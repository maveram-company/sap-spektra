import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SLAPage from '../SLAPage';

vi.mock('../../services/dataService', () => ({
  dataService: {
    getSystems: vi.fn().mockResolvedValue([
      {
        id: 'sys-1',
        sid: 'EP1',
        environment: 'PRD',
        healthScore: 95,
        mttr: 12,
        mtbf: 4320,
        availability: 99.95,
      },
      {
        id: 'sys-2',
        sid: 'QP1',
        environment: 'QAS',
        healthScore: 82,
        mttr: 25,
        mtbf: 2880,
        availability: 99.8,
      },
    ]),
    getAnalytics: vi.fn().mockResolvedValue({
      alertStats: {
        total: 47,
        critical: 3,
        warnings: 12,
        autoResolved: 28,
        avgResolutionMin: 8,
      },
      slaMetrics: {
        runbooksToday: 12,
        successRate: 94,
        avgDuration: '3m 20s',
        mostExecuted: 'Restart Dispatcher',
        pendingApproval: 2,
      },
    }),
  },
}));

describe('SLAPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the SLA page with header', async () => {
    render(
      <MemoryRouter>
        <SLAPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText('SLA & Analytics')).toBeInTheDocument();
    });
  });

  it('shows loading state initially', () => {
    render(
      <MemoryRouter>
        <SLAPage />
      </MemoryRouter>
    );
    expect(screen.getByText('Cargando SLA...')).toBeInTheDocument();
  });

  it('displays SLA per system section', async () => {
    render(
      <MemoryRouter>
        <SLAPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText('SLA por Sistema')).toBeInTheDocument();
      expect(screen.getByText('EP1')).toBeInTheDocument();
      expect(screen.getByText('QP1')).toBeInTheDocument();
    });
  });

  it('renders system health scores', async () => {
    render(
      <MemoryRouter>
        <SLAPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText('95')).toBeInTheDocument();
      expect(screen.getByText('82')).toBeInTheDocument();
    });
  });

  it('renders analytics tables', async () => {
    render(
      <MemoryRouter>
        <SLAPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText('Runbook Analytics')).toBeInTheDocument();
      expect(screen.getByText(/Estadísticas Alertas/)).toBeInTheDocument();
    });
  });

  it('displays alert statistics', async () => {
    render(
      <MemoryRouter>
        <SLAPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText('Total alertas')).toBeInTheDocument();
      expect(screen.getByText('47')).toBeInTheDocument();
      expect(screen.getByText('Auto-resueltas')).toBeInTheDocument();
      expect(screen.getByText('28')).toBeInTheDocument();
    });
  });

  it('displays runbook metrics', async () => {
    render(
      <MemoryRouter>
        <SLAPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText('Runbooks hoy')).toBeInTheDocument();
      expect(screen.getByText('Tasa de éxito')).toBeInTheDocument();
      expect(screen.getByText('94%')).toBeInTheDocument();
      expect(screen.getByText('Duración promedio')).toBeInTheDocument();
      expect(screen.getByText('3m 20s')).toBeInTheDocument();
    });
  });
});
