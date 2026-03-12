import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import PageLoading from '../ui/PageLoading';

export default function ProtectedRoute({ children, requiredRole }) {
  const { isAuthenticated, loading, hasRole } = useAuth();
  const location = useLocation();

  if (loading) return <PageLoading />;
  if (!isAuthenticated) return <Navigate to="/login" state={{ from: location }} replace />;

  if (requiredRole && !hasRole(requiredRole)) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <div className="w-16 h-16 rounded-2xl bg-danger-50 flex items-center justify-center">
          <span className="text-3xl">&#x1F512;</span>
        </div>
        <h2 className="text-xl font-semibold text-text-primary">Acceso Denegado</h2>
        <p className="text-sm text-text-secondary">No tienes permisos para acceder a esta secci&oacute;n.</p>
      </div>
    );
  }

  return children;
}
