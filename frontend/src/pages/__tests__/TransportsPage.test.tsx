import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import TransportsPage from '../TransportsPage';

vi.mock('../../services/dataService', () => ({
  dataService: {
    getTransports: vi.fn().mockResolvedValue([
      { id: 'tr-1', transportId: 'EP1K900001', description: 'Fix critical performance issue', sid: 'EP1', targetSystem: 'EQ1', status: 'released', rc: null, owner: 'DEVELOPER1', createdAt: '2025-06-01T08:00:00Z' },
      { id: 'tr-2', transportId: 'EP1K900002', description: 'New ABAP report', sid: 'EP1', targetSystem: 'EQ1', status: 'imported', rc: 0, owner: 'DEVELOPER2', createdAt: '2025-05-30T14:00:00Z' },
      { id: 'tr-3', transportId: 'EQ1K900003', description: 'Config transport error', sid: 'EQ1', targetSystem: 'EP1', status: 'error', rc: 8, owner: 'BASIS_ADMIN', createdAt: '2025-05-29T10:00:00Z', error: 'Import failed RC=8' },
    ]),
    getSystems: vi.fn().mockResolvedValue([
      { id: 'sys-1', sid: 'ED1', type: 'S/4HANA', environment: 'DEV' },
      { id: 'sys-2', sid: 'EQ1', type: 'S/4HANA', environment: 'QAS' },
      { id: 'sys-3', sid: 'EP1', type: 'S/4HANA', environment: 'PRD' },
    ]),
  },
}));

describe('TransportsPage', () => {
  it('renders the page header', async () => {
    render(
      <MemoryRouter>
        <TransportsPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText(/Transporte de Órdenes/)).toBeInTheDocument();
    });
  });

  it('renders KPI cards', async () => {
    render(
      <MemoryRouter>
        <TransportsPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText('Total Transportes')).toBeInTheDocument();
      expect(screen.getByText('Pendientes Import')).toBeInTheDocument();
      expect(screen.getByText('Importados OK')).toBeInTheDocument();
      // "Con Error" appears in KPI card and filter dropdown
      expect(screen.getAllByText('Con Error').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('displays transport IDs in the table', async () => {
    render(
      <MemoryRouter>
        <TransportsPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText('EP1K900001')).toBeInTheDocument();
      expect(screen.getByText('EP1K900002')).toBeInTheDocument();
      // EQ1K900003 appears in both the table and the error detail section
      expect(screen.getAllByText('EQ1K900003').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('renders landscape transport path diagram', async () => {
    render(
      <MemoryRouter>
        <TransportsPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText('Landscape Transport Path')).toBeInTheDocument();
    });
  });

  it('shows error transports section when errors exist', async () => {
    render(
      <MemoryRouter>
        <TransportsPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText('Transportes con Error')).toBeInTheDocument();
    });
  });
});
