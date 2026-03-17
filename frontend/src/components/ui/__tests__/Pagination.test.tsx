import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Pagination from '../Pagination';

// Mock lucide-react
vi.mock('lucide-react', () => ({
  ChevronLeft: (props: any) => <svg data-testid="chevron-left" {...props} />,
  ChevronRight: (props: any) => <svg data-testid="chevron-right" {...props} />,
}));

describe('Pagination', () => {
  const defaultProps = {
    page: 1,
    totalPages: 5,
    total: 50,
    onPageChange: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Rendering ──
  it('renders when totalPages > 1', () => {
    render(<Pagination {...defaultProps} />);
    expect(screen.getByText(/mostrando página/i)).toBeInTheDocument();
  });

  it('returns null when totalPages is 1', () => {
    const { container } = render(
      <Pagination page={1} totalPages={1} total={5} onPageChange={vi.fn()} />
    );
    expect(container.innerHTML).toBe('');
  });

  it('returns null when totalPages is 0', () => {
    const { container } = render(
      <Pagination page={1} totalPages={0} total={0} onPageChange={vi.fn()} />
    );
    expect(container.innerHTML).toBe('');
  });

  // ── Info text ──
  it('displays current page and total pages', () => {
    render(<Pagination {...defaultProps} page={3} />);
    expect(screen.getByText(/mostrando página 3 de 5/i)).toBeInTheDocument();
  });

  it('displays total results count', () => {
    render(<Pagination {...defaultProps} />);
    expect(screen.getByText(/50 resultados/i)).toBeInTheDocument();
  });

  // ── Page buttons ──
  it('renders page number buttons', () => {
    render(<Pagination {...defaultProps} />);
    for (let i = 1; i <= 5; i++) {
      expect(screen.getByRole('button', { name: String(i) })).toBeInTheDocument();
    }
  });

  it('calls onPageChange with correct page when page button is clicked', () => {
    const onPageChange = vi.fn();
    render(<Pagination {...defaultProps} onPageChange={onPageChange} />);
    fireEvent.click(screen.getByRole('button', { name: '3' }));
    expect(onPageChange).toHaveBeenCalledWith(3);
  });

  it('highlights the active page', () => {
    render(<Pagination {...defaultProps} page={3} />);
    const activeBtn = screen.getByRole('button', { name: '3' });
    expect(activeBtn.className).toContain('bg-primary-500/20');
    expect(activeBtn.className).toContain('text-primary-400');
  });

  it('does not highlight non-active pages', () => {
    render(<Pagination {...defaultProps} page={3} />);
    const inactiveBtn = screen.getByRole('button', { name: '1' });
    expect(inactiveBtn.className).not.toContain('bg-primary-500/20');
  });

  // ── Previous button ──
  it('renders previous page button with aria-label', () => {
    render(<Pagination {...defaultProps} />);
    expect(screen.getByLabelText('Página anterior')).toBeInTheDocument();
  });

  it('disables previous button on first page', () => {
    render(<Pagination {...defaultProps} page={1} />);
    expect(screen.getByLabelText('Página anterior')).toBeDisabled();
  });

  it('enables previous button on page > 1', () => {
    render(<Pagination {...defaultProps} page={3} />);
    expect(screen.getByLabelText('Página anterior')).not.toBeDisabled();
  });

  it('calls onPageChange(page - 1) when previous is clicked', () => {
    const onPageChange = vi.fn();
    render(<Pagination {...defaultProps} page={3} onPageChange={onPageChange} />);
    fireEvent.click(screen.getByLabelText('Página anterior'));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  // ── Next button ──
  it('renders next page button with aria-label', () => {
    render(<Pagination {...defaultProps} />);
    expect(screen.getByLabelText('Página siguiente')).toBeInTheDocument();
  });

  it('disables next button on last page', () => {
    render(<Pagination {...defaultProps} page={5} />);
    expect(screen.getByLabelText('Página siguiente')).toBeDisabled();
  });

  it('enables next button when not on last page', () => {
    render(<Pagination {...defaultProps} page={3} />);
    expect(screen.getByLabelText('Página siguiente')).not.toBeDisabled();
  });

  it('calls onPageChange(page + 1) when next is clicked', () => {
    const onPageChange = vi.fn();
    render(<Pagination {...defaultProps} page={3} onPageChange={onPageChange} />);
    fireEvent.click(screen.getByLabelText('Página siguiente'));
    expect(onPageChange).toHaveBeenCalledWith(4);
  });

  // ── Many pages (window sliding) ──
  it('shows at most 5 page buttons for large page counts', () => {
    render(<Pagination page={5} totalPages={20} total={200} onPageChange={vi.fn()} />);
    const pageButtons = screen.getAllByRole('button').filter(
      btn => !btn.hasAttribute('aria-label') // exclude prev/next
    );
    expect(pageButtons).toHaveLength(5);
  });

  it('shows pages 1-5 when on first page of many', () => {
    render(<Pagination page={1} totalPages={20} total={200} onPageChange={vi.fn()} />);
    for (let i = 1; i <= 5; i++) {
      expect(screen.getByRole('button', { name: String(i) })).toBeInTheDocument();
    }
  });

  it('shows last 5 pages when on last page', () => {
    render(<Pagination page={20} totalPages={20} total={200} onPageChange={vi.fn()} />);
    for (let i = 16; i <= 20; i++) {
      expect(screen.getByRole('button', { name: String(i) })).toBeInTheDocument();
    }
  });

  it('centers current page in the window for middle pages', () => {
    render(<Pagination page={10} totalPages={20} total={200} onPageChange={vi.fn()} />);
    for (let i = 8; i <= 12; i++) {
      expect(screen.getByRole('button', { name: String(i) })).toBeInTheDocument();
    }
  });
});
