import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import SourceIndicator from '../SourceIndicator';

describe('SourceIndicator', () => {
  const baseProps = {
    source: 'real' as const,
    confidence: 'high' as const,
    degraded: false,
    timestamp: new Date().toISOString(),
  };

  it('renders API label for real source', () => {
    render(<SourceIndicator {...baseProps} />);
    expect(screen.getByText('API')).toBeInTheDocument();
  });

  it('renders Cache label for fallback source', () => {
    render(<SourceIndicator {...baseProps} source="fallback" />);
    expect(screen.getByText('Cache')).toBeInTheDocument();
  });

  it('renders Simulation label for mock source', () => {
    render(<SourceIndicator {...baseProps} source="mock" />);
    expect(screen.getByText('Simulation')).toBeInTheDocument();
  });

  it('renders confidence bar', () => {
    render(<SourceIndicator {...baseProps} />);
    expect(screen.getByTestId('confidence-bar')).toBeInTheDocument();
  });

  it('does not show degraded warning when not degraded', () => {
    render(<SourceIndicator {...baseProps} degraded={false} />);
    expect(screen.queryByTestId('degraded-warning')).not.toBeInTheDocument();
  });

  it('shows degraded warning when degraded', () => {
    render(<SourceIndicator {...baseProps} degraded={true} />);
    expect(screen.getByTestId('degraded-warning')).toBeInTheDocument();
    expect(screen.getByText('Degraded')).toBeInTheDocument();
  });

  it('renders timestamp as relative time', () => {
    render(<SourceIndicator {...baseProps} timestamp={new Date().toISOString()} />);
    expect(screen.getByText('0s ago')).toBeInTheDocument();
  });

  it('shows reason in title when provided', () => {
    const { container } = render(
      <SourceIndicator {...baseProps} reason="Backend timeout" />
    );
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.getAttribute('title')).toBe('Backend timeout');
  });

  it('applies green color for real source', () => {
    render(<SourceIndicator {...baseProps} source="real" />);
    const label = screen.getByText('API').closest('span');
    expect(label?.className).toContain('emerald');
  });

  it('applies amber color for fallback source', () => {
    render(<SourceIndicator {...baseProps} source="fallback" />);
    const label = screen.getByText('Cache').closest('span');
    expect(label?.className).toContain('amber');
  });

  it('applies blue color for mock source', () => {
    render(<SourceIndicator {...baseProps} source="mock" />);
    const label = screen.getByText('Simulation').closest('span');
    expect(label?.className).toContain('blue');
  });
});
