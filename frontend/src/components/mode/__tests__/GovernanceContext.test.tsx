import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import GovernanceContext from '../GovernanceContext';

describe('GovernanceContext', () => {
  it('renders nothing when no props provided', () => {
    const { container } = render(<GovernanceContext />);
    expect(container.firstChild).toBeNull();
  });

  it('renders approval required badge', () => {
    render(<GovernanceContext requiresApproval />);
    expect(screen.getByText('Approval Required')).toBeInTheDocument();
  });

  it('renders risk level badge', () => {
    render(<GovernanceContext riskLevel="high" />);
    expect(screen.getByText('Risk: high')).toBeInTheDocument();
  });

  it('applies red styling for critical risk', () => {
    render(<GovernanceContext riskLevel="critical" />);
    const badge = screen.getByText('Risk: critical').closest('span');
    expect(badge?.className).toContain('red');
  });

  it('applies amber styling for medium risk', () => {
    render(<GovernanceContext riskLevel="medium" />);
    const badge = screen.getByText('Risk: medium').closest('span');
    expect(badge?.className).toContain('amber');
  });

  it('applies green styling for low risk', () => {
    render(<GovernanceContext riskLevel="low" />);
    const badge = screen.getByText('Risk: low').closest('span');
    expect(badge?.className).toContain('emerald');
  });

  it('renders manual assisted badge', () => {
    render(<GovernanceContext manualAssisted />);
    expect(screen.getByText('Manual Assisted')).toBeInTheDocument();
  });

  it('renders restrictions count badge', () => {
    render(<GovernanceContext restrictions={['No execution in demo', 'Read-only']} />);
    expect(screen.getByTestId('restrictions-badge')).toBeInTheDocument();
    expect(screen.getByText('2 restrictions')).toBeInTheDocument();
  });

  it('renders singular restriction text for single restriction', () => {
    render(<GovernanceContext restrictions={['No execution in demo']} />);
    expect(screen.getByText('1 restriction')).toBeInTheDocument();
  });

  it('does not render restrictions badge for empty array', () => {
    render(<GovernanceContext restrictions={[]} riskLevel="low" />);
    expect(screen.queryByTestId('restrictions-badge')).not.toBeInTheDocument();
  });

  it('renders recommended action', () => {
    render(<GovernanceContext recommendedAction="Connect real backend" />);
    expect(screen.getByText('Connect real backend')).toBeInTheDocument();
  });

  it('renders multiple badges together', () => {
    render(
      <GovernanceContext
        requiresApproval
        riskLevel="high"
        restrictions={['Demo mode']}
        recommendedAction="Use real backend"
        manualAssisted
      />
    );
    expect(screen.getByText('Approval Required')).toBeInTheDocument();
    expect(screen.getByText('Risk: high')).toBeInTheDocument();
    expect(screen.getByText('1 restriction')).toBeInTheDocument();
    expect(screen.getByText('Use real backend')).toBeInTheDocument();
    expect(screen.getByText('Manual Assisted')).toBeInTheDocument();
  });

  it('has data-testid governance-context when content present', () => {
    render(<GovernanceContext requiresApproval />);
    expect(screen.getByTestId('governance-context')).toBeInTheDocument();
  });
});
