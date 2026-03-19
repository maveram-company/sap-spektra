import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import RISELimitationBadge from '../RISELimitationBadge';

describe('RISELimitationBadge', () => {
  it('renders compact badge with RISE text', () => {
    render(<RISELimitationBadge compact />);
    expect(screen.getByText('RISE')).toBeInTheDocument();
  });

  it('compact badge has title with RISE info', () => {
    render(<RISELimitationBadge compact />);
    const badge = screen.getByText('RISE').closest('span');
    expect(badge?.getAttribute('title')).toContain('SAP RISE');
  });

  it('compact badge applies amber styling', () => {
    render(<RISELimitationBadge compact />);
    const badge = screen.getByText('RISE').closest('span');
    expect(badge?.className).toContain('amber');
  });

  it('renders full badge by default', () => {
    render(<RISELimitationBadge />);
    expect(
      screen.getByText('SAP RISE — Cloud Connector Limitations'),
    ).toBeInTheDocument();
  });

  it('lists unavailable capabilities in full mode', () => {
    render(<RISELimitationBadge />);
    expect(
      screen.getByText('OS-level metrics (CPU, RAM, disk)'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Host-level runbook execution'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('HA/DR physical failover'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Local evidence collection'),
    ).toBeInTheDocument();
  });

  it('shows explanation paragraph in full mode', () => {
    render(<RISELimitationBadge />);
    expect(
      screen.getByText(/This system connects via SAP Cloud Connector/),
    ).toBeInTheDocument();
  });

  it('does not render compact badge when compact is false', () => {
    render(<RISELimitationBadge compact={false} />);
    expect(screen.queryByText('RISE')).not.toBeInTheDocument();
    expect(
      screen.getByText('SAP RISE — Cloud Connector Limitations'),
    ).toBeInTheDocument();
  });
});
