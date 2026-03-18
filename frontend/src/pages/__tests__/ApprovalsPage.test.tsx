import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ApprovalsPage from '../ApprovalsPage';

vi.mock('../../mode/ModeContext', () => ({
  useMode: () => ({
    state: { mode: 'REAL', resolvedAt: new Date().toISOString(), capabilities: new Map(), backendReachable: true },
    setMode: () => {},
    getDomainCapability: () => ({ domain: 'approvals', tier: 'real', readOnly: false, degraded: false, confidence: 'high', source: 'api' }),
  }),
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    hasRole: () => true,
  }),
}));

vi.mock('../../services/dataService', () => ({
  dataService: {
    getApprovals: vi.fn().mockResolvedValue([
      {
        id: 'apr-1',
        sid: 'EP1',
        systemId: 'sys-1',
        runbookId: 'rb-001',
        description: 'Restart dispatcher due to high CPU',
        metric: 'CPU Usage',
        value: 95,
        severity: 'CRITICAL',
        status: 'PENDING',
        createdAt: '2026-03-10T08:30:00Z',
      },
      {
        id: 'apr-2',
        sid: 'QP1',
        systemId: 'sys-2',
        runbookId: 'rb-002',
        description: 'Memory cleanup',
        metric: 'Memory',
        value: 88,
        severity: 'HIGH',
        status: 'APPROVED',
        createdAt: '2026-03-09T14:00:00Z',
      },
    ]),
  },
}));

describe('ApprovalsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders pending approvals', async () => {
    render(
      <MemoryRouter>
        <ApprovalsPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText('EP1')).toBeInTheDocument();
      expect(screen.getByText('Restart dispatcher due to high CPU')).toBeInTheDocument();
    });
  });

  it('shows loading state initially', () => {
    render(
      <MemoryRouter>
        <ApprovalsPage />
      </MemoryRouter>
    );
    expect(screen.getByText('Cargando aprobaciones...')).toBeInTheDocument();
  });

  it('displays tab navigation', async () => {
    render(
      <MemoryRouter>
        <ApprovalsPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText('Pendientes')).toBeInTheDocument();
      expect(screen.getByText('Aprobadas')).toBeInTheDocument();
      expect(screen.getByText('Rechazadas')).toBeInTheDocument();
      expect(screen.getByText('Expiradas')).toBeInTheDocument();
    });
  });

  it('renders approve and reject buttons for pending items', async () => {
    render(
      <MemoryRouter>
        <ApprovalsPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText('Aprobar')).toBeInTheDocument();
      expect(screen.getByText('Rechazar')).toBeInTheDocument();
    });
  });

  it('shows severity badge', async () => {
    render(
      <MemoryRouter>
        <ApprovalsPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText('CRITICAL')).toBeInTheDocument();
    });
  });
});
