import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Button from '../Button';

describe('Button', () => {
  // ── Rendering ──
  it('renders children text', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole('button', { name: /click me/i })).toBeInTheDocument();
  });

  it('renders with type="button" by default', () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
  });

  // ── Variants ──
  const variantKeywords: Record<string, string> = {
    primary: 'from-primary-600',
    secondary: 'bg-white/5',
    outline: 'border-border/50',
    ghost: 'text-text-secondary',
    danger: 'from-danger-600',
    success: 'from-success-600',
  };

  Object.entries(variantKeywords).forEach(([variant, keyword]) => {
    it(`applies ${variant} variant classes`, () => {
      render(<Button variant={variant}>{variant}</Button>);
      expect(screen.getByRole('button').className).toContain(keyword);
    });
  });

  // ── Sizes ──
  it('applies sm size classes', () => {
    render(<Button size="sm">Small</Button>);
    expect(screen.getByRole('button').className).toContain('px-3');
    expect(screen.getByRole('button').className).toContain('text-xs');
  });

  it('applies md size classes (default)', () => {
    render(<Button>Medium</Button>);
    expect(screen.getByRole('button').className).toContain('px-4');
    expect(screen.getByRole('button').className).toContain('text-sm');
  });

  it('applies lg size classes', () => {
    render(<Button size="lg">Large</Button>);
    expect(screen.getByRole('button').className).toContain('px-6');
    expect(screen.getByRole('button').className).toContain('text-base');
  });

  // ── Loading state ──
  it('shows spinner SVG when loading', () => {
    render(<Button loading>Loading</Button>);
    const btn = screen.getByRole('button');
    expect(btn.querySelector('svg')).toBeInTheDocument();
    expect(btn.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('is disabled when loading', () => {
    render(<Button loading>Loading</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  // ── Disabled state ──
  it('is disabled when disabled prop is true', () => {
    render(<Button disabled>Disabled</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('does not fire onClick when disabled', () => {
    const handler = vi.fn();
    render(<Button disabled onClick={handler}>Disabled</Button>);
    fireEvent.click(screen.getByRole('button'));
    expect(handler).not.toHaveBeenCalled();
  });

  // ── Icon ──
  it('renders icon component when provided', () => {
    const IconMock = ({ size }: { size: number }) => <svg data-testid="icon" width={size} height={size} />;
    render(<Button icon={IconMock}>With Icon</Button>);
    expect(screen.getByTestId('icon')).toBeInTheDocument();
  });

  it('does not render icon when loading (shows spinner instead)', () => {
    const IconMock = ({ size }: { size: number }) => <svg data-testid="icon" width={size} height={size} />;
    render(<Button icon={IconMock} loading>Loading</Button>);
    expect(screen.queryByTestId('icon')).not.toBeInTheDocument();
    expect(screen.getByRole('button').querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('passes correct icon size for sm button', () => {
    const IconMock = ({ size }: { size: number }) => <svg data-testid="icon" width={size} />;
    render(<Button icon={IconMock} size="sm">Small</Button>);
    expect(screen.getByTestId('icon')).toHaveAttribute('width', '14');
  });

  it('passes correct icon size for md button', () => {
    const IconMock = ({ size }: { size: number }) => <svg data-testid="icon" width={size} />;
    render(<Button icon={IconMock} size="md">Medium</Button>);
    expect(screen.getByTestId('icon')).toHaveAttribute('width', '16');
  });

  it('passes correct icon size for lg button', () => {
    const IconMock = ({ size }: { size: number }) => <svg data-testid="icon" width={size} />;
    render(<Button icon={IconMock} size="lg">Large</Button>);
    expect(screen.getByTestId('icon')).toHaveAttribute('width', '20');
  });

  // ── onClick ──
  it('calls onClick handler when clicked', () => {
    const handler = vi.fn();
    render(<Button onClick={handler}>Click</Button>);
    fireEvent.click(screen.getByRole('button'));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  // ── fullWidth ──
  it('applies w-full class when fullWidth is true', () => {
    render(<Button fullWidth>Full</Button>);
    expect(screen.getByRole('button').className).toContain('w-full');
  });

  it('does not apply w-full class by default', () => {
    render(<Button>Normal</Button>);
    expect(screen.getByRole('button').className).not.toContain('w-full');
  });

  // ── Custom className ──
  it('appends custom className', () => {
    render(<Button className="my-custom-class">Custom</Button>);
    expect(screen.getByRole('button').className).toContain('my-custom-class');
  });

  // ── Spread props ──
  it('forwards additional props like data-testid', () => {
    render(<Button data-testid="my-btn">Props</Button>);
    expect(screen.getByTestId('my-btn')).toBeInTheDocument();
  });
});
