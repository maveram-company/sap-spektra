import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AdminPage from '../AdminPage';

vi.mock('../../services/dataService', () => ({
  dataService: {
    getSystems: vi.fn().mockResolvedValue([
      { id: 'sys-1', sid: 'EP1', status: 'healthy', healthScore: 95, description: 'Production ERP', type: 'S/4HANA', dbType: 'HANA 2.0', environment: 'PRD', mode: 'PRODUCTION', breaches: 0 },
      { id: 'sys-2', sid: 'EQ1', status: 'warning', healthScore: 78, description: 'Quality ERP', type: 'S/4HANA', dbType: 'HANA 2.0', environment: 'QAS', mode: 'TRIAL', breaches: 1 },
    ]),
  },
}));

describe('AdminPage', () => {
  it('renders system management header', async () => {
    render(
      <MemoryRouter>
        <AdminPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText('Gestión de Sistemas')).toBeInTheDocument();
    });
  });

  it('renders system SIDs in the table', async () => {
    render(
      <MemoryRouter>
        <AdminPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText('EP1')).toBeInTheDocument();
      expect(screen.getByText('EQ1')).toBeInTheDocument();
    });
  });

  it('displays system count in description', async () => {
    render(
      <MemoryRouter>
        <AdminPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText('2 sistemas registrados en la plataforma')).toBeInTheDocument();
    });
  });

  it('renders table column headers', async () => {
    render(
      <MemoryRouter>
        <AdminPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText('Sistema')).toBeInTheDocument();
      expect(screen.getByText('Tipo')).toBeInTheDocument();
      expect(screen.getByText('Ambiente')).toBeInTheDocument();
    });
  });

  it('renders connect system button', async () => {
    render(
      <MemoryRouter>
        <AdminPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText('Conectar Sistema')).toBeInTheDocument();
    });
  });
});
