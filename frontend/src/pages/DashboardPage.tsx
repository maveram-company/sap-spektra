import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Monitor, AlertTriangle, ShieldAlert, ShieldCheck, TrendingUp, ArrowRight } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTenant } from '../contexts/TenantContext';
import Header from '../components/layout/Header';
import StatusBadge from '../components/ui/StatusBadge';
import HealthGauge from '../components/ui/HealthGauge';
import Button from '../components/ui/Button';
import PageLoading from '../components/ui/PageLoading';
import { dataService } from '../services/dataService';
import type { ApiRecord } from '../types';

// Mapa de colores por variante — solo colorea el valor y el icono, sin fondos de color
const variantValueColors = {
  default:  'text-text-primary',
  primary:  'text-primary-400',
  danger:   'text-danger-500',
  success:  'text-success-500',
  warning:  'text-warning-500',
};

// Glow suave en el número según variante (CSS classes in global.css)
const variantGlowClass = {
  default:  '',
  primary:  'glow-text-cyan',
  danger:   'glow-text-danger',
  success:  'glow-text-success',
  warning:  'glow-text-warning',
};

// Gradiente del círculo de icono por variante
const variantIconGradient = {
  default:  ['#06b6d4', '#8b5cf6'],
  primary:  ['#06b6d4', '#8b5cf6'],
  danger:   ['#f43f5e', '#e11d48'],
  success:  ['#10b981', '#059669'],
  warning:  ['#f59e0b', '#d97706'],
};

// Icon is used as a JSX component (<Icon />) below; ESLint's no-unused-vars
// does not detect JSX usage of destructured-and-renamed props.
// eslint-disable-next-line no-unused-vars
function KPICard({ icon: Icon, label, value, change, variant = 'default' }: { icon: any; label: any; value: any; change?: any; variant?: string }) {
  const valueColor   = (variantValueColors as Record<string, string>)[variant];
  const glowClass    = (variantGlowClass as Record<string, string>)[variant];
  const [gradFrom, gradTo] = (variantIconGradient as Record<string, string[]>)[variant];

  return (
    <div className="bg-white/[0.03] backdrop-blur-sm border border-white/10 rounded-xl p-5 transition-all duration-300 hover:border-primary-500/20 hover:shadow-[0_0_20px_rgba(6,182,212,0.06)]">
      {/* Fila superior: icono y cambio porcentual */}
      <div className="flex items-center justify-between mb-4">
        {/* Círculo con degradado cyan→violet (o según variante) */}
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ background: `linear-gradient(135deg, ${gradFrom}, ${gradTo})` }}
        >
          <Icon size={16} className="text-white" />
        </div>

        {/* Indicador de cambio: cyan positivo, danger negativo */}
        {change != null && (
          <span
            className={`text-xs font-medium flex items-center gap-0.5 ${
              change > 0 ? 'text-primary-400' : 'text-danger-500'
            }`}
          >
            <TrendingUp
              size={12}
              className={change < 0 ? 'rotate-180' : ''}
            />
            {Math.abs(change)}%
          </span>
        )}
      </div>

      {/* Número grande con glow */}
      <p className={`text-3xl font-bold tracking-tight ${valueColor} ${glowClass}`}>
        {value}
      </p>

      {/* Etiqueta descriptiva */}
      <p className="text-xs text-text-tertiary mt-1 leading-snug">{label}</p>
    </div>
  );
}

