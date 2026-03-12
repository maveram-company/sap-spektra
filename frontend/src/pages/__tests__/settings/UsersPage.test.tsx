import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import UsersPage from '../../settings/UsersPage';

vi.mock('../../../contexts/TenantContext', () => ({
  useTenant: () => ({
    organization: {
      name: 'Demo Organization',
      limits: { maxUsers: 10 },
    },
  }),
}));

vi.mock('../../../services/dataService', () => ({
  dataService: {
    getUsers: vi.fn().mockResolvedValue([
      { id: 'usr-1', name: 'Admin User', email: 'admin@example.com', role: 'admin', status: 'active', lastLogin: '2025-06-01T10:00:00Z' },
      { id: 'usr-2', name: 'Operator User', email: 'operator@example.com', role: 'operator', status: 'active', lastLogin: '2025-06-01T09:00:00Z' },
      { id: 'usr-3', name: 'Invited User', email: 'invited@example.com', role: 'viewer', status: 'invited', lastLogin: null },
    ]),
  },
}));

describe('UsersPage', () => {
  it('renders the users heading', async () => {
    render(
      <MemoryRouter>
        <UsersPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText('Usuarios')).toBeInTheDocument();
    });
  });

  it('displays user names in the table', async () => {
    render(
      <MemoryRouter>
        <UsersPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText('Admin User')).toBeInTheDocument();
      expect(screen.getByText('Operator User')).toBeInTheDocument();
      expect(screen.getByText('Invited User')).toBeInTheDocument();
    });
  });

  it('renders user count and limit', async () => {
    render(
      <MemoryRouter>
        <UsersPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText('3 de 10 usuarios')).toBeInTheDocument();
    });
  });

  it('renders invite user button', async () => {
    render(
      <MemoryRouter>
        <UsersPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText('Invitar Usuario')).toBeInTheDocument();
    });
  });

  it('renders table column headers', async () => {
    render(
      <MemoryRouter>
        <UsersPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText('Usuario')).toBeInTheDocument();
      expect(screen.getByText('Rol')).toBeInTheDocument();
      expect(screen.getByText('Estado')).toBeInTheDocument();
      expect(screen.getByText('Último Acceso')).toBeInTheDocument();
    });
  });
});
