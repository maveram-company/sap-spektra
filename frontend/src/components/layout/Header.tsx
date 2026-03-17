import type { ReactNode } from 'react';
import { RefreshCw } from 'lucide-react';

interface HeaderProps {
  title: string;
  subtitle?: string;
  onRefresh?: () => void;
  refreshing?: boolean;
  actions?: ReactNode;
}

// Cabecera de página — solo título, subtítulo y botón de refresco opcional
export default function Header({ title, subtitle, onRefresh, refreshing = false, actions }: HeaderProps) {
  return (
    <div className="flex items-center justify-between px-6 pt-6 pb-2">
      <div>
        <h1
          className="text-xl font-bold"
          style={{
            background: 'linear-gradient(90deg, #e2e8f0, #06b6d4)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
        >
          {title}
        </h1>
        {subtitle && (
          <p className="text-[12px] mt-0.5" style={{ color: 'rgba(100,116,139,0.8)' }}>
            {subtitle}
          </p>
        )}
      </div>

      <div className="flex items-center gap-3">
        {actions}
        {onRefresh && (
          <button
            onClick={onRefresh}
            disabled={refreshing}
            className="p-2 rounded-lg transition-colors"
            style={{ color: 'rgba(148,163,184,0.6)' }}
            onMouseEnter={(e) => { e.currentTarget.style.color = '#06b6d4'; e.currentTarget.style.background = 'rgba(6,182,212,0.1)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(148,163,184,0.6)'; e.currentTarget.style.background = 'transparent'; }}
            title="Actualizar datos"
          >
            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
          </button>
        )}
      </div>
    </div>
  );
}
