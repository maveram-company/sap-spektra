import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Input from '../Input';

describe('Input', () => {
  // ── Basic rendering ──
  it('renders an input element', () => {
    render(<Input />);
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  // ── Label ──
  it('renders a label when provided', () => {
    render(<Input label="Email" />);
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
  });

  it('does not render a label when not provided', () => {
    const { container } = render(<Input />);
    expect(container.querySelector('label')).not.toBeInTheDocument();
  });

  it('associates label with input via htmlFor/id', () => {
    render(<Input label="Username" id="user-input" />);
    const input = screen.getByLabelText('Username');
    expect(input).toHaveAttribute('id', 'user-input');
  });

  it('generates an auto id when no external id is provided', () => {
    render(<Input label="Name" />);
    const input = screen.getByLabelText('Name');
    expect(input).toHaveAttribute('id');
    expect(input.id).toBeTruthy();
  });

  // ── Error message ──
  it('renders error message when error prop is provided', () => {
    render(<Input error="Required field" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Required field');
  });

  it('sets aria-invalid when error is present', () => {
    render(<Input label="Field" error="Error" />);
    expect(screen.getByRole('textbox')).toHaveAttribute('aria-invalid', 'true');
  });

  it('does not set aria-invalid when no error', () => {
    render(<Input label="Field" />);
    expect(screen.getByRole('textbox')).not.toHaveAttribute('aria-invalid');
  });

  it('applies error border styles when error is present', () => {
    render(<Input error="Bad" />);
    expect(screen.getByRole('textbox').className).toContain('border-danger-500');
  });

  it('sets aria-describedby to error id when error is present', () => {
    render(<Input id="my-input" error="Error text" />);
    const input = screen.getByRole('textbox');
    expect(input).toHaveAttribute('aria-describedby', 'my-input-error');
    const errorEl = document.getElementById('my-input-error');
    expect(errorEl).toHaveTextContent('Error text');
  });

  // ── Hint ──
  it('renders hint text when provided', () => {
    render(<Input hint="At least 8 chars" />);
    expect(screen.getByText('At least 8 chars')).toBeInTheDocument();
  });

  it('hides hint when error is present', () => {
    render(<Input hint="Hint text" error="Error text" />);
    expect(screen.queryByText('Hint text')).not.toBeInTheDocument();
    expect(screen.getByText('Error text')).toBeInTheDocument();
  });

  it('sets aria-describedby to hint id when hint is present and no error', () => {
    render(<Input id="my-input" hint="Helpful hint" />);
    const input = screen.getByRole('textbox');
    expect(input).toHaveAttribute('aria-describedby', 'my-input-hint');
  });

  // ── Icon ──
  it('renders icon when provided', () => {
    const IconMock = ({ size }: { size: number }) => <svg data-testid="input-icon" width={size} />;
    render(<Input icon={IconMock} />);
    expect(screen.getByTestId('input-icon')).toBeInTheDocument();
  });

  it('applies left padding when icon is present', () => {
    const IconMock = ({ size }: { size: number }) => <svg data-testid="input-icon" width={size} />;
    render(<Input icon={IconMock} />);
    expect(screen.getByRole('textbox').className).toContain('pl-9');
  });

  it('does not apply icon padding when icon is not present', () => {
    render(<Input />);
    expect(screen.getByRole('textbox').className).not.toContain('pl-9');
  });

  // ── onChange handler ──
  it('calls onChange when value changes', () => {
    const handler = vi.fn();
    render(<Input onChange={handler} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'test' } });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  // ── Disabled state ──
  it('can be disabled', () => {
    render(<Input disabled />);
    expect(screen.getByRole('textbox')).toBeDisabled();
  });

  // ── Placeholder ──
  it('renders placeholder text', () => {
    render(<Input placeholder="Enter value" />);
    expect(screen.getByPlaceholderText('Enter value')).toBeInTheDocument();
  });

  // ── Custom className ──
  it('appends custom className to wrapper', () => {
    const { container } = render(<Input className="custom-wrapper" />);
    expect(container.firstChild).toHaveClass('custom-wrapper');
  });

  // ── Ref forwarding ──
  it('forwards ref to input element', () => {
    const ref = { current: null } as React.MutableRefObject<HTMLInputElement | null>;
    render(<Input ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLInputElement);
  });
});
