import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import ProtectedRoute from '../ProtectedRoute';

// Mock react-router-dom to avoid Navigate hanging the worker
const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  Navigate: (props: Record<string, unknown>) => {
    mockNavigate(props);
    return <div data-testid="navigate-redirect">Redirecting...</div>;
  },
  useLocation: () => ({ pathname: '/dashboard' }),
}));

const mockAuthValue = {
  isAuthenticated: true,
  loading: false,
  hasRole: vi.fn().mockReturnValue(true),
};

vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => mockAuthValue,
}));

vi.mock('../../ui/PageLoading', () => ({
  default: () => <div data-testid="page-loading">Loading...</div>,
}));

describe('ProtectedRoute', () => {
  beforeEach(() => {
    mockAuthValue.isAuthenticated = true;
    mockAuthValue.loading = false;
    mockAuthValue.hasRole = vi.fn().mockReturnValue(true);
    mockNavigate.mockClear();
  });

  it('renders PageLoading when auth is loading', () => {
    mockAuthValue.loading = true;
    render(
      <ProtectedRoute>
        <div data-testid="protected-content">Protected</div>
      </ProtectedRoute>,
    );
    expect(screen.getByTestId('page-loading')).toBeInTheDocument();
    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
  });

  it('renders children when authenticated', () => {
    render(
      <ProtectedRoute>
        <div data-testid="protected-content">Protected Page</div>
      </ProtectedRoute>,
    );
    expect(screen.getByTestId('protected-content')).toBeInTheDocument();
    expect(screen.getByText('Protected Page')).toBeInTheDocument();
  });

  it('redirects to /login when not authenticated', () => {
    mockAuthValue.isAuthenticated = false;
    render(
      <ProtectedRoute>
        <div data-testid="protected-content">Protected</div>
      </ProtectedRoute>,
    );
    expect(screen.getByTestId('navigate-redirect')).toBeInTheDocument();
    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
    expect(mockNavigate).toHaveBeenCalledWith(
      expect.objectContaining({ to: '/login', replace: true }),
    );
  });

  it('renders children when requiredRole is met', () => {
    mockAuthValue.hasRole = vi.fn().mockReturnValue(true);
    render(
      <ProtectedRoute requiredRole="operator">
        <div data-testid="protected-content">Protected</div>
      </ProtectedRoute>,
    );
    expect(screen.getByTestId('protected-content')).toBeInTheDocument();
    expect(mockAuthValue.hasRole).toHaveBeenCalledWith('operator');
  });

  it('shows "Acceso Denegado" when requiredRole is not met', () => {
    mockAuthValue.hasRole = vi.fn().mockReturnValue(false);
    render(
      <ProtectedRoute requiredRole="admin">
        <div data-testid="protected-content">Protected</div>
      </ProtectedRoute>,
    );
    expect(screen.getByText('Acceso Denegado')).toBeInTheDocument();
    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
  });

  it('shows description text when role is denied', () => {
    mockAuthValue.hasRole = vi.fn().mockReturnValue(false);
    render(
      <ProtectedRoute requiredRole="admin">
        <div>Protected</div>
      </ProtectedRoute>,
    );
    expect(screen.getByText(/no tienes permisos/i)).toBeInTheDocument();
  });

  it('does not check roles when requiredRole is not specified', () => {
    render(
      <ProtectedRoute>
        <div data-testid="protected-content">Protected</div>
      </ProtectedRoute>,
    );
    expect(mockAuthValue.hasRole).not.toHaveBeenCalled();
    expect(screen.getByTestId('protected-content')).toBeInTheDocument();
  });

  it('shows loading even if not authenticated (loading takes priority)', () => {
    mockAuthValue.loading = true;
    mockAuthValue.isAuthenticated = false;
    render(
      <ProtectedRoute>
        <div data-testid="protected-content">Protected</div>
      </ProtectedRoute>,
    );
    expect(screen.getByTestId('page-loading')).toBeInTheDocument();
  });
});
