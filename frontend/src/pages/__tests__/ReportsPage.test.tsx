import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ReportsPage from '../ReportsPage';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'reports.typeDaily': 'Diario',
        'reports.typeWeekly': 'Semanal',
        'reports.typeHealth': 'Salud',
        'reports.typeAudit': 'Auditoría',
        'reports.typeDescDaily': 'Últimas 24h',
        'reports.typeDescWeekly': 'Tendencias 7 días',
        'reports.typeDescHealth': 'Estado infra completo',
        'reports.typeDescAudit': 'Hash chain inmutable',
      };
      return translations[key] || key;
    },
  }),
}));

vi.mock('../../services/dataService', () => ({
  dataService: {
    getEvents: vi.fn().mockResolvedValue([
      { id: 'evt-1', type: 'alert', message: 'CPU high' },
    ]),
    getAlerts: vi.fn().mockResolvedValue([
      { id: 'alt-1', status: 'active', title: 'High CPU' },
      { id: 'alt-2', status: 'resolved', title: 'Disk full' },
    ]),
  },
}));

describe('ReportsPage', () => {
  it('renders the page header', async () => {
    render(
      <MemoryRouter>
        <ReportsPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      // "Reportes" appears in both Header and PageHeader
      expect(screen.getAllByText('Reportes').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText(/Genera reportes operativos/)).toBeInTheDocument();
    });
  });

  it('renders report type cards', async () => {
    render(
      <MemoryRouter>
        <ReportsPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText('Diario')).toBeInTheDocument();
      expect(screen.getByText('Semanal')).toBeInTheDocument();
      expect(screen.getByText('Salud')).toBeInTheDocument();
      expect(screen.getByText('Auditoría')).toBeInTheDocument();
    });
  });

  it('shows empty state when no reports generated', async () => {
    render(
      <MemoryRouter>
        <ReportsPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText('Sin reportes')).toBeInTheDocument();
      expect(screen.getByText('Genera un reporte desde las tarjetas de arriba')).toBeInTheDocument();
    });
  });

  it('renders generate buttons for each report type', async () => {
    render(
      <MemoryRouter>
        <ReportsPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      const generateButtons = screen.getAllByText('Generar');
      expect(generateButtons.length).toBe(4);
    });
  });

  it('renders report descriptions', async () => {
    render(
      <MemoryRouter>
        <ReportsPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText('Últimas 24h')).toBeInTheDocument();
      expect(screen.getByText('Tendencias 7 días')).toBeInTheDocument();
      expect(screen.getByText('Estado infra completo')).toBeInTheDocument();
      expect(screen.getByText('Hash chain inmutable')).toBeInTheDocument();
    });
  });
});
