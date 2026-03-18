import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import EvidencePanel from '../EvidencePanel';
import type { ProviderResult } from '../../../providers/types';

const makeResult = (overrides: Partial<ProviderResult<unknown>> = {}): ProviderResult<unknown> => ({
  data: [],
  source: 'real',
  confidence: 'high',
  timestamp: '2025-01-15T10:30:00.000Z',
  degraded: false,
  ...overrides,
});

describe('EvidencePanel', () => {
  it('renders collapsed by default', () => {
    render(<EvidencePanel result={makeResult()} domain="systems" action="getSystems" />);
    expect(screen.queryByTestId('evidence-details')).not.toBeInTheDocument();
  });

  it('shows domain and action in header', () => {
    render(<EvidencePanel result={makeResult()} domain="systems" action="getSystems" />);
    expect(screen.getByText(/systems \/ getSystems/)).toBeInTheDocument();
  });

  it('expands when clicked', () => {
    render(<EvidencePanel result={makeResult()} domain="alerts" action="getAlerts" />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByTestId('evidence-details')).toBeInTheDocument();
  });

  it('shows source field when expanded', () => {
    render(<EvidencePanel result={makeResult({ source: 'real' })} domain="d" action="a" />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText('real')).toBeInTheDocument();
  });

  it('shows confidence field when expanded', () => {
    render(<EvidencePanel result={makeResult({ confidence: 'medium' })} domain="d" action="a" />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText('medium')).toBeInTheDocument();
  });

  it('shows degraded=No when not degraded', () => {
    render(<EvidencePanel result={makeResult({ degraded: false })} domain="d" action="a" />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText('No')).toBeInTheDocument();
  });

  it('shows degraded=Yes when degraded', () => {
    render(<EvidencePanel result={makeResult({ degraded: true })} domain="d" action="a" />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText('Yes')).toBeInTheDocument();
  });

  it('shows reason when provided', () => {
    render(<EvidencePanel result={makeResult({ reason: 'Fallback active' })} domain="d" action="a" />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText('Fallback active')).toBeInTheDocument();
  });

  it('does not show reason section when not provided', () => {
    render(<EvidencePanel result={makeResult()} domain="d" action="a" />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.queryByText('Reason:')).not.toBeInTheDocument();
  });

  it('shows timestamp when expanded', () => {
    render(<EvidencePanel result={makeResult({ timestamp: '2025-01-15T10:30:00.000Z' })} domain="d" action="a" />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText('2025-01-15T10:30:00.000Z')).toBeInTheDocument();
  });

  it('collapses when clicked again', () => {
    render(<EvidencePanel result={makeResult()} domain="d" action="a" />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByTestId('evidence-details')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button'));
    expect(screen.queryByTestId('evidence-details')).not.toBeInTheDocument();
  });
});
