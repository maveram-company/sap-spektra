import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import FeatureGate from '../FeatureGate';

// Mock usePlan hook
const mockHasFeature = vi.fn();
vi.mock('../../../hooks/usePlan', () => ({
  usePlan: () => ({
    hasFeature: mockHasFeature,
  }),
}));

// Mock react-router-dom (FeatureGate imports useNavigate)
vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

describe('FeatureGate', () => {
  // ── Feature available ──
  it('renders children when feature is available', () => {
    mockHasFeature.mockReturnValue(true);
    render(
      <FeatureGate feature="ai_analysis">
        <div>Premium content</div>
      </FeatureGate>
    );
    expect(screen.getByText('Premium content')).toBeInTheDocument();
  });

  it('calls hasFeature with the correct feature name', () => {
    mockHasFeature.mockReturnValue(true);
    render(
      <FeatureGate feature="runbooks">
        <div>Content</div>
      </FeatureGate>
    );
    expect(mockHasFeature).toHaveBeenCalledWith('runbooks');
  });

  // ── Feature unavailable ──
  it('renders nothing when feature is unavailable and no fallback', () => {
    mockHasFeature.mockReturnValue(false);
    const { container } = render(
      <FeatureGate feature="ha_orchestration">
        <div>Hidden content</div>
      </FeatureGate>
    );
    expect(screen.queryByText('Hidden content')).not.toBeInTheDocument();
    expect(container.innerHTML).toBe('');
  });

  it('renders fallback when feature is unavailable', () => {
    mockHasFeature.mockReturnValue(false);
    render(
      <FeatureGate feature="ha_orchestration" fallback={<div>Upgrade required</div>}>
        <div>Hidden content</div>
      </FeatureGate>
    );
    expect(screen.queryByText('Hidden content')).not.toBeInTheDocument();
    expect(screen.getByText('Upgrade required')).toBeInTheDocument();
  });

  it('does not render fallback when feature is available', () => {
    mockHasFeature.mockReturnValue(true);
    render(
      <FeatureGate feature="monitoring" fallback={<div>Upgrade required</div>}>
        <div>Available content</div>
      </FeatureGate>
    );
    expect(screen.getByText('Available content')).toBeInTheDocument();
    expect(screen.queryByText('Upgrade required')).not.toBeInTheDocument();
  });
});
