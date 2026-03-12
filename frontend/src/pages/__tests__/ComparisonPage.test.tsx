import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ComparisonPage from '../ComparisonPage';

// Mock recharts to avoid rendering issues in tests
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  BarChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Bar: () => <div />,
  XAxis: () => <div />,
  YAxis: () => <div />,
  CartesianGrid: () => <div />,
  Tooltip: () => <div />,
  Legend: () => <div />,
}));

vi.mock('../../hooks/usePlan', () => ({
  usePlan: () => ({
    hasFeature: () => true,
    currentPlan: { id: 'professional', features: ['comparison'] },
  }),
}));

vi.mock('../../services/dataService', () => ({
  dataService: {
    getSystems: vi.fn().mockResolvedValue([
      { id: 'sys-1', sid: 'ED1', status: 'healthy', healthScore: 92, type: 'S/4HANA', description: 'Dev ERP', environment: 'DEV', cpu: 45, mem: 60, disk: 55 },
      { id: 'sys-2', sid: 'EQ1', status: 'healthy', healthScore: 88, type: 'S/4HANA', description: 'Quality ERP', environment: 'QAS', cpu: 55, mem: 65, disk: 60 },
      { id: 'sys-3', sid: 'EP1', status: 'healthy', healthScore: 95, type: 'S/4HANA', description: 'Production ERP', environment: 'PRD', cpu: 70, mem: 75, disk: 50 },
    ]),
    getSIDLines: vi.fn().mockResolvedValue([
      { line: 'ERP', description: 'ERP Line', systems: ['sys-1', 'sys-2', 'sys-3'] },
    ]),
    getSystemMeta: vi.fn().mockResolvedValue({
      'sys-1': { sapRelease: '2023', kernelRelease: '793', sapNotes: 12, client: '100' },
      'sys-2': { sapRelease: '2023', kernelRelease: '793', sapNotes: 12, client: '200' },
      'sys-3': { sapRelease: '2023', kernelRelease: '793', sapNotes: 14, client: '100' },
    }),
    getLandscapeValidation: vi.fn().mockResolvedValue({
      ERP: {
        overallStatus: 'warning',
        lastValidated: '2025-06-01T12:00:00Z',
        checks: [
          { name: 'SAP Notes', status: 'warning', devValue: '12', qasValue: '12', prdValue: '14', detail: 'Notes count differs' },
        ],
      },
    }),
  },
}));

describe('ComparisonPage', () => {
  it('renders the page header', async () => {
    render(
      <MemoryRouter>
        <ComparisonPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText('Comparacion de Landscape SAP')).toBeInTheDocument();
    });
  });

  it('renders system cards for each environment', async () => {
    render(
      <MemoryRouter>
        <ComparisonPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText('ED1')).toBeInTheDocument();
      expect(screen.getByText('EQ1')).toBeInTheDocument();
      expect(screen.getByText('EP1')).toBeInTheDocument();
    });
  });

  it('renders landscape consistency section', async () => {
    render(
      <MemoryRouter>
        <ComparisonPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText('Consistencia de Landscape')).toBeInTheDocument();
    });
  });

  it('shows environment badges', async () => {
    render(
      <MemoryRouter>
        <ComparisonPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      // DEV/QAS/PRD appear in system cards and possibly in landscape table headers
      expect(screen.getAllByText('DEV').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('QAS').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('PRD').length).toBeGreaterThanOrEqual(1);
    });
  });
});