function SystemCard({ system, onClick }: { system: any; onClick: any }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
      className="
        bg-white/[0.03] backdrop-blur-sm border border-white/10 rounded-xl p-5
        cursor-pointer transition-all duration-300 animate-fade-in
        hover:border-primary-500/30 hover:shadow-[0_0_20px_rgba(6,182,212,0.10)]
        focus:outline-none focus:ring-2 focus:ring-primary-500/50
      "
    >
      {/* Cabecera: SID + badge de estado */}
      <div className="flex items-start justify-between mb-1">
        <h3 className="text-xl font-bold text-gradient leading-none">{system.sid}</h3>
        <StatusBadge status={system.status} size="sm" />
      </div>

      {/* Descripción y modo (Trial / Producción) */}
      <div className="flex items-center gap-2 mb-4">
        <p className="text-xs text-text-tertiary truncate">{system.description}</p>
        <StatusBadge status={system.mode === 'TRIAL' ? 'trial' : 'production'} size="sm" />
      </div>

      {/* Gauge de salud centrado */}
      <div className="flex items-center justify-center my-3">
        <HealthGauge score={system.healthScore} size={130} />
      </div>

      {/* Grid de métricas con separador sutil */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 mt-4 pt-4 border-t border-white/[0.06]">
        <div>
          <p className="text-[10px] text-text-tertiary uppercase tracking-wider">Tipo</p>
          <p className="text-xs font-medium text-text-secondary mt-0.5">{system.type}</p>
        </div>
        <div>
          <p className="text-[10px] text-text-tertiary uppercase tracking-wider">Base de Datos</p>
          <p className="text-xs font-medium text-text-secondary mt-0.5">{system.dbType}</p>
        </div>
        <div>
          <p className="text-[10px] text-text-tertiary uppercase tracking-wider">Ambiente</p>
          <p className="text-xs font-medium text-text-secondary mt-0.5">{system.environment}</p>
        </div>
        <div>
          <p className="text-[10px] text-text-tertiary uppercase tracking-wider">Breaches</p>
          <p className="text-xs font-medium mt-0.5">
            {system.breaches > 0 ? (
              /* Breaches activos: color danger con pulso sutil */
              <span className="text-danger-500 animate-pulse">
                {system.breaches} activos
              </span>
            ) : (
              <span className="text-success-500">Sin breaches</span>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { t } = useTranslation();
  const [systems, setSystems] = useState<ApiRecord[]>([]);
  const [approvals, setApprovals] = useState<ApiRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const navigate = useNavigate();
  const { user } = useAuth();
  const { organization } = useTenant();

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [systemsData, approvalsData] = await Promise.all([
          dataService.getSystems(),
          dataService.getApprovals(),
        ]);
        if (mounted) {
          setSystems(systemsData);
          setApprovals(approvalsData);
          setLoading(false);
        }
      } catch {
        if (mounted) {
          setError(t('common.error.loadData'));
          setLoading(false);
        }
      }
    })();
    return () => { mounted = false; };
  }, []);

  const loadData = useCallback(async () => {
    setRefreshing(true);
    const [systemsData, approvalsData] = await Promise.all([
      dataService.getSystems(),
      dataService.getApprovals(),
    ]);
    setSystems(systemsData);
    setApprovals(approvalsData);
    setRefreshing(false);
  }, []);

  if (loading) return <PageLoading message="Cargando dashboard..." />;

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

  // Cálculo de KPIs
  const healthySystems    = systems.filter((s: any) => s.healthScore >= 90).length;
  const totalBreaches     = systems.reduce((sum: any, s: any) => sum + s.breaches, 0);
  const pendingApprovals  = approvals.filter((a: any) => a.status === 'PENDING').length;

  return (
    <div>
      {/* ── Header global del layout ── */}
      <Header
        title={`Hola, ${user?.name || user?.username}`}
        subtitle={`${organization?.name} — ${new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })}`}
        onRefresh={loadData}
        refreshing={refreshing}
      />

      <div className="p-6 space-y-8">

        {/* ══════════════════════════════════════
            KPI Cards
        ══════════════════════════════════════ */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard
            icon={Monitor}
            label="Sistemas Activos"
            value={systems.length}
            change={12}
            variant="primary"
          />
          <KPICard
            icon={ShieldCheck}
            label="Sistemas Saludables"
            value={healthySystems}
            change={5}
            variant="success"
          />
          <KPICard
            icon={AlertTriangle}
            label="Breaches Activos"
            value={totalBreaches}
            change={-8}
            variant={totalBreaches > 0 ? 'danger' : 'default'}
          />
          <KPICard
            icon={ShieldAlert}
            label="Aprobaciones Pendientes"
            value={pendingApprovals}
            variant={pendingApprovals > 0 ? 'warning' : 'default'}
          />
        </div>

        {/* ══════════════════════════════════════
            Landscape SAP — cabecera de sección
        ══════════════════════════════════════ */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-text-primary">Landscape SAP</h2>
            {/* Pill con conteo de sistemas */}
            <span className="
              px-2.5 py-0.5 text-xs font-medium rounded-full
              bg-primary-500/10 text-primary-400 border border-primary-500/20
            ">
              {systems.length} sistemas
            </span>
          </div>

        </div>

        {/* ══════════════════════════════════════
            Grid de SystemCards
        ══════════════════════════════════════ */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {systems.map((system: any) => (
            <SystemCard
              key={system.id}
              system={system}
              onClick={() => navigate(`/systems/${system.id}`)}
            />
          ))}
        </div>

        {/* ══════════════════════════════════════
            Quick Actions — aviso de aprobaciones
        ══════════════════════════════════════ */}
        {pendingApprovals > 0 && (
          <div className="
            bg-white/[0.03] backdrop-blur-sm
            border border-warning-500/30
            rounded-xl p-4
            transition-all duration-300
            hover:shadow-[0_0_20px_rgba(245,158,11,0.08)]
          ">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {/* Icono con glow amber */}
                <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 warning-icon-glow">
                  <ShieldAlert size={20} className="text-warning-500" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-text-primary">
                    {pendingApprovals} aprobaciones pendientes
                  </p>
                  <p className="text-xs text-text-secondary">Requieren acción inmediata</p>
                </div>
              </div>

              <Button
                variant="outline"
                size="sm"
                icon={ArrowRight}
                onClick={() => navigate('/approvals')}
              >
                Ver Aprobaciones
              </Button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
