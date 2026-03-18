import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AppLayout from '../AppLayout';

// Mock TopNav since it has heavy dependencies
vi.mock('../TopNav', () => ({
  default: () => <div data-testid="topnav">TopNav</div>,
  NAV_HEIGHT: 52,
}));

// Mock ChatWidget
vi.mock('../../ChatWidget', () => ({
  default: () => <div data-testid="chat-widget">Chat</div>,
}));

// Mock ModeContext
vi.mock('../../../mode/ModeContext', () => ({
  useMode: () => ({
    state: {
      mode: 'REAL',
      resolvedAt: new Date().toISOString(),
      capabilities: new Map(),
      backendReachable: true,
    },
    setMode: () => {},
    getDomainCapability: () => undefined,
  }),
}));

// Mock ModeIndicator
vi.mock('../../../mode/ModeIndicator', () => ({
  default: () => <div data-testid="mode-indicator">REAL</div>,
}));

// Mock Outlet to render test content
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    Outlet: () => <div data-testid="outlet-content">Page Content</div>,
  };
});

describe('AppLayout', () => {
  it('renders TopNav', () => {
    render(
      <MemoryRouter>
        <AppLayout />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('topnav')).toBeInTheDocument();
  });

  it('renders the Outlet (children)', () => {
    render(
      <MemoryRouter>
        <AppLayout />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('outlet-content')).toBeInTheDocument();
  });

  it('renders ChatWidget', () => {
    render(
      <MemoryRouter>
        <AppLayout />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('chat-widget')).toBeInTheDocument();
  });

  it('renders skip-to-content link', () => {
    render(
      <MemoryRouter>
        <AppLayout />
      </MemoryRouter>,
    );
    const skipLink = screen.getByText('Ir al contenido principal');
    expect(skipLink).toBeInTheDocument();
    expect(skipLink.getAttribute('href')).toBe('#main-content');
  });
});
