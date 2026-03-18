import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Header from '../Header';

describe('Header', () => {
  it('renders the title', () => {
    render(<Header title="Dashboard" />);
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });

  it('renders subtitle when provided', () => {
    render(<Header title="Dashboard" subtitle="Overview of systems" />);
    expect(screen.getByText('Overview of systems')).toBeInTheDocument();
  });

  it('does not render subtitle when omitted', () => {
    const { container } = render(<Header title="Dashboard" />);
    const paragraphs = container.querySelectorAll('p');
    expect(paragraphs).toHaveLength(0);
  });

  it('renders refresh button when onRefresh is provided', () => {
    const onRefresh = vi.fn();
    render(<Header title="Dashboard" onRefresh={onRefresh} />);
    const refreshBtn = screen.getByTitle('Actualizar datos');
    expect(refreshBtn).toBeInTheDocument();
    fireEvent.click(refreshBtn);
    expect(onRefresh).toHaveBeenCalledOnce();
  });

  it('does not render refresh button when onRefresh is omitted', () => {
    render(<Header title="Dashboard" />);
    expect(screen.queryByTitle('Actualizar datos')).toBeNull();
  });

  it('renders actions when provided', () => {
    render(
      <Header
        title="Dashboard"
        actions={<button data-testid="header-action">Export</button>}
      />,
    );
    expect(screen.getByTestId('header-action')).toBeInTheDocument();
  });
});
