import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Avatar from '../Avatar';

describe('Avatar', () => {
  // ── Initials ──
  it('renders initials from a single name', () => {
    render(<Avatar name="Carlos" />);
    expect(screen.getByRole('img', { name: 'Carlos' })).toHaveTextContent('C');
  });

  it('renders initials from a full name', () => {
    render(<Avatar name="Carlos López" />);
    expect(screen.getByRole('img', { name: 'Carlos López' })).toHaveTextContent('CL');
  });

  it('truncates initials to 2 characters max', () => {
    render(<Avatar name="Ana María García" />);
    expect(screen.getByRole('img')).toHaveTextContent('AM');
  });

  it('falls back to "Usuario" when name is empty', () => {
    render(<Avatar name="" />);
    expect(screen.getByRole('img', { name: 'Usuario' })).toHaveTextContent('U');
  });

  // ── Sizes ──
  it('applies sm size classes', () => {
    render(<Avatar name="Ana" size="sm" />);
    const el = screen.getByRole('img');
    expect(el.className).toContain('w-7');
    expect(el.className).toContain('h-7');
    expect(el.className).toContain('text-xs');
  });

  it('applies md size classes by default', () => {
    render(<Avatar name="Ana" />);
    const el = screen.getByRole('img');
    expect(el.className).toContain('w-9');
    expect(el.className).toContain('h-9');
    expect(el.className).toContain('text-sm');
  });

  it('applies lg size classes', () => {
    render(<Avatar name="Ana" size="lg" />);
    const el = screen.getByRole('img');
    expect(el.className).toContain('w-11');
    expect(el.className).toContain('h-11');
    expect(el.className).toContain('text-base');
  });

  it('applies xl size classes', () => {
    render(<Avatar name="Ana" size="xl" />);
    const el = screen.getByRole('img');
    expect(el.className).toContain('w-14');
    expect(el.className).toContain('h-14');
    expect(el.className).toContain('text-lg');
  });

  // ── Custom className ──
  it('applies custom className', () => {
    render(<Avatar name="Ana" className="my-custom" />);
    expect(screen.getByRole('img').className).toContain('my-custom');
  });

  // ── Image src ──
  it('renders an img element when src is provided', () => {
    render(<Avatar name="Ana" src="https://example.com/photo.jpg" />);
    const img = screen.getByRole('img', { name: 'Ana' });
    expect(img.tagName).toBe('IMG');
    expect(img).toHaveAttribute('src', 'https://example.com/photo.jpg');
  });
});
