import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Badge from './Badge';

describe('Badge', () => {
  it('renders text', () => {
    render(<Badge>Active</Badge>);
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('applies variant class', () => {
    const { container } = render(<Badge variant="success">OK</Badge>);
    expect(container.firstChild.className).toContain('success');
  });

  it('applies default variant when none specified', () => {
    const { container } = render(<Badge>Default</Badge>);
    expect(container.firstChild.className).toContain('bg-white/5');
  });

  it('renders dot when dot prop is true', () => {
    const { container } = render(<Badge dot>Status</Badge>);
    const dots = container.querySelectorAll('.rounded-full');
    expect(dots.length).toBeGreaterThan(0);
  });

  it('applies size class', () => {
    const { container } = render(<Badge size="sm">Small</Badge>);
    expect(container.firstChild.className).toContain('text-[10px]');
  });
});
