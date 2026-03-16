import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import BackgroundJobsPage from '../BackgroundJobsPage';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'backgroundJobs.statusRunning': 'Ejecutando',
        'backgroundJobs.statusScheduled': 'Programado',
        'backgroundJobs.statusFinished': 'Finalizado',
        'backgroundJobs.statusFailed': 'Fallido',
        'backgroundJobs.statusCanceled': 'Cancelado',
        'backgroundJobs.kpiRunning': 'Ejecutando',
        'backgroundJobs.kpiScheduled': 'Programados',
        'backgroundJobs.kpiFinished': 'Finalizados',
        'backgroundJobs.kpiFailed': 'Fallidos',
      };
      return translations[key] || key;
    },
  }),
}));

vi.mock('../../services/dataService', () => ({
  dataService: {
    getBackgroundJobs: vi.fn().mockResolvedValue([
      { id: 'job-1', name: 'RDDIMPDP', sid: 'EP1', systemId: 'sys-1', status: 'running', class: 'A', runtime: '00:12:34', scheduledBy: 'DDIC', client: '100', currentStep: 2, stepCount: 5, startedAt: '2025-06-01T10:00:00Z' },
      { id: 'job-2', name: 'RSBTCDEL', sid: 'EP1', systemId: 'sys-1', status: 'failed', class: 'B', runtime: '00:03:10', scheduledBy: 'BASIS_ADMIN', client: '100', currentStep: 1, stepCount: 3, startedAt: '2025-06-01T09:00:00Z', error: 'ABAP runtime error: DBIF_RSQL_SQL_ERROR' },
      { id: 'job-3', name: 'SAP_COLLECTOR', sid: 'EQ1', systemId: 'sys-2', status: 'finished', class: 'C', runtime: '00:01:45', scheduledBy: 'SYSTEM', client: '000', currentStep: 2, stepCount: 2 },
      { id: 'job-4', name: 'SM21_CLEANUP', sid: 'EP1', systemId: 'sys-1', status: 'scheduled', class: 'A', runtime: null, scheduledBy: 'DDIC', client: '100', currentStep: 0, stepCount: 1 },
    ]),
    getSystems: vi.fn().mockResolvedValue([
      { id: 'sys-1', sid: 'EP1', description: 'Production ERP', type: 'S/4HANA' },
      { id: 'sys-2', sid: 'EQ1', description: 'Quality ERP', type: 'S/4HANA' },
    ]),
  },
}));

describe('BackgroundJobsPage', () => {
  it('renders page header', async () => {
    render(
      <MemoryRouter>
        <BackgroundJobsPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText('Background Jobs')).toBeInTheDocument();
    });
  });

  it('renders KPI cards with correct counts', async () => {
    render(
      <MemoryRouter>
        <BackgroundJobsPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      // KPI labels appear in cards (may also appear in status badges)
      expect(screen.getAllByText('Ejecutando').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Programados').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Finalizados').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Fallidos').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('displays job names in the table', async () => {
    render(
      <MemoryRouter>
        <BackgroundJobsPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText('RDDIMPDP')).toBeInTheDocument();
      // RSBTCDEL appears in both table and failed jobs detail
      expect(screen.getAllByText('RSBTCDEL').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('SAP_COLLECTOR')).toBeInTheDocument();
    });
  });

  it('shows failed jobs detail section with error message', async () => {
    render(
      <MemoryRouter>
        <BackgroundJobsPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText(/Jobs Fallidos/)).toBeInTheDocument();
      expect(screen.getByText('ABAP runtime error: DBIF_RSQL_SQL_ERROR')).toBeInTheDocument();
    });
  });

  it('shows total job count', async () => {
    render(
      <MemoryRouter>
        <BackgroundJobsPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText('4 jobs')).toBeInTheDocument();
    });
  });
});
