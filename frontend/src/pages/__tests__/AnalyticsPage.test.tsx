import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AnalyticsPage from '../AnalyticsPage';

// Mock recharts to avoid rendering issues in jsdom
vi.mock('recharts', () => ({
  BarChart: ({ children }: any) => <div data-testid="bar-chart">{children}</div>,
  Bar: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
  Legend: () => null,
  PieChart: ({ children }: any) => <div data-testid="pie-chart">{children}</div>,
  Pie: () => null,
  Cell: () => null,
}));

// Mock FeatureGate to always render children
vi.mock('../../components/ui/FeatureGate', () => ({
  default: ({ children }: any) => <>{children}</>,
  UpgradeBanner: () => null,
}));

vi.mock('../../services/dataService', () => ({
  dataService: {
    getAnalytics: vi.fn().mockResolvedValue({
      totalExecutions: 156,
      successRate: 94,
      failedCount: 10,
      avgPerDay: 22,
      dailyTrend: [
        { date: '2026-03-04', success: 18, failed: 2 },
        { date: '2026-03-05', success: 20, failed: 1 },
      ],
      topRunbooks: [
        { id: 'rb-001', name: 'Restart Dispatcher', executions: 45, successRate: 98 },
        { id: 'rb-002', name: 'Clear SM12 Locks', executions: 32, successRate: 95 },
      ],
    }),
    getSystems: vi.fn().mockResolvedValue([
      { id: 'sys-1', sid: 'EP1', type: 'S/4HANA' },
      { id: 'sys-2', sid: 'QP1', type: 'S/4HANA' },
    ]),
  },
}));

describe('AnalyticsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the analytics page', async () => {
    render(
      <MemoryRouter>
        <AnalyticsPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText('Analytics')).toBeInTheDocument();
    });
  });

  it('shows loading state initially', () => {
    render(
      <MemoryRouter>
        <AnalyticsPage />
      </MemoryRouter>
    );
    expect(screen.getByText('Cargando analytics...')).toBeInTheDocument();
  });

  it('displays KPI cards', async () => {
    render(
      <MemoryRouter>
        <AnalyticsPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText('Total Ejecuciones')).toBeInTheDocument();
      expect(screen.getByText('156')).toBeInTheDocument();
      expect(screen.getAllByText(/Tasa de Éxito/i).length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText(/Fallidas/i).length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('10')).toBeInTheDocument();
    });
  });

  it('renders the top runbooks table', async () => {
    render(
      <MemoryRouter>
        <AnalyticsPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText('Top Runbooks')).toBeInTheDocument();
      expect(screen.getByText('Restart Dispatcher')).toBeInTheDocument();
      expect(screen.getByText('Clear SM12 Locks')).toBeInTheDocument();
    });
  });

  it('handles error state', async () => {
    const { dataService } = await import('../../services/dataService');
    (dataService.getAnalytics as any).mockRejectedValueOnce(new Error('API error'));
    (dataService.getSystems as any).mockRejectedValueOnce(new Error('API error'));

    render(
      <MemoryRouter>
        <AnalyticsPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText('Error al cargar analytics')).toBeInTheDocument();
    });
  });

  it('renders chart sections', async () => {
    render(
      <MemoryRouter>
        <AnalyticsPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText('Tendencia Diaria')).toBeInTheDocument();
      expect(screen.getByText('Distribución')).toBeInTheDocument();
    });
  });
});
