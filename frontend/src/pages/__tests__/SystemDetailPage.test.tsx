import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import SystemDetailPage from '../SystemDetailPage';

// Mock recharts to avoid rendering issues in jsdom
vi.mock('recharts', () => ({
  LineChart: ({ children }: any) => <div data-testid="line-chart">{children}</div>,
  Line: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
  Legend: () => null,
}));

vi.mock('../../services/dataService', () => ({
  dataService: {
    getSystemById: vi.fn().mockResolvedValue({
      id: 'sys-1',
      sid: 'EP1',
      status: 'healthy',
      healthScore: 95,
      description: 'Production ERP',
      type: 'S/4HANA',
      dbType: 'HANA 2.0',
      environment: 'PRD',
      mode: 'PRODUCTION',
      breaches: 0,
      startedAt: '2026-03-01T00:00:00Z',
    }),
    getServerMetrics: vi.fn().mockResolvedValue({
      cpu: 45,
      memory: 62,
      disk: 38,
      network: '1.2 Gbps',
      stack: 'abap',
      dbInfo: { type: 'HANA', version: '2.0 SPS07', size: '512 GB', status: 'online' },
    }),
    getServerDeps: vi.fn().mockResolvedValue([
      { name: 'SAP Router', status: 'ok', latency: '2ms' },
    ]),
    getSAPMonitoring: vi.fn().mockResolvedValue({
      sm12: { locks: 3, longLocks: 0 },
      sm13: { pending: 0, errors: 0 },
      sm37: { running: 2, failed: 0, scheduled: 5 },
      sm21: { criticalLogs: 0, recentErrors: [] },
    }),
    getSystemInstances: vi.fn().mockResolvedValue([
      { instanceNr: '00', hostname: 'sap-ep1-ci', type: 'CI', status: 'running', cpu: 45, mem: 62, disk: 38, availability: 99.9 },
    ]),
    getSystemMeta: vi.fn().mockResolvedValue({
      kernel: '7.93',
      patchLevel: 'SP02',
      abapVersion: '7.57',
      osVersion: 'SLES 15 SP4',
      hostCount: 2,
    }),
    getSystemBreaches: vi.fn().mockResolvedValue([]),
    getSystemHosts: vi.fn().mockResolvedValue([
      { hostname: 'sap-ep1-ci', cpu: 45, mem: 62, disk: 38, os: 'SLES 15 SP4', role: 'CI' },
    ]),
    getMetricHistory: vi.fn().mockResolvedValue([
      { cpu: 40, mem: 60, disk: 37 },
      { cpu: 45, mem: 62, disk: 38 },
    ]),
  },
}));

function renderWithRoute() {
  return render(
    <MemoryRouter initialEntries={['/systems/sys-1']}>
      <Routes>
        <Route path="/systems/:systemId" element={<SystemDetailPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('SystemDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders system SID', async () => {
    renderWithRoute();
    await waitFor(() => {
      expect(screen.getByText('EP1')).toBeInTheDocument();
    });
  });

  it('shows overview tab by default', async () => {
    renderWithRoute();
    await waitFor(() => {
      expect(screen.getByText('Overview')).toBeInTheDocument();
    });
  });

  it('renders tab navigation', async () => {
    renderWithRoute();
    await waitFor(() => {
      expect(screen.getByText('Hosts')).toBeInTheDocument();
      expect(screen.getAllByText('Database').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('Dependencies')).toBeInTheDocument();
    });
  });

  it('displays health score', async () => {
    renderWithRoute();
    await waitFor(() => {
      expect(screen.getByText('95')).toBeInTheDocument();
    });
  });

  it('shows loading state initially', () => {
    render(
      <MemoryRouter initialEntries={['/systems/sys-1']}>
        <Routes>
          <Route path="/systems/:systemId" element={<SystemDetailPage />} />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByText('Cargando sistema...')).toBeInTheDocument();
  });
});
