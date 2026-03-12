import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ConnectSystemPage from '../ConnectSystemPage';

describe('ConnectSystemPage', () => {
  it('renders method selection screen', async () => {
    render(
      <MemoryRouter>
        <ConnectSystemPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText(/Cómo está desplegado tu sistema SAP/)).toBeInTheDocument();
    });
  });

  it('renders Spektra Agent option', async () => {
    render(
      <MemoryRouter>
        <ConnectSystemPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText('Spektra Agent')).toBeInTheDocument();
      expect(screen.getByText('Para sistemas on-premise o en cloud IaaS')).toBeInTheDocument();
    });
  });

  it('renders Cloud Connector option', async () => {
    render(
      <MemoryRouter>
        <ConnectSystemPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText('SAP Cloud Connector')).toBeInTheDocument();
      expect(screen.getByText('Para sistemas SAP RISE / BTP')).toBeInTheDocument();
    });
  });

  it('renders features for both connection methods', async () => {
    render(
      <MemoryRouter>
        <ConnectSystemPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText('Monitoreo completo: OS + SAP + Base de Datos')).toBeInTheDocument();
      expect(screen.getByText('Sin instalación en el servidor SAP')).toBeInTheDocument();
    });
  });

  it('renders the back button', async () => {
    render(
      <MemoryRouter>
        <ConnectSystemPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText('Volver')).toBeInTheDocument();
    });
  });
});
