import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import ModeBadge from '../ModeBadge';

// Mock useMode with different modes
const mockUseMode = vi.fn();
vi.mock('../../../mode/ModeContext', () => ({
  useMode: () => mockUseMode(),
}));

function makeModeState(mode: 'REAL' | 'FALLBACK' | 'MOCK') {
  return {
    state: {
      mode,
      resolvedAt: new Date().toISOString(),
      capabilities: new Map(),
      backendReachable: true,
    },
    setMode: () => {},
    getDomainCapability: () => undefined,
  };
}

describe('ModeBadge', () => {
  it('renders "Live" label for REAL mode', () => {
    mockUseMode.mockReturnValue(makeModeState('REAL'));
    render(<ModeBadge />);
    expect(screen.getByText('Live')).toBeInTheDocument();
  });

  it('renders "Fallback" label for FALLBACK mode', () => {
    mockUseMode.mockReturnValue(makeModeState('FALLBACK'));
    render(<ModeBadge />);
    expect(screen.getByText('Fallback')).toBeInTheDocument();
  });

  it('renders "Demo" label for MOCK mode', () => {
    mockUseMode.mockReturnValue(makeModeState('MOCK'));
    render(<ModeBadge />);
    expect(screen.getByText('Demo')).toBeInTheDocument();
  });

  it('applies green styling for REAL mode', () => {
    mockUseMode.mockReturnValue(makeModeState('REAL'));
    render(<ModeBadge />);
    const badge = screen.getByText('Live').closest('span');
    expect(badge?.className).toContain('emerald');
  });

  it('applies amber styling for FALLBACK mode', () => {
    mockUseMode.mockReturnValue(makeModeState('FALLBACK'));
    render(<ModeBadge />);
    const badge = screen.getByText('Fallback').closest('span');
    expect(badge?.className).toContain('amber');
  });

  it('applies blue styling for MOCK mode', () => {
    mockUseMode.mockReturnValue(makeModeState('MOCK'));
    render(<ModeBadge />);
    const badge = screen.getByText('Demo').closest('span');
    expect(badge?.className).toContain('blue');
  });

  it('includes mode title attribute', () => {
    mockUseMode.mockReturnValue(makeModeState('REAL'));
    render(<ModeBadge />);
    const badge = screen.getByText('Live').closest('span');
    expect(badge?.getAttribute('title')).toContain('REAL');
  });

  it('shows backend unreachable in title when not reachable', () => {
    mockUseMode.mockReturnValue({
      ...makeModeState('FALLBACK'),
      state: { ...makeModeState('FALLBACK').state, backendReachable: false },
    });
    render(<ModeBadge />);
    const badge = screen.getByText('Fallback').closest('span');
    expect(badge?.getAttribute('title')).toContain('backend unreachable');
  });

  it('renders dot indicator', () => {
    mockUseMode.mockReturnValue(makeModeState('REAL'));
    const { container } = render(<ModeBadge />);
    const dot = container.querySelector('.rounded-full.bg-emerald-500');
    expect(dot).toBeInTheDocument();
  });
});
