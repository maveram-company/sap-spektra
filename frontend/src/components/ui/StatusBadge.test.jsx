import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import StatusBadge from './StatusBadge';

describe('StatusBadge', () => {
  it('renders healthy status with correct label', () => {
    render(<StatusBadge status="healthy" />);
    expect(screen.getByText('Saludable')).toBeInTheDocument();
  });

  it('renders warning status with correct label', () => {
    render(<StatusBadge status="warning" />);
    expect(screen.getByText('Atención')).toBeInTheDocument();
  });

  it('renders critical status with correct label', () => {
    render(<StatusBadge status="critical" />);
    expect(screen.getByText('Crítico')).toBeInTheDocument();
  });

  it('applies success variant for healthy status', () => {
    const { container } = render(<StatusBadge status="healthy" />);
    expect(container.innerHTML).toContain('success');
  });

  it('applies danger variant for critical status', () => {
    const { container } = render(<StatusBadge status="critical" />);
    expect(container.innerHTML).toContain('danger');
  });

  it('falls back to default variant for unknown status', () => {
    render(<StatusBadge status="unknown-status" />);
    expect(screen.getByText('unknown-status')).toBeInTheDocument();
  });

  it('handles case-insensitive status', () => {
    render(<StatusBadge status="HEALTHY" />);
    expect(screen.getByText('Saludable')).toBeInTheDocument();
  });
});
