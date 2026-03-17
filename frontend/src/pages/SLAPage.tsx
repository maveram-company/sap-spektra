import { useState, useEffect } from 'react';
import { BarChart3, AlertTriangle } from 'lucide-react';
import Header from '../components/layout/Header';
import PageLoading from '../components/ui/PageLoading';
import { dataService } from '../services/dataService';
import { createLogger } from '../lib/logger';

const log = createLogger('SLAPage');

function getHealthColor(score) {
  if (score >= 85) return { border: 'border-success-500', text: 'text-success-600', bg: 'bg-success-50 dark:bg-success-500/10' };
  if (score >= 65) return { border: 'border-warning-500', text: 'text-warning-600', bg: 'bg-warning-50 dark:bg-warning-500/10' };
  return { border: 'border-danger-500', text: 'text-danger-600', bg: 'bg-danger-50 dark:bg-danger-500/10' };
}

function HealthCircle({ score }) {
  const colors = getHealthColor(score);
  return (
    <div
      className={`w-12 h-12 rounded-full border-2 ${colors.border} ${colors.bg} flex items-center justify-center flex-shrink-0`}
    >
      <span className={`text-sm font-bold ${colors.text}`}>{score}</span>
    </div>
  );
}

function MetricItem({ label, value, unit, color }) {
  return (
    <div className="text-center">
      <p className={`text-2xl font-bold ${color}`}>
        {value}
        {unit && <span className="text-xs font-normal text-text-tertiary ml-0.5">{unit}</span>}
      </p>
      <p className="text-xs text-text-tertiary">{label}</p>
    </div>
  );
}

// Icon is used as a JSX component (<Icon />) below; ESLint's no-unused-vars
// does not detect JSX usage of destructured-and-renamed props.
// eslint-disable-next-line no-unused-vars
function SimpleTable({ title, icon: Icon, rows }) {
  return (
    <div className="bg-surface rounded-xl border border-border p-5">
      <div className="flex items-center gap-2 mb-4">
        <Icon size={18} className="text-primary-600" />
        <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
      </div>
      <table className="w-full">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left text-xs font-medium text-text-tertiary pb-2">Métrica</th>
            <th className="text-right text-xs font-medium text-text-tertiary pb-2">Valor</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-border last:border-0">
              <td className="py-2.5 text-sm text-text-secondary">{row.label}</td>
              <td className="py-2.5 text-sm font-medium text-text-primary text-right">{row.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function SLAPage() {
  const [systems, setSystems] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([dataService.getSystems(), dataService.getAnalytics()]).then(([sys, anl]) => {
      setSystems(sys);
      setAnalytics(anl);
      setLoading(false);
    }).catch((err) => {
      log.warn('Fetch failed', { error: err.message });
      setError('Error al cargar datos. Intenta de nuevo.');
      setLoading(false);
    });
  }, []);

  if (loading) return <PageLoading message="Cargando SLA..." />;

  if (error) return (
    <div className="flex items-center justify-center h-64">
      <div className="text-center">
        <p className="text-red-400 mb-4">{error}</p>
        <button onClick={() => window.location.reload()} className="px-4 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 transition-colors">
          Reintentar
        </button>
      </div>
    </div>
  );

  if (!analytics) return <PageLoading message="Cargando SLA..." />;

  const { alertStats, slaMetrics } = analytics;

  const runbookRows = [
    { label: 'Runbooks hoy', value: slaMetrics.runbooksToday },
    { label: 'Tasa de éxito', value: `${slaMetrics.successRate}%` },
    { label: 'Duración promedio', value: slaMetrics.avgDuration },
    { label: 'Más ejecutado', value: slaMetrics.mostExecuted },
    { label: 'Pendientes aprobación', value: slaMetrics.pendingApproval },
  ];

  const alertRows = [
    { label: 'Total alertas', value: alertStats.total },
    { label: 'Críticas', value: alertStats.critical },
    { label: 'Warnings', value: alertStats.warnings },
    { label: 'Auto-resueltas', value: alertStats.autoResolved },
    { label: 'Resolución promedio', value: `${alertStats.avgResolutionMin} min` },
  ];

  return (
    <div>
      <Header title="SLA & Analytics" subtitle="Métricas de servicio y rendimiento" />

      <div className="p-6">
        {/* System SLA Cards */}
        <h2 className="text-base font-semibold text-text-primary mb-4">SLA por Sistema</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
          {systems.map((system) => (
              <div
                key={system.id}
                className="bg-surface rounded-xl border border-border p-5"
              >
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-sm font-semibold text-text-primary">{system.sid}</p>
                    <p className="text-xs text-text-tertiary">{system.environment}</p>
                  </div>
                  <HealthCircle score={system.healthScore} />
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <MetricItem
                    label="MTTR"
                    value={system.mttr}
                    unit="min"
                    color="text-primary-600"
                  />
                  <MetricItem
                    label="MTBF"
                    value={system.mtbf}
                    unit="min"
                    color="text-accent-600"
                  />
                  <MetricItem
                    label="Disponibilidad"
                    value={system.availability}
                    unit="%"
                    color="text-success-600"
                  />
                </div>
              </div>
          ))}
        </div>

        {/* Bottom two-column section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <SimpleTable
            title="Runbook Analytics"
            icon={BarChart3}
            rows={runbookRows}
          />
          <SimpleTable
            title="Estadísticas Alertas (7 días)"
            icon={AlertTriangle}
            rows={alertRows}
          />
        </div>
      </div>
    </div>
  );
}
