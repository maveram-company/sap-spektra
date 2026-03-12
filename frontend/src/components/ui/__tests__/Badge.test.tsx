import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Badge from '../Badge';

describe('Badge', () => {
  // ── Basic rendering ──
  it('renders children text', () => {
    render(<Badge>Active</Badge>);
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('renders as a span element', () => {
    render(<Badge>Tag</Badge>);
    expect(screen.getByText('Tag').tagName).toBe('SPAN');
  });

  // ── Variants ──
  const variantClasses: Record<string, string> = {
    default: 'bg-white/5',
    primary: 'text-primary-400',
    success: 'text-success-400',
    warning: 'text-warning-400',
    danger: 'text-danger-400',
    info: 'text-blue-400',
  };

  Object.entries(variantClasses).forEach(([variant, expectedClass]) => {
    it(`applies ${variant} variant classes`, () => {
      render(<Badge variant={variant}>{variant}</Badge>);
      expect(screen.getByText(variant).className).toContain(expectedClass);
    });
  });

  it('defaults to "default" variant', () => {
    render(<Badge>Default</Badge>);
    expect(screen.getByText('Default').className).toContain('bg-white/5');
  });

  // ── Sizes ──
  it('applies sm size classes', () => {
    render(<Badge size="sm">Small</Badge>);
    expect(screen.getByText('Small').className).toContain('text-[10px]');
  });

  it('applies md size classes (default)', () => {
    render(<Badge>Medium</Badge>);
    expect(screen.getByText('Medium').className).toContain('text-xs');
  });

  it('applies lg size classes', () => {
    render(<Badge size="lg">Large</Badge>);
    expect(screen.getByText('Large').className).toContain('text-sm');
  });

  // ── Dot indicator ──
  it('renders a dot indicator when dot is true', () => {
    const { container } = render(<Badge dot>Dotted</Badge>);
    const dot = container.querySelector('.rounded-full.bg-current');
    expect(dot).toBeInTheDocument();
  });

  it('does not render a dot indicator by default', () => {
    const { container } = render(<Badge>No Dot</Badge>);
    const dot = container.querySelector('.w-1\\.5');
    expect(dot).not.toBeInTheDocument();
  });

  // ── Rounded pill shape ──
  it('applies rounded-full for pill shape', () => {
    render(<Badge>Pill</Badge>);
    expect(screen.getByText('Pill').className).toContain('rounded-full');
  });

  // ── Custom className ──
  it('appends custom className', () => {
    render(<Badge className="extra-class">Custom</Badge>);
    expect(screen.getByText('Custom').className).toContain('extra-class');
  });

  // ── Inline flex ──
  it('is inline-flex', () => {
    render(<Badge>Inline</Badge>);
    expect(screen.getByText('Inline').className).toContain('inline-flex');
  });
});
