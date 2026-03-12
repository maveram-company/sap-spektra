import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import LoginPage from '../LoginPage';

// Mock react-i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'login.username': 'Usuario',
        'login.password': 'Contraseña',
        'login.submit': 'Iniciar Sesión',
        'login.authenticating': 'Autenticando...',
        'login.tagline': 'Plataforma de operaciones SAP',
        'login.testAccounts': 'Cuentas de prueba',
        'login.testAccountHint': 'Selecciona una cuenta demo',
        'login.copyright': '© 2026 Maveram',
        'login.monitoring': 'Monitoreo',
        'login.aiIntegrated': 'IA Integrada',
        'login.automation': 'Automatización',
        'login.setup': 'Setup rápido',
        'login.errorEmpty': 'El usuario es requerido',
        'login.errorEmptyPassword': 'La contraseña es requerida',
        'login.errorPassword': 'La contraseña debe tener al menos 4 caracteres',
        'login.errorInvalidEmail': 'Email inválido',
        'login.errorAuth': 'Credenciales inválidas',
        'login.showPassword': 'Mostrar contraseña',
        'login.hidePassword': 'Ocultar contraseña',
      };
      return translations[key] || key;
    },
  }),
}));

// Mock AuthContext
const mockLogin = vi.fn();
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ login: mockLogin }),
}));

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the login form', () => {
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    );
    expect(screen.getByText('SAP Spektra')).toBeInTheDocument();
    expect(screen.getByLabelText('Usuario')).toBeInTheDocument();
    expect(screen.getByLabelText('Contraseña')).toBeInTheDocument();
  });

  it('renders demo account buttons', () => {
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    );
    expect(screen.getByText('admin')).toBeInTheDocument();
    expect(screen.getByText('operator')).toBeInTheDocument();
    expect(screen.getByText('escalation')).toBeInTheDocument();
    expect(screen.getByText('viewer')).toBeInTheDocument();
  });

  it('shows error when submitting empty username', async () => {
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByText('Iniciar Sesión'));
    await waitFor(() => {
      expect(screen.getByText('El usuario es requerido')).toBeInTheDocument();
    });
  });

  it('shows error when submitting empty password', async () => {
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    );
    fireEvent.change(screen.getByLabelText('Usuario'), { target: { value: 'admin' } });
    fireEvent.click(screen.getByText('Iniciar Sesión'));
    await waitFor(() => {
      expect(screen.getByText('La contraseña es requerida')).toBeInTheDocument();
    });
  });

  it('calls login on valid submission', async () => {
    mockLogin.mockResolvedValue(undefined);
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    );
    fireEvent.change(screen.getByLabelText('Usuario'), { target: { value: 'admin@acme-corp.com' } });
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'admin123' } });
    fireEvent.click(screen.getByText('Iniciar Sesión'));
    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith('admin@acme-corp.com', 'admin123');
    });
  });

  it('fills credentials when clicking demo account', () => {
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByText('admin'));
    expect(screen.getByLabelText('Usuario')).toHaveValue('admin@acme-corp.com');
  });

  it('renders feature pills', () => {
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    );
    expect(screen.getByText('Monitoreo')).toBeInTheDocument();
    expect(screen.getByText('IA Integrada')).toBeInTheDocument();
    expect(screen.getByText('Automatización')).toBeInTheDocument();
  });
});
