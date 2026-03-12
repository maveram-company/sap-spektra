import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import GeneralSettings from '../../settings/GeneralSettings';

vi.mock('../../../contexts/TenantContext', () => ({
  useTenant: () => ({
    organization: {
      name: 'Demo Organization',
      slug: 'demo-org',
      plan: 'professional',
      settings: { timezone: 'America/Bogota', language: 'es' },
      limits: { maxSystems: 25, maxUsers: 10, maxIntegrations: 3, aiCallsPerDay: 100 },
      usage: { systems: 9, users: 4, integrations: 1, aiCallsToday: 12 },
    },
    updateSettings: vi.fn(),
  }),
}));

vi.mock('../../../services/dataService', () => ({
  dataService: {
    getThresholds: vi.fn().mockResolvedValue([
      { metric: 'CPU (%)', warning: 80, critical: 95 },
      { metric: 'Memory (%)', warning: 85, critical: 95 },
    ]),
    getEscalationPolicy: vi.fn().mockResolvedValue([
      { level: 'L1', timeout: '5 min', recipients: 'Operadores', autoExecute: true },
      { level: 'L2', timeout: '15 min', recipients: 'Admins', autoExecute: false },
    ]),
    getMaintenanceWindows: vi.fn().mockResolvedValue([
      { system: 'EP1', day: 'Domingo', time: '02:00', duration: '4h', status: 'active' },
    ]),
    getApiKeys: vi.fn().mockResolvedValue([
      { name: 'Production API Key', key: 'sk-****-prod', created: '2025-01-15', status: 'active' },
    ]),
  },
}));

describe('GeneralSettings', () => {
  it('renders general settings heading', async () => {
    render(
      <MemoryRouter>
        <GeneralSettings />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText('General')).toBeInTheDocument();
      expect(screen.getByText('Configuración básica de tu organización')).toBeInTheDocument();
    });
  });

  it('renders organization info card', async () => {
    render(
      <MemoryRouter>
        <GeneralSettings />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText('Información de la Organización')).toBeInTheDocument();
    });
  });

  it('renders usage overview section', async () => {
    render(
      <MemoryRouter>
        <GeneralSettings />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText('Uso Actual')).toBeInTheDocument();
      expect(screen.getByText('Sistemas')).toBeInTheDocument();
      expect(screen.getByText('Usuarios')).toBeInTheDocument();
    });
  });

  it('renders danger zone', async () => {
    render(
      <MemoryRouter>
        <GeneralSettings />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText('Zona de Peligro')).toBeInTheDocument();
      expect(screen.getByText('Eliminar Organización')).toBeInTheDocument();
    });
  });

  it('renders monitoring thresholds table', async () => {
    render(
      <MemoryRouter>
        <GeneralSettings />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText('Umbrales de Monitoreo')).toBeInTheDocument();
    });
  });

  it('renders escalation policy section', async () => {
    render(
      <MemoryRouter>
        <GeneralSettings />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText('Política de Escalación')).toBeInTheDocument();
    });
  });
});
