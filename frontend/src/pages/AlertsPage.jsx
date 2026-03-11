import { useState } from 'react';
import Header from '../components/layout/Header';
import { mockAlerts, mockSystems, alertResolutionCategories } from '../lib/mockData';
import { useAuth } from '../contexts/AuthContext';
import {
  AlertTriangle,
  AlertCircle,
  Info,
  CheckCircle2,
  Clock,
  Shield,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  Play,
  X,
  Filter,
  ArrowRight,
} from 'lucide-react';

function AlertsPage() {
  const { user, hasRole } = useAuth();
  const [alerts, setAlerts] = useState(() => [...mockAlerts]);
  const [statusFilter, setStatusFilter] = useState('active');
  const [systemFilter, setSystemFilter] = useState('all');
  const [resolveModalAlertId, setResolveModalAlertId] = useState(null);
  const [resolutionCategory, setResolutionCategory] = useState('');
  const [resolutionNote, setResolutionNote] = useState('');

  // Filtrado de alertas
  const filteredAlerts = alerts.filter((alert) => {
    // Filtro por estado
    if (statusFilter === 'active' && alert.status !== 'active') return false;
    if (statusFilter === 'resolved' && alert.status !== 'resolved') return false;
    if (statusFilter === 'critical' && alert.level !== 'critical') return false;
    // 'all' no filtra por estado

    // Filtro por sistema
    if (systemFilter !== 'all' && alert.systemId !== systemFilter) return false;

    return true;
  });

  // Tomar en gestión
  const handleAcknowledge = (alertId) => {
    setAlerts((prev) =>
      prev.map((a) =>
        a.id === alertId
          ? {
              ...a,
              acknowledged: true,
              ackBy: user?.email || 'unknown',
              ackAt: new Date().toISOString(),
            }
          : a
      )
    );
  };

  // Abrir modal de resolución
  const openResolveModal = (alertId) => {
    setResolveModalAlertId(alertId);
    setResolutionCategory('');
    setResolutionNote('');
  };

  // Cerrar modal de resolución
  const closeResolveModal = () => {
    setResolveModalAlertId(null);
    setResolutionCategory('');
    setResolutionNote('');
  };

  // Resolver alerta
  const handleResolve = () => {
    if (!resolutionCategory || !resolutionNote) return;

    setAlerts((prev) =>
      prev.map((a) =>
        a.id === resolveModalAlertId
          ? {
              ...a,
              status: 'resolved',
              resolvedBy: user?.email || 'unknown',
              resolvedAt: new Date().toISOString(),
              resolutionNote,
              resolutionCategory,
            }
          : a
      )
    );
    closeResolveModal();
  };

  // Badge de nivel
  const getLevelBadge = (level) => {
    const config = {
      critical: {
        bg: 'bg-danger-50 dark:bg-danger-950',
        text: 'text-danger-700 dark:text-danger-300',
        icon: <AlertTriangle className="w-3.5 h-3.5" />,
        label: 'Crítica',
      },
      warning: {
        bg: 'bg-warning-50 dark:bg-warning-950',
        text: 'text-warning-700 dark:text-warning-300',
        icon: <AlertCircle className="w-3.5 h-3.5" />,
        label: 'Advertencia',
      },
      info: {
        bg: 'bg-primary-50 dark:bg-primary-950',
        text: 'text-primary-700 dark:text-primary-300',
        icon: <Info className="w-3.5 h-3.5" />,
        label: 'Informativa',
      },
    };
    const c = config[level] || config.info;
    return (
      <span
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold ${c.bg} ${c.text}`}
      >
        {c.icon}
        {c.label}
      </span>
    );
  };

  // Badge de escalamiento
  const getEscalationBadge = (escalation) => {
    if (!escalation || escalation === '-') return null;
    const config = {
      L1: {
        bg: 'bg-warning-50 dark:bg-warning-950',
        text: 'text-warning-700 dark:text-warning-300',
        icon: <Shield className="w-3.5 h-3.5" />,
      },
      L2: {
        bg: 'bg-danger-50 dark:bg-danger-950',
        text: 'text-danger-700 dark:text-danger-300',
        icon: <ShieldAlert className="w-3.5 h-3.5" />,
      },
    };
    const c = config[escalation] || config.L1;
    return (
      <span
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold ${c.bg} ${c.text}`}
      >
        {c.icon}
        {escalation}
      </span>
    );
  };

  const statusFilterOptions = [
    { value: 'active', label: 'Activas' },
    { value: 'all', label: 'Todas' },
    { value: 'critical', label: 'Críticas' },
    { value: 'resolved', label: 'Resueltas' },
  ];

  return (
    <div className="min-h-screen">
      <Header
        title="Alertas"
        subtitle="Gestión de alertas y escalamiento"
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Barra de escalamiento */}
        <div className="bg-surface dark:bg-surface border border-border dark:border-border rounded-xl p-4">
          <h3 className="text-sm font-semibold text-text-primary dark:text-text-primary mb-3 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4" />
            Flujo de Escalamiento
          </h3>
          <div className="flex items-center gap-0">
            <div className="flex-1 bg-warning-50 dark:bg-warning-950 border border-warning-200 dark:border-warning-800 rounded-l-lg p-3 text-center">
              <div className="text-xs font-bold text-warning-700 dark:text-warning-300">L1</div>
              <div className="text-xs text-warning-600 dark:text-warning-400 flex items-center justify-center gap-1 mt-1">
                <Clock className="w-3 h-3" />
                30 min
              </div>
            </div>
            <ArrowRight className="w-5 h-5 text-text-tertiary dark:text-text-tertiary flex-shrink-0 -mx-1 z-10" />
            <div className="flex-1 bg-danger-50 dark:bg-danger-950 border border-danger-200 dark:border-danger-800 p-3 text-center">
              <div className="text-xs font-bold text-danger-700 dark:text-danger-300">L2</div>
              <div className="text-xs text-danger-600 dark:text-danger-400 flex items-center justify-center gap-1 mt-1">
                <Clock className="w-3 h-3" />
                60 min
              </div>
            </div>
            <ArrowRight className="w-5 h-5 text-text-tertiary dark:text-text-tertiary flex-shrink-0 -mx-1 z-10" />
            <div className="flex-1 bg-primary-50 dark:bg-primary-950 border border-primary-200 dark:border-primary-800 rounded-r-lg p-3 text-center">
              <div className="text-xs font-bold text-primary-700 dark:text-primary-300">Admin</div>
              <div className="text-xs text-primary-600 dark:text-primary-400 flex items-center justify-center gap-1 mt-1">
                <Clock className="w-3 h-3" />
                120 min
              </div>
            </div>
          </div>
        </div>

        {/* Toolbar de filtros */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2 flex-wrap">
            <Filter className="w-4 h-4 text-text-tertiary dark:text-text-tertiary" />
            {statusFilterOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setStatusFilter(opt.value)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  statusFilter === opt.value
                    ? 'bg-primary-600 text-white'
                    : 'bg-surface dark:bg-surface border border-border dark:border-border text-text-secondary dark:text-text-secondary hover:bg-primary-50 dark:hover:bg-primary-950'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <select
              value={systemFilter}
              onChange={(e) => setSystemFilter(e.target.value)}
              className="px-3 py-1.5 rounded-lg text-sm border border-border dark:border-border bg-surface dark:bg-surface text-text-primary dark:text-text-primary focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="all">Todos los sistemas</option>
              {mockSystems.map((sys) => (
                <option key={sys.id} value={sys.id}>
                  {sys.sid} - {sys.description}
                </option>
              ))}
            </select>

            <span className="text-sm text-text-tertiary dark:text-text-tertiary whitespace-nowrap">
              {filteredAlerts.length} alerta{filteredAlerts.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>

        {/* Lista de alertas */}
        <div className="space-y-4">
          {filteredAlerts.length === 0 && (
            <div className="bg-surface dark:bg-surface border border-border dark:border-border rounded-xl p-8 text-center">
              <CheckCircle2 className="w-10 h-10 text-text-tertiary dark:text-text-tertiary mx-auto mb-3" />
              <p className="text-text-secondary dark:text-text-secondary text-sm">
                No hay alertas que coincidan con los filtros seleccionados.
              </p>
            </div>
          )}

          {filteredAlerts.map((alert) => (
            <div
              key={alert.id}
              className="bg-surface dark:bg-surface border border-border dark:border-border rounded-xl p-5 space-y-3"
            >
              {/* Cabecera de la tarjeta */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  {getLevelBadge(alert.level)}
                  {getEscalationBadge(alert.escalation)}
                  {alert.acknowledged && alert.status === 'active' && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-primary-50 dark:bg-primary-950 text-primary-700 dark:text-primary-300">
                      <UserCheck className="w-3.5 h-3.5" />
                      EN REVISI&Oacute;N
                    </span>
                  )}
                  {alert.status === 'resolved' && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-success-50 dark:bg-success-950 text-success-700 dark:text-success-300">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Resuelta
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs text-text-tertiary dark:text-text-tertiary">
                  <span className="font-medium">{alert.sid}</span>
                  <span>&middot;</span>
                  <span>{alert.systemId}</span>
                  <span>&middot;</span>
                  <Clock className="w-3 h-3" />
                  <span>{alert.time}</span>
                </div>
              </div>

              {/* Título y mensaje */}
              <div>
                <h4 className="text-sm font-semibold text-text-primary dark:text-text-primary">
                  {alert.title}
                </h4>
                <p className="text-sm text-text-secondary dark:text-text-secondary mt-1">
                  {alert.message}
                </p>
              </div>

              {/* Información de reconocimiento */}
              {alert.acknowledged && alert.ackBy && (
                <div className="text-xs text-text-tertiary dark:text-text-tertiary">
                  Tomada por <span className="font-medium">{alert.ackBy}</span>
                  {alert.ackAt && <span> el {alert.ackAt}</span>}
                </div>
              )}

              {/* Información de resolución */}
              {alert.status === 'resolved' && (
                <div className="bg-success-50 dark:bg-success-950 border border-success-200 dark:border-success-800 rounded-lg p-3 space-y-1">
                  <div className="text-xs font-semibold text-success-700 dark:text-success-300">
                    Resolución
                  </div>
                  {alert.resolutionCategory && (
                    <div className="text-xs text-success-600 dark:text-success-400">
                      Categoría: <span className="font-medium">{alert.resolutionCategory}</span>
                    </div>
                  )}
                  {alert.resolutionNote && (
                    <div className="text-xs text-success-600 dark:text-success-400">
                      Nota: {alert.resolutionNote}
                    </div>
                  )}
                  {alert.resolvedBy && (
                    <div className="text-xs text-success-600 dark:text-success-400">
                      Resuelta por <span className="font-medium">{alert.resolvedBy}</span>
                      {alert.resolvedAt && <span> el {alert.resolvedAt}</span>}
                    </div>
                  )}
                </div>
              )}

              {/* Botones de acción */}
              {alert.status === 'active' && (
                <div className="flex items-center gap-2 pt-1 flex-wrap">
                  {!alert.acknowledged && hasRole('operator') && (
                    <button
                      onClick={() => handleAcknowledge(alert.id)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-primary-600 text-white hover:bg-primary-700 transition-colors"
                    >
                      <UserCheck className="w-3.5 h-3.5" />
                      Tomar en gesti&oacute;n
                    </button>
                  )}
                  {hasRole('operator') && (
                    <button
                      onClick={() => openResolveModal(alert.id)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-border dark:border-border text-text-secondary dark:text-text-secondary hover:bg-primary-50 dark:hover:bg-primary-950 transition-colors"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Resolver
                    </button>
                  )}
                  {alert.runbookId && (
                    <button
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-border dark:border-border text-text-secondary dark:text-text-secondary hover:bg-primary-50 dark:hover:bg-primary-950 transition-colors"
                    >
                      <Play className="w-3.5 h-3.5" />
                      Ejecutar Runbook
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Modal de resolución */}
      {resolveModalAlertId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={closeResolveModal}>
          <div className="bg-surface dark:bg-surface border border-border dark:border-border rounded-xl shadow-xl w-full max-w-md mx-4 p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-text-primary dark:text-text-primary">
                Resolver Alerta
              </h3>
              <button
                onClick={closeResolveModal}
                className="p-1 rounded-lg text-text-tertiary dark:text-text-tertiary hover:bg-primary-50 dark:hover:bg-primary-950 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-text-secondary dark:text-text-secondary mb-1">
                  Categor&iacute;a de resoluci&oacute;n *
                </label>
                <select
                  value={resolutionCategory}
                  onChange={(e) => setResolutionCategory(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-sm border border-border dark:border-border bg-surface dark:bg-surface text-text-primary dark:text-text-primary focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="">Seleccionar categor&iacute;a...</option>
                  {alertResolutionCategories.map((cat) => (
                    <option key={cat.value} value={cat.value}>
                      {cat.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-text-secondary dark:text-text-secondary mb-1">
                  Nota de resoluci&oacute;n *
                </label>
                <textarea
                  value={resolutionNote}
                  onChange={(e) => setResolutionNote(e.target.value)}
                  placeholder="Describe c&oacute;mo se resolvi&oacute; la alerta..."
                  rows={4}
                  className="w-full px-3 py-2 rounded-lg text-sm border border-border dark:border-border bg-surface dark:bg-surface text-text-primary dark:text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={closeResolveModal}
                className="px-4 py-2 rounded-lg text-sm font-medium border border-border dark:border-border text-text-secondary dark:text-text-secondary hover:bg-primary-50 dark:hover:bg-primary-950 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleResolve}
                disabled={!resolutionCategory || !resolutionNote}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Confirmar Resoluci&oacute;n
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AlertsPage;
