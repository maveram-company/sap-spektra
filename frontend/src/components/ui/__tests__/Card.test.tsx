import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Card, { CardHeader, CardTitle, CardDescription } from '../Card';

describe('Card', () => {
  it('renders children', () => {
    render(<Card>Card content</Card>);
    expect(screen.getByText('Card content')).toBeInTheDocument();
  });

  it('applies default md padding', () => {
    const { container } = render(<Card>Content</Card>);
    expect(container.firstChild).toHaveClass('p-6');
  });

  it('applies sm padding', () => {
    const { container } = render(<Card padding="sm">Content</Card>);
    expect(container.firstChild).toHaveClass('p-4');
  });

  it('applies lg padding', () => {
    const { container } = render(<Card padding="lg">Content</Card>);
    expect(container.firstChild).toHaveClass('p-8');
  });

  it('applies no padding when padding is "none"', () => {
    const { container } = render(<Card padding="none">Content</Card>);
    const el = container.firstChild as HTMLElement;
    expect(el.className).not.toMatch(/\bp-\d/);
  });

  it('applies hover styles when hover is true', () => {
    const { container } = render(<Card hover>Content</Card>);
    expect((container.firstChild as HTMLElement).className).toContain('hover:border-primary-500/30');
    expect((container.firstChild as HTMLElement).className).toContain('cursor-pointer');
  });

  it('does not apply hover styles by default', () => {
    const { container } = render(<Card>Content</Card>);
    expect((container.firstChild as HTMLElement).className).not.toContain('cursor-pointer');
  });

  it('appends custom className', () => {
    const { container } = render(<Card className="extra-class">Content</Card>);
    expect(container.firstChild).toHaveClass('extra-class');
  });

  it('forwards additional props', () => {
    render(<Card data-testid="card">Content</Card>);
    expect(screen.getByTestId('card')).toBeInTheDocument();
  });
});

describe('CardHeader', () => {
  it('renders children', () => {
    render(<CardHeader>Header</CardHeader>);
    expect(screen.getByText('Header')).toBeInTheDocument();
  });

  it('applies flex layout classes', () => {
    const { container } = render(<CardHeader>Header</CardHeader>);
    expect(container.firstChild).toHaveClass('flex', 'items-center', 'justify-between');
  });

  it('appends custom className', () => {
    const { container } = render(<CardHeader className="custom">Header</CardHeader>);
    expect(container.firstChild).toHaveClass('custom');
  });
});

describe('CardTitle', () => {
  it('renders as an h3 element', () => {
    render(<CardTitle>Title</CardTitle>);
    const el = screen.getByText('Title');
    expect(el.tagName).toBe('H3');
  });

  it('applies font styles', () => {
    render(<CardTitle>Title</CardTitle>);
    expect(screen.getByText('Title')).toHaveClass('text-lg', 'font-semibold');
  });

  it('appends custom className', () => {
    render(<CardTitle className="extra">Title</CardTitle>);
    expect(screen.getByText('Title')).toHaveClass('extra');
  });
});

describe('CardDescription', () => {
  it('renders as a p element', () => {
    render(<CardDescription>Description text</CardDescription>);
    const el = screen.getByText('Description text');
    expect(el.tagName).toBe('P');
  });

  it('applies text styles', () => {
    render(<CardDescription>Description text</CardDescription>);
    expect(screen.getByText('Description text')).toHaveClass('text-sm', 'text-text-secondary');
  });

  it('appends custom className', () => {
    render(<CardDescription className="extra">Description</CardDescription>);
    expect(screen.getByText('Description')).toHaveClass('extra');
  });
});
