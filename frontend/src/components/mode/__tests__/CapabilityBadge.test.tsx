import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import CapabilityBadge from '../CapabilityBadge';

describe('CapabilityBadge', () => {
  it('renders action and Live label for real tier', () => {
    render(<CapabilityBadge action="View" tier="real" />);
    expect(screen.getByText('View: Live')).toBeInTheDocument();
  });

  it('renders action and Fallback label for fallback tier', () => {
    render(<CapabilityBadge action="Execute" tier="fallback" />);
    expect(screen.getByText('Execute: Fallback')).toBeInTheDocument();
  });

  it('renders action and Demo label for mock tier', () => {
    render(<CapabilityBadge action="Failover" tier="mock" />);
    expect(screen.getByText('Failover: Demo')).toBeInTheDocument();
  });

  it('renders Restricted label when restricted', () => {
    render(<CapabilityBadge action="Failover" tier="mock" restricted />);
    expect(screen.getByText('Failover: Restricted')).toBeInTheDocument();
  });

  it('shows (RO) when readOnly', () => {
    render(<CapabilityBadge action="View" tier="real" readOnly />);
    expect(screen.getByText('(RO)')).toBeInTheDocument();
  });

  it('does not show (RO) by default', () => {
    render(<CapabilityBadge action="View" tier="real" />);
    expect(screen.queryByText('(RO)')).not.toBeInTheDocument();
  });

  it('applies green styling for real tier', () => {
    render(<CapabilityBadge action="View" tier="real" />);
    const badge = screen.getByText('View: Live').closest('span');
    expect(badge?.className).toContain('emerald');
  });

  it('applies amber styling for fallback tier', () => {
    render(<CapabilityBadge action="Execute" tier="fallback" />);
    const badge = screen.getByText('Execute: Fallback').closest('span');
    expect(badge?.className).toContain('amber');
  });

  it('applies red styling when restricted', () => {
    render(<CapabilityBadge action="Failover" tier="mock" restricted />);
    const badge = screen.getByText('Failover: Restricted').closest('span');
    expect(badge?.className).toContain('red');
  });

  it('includes readOnly info in title', () => {
    render(<CapabilityBadge action="View" tier="real" readOnly />);
    const badge = screen.getByText('View: Live').closest('span');
    expect(badge?.getAttribute('title')).toContain('read-only');
  });
});
