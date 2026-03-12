import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ProfilePage from '../../settings/ProfilePage';

vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { name: 'Test User', email: 'test@example.com', username: 'testuser', role: 'admin' },
  }),
}));

vi.mock('../../../contexts/TenantContext', () => ({
  useTenant: () => ({
    organization: { name: 'Demo Organization' },
  }),
}));

describe('ProfilePage', () => {
  it('renders the profile heading', async () => {
    render(
      <MemoryRouter>
        <ProfilePage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText('Mi Perfil')).toBeInTheDocument();
      expect(screen.getByText('Gestiona tu información personal y preferencias')).toBeInTheDocument();
    });
  });

  it('renders user name and email', async () => {
    render(
      <MemoryRouter>
        <ProfilePage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText('Test User')).toBeInTheDocument();
      expect(screen.getByText('test@example.com')).toBeInTheDocument();
    });
  });

  it('renders personal info form card', async () => {
    render(
      <MemoryRouter>
        <ProfilePage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText('Información Personal')).toBeInTheDocument();
      expect(screen.getByText('Actualiza tus datos de contacto')).toBeInTheDocument();
    });
  });

  it('renders change password section', async () => {
    render(
      <MemoryRouter>
        <ProfilePage />
      </MemoryRouter>
    );
    await waitFor(() => {
      // "Cambiar Contraseña" appears as both a title and a button label
      expect(screen.getAllByText('Cambiar Contraseña').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('Actualiza tu contraseña de acceso')).toBeInTheDocument();
    });
  });

  it('renders session info card', async () => {
    render(
      <MemoryRouter>
        <ProfilePage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText('Sesión Activa')).toBeInTheDocument();
    });
  });

  it('renders user role badge', async () => {
    render(
      <MemoryRouter>
        <ProfilePage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText('Administrador')).toBeInTheDocument();
    });
  });
});
