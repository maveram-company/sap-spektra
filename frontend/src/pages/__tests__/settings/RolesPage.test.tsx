import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import RolesPage from '../../settings/RolesPage';

describe('RolesPage', () => {
  it('renders roles heading', async () => {
    render(
      <MemoryRouter>
        <RolesPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText('Roles y Permisos')).toBeInTheDocument();
      expect(screen.getByText('Define los niveles de acceso para tu equipo')).toBeInTheDocument();
    });
  });

  it('renders all role cards', async () => {
    render(
      <MemoryRouter>
        <RolesPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText('Administrador')).toBeInTheDocument();
      expect(screen.getByText('Escalación (L2/L3)')).toBeInTheDocument();
      expect(screen.getByText('Operador (L1)')).toBeInTheDocument();
      expect(screen.getByText('Viewer')).toBeInTheDocument();
    });
  });

  it('renders role level badges', async () => {
    render(
      <MemoryRouter>
        <RolesPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText('Nivel 40')).toBeInTheDocument();
      expect(screen.getByText('Nivel 30')).toBeInTheDocument();
      expect(screen.getByText('Nivel 20')).toBeInTheDocument();
      expect(screen.getByText('Nivel 10')).toBeInTheDocument();
    });
  });

  it('renders hierarchical model info box', async () => {
    render(
      <MemoryRouter>
        <RolesPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText('Modelo Jerárquico')).toBeInTheDocument();
    });
  });
});
