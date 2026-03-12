import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import DashboardPage from '../DashboardPage';

// Mock contexts
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { name: 'Test User', username: 'admin' } }),
}));
vi.mock('../../contexts/TenantContext', () => ({
  useTenant: () => ({ organization: { name: 'Test Org' } }),
}));

// Mock dataService
vi.mock('../../services/dataService', () => ({
  dataService: {
    getSystems: vi.fn().mockResolvedValue([
      { id: '1', sid: 'EP1', status: 'healthy', healthScore: 95, description: 'Production', type: 'S/4HANA', dbType: 'HANA 2.0', environment: 'PRD', mode: 'PRODUCTION', breaches: 0 },
    ]),
    getApprovals: vi.fn().mockResolvedValue([]),
  },
}));

describe('DashboardPage', () => {
  it('renders greeting with user name', async () => {
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText(/hola, test user/i)).toBeInTheDocument();
    });
  });

  it('renders KPI cards', async () => {
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText(/sistemas activos/i)).toBeInTheDocument();
    });
  });

  it('renders system cards', async () => {
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText('EP1')).toBeInTheDocument();
    });
  });
});
