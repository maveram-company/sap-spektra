import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Modal from '../Modal';

// Mock lucide-react X icon
vi.mock('lucide-react', () => ({
  X: ({ size, ...props }: any) => <svg data-testid="x-icon" {...props} />,
}));

describe('Modal', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    title: 'Test Modal',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    document.body.style.overflow = '';
  });

  // ── Rendering ──
  it('renders nothing when isOpen is false', () => {
    const { container } = render(<Modal {...defaultProps} isOpen={false} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders the modal when isOpen is true', () => {
    render(<Modal {...defaultProps} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('renders the title', () => {
    render(<Modal {...defaultProps} />);
    expect(screen.getByText('Test Modal')).toBeInTheDocument();
  });

  it('renders children content', () => {
    render(<Modal {...defaultProps}>Modal body content</Modal>);
    expect(screen.getByText('Modal body content')).toBeInTheDocument();
  });

  it('renders description when provided', () => {
    render(<Modal {...defaultProps} description="A description">Content</Modal>);
    expect(screen.getByText('A description')).toBeInTheDocument();
  });

  it('does not render description when not provided', () => {
    render(<Modal {...defaultProps}>Content</Modal>);
    expect(screen.queryByText('A description')).not.toBeInTheDocument();
  });

  it('renders footer when provided', () => {
    render(<Modal {...defaultProps} footer={<button>Save</button>}>Content</Modal>);
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  // ── ARIA attributes ──
  it('has role="dialog"', () => {
    render(<Modal {...defaultProps} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('has aria-modal="true"', () => {
    render(<Modal {...defaultProps} />);
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
  });

  it('has aria-labelledby pointing to the title', () => {
    render(<Modal {...defaultProps} />);
    const dialog = screen.getByRole('dialog');
    const labelledBy = dialog.getAttribute('aria-labelledby');
    expect(labelledBy).toBeTruthy();
    const titleEl = document.getElementById(labelledBy!);
    expect(titleEl).toHaveTextContent('Test Modal');
  });

  it('has aria-describedby when description is provided', () => {
    render(<Modal {...defaultProps} description="Help text">Content</Modal>);
    const dialog = screen.getByRole('dialog');
    const describedBy = dialog.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    const descEl = document.getElementById(describedBy!);
    expect(descEl).toHaveTextContent('Help text');
  });

  it('does not have aria-describedby when description is not provided', () => {
    render(<Modal {...defaultProps}>Content</Modal>);
    expect(screen.getByRole('dialog')).not.toHaveAttribute('aria-describedby');
  });

  // ── Close actions ──
  it('calls onClose when the close button is clicked', () => {
    const onClose = vi.fn();
    render(<Modal {...defaultProps} onClose={onClose}>Content</Modal>);
    fireEvent.click(screen.getByLabelText('Cerrar'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when the overlay is clicked', () => {
    const onClose = vi.fn();
    render(<Modal {...defaultProps} onClose={onClose}>Content</Modal>);
    // The overlay is the backdrop div with aria-hidden="true"
    const overlay = document.querySelector('[aria-hidden="true"]') as HTMLElement;
    fireEvent.click(overlay);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when Escape key is pressed', () => {
    const onClose = vi.fn();
    render(<Modal {...defaultProps} onClose={onClose}>Content</Modal>);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not call onClose for other keys', () => {
    const onClose = vi.fn();
    render(<Modal {...defaultProps} onClose={onClose}>Content</Modal>);
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(onClose).not.toHaveBeenCalled();
  });

  // ── Body overflow ──
  it('sets body overflow to hidden when open', () => {
    render(<Modal {...defaultProps}>Content</Modal>);
    expect(document.body.style.overflow).toBe('hidden');
  });

  it('restores body overflow when closed', () => {
    const { unmount } = render(<Modal {...defaultProps}>Content</Modal>);
    unmount();
    expect(document.body.style.overflow).toBe('');
  });

  // ── Sizes ──
  it('applies md size class by default', () => {
    render(<Modal {...defaultProps}>Content</Modal>);
    expect(screen.getByRole('dialog').className).toContain('max-w-lg');
  });

  it('applies sm size class', () => {
    render(<Modal {...defaultProps} size="sm">Content</Modal>);
    expect(screen.getByRole('dialog').className).toContain('max-w-md');
  });

  it('applies lg size class', () => {
    render(<Modal {...defaultProps} size="lg">Content</Modal>);
    expect(screen.getByRole('dialog').className).toContain('max-w-2xl');
  });

  it('applies xl size class', () => {
    render(<Modal {...defaultProps} size="xl">Content</Modal>);
    expect(screen.getByRole('dialog').className).toContain('max-w-4xl');
  });
});
