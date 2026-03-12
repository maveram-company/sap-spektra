import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import HAControlCenterPage from '../HAControlCenterPage';

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { name: 'Test User', email: 'test@example.com' },
  }),
}));

vi.mock('../../services/dataService', () => ({
  dataService: {
    getHASystems: vi.fn().mockResolvedValue([
      {
        systemId: 'sys-1',
        sid: 'EP1',
        haType: 'HSR',
        haStrategy: 'HOT_STANDBY',
        status: 'healthy',
        primaryNode: 'sap-ep1-primary',
        secondaryNode: 'sap-ep1-secondary',
        replicationMode: 'syncmem',
        replicationStatus: 'ACTIVE',
        lastFailover: null,
        rpo: '0s',
        rto: '< 2min',
        tier: 'Tier-1',
        region: 'us-east-1',
        primary: {
          host: 'sap-ep1-primary',
          instanceNr: '00',
          ip: '10.0.1.10',
          zone: 'us-east-1a',
          state: 'running',
          instanceType: 'm5.4xlarge',
          vcpu: 16,
          memoryGb: 64,
        },
        secondary: {
          host: 'sap-ep1-secondary',
          instanceNr: '01',
          ip: '10.0.2.10',
          zone: 'us-east-1b',
          state: 'running',
          instanceType: 'm5.4xlarge',
          vcpu: 16,
          memoryGb: 64,
        },
      },
    ]),
    getHAOpsHistory: vi.fn().mockResolvedValue([
      {
        id: 'ha-op-001',
        systemId: 'sys-1',
        type: 'TAKEOVER',
        strategy: 'HOT_STANDBY',
        status: 'COMPLETED',
        triggeredBy: 'admin@empresa.com',
        reason: 'TAKEOVER manual',
        startedAt: '2026-03-09T10:00:00Z',
        completedAt: '2026-03-09T10:02:00Z',
        duration: '120s',
        steps: 5,
        stepsOk: 5,
      },
    ]),
    getHADrivers: vi.fn().mockResolvedValue([
      { name: 'Pacemaker', version: '2.1.5', status: 'active' },
    ]),
    getHAPrereqs: vi.fn().mockResolvedValue({
      fencing: true,
      hooks: true,
      sudoers: true,
    }),
  },
}));

describe('HAControlCenterPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the HA Control Center header', async () => {
    render(
      <MemoryRouter>
        <HAControlCenterPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText('HA Control Center')).toBeInTheDocument();
    });
  });

  it('shows loading state initially', () => {
    render(
      <MemoryRouter>
        <HAControlCenterPage />
      </MemoryRouter>
    );
    expect(screen.getByText(/Cargando/i)).toBeInTheDocument();
  });

  it('displays HA system information', async () => {
    render(
      <MemoryRouter>
        <HAControlCenterPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText('EP1')).toBeInTheDocument();
    });
  });

  it('renders tab navigation for systems', async () => {
    render(
      <MemoryRouter>
        <HAControlCenterPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText('Sistemas HA')).toBeInTheDocument();
    });
  });

  it('shows the subtitle with strategy info', async () => {
    render(
      <MemoryRouter>
        <HAControlCenterPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText(/Orquestación de Alta Disponibilidad/)).toBeInTheDocument();
    });
  });
});
