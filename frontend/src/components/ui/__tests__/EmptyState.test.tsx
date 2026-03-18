import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import EmptyState from '../EmptyState';

describe('EmptyState', () => {
  // ── Title and description ──
  it('renders title and description', () => {
    render(<EmptyState title="Sin datos" description="No hay registros disponibles" />);
    expect(screen.getByText('Sin datos')).toBeInTheDocument();
    expect(screen.getByText('No hay registros disponibles')).toBeInTheDocument();
  });

  it('renders title as an h3 element', () => {
    render(<EmptyState title="Sin datos" />);
    expect(screen.getByText('Sin datos').tagName).toBe('H3');
  });

  // ── Without icon ──
  it('renders without an icon by default', () => {
    const { container } = render(<EmptyState title="Sin datos" />);
    expect(container.querySelector('svg')).not.toBeInTheDocument();
  });

  // ── With icon ──
  it('renders the icon when provided', () => {
    const MockIcon = ({ size, className }: { size: number; className?: string }) => (
      <svg data-testid="mock-icon" width={size} className={className} />
    );
    render(<EmptyState title="Sin datos" icon={MockIcon} />);
    expect(screen.getByTestId('mock-icon')).toBeInTheDocument();
    expect(screen.getByTestId('mock-icon')).toHaveAttribute('width', '28');
  });

  // ── With action button ──
  it('renders with action button', () => {
    render(
      <EmptyState
        title="Sin datos"
        action={<button>Crear nuevo</button>}
      />
    );
    expect(screen.getByRole('button', { name: /crear nuevo/i })).toBeInTheDocument();
  });

  // ── Without optional props ──
  it('renders without description when not provided', () => {
    const { container } = render(<EmptyState title="Sin datos" />);
    expect(container.querySelector('p')).not.toBeInTheDocument();
  });

  it('renders without action when not provided', () => {
    const { container } = render(<EmptyState title="Sin datos" />);
    // The action wrapper div with mt-6 should not exist
    expect(container.querySelector('.mt-6')).not.toBeInTheDocument();
  });

  // ── Custom className ──
  it('applies custom className', () => {
    const { container } = render(<EmptyState title="Sin datos" className="extra-class" />);
    expect((container.firstChild as HTMLElement).className).toContain('extra-class');
  });
});
