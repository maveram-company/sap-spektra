import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import LoadingSpinner from '../LoadingSpinner';

describe('LoadingSpinner', () => {
  // ── Default rendering ──
  it('renders spinner with default md size', () => {
    render(<LoadingSpinner />);
    const status = screen.getByRole('status');
    const svg = status.querySelector('svg');
    expect(svg).toBeInTheDocument();
    expect(svg!.getAttribute('class')).toContain('h-8');
    expect(svg!.getAttribute('class')).toContain('w-8');
  });

  it('renders with animate-spin class', () => {
    render(<LoadingSpinner />);
    const svg = screen.getByRole('status').querySelector('svg');
    expect(svg!.getAttribute('class')).toContain('animate-spin');
  });

  // ── Sizes ──
  it('renders with sm size', () => {
    render(<LoadingSpinner size="sm" />);
    const svg = screen.getByRole('status').querySelector('svg');
    expect(svg!.getAttribute('class')).toContain('h-4');
    expect(svg!.getAttribute('class')).toContain('w-4');
  });

  it('renders with lg size', () => {
    render(<LoadingSpinner size="lg" />);
    const svg = screen.getByRole('status').querySelector('svg');
    expect(svg!.getAttribute('class')).toContain('h-12');
    expect(svg!.getAttribute('class')).toContain('w-12');
  });

  // ── Accessibility ──
  it('has role="status"', () => {
    render(<LoadingSpinner />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('has aria-label for accessibility', () => {
    render(<LoadingSpinner />);
    expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Cargando');
  });

  // ── Custom className ──
  it('applies custom className', () => {
    render(<LoadingSpinner className="extra" />);
    expect(screen.getByRole('status').className).toContain('extra');
  });
});
