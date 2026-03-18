import { type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePlan } from '../../hooks/usePlan';

export default function FeatureGate({ feature, fallback = null, children }: { feature: string; fallback?: ReactNode; children: ReactNode }) {
  const { hasFeature } = usePlan();

  if (!hasFeature(feature)) {
    return fallback;
  }

  return children;
}

export function UpgradeBanner({ feature, className = '' }: { feature: string; className?: string }) {
  const navigate = useNavigate();

  return (
    <div className={`bg-gradient-to-r from-primary-50 to-accent-50 dark:from-primary-900/20 dark:to-accent-900/20 border border-primary-200 dark:border-primary-800 rounded-xl p-6 text-center ${className}`}>
      <h3 className="text-lg font-semibold text-text-primary mb-1">Funcionalidad Premium</h3>
      <p className="text-sm text-text-secondary mb-4">
        Actualiza tu plan para acceder a {feature}
      </p>
      <button
        onClick={() => navigate('/settings/billing')}
        className="px-6 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors"
      >
        Ver Planes
      </button>
    </div>
  );
}
