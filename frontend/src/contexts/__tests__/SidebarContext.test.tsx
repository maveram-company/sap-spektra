import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { SidebarProvider, useSidebar } from '../SidebarContext';

const STORAGE_KEY = 'sap-spektra-sidebar-collapsed';

// ── Helpers ──────────────────────────────────────────────────────────────────

function wrapper({ children }: { children: React.ReactNode }) {
  return <SidebarProvider>{children}</SidebarProvider>;
}

// ── Setup / Teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('SidebarProvider – initial state', () => {
  it('throws when useSidebar is called outside SidebarProvider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useSidebar())).toThrow(
      'useSidebar must be used within SidebarProvider',
    );
    spy.mockRestore();
  });

  it('defaults to collapsed=false when localStorage is empty', () => {
    const { result } = renderHook(() => useSidebar(), { wrapper });
    expect(result.current.collapsed).toBe(false);
  });

  it('restores collapsed=true from localStorage', () => {
    localStorage.setItem(STORAGE_KEY, 'true');
    const { result } = renderHook(() => useSidebar(), { wrapper });
    expect(result.current.collapsed).toBe(true);
  });

  it('restores collapsed=false from localStorage', () => {
    localStorage.setItem(STORAGE_KEY, 'false');
    const { result } = renderHook(() => useSidebar(), { wrapper });
    expect(result.current.collapsed).toBe(false);
  });

  it('defaults to false when localStorage has unexpected value', () => {
    localStorage.setItem(STORAGE_KEY, 'garbage');
    const { result } = renderHook(() => useSidebar(), { wrapper });
    expect(result.current.collapsed).toBe(false);
  });
});

describe('SidebarProvider – toggle', () => {
  it('toggles collapsed from false to true', () => {
    const { result } = renderHook(() => useSidebar(), { wrapper });

    expect(result.current.collapsed).toBe(false);
    act(() => result.current.toggle());
    expect(result.current.collapsed).toBe(true);
  });

  it('toggles collapsed from true to false', () => {
    localStorage.setItem(STORAGE_KEY, 'true');
    const { result } = renderHook(() => useSidebar(), { wrapper });

    expect(result.current.collapsed).toBe(true);
    act(() => result.current.toggle());
    expect(result.current.collapsed).toBe(false);
  });

  it('toggles back and forth correctly', () => {
    const { result } = renderHook(() => useSidebar(), { wrapper });

    act(() => result.current.toggle()); // false -> true
    expect(result.current.collapsed).toBe(true);

    act(() => result.current.toggle()); // true -> false
    expect(result.current.collapsed).toBe(false);

    act(() => result.current.toggle()); // false -> true
    expect(result.current.collapsed).toBe(true);
  });
});

describe('SidebarProvider – localStorage persistence', () => {
  it('persists toggle state to localStorage', () => {
    const { result } = renderHook(() => useSidebar(), { wrapper });

    act(() => result.current.toggle());
    expect(localStorage.getItem(STORAGE_KEY)).toBe('true');

    act(() => result.current.toggle());
    expect(localStorage.getItem(STORAGE_KEY)).toBe('false');
  });

  it('persists state after multiple toggles', () => {
    const { result } = renderHook(() => useSidebar(), { wrapper });

    act(() => result.current.toggle()); // true
    act(() => result.current.toggle()); // false
    act(() => result.current.toggle()); // true

    expect(localStorage.getItem(STORAGE_KEY)).toBe('true');
  });
});

describe('SidebarProvider – setCollapsed', () => {
  it('allows setting collapsed directly to true', () => {
    const { result } = renderHook(() => useSidebar(), { wrapper });

    act(() => result.current.setCollapsed(true));
    expect(result.current.collapsed).toBe(true);
  });

  it('allows setting collapsed directly to false', () => {
    localStorage.setItem(STORAGE_KEY, 'true');
    const { result } = renderHook(() => useSidebar(), { wrapper });

    act(() => result.current.setCollapsed(false));
    expect(result.current.collapsed).toBe(false);
  });

  it('setting collapsed to current value does not change state', () => {
    const { result } = renderHook(() => useSidebar(), { wrapper });

    act(() => result.current.setCollapsed(false));
    expect(result.current.collapsed).toBe(false);
  });
});

describe('SidebarProvider – localStorage error handling', () => {
  it('defaults to false when localStorage.getItem throws', () => {
    const originalGetItem = Storage.prototype.getItem;
    Storage.prototype.getItem = () => { throw new Error('Access denied'); };

    const { result } = renderHook(() => useSidebar(), { wrapper });
    expect(result.current.collapsed).toBe(false);

    Storage.prototype.getItem = originalGetItem;
  });

  it('toggle still works when localStorage.setItem throws', () => {
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = () => { throw new Error('QuotaExceeded'); };

    const { result } = renderHook(() => useSidebar(), { wrapper });

    // Should not throw
    act(() => result.current.toggle());
    expect(result.current.collapsed).toBe(true);

    Storage.prototype.setItem = originalSetItem;
  });
});
