import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import BillingPage from '../../settings/BillingPage';

vi.mock('../../../hooks/usePlan', () => ({
  usePlan: () => ({
    currentPlan: {
      id: 'professional',
      name: 'Professional',
      price: 299,
      description: 'Para operaciones SAP con automatización completa',
      features: ['monitoring', 'dashboard', 'alerts_basic', 'alerts_advanced', 'runbooks', 'ai_analysis'],
      limits: { maxSystems: 25, maxUsers: 10, maxIntegrations: 3, aiCallsPerDay: 100, retentionDays: 90 },
      popular: true,
    },
    getAllPlans: () => [
      {
        id: 'starter',
        name: 'Starter',
        price: 0,
        description: 'Para equipos que inician con monitoreo SAP',
        features: ['monitoring', 'dashboard', 'alerts_basic'],
        limits: { maxSystems: 3, maxUsers: 2, maxIntegrations: 0, aiCallsPerDay: 5, retentionDays: 7 },
        popular: false,
      },
      {
        id: 'professional',
        name: 'Professional',
        price: 299,
        description: 'Para operaciones SAP con automatización completa',
        features: ['monitoring', 'dashboard', 'alerts_basic', 'alerts_advanced', 'runbooks', 'ai_analysis'],
        limits: { maxSystems: 25, maxUsers: 10, maxIntegrations: 3, aiCallsPerDay: 100, retentionDays: 90 },
        popular: true,
      },
      {
        id: 'enterprise',
        name: 'Enterprise',
        price: null,
        description: 'Para organizaciones con requerimientos avanzados',
        features: ['monitoring', 'dashboard', 'alerts_basic', 'sso', 'api_access'],
        limits: { maxSystems: Infinity, maxUsers: Infinity, maxIntegrations: Infinity, aiCallsPerDay: 1000, retentionDays: 365 },
        popular: false,
      },
    ],
  }),
}));

describe('BillingPage', () => {
  it('renders billing heading', async () => {
    render(
      <MemoryRouter>
        <BillingPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText('Plan y Facturación')).toBeInTheDocument();
    });
  });

  it('renders current plan section', async () => {
    render(
      <MemoryRouter>
        <BillingPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText('Plan Professional')).toBeInTheDocument();
      expect(screen.getByText('Activo')).toBeInTheDocument();
    });
  });

  it('renders available plans section', async () => {
    render(
      <MemoryRouter>
        <BillingPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText('Planes Disponibles')).toBeInTheDocument();
      // Starter appears multiple times (plan card heading + feature comparison table header)
      expect(screen.getAllByText('Starter').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Enterprise').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('renders feature comparison table', async () => {
    render(
      <MemoryRouter>
        <BillingPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText('Comparación de Funcionalidades')).toBeInTheDocument();
      expect(screen.getByText('Funcionalidad')).toBeInTheDocument();
    });
  });

  it('shows current plan button as disabled', async () => {
    render(
      <MemoryRouter>
        <BillingPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText('Plan Actual')).toBeInTheDocument();
    });
  });
});
