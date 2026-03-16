import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import NotificationsPage from '../../settings/NotificationsPage';

describe('NotificationsPage', () => {
  it('renders notifications heading', async () => {
    render(
      <MemoryRouter>
        <NotificationsPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText('Notificaciones')).toBeInTheDocument();
      expect(screen.getByText('Configura cómo y cuándo recibir alertas')).toBeInTheDocument();
    });
  });

  it('renders email notification settings', async () => {
    render(
      <MemoryRouter>
        <NotificationsPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText('Email')).toBeInTheDocument();
      expect(screen.getByText('Breaches y alertas críticas')).toBeInTheDocument();
      expect(screen.getByText('Solicitudes de aprobación')).toBeInTheDocument();
      expect(screen.getByText('Reportes de compliance')).toBeInTheDocument();
    });
  });

  it('renders digest summary settings', async () => {
    render(
      <MemoryRouter>
        <NotificationsPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText('Resúmenes')).toBeInTheDocument();
      expect(screen.getByText('Digesto diario')).toBeInTheDocument();
      expect(screen.getByText('Reporte semanal')).toBeInTheDocument();
    });
  });

  it('renders save preferences button', async () => {
    render(
      <MemoryRouter>
        <NotificationsPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText('Guardar Preferencias')).toBeInTheDocument();
    });
  });
});
