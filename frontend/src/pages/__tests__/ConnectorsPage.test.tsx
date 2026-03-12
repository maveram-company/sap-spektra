import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ConnectorsPage from '../ConnectorsPage';

vi.mock('../../services/dataService', () => ({
  dataService: {
    getConnectors: vi.fn().mockResolvedValue([
      { id: 'conn-1', sid: 'EP1', systemName: 'Production ERP', systemType: 'S/4HANA', environment: 'PRD', status: 'connected', connectionMethod: 'Spektra Agent', latencyMs: 28, lastHeartbeat: new Date().toISOString(), messagesCollected24h: 14500, agentVersion: 'v1.4.2' },
      { id: 'conn-2', sid: 'EQ1', systemName: 'Quality ERP', systemType: 'S/4HANA', environment: 'QAS', status: 'degraded', connectionMethod: 'Spektra Agent', latencyMs: 180, lastHeartbeat: new Date(Date.now() - 300000).toISOString(), messagesCollected24h: 8200, agentVersion: 'v1.4.1' },
      { id: 'conn-3', sid: 'BW1', systemName: 'BW Production', systemType: 'BW/4HANA', environment: 'PRD', status: 'disconnected', connectionMethod: 'SAP Cloud Connector', latencyMs: null, lastHeartbeat: null, messagesCollected24h: 0, agentVersion: null },
    ]),
  },
}));

describe('ConnectorsPage', () => {
  it('renders the page header', async () => {
    render(
      <MemoryRouter>
        <ConnectorsPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText('Conectores')).toBeInTheDocument();
    });
  });

  it('renders KPI cards', async () => {
    render(
      <MemoryRouter>
        <ConnectorsPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText('Total Conexiones')).toBeInTheDocument();
      expect(screen.getByText('Conectados')).toBeInTheDocument();
      expect(screen.getByText('Degradados')).toBeInTheDocument();
      expect(screen.getByText('Desconectados')).toBeInTheDocument();
    });
  });

  it('displays connector SIDs in the table', async () => {
    render(
      <MemoryRouter>
        <ConnectorsPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText('Production ERP')).toBeInTheDocument();
      expect(screen.getByText('Quality ERP')).toBeInTheDocument();
      expect(screen.getByText('BW Production')).toBeInTheDocument();
    });
  });

  it('shows disconnection alert when disconnected connectors exist', async () => {
    render(
      <MemoryRouter>
        <ConnectorsPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText(/conexión sin respuesta/)).toBeInTheDocument();
    });
  });

  it('renders Conexiones SAP table title', async () => {
    render(
      <MemoryRouter>
        <ConnectorsPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText('Conexiones SAP')).toBeInTheDocument();
    });
  });
});
