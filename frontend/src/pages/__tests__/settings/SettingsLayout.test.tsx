import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SettingsLayout from '../../settings/SettingsLayout';

describe('SettingsLayout', () => {
  it('renders without crashing', () => {
    render(
      <MemoryRouter>
        <SettingsLayout />
      </MemoryRouter>
    );
  });

  it('renders the settings header', () => {
    render(
      <MemoryRouter>
        <SettingsLayout />
      </MemoryRouter>
    );
    expect(screen.getByText('Configuración')).toBeInTheDocument();
    expect(screen.getByText('Administra tu organización y preferencias')).toBeInTheDocument();
  });

  it('renders all settings nav links', () => {
    render(
      <MemoryRouter>
        <SettingsLayout />
      </MemoryRouter>
    );
    expect(screen.getByText('General')).toBeInTheDocument();
    expect(screen.getByText('Usuarios')).toBeInTheDocument();
    expect(screen.getByText('Roles y Permisos')).toBeInTheDocument();
    expect(screen.getByText('Integraciones')).toBeInTheDocument();
    expect(screen.getByText('Notificaciones')).toBeInTheDocument();
    expect(screen.getByText('Plan y Facturación')).toBeInTheDocument();
    expect(screen.getByText('Auditoría')).toBeInTheDocument();
  });
});
