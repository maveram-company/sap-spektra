import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import RunbooksPage from '../RunbooksPage';

vi.mock('../../mode/ModeContext', () => ({
  useMode: () => ({
    state: { mode: 'REAL', resolvedAt: new Date().toISOString(), capabilities: new Map(), backendReachable: true },
    setMode: () => {},
    getDomainCapability: () => ({ domain: 'runbooks', tier: 'real', readOnly: false, degraded: false, confidence: 'high', source: 'api' }),
  }),
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    hasRole: () => true,
  }),
}));

vi.mock('../../lib/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('../../services/dataService', () => ({
  dataService: {
    getRunbooks: vi.fn().mockResolvedValue([
      {
        id: 'rb-001',
        name: 'Restart Dispatcher',
        description: 'Reinicia el dispatcher SAP',
        costSafe: true,
        auto: true,
        gate: 'SAFE',
        dbType: 'HANA',
        totalRuns: 15,
        successRate: 93,
        avgDuration: '2m 30s',
        txCode: 'SM51',
        prereqs: ['SAP running'],
        steps: [
          { order: 1, action: 'Stop dispatcher', command: 'sapcontrol -function Stop' },
          { order: 2, action: 'Start dispatcher', command: 'sapcontrol -function Start' },
        ],
      },
    ]),
    getRunbookExecutions: vi.fn().mockResolvedValue([
      {
        runbookId: 'rb-001',
        sid: 'EP1',
        systemId: 'sys-1',
        gate: 'SAFE',
        result: 'SUCCESS',
        duration: '2m 15s',
        detail: 'Dispatcher restarted',
        ts: '2026-03-10 10:30:00',
        runbook: { name: 'Restart Dispatcher' },
      },
    ]),
    getSystems: vi.fn().mockResolvedValue([
      { id: 'sys-1', sid: 'EP1', type: 'S/4HANA', environment: 'PRD' },
    ]),
    executeRunbook: vi.fn().mockResolvedValue({
      result: 'SUCCESS',
      detail: 'Executed successfully',
      duration: '2m 10s',
    }),
  },
}));

describe('RunbooksPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the runbooks catalog', async () => {
    render(
      <MemoryRouter>
        <RunbooksPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText('Restart Dispatcher')).toBeInTheDocument();
    });
  });

  it('shows loading state initially', () => {
    render(
      <MemoryRouter>
        <RunbooksPage />
      </MemoryRouter>
    );
    expect(screen.getByText('Cargando runbooks...')).toBeInTheDocument();
  });

  it('renders header and description', async () => {
    render(
      <MemoryRouter>
        <RunbooksPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getAllByText('Runbooks').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('displays tabs for catalog and executions', async () => {
    render(
      <MemoryRouter>
        <RunbooksPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText(/Catálogo \(/)).toBeInTheDocument();
      expect(screen.getByText(/Ejecuciones \(/)).toBeInTheDocument();
    });
  });

  it('shows runbook details in the catalog', async () => {
    render(
      <MemoryRouter>
        <RunbooksPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText('Reinicia el dispatcher SAP')).toBeInTheDocument();
      expect(screen.getByText('93%')).toBeInTheDocument();
      expect(screen.getByText('2m 30s')).toBeInTheDocument();
    });
  });

  it('renders execute and dry-run buttons', async () => {
    render(
      <MemoryRouter>
        <RunbooksPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText('Ejecutar')).toBeInTheDocument();
      expect(screen.getByText('Dry-run')).toBeInTheDocument();
    });
  });
});
