import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { ThemeProvider, useTheme } from '../ThemeContext';

const STORAGE_KEY = 'sap-spektra-theme';

// ── Helpers ──────────────────────────────────────────────────────────────────

function wrapper({ children }: { children: React.ReactNode }) {
  return <ThemeProvider>{children}</ThemeProvider>;
}

let matchMediaMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  localStorage.clear();
  document.documentElement.classList.remove('light');

  // Default: system prefers dark
  matchMediaMock = vi.fn().mockReturnValue({ matches: true });
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: matchMediaMock,
  });
});

afterEach(() => {
  localStorage.clear();
  document.documentElement.classList.remove('light');
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('ThemeProvider – initial state', () => {
  it('throws when useTheme is called outside ThemeProvider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useTheme())).toThrow(
      'useTheme must be used within ThemeProvider',
    );
    spy.mockRestore();
  });

  it('defaults to dark when system prefers dark', () => {
    matchMediaMock.mockReturnValue({ matches: true });

    const { result } = renderHook(() => useTheme(), { wrapper });
    expect(result.current.theme).toBe('dark');
    expect(result.current.isDark).toBe(true);
  });

  it('defaults to light when system prefers light', () => {
    matchMediaMock.mockReturnValue({ matches: false });

    const { result } = renderHook(() => useTheme(), { wrapper });
    expect(result.current.theme).toBe('light');
    expect(result.current.isDark).toBe(false);
  });

  it('restores theme from localStorage over system preference', () => {
    matchMediaMock.mockReturnValue({ matches: true }); // system = dark
    localStorage.setItem(STORAGE_KEY, 'light'); // stored = light

    const { result } = renderHook(() => useTheme(), { wrapper });
    expect(result.current.theme).toBe('light');
  });

  it('uses stored dark theme from localStorage', () => {
    matchMediaMock.mockReturnValue({ matches: false }); // system = light
    localStorage.setItem(STORAGE_KEY, 'dark'); // stored = dark

    const { result } = renderHook(() => useTheme(), { wrapper });
    expect(result.current.theme).toBe('dark');
    expect(result.current.isDark).toBe(true);
  });
});

describe('ThemeProvider – toggleTheme', () => {
  it('toggles from dark to light', () => {
    matchMediaMock.mockReturnValue({ matches: true });

    const { result } = renderHook(() => useTheme(), { wrapper });
    expect(result.current.theme).toBe('dark');

    act(() => result.current.toggleTheme());
    expect(result.current.theme).toBe('light');
    expect(result.current.isDark).toBe(false);
  });

  it('toggles from light to dark', () => {
    matchMediaMock.mockReturnValue({ matches: false });

    const { result } = renderHook(() => useTheme(), { wrapper });
    expect(result.current.theme).toBe('light');

    act(() => result.current.toggleTheme());
    expect(result.current.theme).toBe('dark');
    expect(result.current.isDark).toBe(true);
  });

  it('toggles back and forth correctly', () => {
    matchMediaMock.mockReturnValue({ matches: true });
    const { result } = renderHook(() => useTheme(), { wrapper });

    act(() => result.current.toggleTheme()); // dark -> light
    expect(result.current.theme).toBe('light');

    act(() => result.current.toggleTheme()); // light -> dark
    expect(result.current.theme).toBe('dark');

    act(() => result.current.toggleTheme()); // dark -> light
    expect(result.current.theme).toBe('light');
  });
});

describe('ThemeProvider – localStorage persistence', () => {
  it('persists theme change to localStorage', () => {
    matchMediaMock.mockReturnValue({ matches: true });
    const { result } = renderHook(() => useTheme(), { wrapper });

    act(() => result.current.toggleTheme());

    expect(localStorage.getItem(STORAGE_KEY)).toBe('light');
  });

  it('persists initial theme to localStorage on mount', () => {
    matchMediaMock.mockReturnValue({ matches: true });
    renderHook(() => useTheme(), { wrapper });

    expect(localStorage.getItem(STORAGE_KEY)).toBe('dark');
  });

  it('updates localStorage on every toggle', () => {
    matchMediaMock.mockReturnValue({ matches: true });
    const { result } = renderHook(() => useTheme(), { wrapper });

    act(() => result.current.toggleTheme());
    expect(localStorage.getItem(STORAGE_KEY)).toBe('light');

    act(() => result.current.toggleTheme());
    expect(localStorage.getItem(STORAGE_KEY)).toBe('dark');
  });
});

describe('ThemeProvider – DOM class toggling', () => {
  it('adds .light class when theme is light', () => {
    matchMediaMock.mockReturnValue({ matches: false });
    renderHook(() => useTheme(), { wrapper });

    expect(document.documentElement.classList.contains('light')).toBe(true);
  });

  it('removes .light class when theme is dark', () => {
    matchMediaMock.mockReturnValue({ matches: true });
    renderHook(() => useTheme(), { wrapper });

    expect(document.documentElement.classList.contains('light')).toBe(false);
  });

  it('toggles .light class when toggling theme', () => {
    matchMediaMock.mockReturnValue({ matches: true });
    const { result } = renderHook(() => useTheme(), { wrapper });

    expect(document.documentElement.classList.contains('light')).toBe(false);

    act(() => result.current.toggleTheme());
    expect(document.documentElement.classList.contains('light')).toBe(true);

    act(() => result.current.toggleTheme());
    expect(document.documentElement.classList.contains('light')).toBe(false);
  });
});

describe('ThemeProvider – setTheme', () => {
  it('allows setting theme directly via setTheme', () => {
    matchMediaMock.mockReturnValue({ matches: true });
    const { result } = renderHook(() => useTheme(), { wrapper });

    act(() => result.current.setTheme('light'));
    expect(result.current.theme).toBe('light');
    expect(result.current.isDark).toBe(false);

    act(() => result.current.setTheme('dark'));
    expect(result.current.theme).toBe('dark');
    expect(result.current.isDark).toBe(true);
  });
});
