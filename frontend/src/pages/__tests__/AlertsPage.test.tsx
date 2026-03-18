import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AlertsPage from '../AlertsPage';

vi.mock('../../mode/ModeContext', () => ({
  useMode: () => ({
    state: { mode: 'REAL', resolvedAt: new Date().toISOString(), capabilities: new Map(), backendReachable: true },
    setMode: () => {},
    getDomainCapability: () => undefined,
  }),
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { name: 'Test User', email: 'test@example.com' },
    hasRole: () => true,
  }),
}));

vi.mock('../../services/dataService', () => {
  const alerts = [
    { id: '1', title: 'High CPU', level: 'critical', status: 'active', systemId: 'sys-1', sid: 'EP1', createdAt: new Date().toISOString(), message: 'CPU > 90%', time: '10:30' },
  ];
  return {
    dataService: {
      getAlerts: vi.fn().mockResolvedValue(alerts),
      getSystems: vi.fn().mockResolvedValue([
        { id: 'sys-1', sid: 'EP1', description: 'Production' },
      ]),
    },
    getAlertsResult: vi.fn().mockResolvedValue({
      data: alerts,
      source: 'real',
      confidence: 'high',
      timestamp: new Date().toISOString(),
      degraded: false,
    }),
  };
});

describe('AlertsPage', () => {
  it('renders alerts', async () => {
    render(
      <MemoryRouter>
        <AlertsPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText('High CPU')).toBeInTheDocument();
    });
  });

  it('renders alert message', async () => {
    render(
      <MemoryRouter>
        <AlertsPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText('CPU > 90%')).toBeInTheDocument();
    });
  });

  it('shows escalation flow', async () => {
    render(
      <MemoryRouter>
        <AlertsPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText('Flujo de Escalamiento')).toBeInTheDocument();
    });
  });
});
