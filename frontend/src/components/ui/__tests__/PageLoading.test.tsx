import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import PageLoading from '../PageLoading';

describe('PageLoading', () => {
  // ── Default message ──
  it('renders default loading message', () => {
    render(<PageLoading />);
    expect(screen.getByText('Cargando...')).toBeInTheDocument();
  });

  // ── Custom message ──
  it('renders custom loading message', () => {
    render(<PageLoading message="Procesando datos..." />);
    expect(screen.getByText('Procesando datos...')).toBeInTheDocument();
  });

  // ── Spinner ──
  it('renders a spinner', () => {
    const { container } = render(<PageLoading />);
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
    expect(svg!.getAttribute('class')).toContain('animate-spin');
  });

  it('renders spinner with lg size', () => {
    const { container } = render(<PageLoading />);
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
    expect(svg!.getAttribute('class')).toContain('h-12');
    expect(svg!.getAttribute('class')).toContain('w-12');
  });

  // ── Accessibility ──
  it('has aria-live="polite" for screen readers', () => {
    const { container } = render(<PageLoading />);
    const outerDiv = container.firstChild as HTMLElement;
    expect(outerDiv).toHaveAttribute('aria-live', 'polite');
  });
});
