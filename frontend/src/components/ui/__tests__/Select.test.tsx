import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Select from '../Select';

// Mock lucide-react
vi.mock('lucide-react', () => ({
  ChevronDown: (props: any) => <svg data-testid="chevron-icon" {...props} />,
}));

const sampleOptions = [
  { value: 'us', label: 'United States' },
  { value: 'mx', label: 'Mexico' },
  { value: 'br', label: 'Brazil' },
];

describe('Select', () => {
  // ── Basic rendering ──
  it('renders a select element', () => {
    render(<Select options={sampleOptions} />);
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  it('renders all options', () => {
    render(<Select options={sampleOptions} />);
    expect(screen.getByRole('option', { name: 'United States' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Mexico' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Brazil' })).toBeInTheDocument();
  });

  it('renders options with correct values', () => {
    render(<Select options={sampleOptions} />);
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(3);
    expect(options[0]).toHaveValue('us');
    expect(options[1]).toHaveValue('mx');
    expect(options[2]).toHaveValue('br');
  });

  // ── Placeholder ──
  it('renders placeholder as the first option', () => {
    render(<Select options={sampleOptions} placeholder="Select country" />);
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(4);
    expect(options[0]).toHaveTextContent('Select country');
    expect(options[0]).toHaveValue('');
  });

  it('does not render placeholder option when not provided', () => {
    render(<Select options={sampleOptions} />);
    expect(screen.getAllByRole('option')).toHaveLength(3);
  });

  // ── Label ──
  it('renders label when provided', () => {
    render(<Select label="Country" options={sampleOptions} />);
    expect(screen.getByLabelText('Country')).toBeInTheDocument();
  });

  it('does not render label when not provided', () => {
    const { container } = render(<Select options={sampleOptions} />);
    expect(container.querySelector('label')).not.toBeInTheDocument();
  });

  it('associates label with select via id', () => {
    render(<Select label="Country" options={sampleOptions} id="country-select" />);
    expect(screen.getByLabelText('Country')).toHaveAttribute('id', 'country-select');
  });

  // ── onChange ──
  it('calls onChange when selection changes', () => {
    const handler = vi.fn();
    render(<Select options={sampleOptions} onChange={handler} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'mx' } });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  // ── Controlled value ──
  it('respects controlled value', () => {
    render(<Select options={sampleOptions} value="br" onChange={() => {}} />);
    expect(screen.getByRole('combobox')).toHaveValue('br');
  });

  // ── Disabled ──
  it('can be disabled', () => {
    render(<Select options={sampleOptions} disabled />);
    expect(screen.getByRole('combobox')).toBeDisabled();
  });

  // ── Error ──
  it('renders error message when error prop is provided', () => {
    render(<Select options={sampleOptions} error="Selection required" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Selection required');
  });

  it('sets aria-invalid when error is present', () => {
    render(<Select options={sampleOptions} error="Error" />);
    expect(screen.getByRole('combobox')).toHaveAttribute('aria-invalid', 'true');
  });

  it('does not set aria-invalid when no error', () => {
    render(<Select options={sampleOptions} />);
    expect(screen.getByRole('combobox')).not.toHaveAttribute('aria-invalid');
  });

  it('sets aria-describedby pointing to error element', () => {
    render(<Select options={sampleOptions} error="Bad" id="sel" />);
    expect(screen.getByRole('combobox')).toHaveAttribute('aria-describedby', 'sel-error');
  });

  // ── Chevron icon ──
  it('renders chevron down icon', () => {
    render(<Select options={sampleOptions} />);
    expect(screen.getByTestId('chevron-icon')).toBeInTheDocument();
  });

  // ── Custom className ──
  it('appends custom className to wrapper', () => {
    const { container } = render(<Select options={sampleOptions} className="extra" />);
    expect(container.firstChild).toHaveClass('extra');
  });

  // ── Empty options ──
  it('renders with empty options array', () => {
    render(<Select options={[]} />);
    expect(screen.getByRole('combobox')).toBeInTheDocument();
    expect(screen.queryAllByRole('option')).toHaveLength(0);
  });

  // ── Ref forwarding ──
  it('forwards ref to select element', () => {
    const ref = { current: null } as React.MutableRefObject<HTMLSelectElement | null>;
    render(<Select ref={ref} options={sampleOptions} />);
    expect(ref.current).toBeInstanceOf(HTMLSelectElement);
  });
});
