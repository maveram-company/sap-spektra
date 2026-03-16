import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import IntegrationsPage from '../../settings/IntegrationsPage';

vi.mock('../../../hooks/usePlan', () => ({
  usePlan: () => ({
    hasFeature: (feature: string) => ['integrations_basic', 'alerts_basic'].includes(feature),
  }),
}));

describe('IntegrationsPage', () => {
  it('renders integrations heading', async () => {
    render(
      <MemoryRouter>
        <IntegrationsPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText('Integraciones')).toBeInTheDocument();
      expect(screen.getByText('Conecta SAP Spektra con tus herramientas')).toBeInTheDocument();
    });
  });

  it('renders integration cards', async () => {
    render(
      <MemoryRouter>
        <IntegrationsPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText('Slack')).toBeInTheDocument();
      expect(screen.getByText('Microsoft Teams')).toBeInTheDocument();
      expect(screen.getByText('Email (SES)')).toBeInTheDocument();
    });
  });

  it('renders premium integrations', async () => {
    render(
      <MemoryRouter>
        <IntegrationsPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText('ServiceNow')).toBeInTheDocument();
      expect(screen.getByText('Jira')).toBeInTheDocument();
      expect(screen.getByText('PagerDuty')).toBeInTheDocument();
    });
  });

  it('shows connected badge for connected integrations', async () => {
    render(
      <MemoryRouter>
        <IntegrationsPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getAllByText('Conectado (demo)').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('shows connect button for available non-connected integrations', async () => {
    render(
      <MemoryRouter>
        <IntegrationsPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getAllByText('Conectar').length).toBeGreaterThanOrEqual(1);
    });
  });
});
