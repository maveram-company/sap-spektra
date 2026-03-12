import { useState, useEffect, useCallback } from 'react';
import Header from '../components/layout/Header';
import PageLoading from '../components/ui/PageLoading';
import {
  HA_STRATEGY_META,
  HANA_TAKEOVER_STEPS, HANA_FAILOVER_STEPS, WARM_STANDBY_FAILOVER_STEPS,
  ASCS_FAILOVER_STEPS,
  PILOT_LIGHT_ACTIVATION_STEPS, CROSS_REGION_DR_STEPS, BACKUP_RESTORE_STEPS,
} from '../lib/constants';
import { dataService } from '../services/dataService';
import { useAuth } from '../contexts/AuthContext';
import {
  ArrowLeftRight,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ShieldCheck,
  Play,
  RotateCcw,
  RefreshCw,
  Clock,
  Download,
  Hash,
  Cpu,
  Network,
  Database,
  FileJson,
  Loader2,
  Info,
  Globe,
  Power,
  PowerOff,
  Flame,
  Lightbulb,
  Archive,
  Thermometer,
  Server,
  MapPin,
  Zap,
  Timer,
  Activity,
  ArrowUpCircle,
  HardDrive,
} from 'lucide-react';

// ── Helper: pick the correct step list ──
const getStepsForOp = (systems, systemId, opType) => {
  const sys = systems.find(s => s.systemId === systemId);
  if (!sys) return HANA_TAKEOVER_STEPS;

  // Por estrategia
  if (sys.haStrategy === 'WARM_STANDBY') return WARM_STANDBY_FAILOVER_STEPS;
  if (sys.haStrategy === 'PILOT_LIGHT') return PILOT_LIGHT_ACTIVATION_STEPS;
  if (sys.haStrategy === 'CROSS_REGION_DR') return CROSS_REGION_DR_STEPS;
  if (sys.haStrategy === 'BACKUP_RESTORE') return BACKUP_RESTORE_STEPS;

  // Por tipo de HA
  if (sys.haType === 'ASCS_ERS') return ASCS_FAILOVER_STEPS;
  if (opType === 'TAKEOVER' || opType === 'FAILBACK') return HANA_TAKEOVER_STEPS;
  return HANA_FAILOVER_STEPS;
};

// ── Strategy icon ──
const StrategyIcon = ({ strategy, className = 'w-4 h-4' }) => {
  const map = {
    HOT_STANDBY: Flame,
    WARM_STANDBY: Thermometer,
    PILOT_LIGHT: Lightbulb,
    BACKUP_RESTORE: Archive,
    CROSS_REGION_DR: Globe,
  };
  const Icon = map[strategy] || Activity;
  return <Icon className={className} />;
};

// ── Get operation label by strategy ──
const getOpLabels = (sys) => {
  if (!sys) return { primary: 'Failover', secondary: null, drTest: null };
  const s = sys.haStrategy;
  if (s === 'HOT_STANDBY') return { primary: 'Takeover', secondary: 'Failover', drTest: null };
  if (s === 'WARM_STANDBY') return { primary: 'Failover', secondary: null, drTest: null };
  if (s === 'PILOT_LIGHT') return { primary: 'Activar DR', secondary: null, drTest: 'Test DR' };
  if (s === 'CROSS_REGION_DR') return { primary: 'DR Switchover', secondary: null, drTest: 'Test DR' };
  if (s === 'BACKUP_RESTORE') return { primary: 'Restore', secondary: null, drTest: 'Test Restore' };
  return { primary: 'Failover', secondary: null, drTest: null };
};

export default function HAControlCenterPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('systems');
  const [systems, setSystems] = useState([]);
  const [opsHistory, setOpsHistory] = useState([]);
  const [haDrivers, setHaDrivers] = useState([]);
  const [haPrereqs, setHaPrereqs] = useState({});
  const [loading, setLoading] = useState(true);
  const [selectedStrategy, setSelectedStrategy] = useState('ALL');

  useEffect(() => {
    Promise.all([
      dataService.getHASystems(),
      dataService.getHAOpsHistory(),
      dataService.getHADrivers(),
      dataService.getHAPrereqs(),
    ]).then(([sys, history, drivers, prereqs]) => {
      setSystems(sys);
      setOpsHistory(history);
      setHaDrivers(drivers);
      setHaPrereqs(prereqs);
      setLoading(false);
    });
  }, []);

  // Simulation state
  const [runningOp, setRunningOp] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState(null);

  // Filtered systems
  const filteredSystems = selectedStrategy === 'ALL'
    ? systems
    : systems.filter(s => s.haStrategy === selectedStrategy);

  // ── Completion handler ──
  const completeOperation = useCallback((op) => {
    const endTime = new Date().toISOString();
    setOpsHistory(prev => {
      const newEntry = {
        id: `ha-op-${String(prev.length + 1).padStart(3, '0')}`,
        systemId: op.systemId,
        type: op.type,
        strategy: op.strategy,
        status: 'COMPLETED',
        triggeredBy: user?.email || 'demo@empresa.com',
        reason: `${op.type} manual`,
        startedAt: op.startedAt,
        completedAt: endTime,
        duration: op.startedAt ? `${((Date.now() - new Date(op.startedAt).getTime()) / 1000).toFixed(0)}s` : '—',
        steps: op.totalSteps,
        stepsOk: op.totalSteps,
      };
      return [newEntry, ...prev];
    });
    setRunningOp(prev => (prev ? { ...prev, status: 'completed' } : prev));
  }, [user?.email]);

  // ── Step progression ──
  useEffect(() => {
    if (!runningOp || runningOp.status !== 'running') return;
    const isLastStep = runningOp.currentStep >= runningOp.totalSteps;
    const delay = isLastStep ? 0 : 2000 + Math.random() * 1000;

    const timer = setTimeout(() => {
      if (isLastStep) {
        completeOperation(runningOp);
      } else {
        setRunningOp(prev => {
          if (!prev || prev.status !== 'running') return prev;
          return { ...prev, currentStep: prev.currentStep + 1 };
        });
      }
    }, delay);
    return () => clearTimeout(timer);
  }, [runningOp, completeOperation]);

  // ── Handlers ──
  const handleStartOp = useCallback((systemId, type) => {
    setConfirmDialog({ systemId, type });
  }, []);

  const handleConfirmOp = useCallback(() => {
    if (!confirmDialog) return;
    const sys = systems.find(s => s.systemId === confirmDialog.systemId);
    const steps = getStepsForOp(systems, confirmDialog.systemId, confirmDialog.type);
    setRunningOp({
      systemId: confirmDialog.systemId,
      type: confirmDialog.type,
      strategy: sys?.haStrategy || 'HOT_STANDBY',
      currentStep: 0,
      totalSteps: steps.length,
      steps,
      status: 'running',
      startedAt: new Date().toISOString(),
    });
    setConfirmDialog(null);
    setActiveTab('operations');
  }, [confirmDialog, systems]);

  const handleCancelConfirm = useCallback(() => setConfirmDialog(null), []);
  const handleDismissComplete = useCallback(() => setRunningOp(null), []);

  // ── Tab config ──
  const tabs = [
    { key: 'systems', label: 'Sistemas HA' },
    { key: 'operations', label: 'Operaciones' },
    { key: 'prerequisites', label: 'Prerequisites' },
    { key: 'evidence', label: 'Evidence' },
  ];

  // ── Status helpers ──
  const statusColor = (status) => ({
    HEALTHY: 'border-l-success-500',
    DEGRADED: 'border-l-warning-500',
    STANDBY: 'border-l-primary-500',
    PROTECTED: 'border-l-accent-500',
    NOT_CONFIGURED: 'border-l-gray-400',
  }[status] || 'border-l-gray-400');

  const statusBadge = (status) => {
    const map = {
      HEALTHY: { bg: 'bg-success-50 dark:bg-success-950', text: 'text-success-700 dark:text-success-300', label: 'Healthy', Icon: CheckCircle2 },
      DEGRADED: { bg: 'bg-warning-50 dark:bg-warning-950', text: 'text-warning-700 dark:text-warning-300', label: 'Degraded', Icon: AlertTriangle },
      STANDBY: { bg: 'bg-primary-50 dark:bg-primary-950', text: 'text-primary-700 dark:text-primary-300', label: 'Standby', Icon: PowerOff },
      PROTECTED: { bg: 'bg-accent-50 dark:bg-accent-950', text: 'text-accent-700 dark:text-accent-300', label: 'Protected', Icon: ShieldCheck },
      NOT_CONFIGURED: { bg: 'bg-gray-100 dark:bg-gray-800', text: 'text-gray-600 dark:text-gray-400', label: 'Not Configured', Icon: Info },
    };
    const c = map[status] || map.NOT_CONFIGURED;
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${c.bg} ${c.text}`}>
        <c.Icon className="w-3 h-3" />
        {c.label}
      </span>
    );
  };

  const strategyBadge = (strategy) => {
    const meta = HA_STRATEGY_META[strategy];
    if (!meta) return null;
    const colorMap = {
      success: 'bg-success-50 dark:bg-success-950 text-success-700 dark:text-success-300',
      primary: 'bg-primary-50 dark:bg-primary-950 text-primary-700 dark:text-primary-300',
      warning: 'bg-warning-50 dark:bg-warning-950 text-warning-700 dark:text-warning-300',
      danger: 'bg-danger-50 dark:bg-danger-950 text-danger-700 dark:text-danger-300',
      accent: 'bg-accent-50 dark:bg-accent-950 text-accent-700 dark:text-accent-300',
    };
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${colorMap[meta.color] || colorMap.primary}`}>
        <StrategyIcon strategy={strategy} className="w-3 h-3" />
        {meta.label}
      </span>
    );
  };

  const replStatusBadge = (replStatus) => {
    if (!replStatus) return null;
    if (replStatus === 'SOK') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-success-50 dark:bg-success-950 text-success-700 dark:text-success-300">
          <CheckCircle2 className="w-3 h-3" /> SOK
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-danger-50 dark:bg-danger-950 text-danger-700 dark:text-danger-300">
        <XCircle className="w-3 h-3" /> SFAIL
      </span>
    );
  };

  const opTypeBadge = (type) => {
    const map = {
      TAKEOVER: { bg: 'bg-primary-50 dark:bg-primary-950', text: 'text-primary-700 dark:text-primary-300' },
      FAILOVER: { bg: 'bg-warning-50 dark:bg-warning-950', text: 'text-warning-700 dark:text-warning-300' },
      FAILBACK: { bg: 'bg-success-50 dark:bg-success-950', text: 'text-success-700 dark:text-success-300' },
      DR_ACTIVATION: { bg: 'bg-danger-50 dark:bg-danger-950', text: 'text-danger-700 dark:text-danger-300' },
      DR_TEST: { bg: 'bg-accent-50 dark:bg-accent-950', text: 'text-accent-700 dark:text-accent-300' },
      DR_SWITCHOVER: { bg: 'bg-warning-50 dark:bg-warning-950', text: 'text-warning-700 dark:text-warning-300' },
      RESTORE: { bg: 'bg-danger-50 dark:bg-danger-950', text: 'text-danger-700 dark:text-danger-300' },
    };
    const c = map[type] || map.TAKEOVER;
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${c.bg} ${c.text}`}>
        {type.replace('_', ' ')}
      </span>
    );
  };

  const opStatusBadge = (status) => {
    if (status === 'COMPLETED') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-success-50 dark:bg-success-950 text-success-700 dark:text-success-300">
          <CheckCircle2 className="w-3 h-3" /> Completed
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-danger-50 dark:bg-danger-950 text-danger-700 dark:text-danger-300">
        <XCircle className="w-3 h-3" /> Failed
      </span>
    );
  };

  const prereqIcon = (status) => {
    if (status === 'PASS') return <CheckCircle2 className="w-5 h-5 text-success-500" />;
    if (status === 'WARN') return <AlertTriangle className="w-5 h-5 text-warning-500" />;
    return <XCircle className="w-5 h-5 text-danger-500" />;
  };

  const prereqStatusBadge = (status) => {
    const map = {
      PASS: { bg: 'bg-success-50 dark:bg-success-950', text: 'text-success-700 dark:text-success-300' },
      WARN: { bg: 'bg-warning-50 dark:bg-warning-950', text: 'text-warning-700 dark:text-warning-300' },
      FAIL: { bg: 'bg-danger-50 dark:bg-danger-950', text: 'text-danger-700 dark:text-danger-300' },
    };
    const c = map[status] || map.FAIL;
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${c.bg} ${c.text}`}>
        {status}
      </span>
    );
  };

  const generateEvidenceHash = (id) => {
    const base = `${id}-evidence-hash`;
    let hash = '';
    for (let i = 0; i < 64; i++) {
      hash += ((base.charCodeAt(i % base.length) * 7 + i * 13) % 16).toString(16);
    }
    return hash;
  };

  // ── Strategy overview cards ──
  const renderStrategyOverview = () => {
    const strategies = Object.entries(HA_STRATEGY_META);
    const counts = {};
    systems.forEach(s => {
      if (s.haStrategy) counts[s.haStrategy] = (counts[s.haStrategy] || 0) + 1;
    });

    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {strategies.map(([key, meta]) => (
          <button
            key={key}
            onClick={() => setSelectedStrategy(prev => prev === key ? 'ALL' : key)}
            className={`p-3 rounded-xl border transition-all text-left ${
              selectedStrategy === key
                ? 'border-primary-500 bg-primary-50/50 dark:bg-primary-950/50 ring-1 ring-primary-500'
                : 'border-border bg-surface hover:bg-surface-secondary'
            }`}
          >
            <div className="flex items-center gap-2 mb-2">
              <StrategyIcon strategy={key} className="w-4 h-4 text-text-tertiary" />
              <span className="text-xs font-semibold text-text-primary">{meta.label}</span>
            </div>
            <div className="flex items-center justify-between text-[10px] text-text-tertiary">
              <span className="flex items-center gap-1"><Timer className="w-3 h-3" /> RTO: {meta.rto}</span>
            </div>
            <div className="flex items-center justify-between text-[10px] text-text-tertiary mt-0.5">
              <span className="flex items-center gap-1"><Database className="w-3 h-3" /> RPO: {meta.rpo}</span>
              <span className="font-semibold text-text-secondary">{counts[key] || 0} sys</span>
            </div>
          </button>
        ))}
      </div>
    );
  };

  // ── Render: node pair for any strategy ──
  const renderNodePair = (sys) => {
    const isPilotLight = sys.haStrategy === 'PILOT_LIGHT';
    const isBackupOnly = sys.haStrategy === 'BACKUP_RESTORE';
    const isCrossRegion = sys.haStrategy === 'CROSS_REGION_DR';
    const isWarmStandby = sys.haStrategy === 'WARM_STANDBY';
    const primaryLabel = sys.haType === 'ASCS_ERS' ? 'ASCS' : 'Primary';
    const secondaryLabel = sys.haType === 'ASCS_ERS' ? 'ERS' :
      isPilotLight ? 'DR (Stopped)' :
      isCrossRegion ? 'DR Region' :
      isWarmStandby ? 'Secondary (Reduced)' : 'Secondary';

    return (
      <div className="bg-surface-secondary rounded-lg p-3 space-y-2">
        {/* Primary node */}
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-success-500 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-text-primary truncate">
              {primaryLabel}: {sys.primary.host}
              <span className="font-mono text-text-tertiary ml-1">(Inst. {sys.primary.instanceNr})</span>
            </p>
            <p className="text-[10px] text-text-tertiary font-mono">
              {sys.primary.ip} &middot; {sys.primary.zone}
              {sys.primary.state === 'running' && (
                <span className="ml-1.5 text-success-600 dark:text-success-400"><Power className="w-2.5 h-2.5 inline" /> Running</span>
              )}
            </p>
          </div>
        </div>

        {/* Separator */}
        {!isBackupOnly && (
          <div className="flex justify-center">
            <ArrowLeftRight className="w-4 h-4 text-text-tertiary" />
          </div>
        )}

        {/* Secondary node */}
        {sys.secondary ? (
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
              sys.secondary.state === 'stopped' ? 'bg-gray-400' : 'bg-primary-500'
            }`} />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-text-primary truncate">
                {secondaryLabel}: {sys.secondary.host}
                <span className="font-mono text-text-tertiary ml-1">(Inst. {sys.secondary.instanceNr})</span>
              </p>
              <p className="text-[10px] text-text-tertiary font-mono">
                {sys.secondary.ip} &middot; {sys.secondary.zone}
                {sys.secondary.state === 'stopped' ? (
                  <span className="ml-1.5 text-gray-500"><PowerOff className="w-2.5 h-2.5 inline" /> Stopped</span>
                ) : (
                  <span className="ml-1.5 text-success-600 dark:text-success-400"><Power className="w-2.5 h-2.5 inline" /> Running</span>
                )}
              </p>
            </div>
          </div>
        ) : isBackupOnly ? (
          <div className="flex items-center gap-2 text-xs text-text-tertiary">
            <Archive className="w-3.5 h-3.5" />
            <span>Sin nodo secundario — protegido por backups</span>
          </div>
        ) : (
          <p className="text-xs text-text-tertiary text-center">Sin nodo secundario</p>
        )}

        {/* Warm Standby: sizing comparison */}
        {isWarmStandby && sys.primary.instanceType && sys.secondary?.instanceType && (
          <div className="mt-2 pt-2 border-t border-border space-y-2">
            {/* Sizing bars */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-text-tertiary">Primary</span>
                <span className="font-mono font-medium text-text-primary">
                  {sys.primary.instanceType} &middot; {sys.primary.vcpu} vCPU &middot; {sys.primary.memoryGb} GB
                </span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                <div className="bg-success-500 h-1.5 rounded-full w-full" />
              </div>

              <div className="flex items-center justify-between text-[10px]">
                <span className="text-text-tertiary">Secondary</span>
                <span className="font-mono font-medium text-warning-600 dark:text-warning-400">
                  {sys.secondary.instanceType} &middot; {sys.secondary.vcpu} vCPU &middot; {sys.secondary.memoryGb} GB
                </span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                <div className="bg-warning-500 h-1.5 rounded-full" style={{ width: `${(sys.secondary.memoryGb / sys.primary.memoryGb) * 100}%` }} />
              </div>
            </div>

            {/* Scale-up info */}
            {sys.warmStandbyDetails && (
              <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-warning-50 dark:bg-warning-950/50 text-xs">
                <ArrowUpCircle className="w-3.5 h-3.5 text-warning-600 dark:text-warning-400 flex-shrink-0" />
                <span className="text-warning-700 dark:text-warning-300">
                  Scale-up a <span className="font-mono font-semibold">{sys.secondary.targetInstanceType}</span> necesario antes de activar
                  ({sys.warmStandbyDetails.estimatedScaleUpTime})
                </span>
              </div>
            )}

            {sys.warmStandbyDetails && (
              <div className="grid grid-cols-2 gap-2 text-[10px] text-text-secondary">
                <div className="flex justify-between">
                  <span>Ahorro costo:</span>
                  <span className="font-semibold text-success-600 dark:text-success-400">{sys.warmStandbyDetails.costSavingsPercent}%</span>
                </div>
                <div className="flex justify-between">
                  <span>Catch-up estimado:</span>
                  <span className="font-medium">{sys.warmStandbyDetails.estimatedCatchUpTime}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ASCS/ERS specific: Enqueue Stats */}
        {sys.haType === 'ASCS_ERS' && sys.enqueueStats && (
          <div className="mt-2 pt-2 border-t border-border space-y-1">
            <div className="flex items-center gap-2 text-xs text-text-secondary">
              <span className="font-medium">Modo:</span> {sys.replicationMode}
            </div>
            <div className="flex items-center gap-2 text-xs text-text-secondary">
              <span className="font-medium">Locks replicados:</span>
              <span className={sys.enqueueStats.replicated === sys.enqueueStats.locks
                ? 'text-success-600 dark:text-success-400 font-semibold'
                : 'text-danger-600 dark:text-danger-400 font-semibold'
              }>
                {sys.enqueueStats.replicated}/{sys.enqueueStats.locks}
              </span>
              {sys.enqueueStats.replicationActive && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-success-50 dark:bg-success-950 text-success-700 dark:text-success-300">
                  <CheckCircle2 className="w-2.5 h-2.5" /> Activo
                </span>
              )}
            </div>
          </div>
        )}

        {/* Pilot Light details */}
        {isPilotLight && sys.pilotLightDetails && (
          <div className="mt-2 pt-2 border-t border-border space-y-1 text-xs text-text-secondary">
            <div className="flex justify-between">
              <span>Tipo instancia DR:</span>
              <span className="font-mono font-medium text-text-primary">{sys.pilotLightDetails.secondaryInstanceType}</span>
            </div>
            <div className="flex justify-between">
              <span>Tiempo estimado boot:</span>
              <span className="font-medium">{sys.pilotLightDetails.estimatedBootTime}</span>
            </div>
            <div className="flex justify-between">
              <span>Último sync backup:</span>
              <span className="font-medium">{sys.pilotLightDetails?.lastBackupSync ? new Date(sys.pilotLightDetails.lastBackupSync).toLocaleString('es-CO', { hour12: false }) : '—'}</span>
            </div>
            <div className="flex justify-between">
              <span>Método:</span>
              <span className="font-medium">{sys.pilotLightDetails?.backupType?.replace(/_/g, ' ') ?? '—'}</span>
            </div>
          </div>
        )}

        {/* Backup details */}
        {isBackupOnly && sys.backupDetails && (
          <div className="mt-2 pt-2 border-t border-border space-y-1 text-xs text-text-secondary">
            <div className="flex justify-between">
              <span>Último backup completo:</span>
              <span className="font-medium">{sys.backupDetails?.lastFull ? new Date(sys.backupDetails.lastFull).toLocaleString('es-CO', { hour12: false }) : '—'}</span>
            </div>
            <div className="flex justify-between">
              <span>Último log backup:</span>
              <span className="font-medium">{sys.backupDetails?.lastLog ? new Date(sys.backupDetails.lastLog).toLocaleString('es-CO', { hour12: false }) : '—'}</span>
            </div>
            <div className="flex justify-between">
              <span>Destino:</span>
              <span className="font-mono font-medium text-text-primary">{sys.backupDetails.backupTarget}</span>
            </div>
            <div className="flex justify-between">
              <span>Tiempo estimado restore:</span>
              <span className="font-medium text-warning-600 dark:text-warning-400">{sys.backupDetails.estimatedRestoreTime}</span>
            </div>
          </div>
        )}
      </div>
    );
  };

  // ── Render: Sistemas HA tab ──
  const renderSystemsTab = () => (
    <div className="space-y-6">
      {/* Strategy overview */}
      {renderStrategyOverview()}

      {/* Filter indicator */}
      {selectedStrategy !== 'ALL' && (
        <div className="flex items-center gap-2 text-xs text-text-secondary">
          <span>Filtrando por:</span>
          {strategyBadge(selectedStrategy)}
          <button onClick={() => setSelectedStrategy('ALL')} className="text-primary-600 dark:text-primary-400 hover:underline ml-1">
            Mostrar todos
          </button>
        </div>
      )}

      {/* System cards grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filteredSystems.map((sys) => (
          <div
            key={sys.systemId}
            className={`bg-surface rounded-xl border border-border border-l-4 ${statusColor(sys.haStatus)} p-4 space-y-3`}
          >
            {/* Header row */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-text-tertiary font-mono">{sys.systemId}</p>
                <p className="text-lg font-bold text-text-primary">{sys.sid}</p>
              </div>
              <div className="flex flex-col items-end gap-1">
                {statusBadge(sys.haStatus)}
                {sys.haStrategy && strategyBadge(sys.haStrategy)}
              </div>
            </div>

            {sys.haStatus === 'NOT_CONFIGURED' ? (
              <div className="py-4 text-center">
                <Info className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                <p className="text-sm text-text-secondary">Alta Disponibilidad no configurada para este sistema.</p>
              </div>
            ) : (
              <>
                {/* Info row */}
                <div className="flex items-center gap-2 flex-wrap text-xs text-text-secondary">
                  {sys.provider && (
                    <span className="inline-flex items-center gap-1">
                      <Server className="w-3.5 h-3.5" />
                      {sys.provider}
                    </span>
                  )}
                  {sys.region && (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5" />
                      {sys.region}
                    </span>
                  )}
                  {sys.dbType && (
                    <span className="inline-flex items-center gap-1">
                      <Database className="w-3.5 h-3.5" />
                      {sys.dbType}
                    </span>
                  )}
                  {sys.replicationMode && (
                    <span className="inline-flex items-center gap-1">
                      <Network className="w-3.5 h-3.5" />
                      {sys.replicationMode}
                    </span>
                  )}
                  {replStatusBadge(sys.replicationStatus)}
                  {sys.replicationLag != null && (
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
                      sys.replicationLag < 5
                        ? 'bg-success-50 dark:bg-success-950 text-success-700 dark:text-success-300'
                        : sys.replicationLag < 30
                          ? 'bg-warning-50 dark:bg-warning-950 text-warning-700 dark:text-warning-300'
                          : 'bg-danger-50 dark:bg-danger-950 text-danger-700 dark:text-danger-300'
                    }`}>
                      <Clock className="w-3 h-3" />
                      Lag: {sys.replicationLag}s
                    </span>
                  )}
                </div>

                {/* RTO/RPO for the strategy */}
                {sys.haStrategy && HA_STRATEGY_META[sys.haStrategy] && (
                  <div className="flex items-center gap-4 text-[10px] text-text-tertiary">
                    <span className="flex items-center gap-1">
                      <Zap className="w-3 h-3" />
                      RTO: <span className="font-semibold text-text-secondary">{HA_STRATEGY_META[sys.haStrategy].rto}</span>
                    </span>
                    <span className="flex items-center gap-1">
                      <Database className="w-3 h-3" />
                      RPO: <span className="font-semibold text-text-secondary">{HA_STRATEGY_META[sys.haStrategy].rpo}</span>
                    </span>
                  </div>
                )}

                {/* Node pair visualization */}
                {renderNodePair(sys)}

                {/* VIP / DNS */}
                {sys.vip && (
                  <div className="flex items-center gap-1.5 text-xs text-text-secondary">
                    <Globe className="w-3.5 h-3.5" />
                    <span>VIP: <span className="font-mono font-medium text-text-primary">{sys.vip}</span></span>
                  </div>
                )}
                {sys.dnsEndpoint && (
                  <div className="flex items-center gap-1.5 text-xs text-text-secondary">
                    <Globe className="w-3.5 h-3.5" />
                    <span>DNS: <span className="font-mono font-medium text-text-primary">{sys.dnsEndpoint}</span></span>
                  </div>
                )}

                {/* Last operation */}
                {sys.lastOp && (
                  <div className="flex items-center gap-2 text-xs text-text-tertiary">
                    <Clock className="w-3.5 h-3.5" />
                    <span>
                      Última op: {sys.lastOp.type} &mdash;{' '}
                      <span className={sys.lastOp.status === 'FAILED' ? 'text-danger-600 dark:text-danger-400 font-medium' : 'text-success-600 dark:text-success-400 font-medium'}>
                        {sys.lastOp.status}
                      </span>{' '}
                      ({sys.lastOp?.at ? new Date(sys.lastOp.at).toLocaleDateString('es-CO') : '—'})
                    </span>
                  </div>
                )}

                {/* Action buttons — adapted per strategy */}
                <div className="flex items-center gap-2 pt-1 flex-wrap">
                  {(() => {
                    const labels = getOpLabels(sys);
                    return (
                      <>
                        {/* Primary action */}
                        {sys.haStatus !== 'NOT_CONFIGURED' && (
                          <button
                            onClick={() => handleStartOp(sys.systemId, labels.primary === 'Takeover' ? 'TAKEOVER' : labels.primary === 'Activar DR' ? 'DR_ACTIVATION' : labels.primary === 'DR Switchover' ? 'DR_SWITCHOVER' : labels.primary === 'Restore' ? 'RESTORE' : 'FAILOVER')}
                            disabled={!!runningOp}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          >
                            <Play className="w-3.5 h-3.5" /> {labels.primary}
                          </button>
                        )}
                        {/* Secondary action (failover for hot standby) */}
                        {labels.secondary && (sys.haStatus === 'HEALTHY' || sys.haStatus === 'DEGRADED') && (
                          <button
                            onClick={() => handleStartOp(sys.systemId, 'FAILOVER')}
                            disabled={!!runningOp}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-warning-600 text-white hover:bg-warning-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          >
                            <RotateCcw className="w-3.5 h-3.5" /> {labels.secondary}
                          </button>
                        )}
                        {/* DR Test */}
                        {labels.drTest && (
                          <button
                            onClick={() => handleStartOp(sys.systemId, 'DR_TEST')}
                            disabled={!!runningOp}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-border text-text-secondary hover:bg-surface-secondary disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          >
                            <Activity className="w-3.5 h-3.5" /> {labels.drTest}
                          </button>
                        )}
                        {/* Health check */}
                        <button
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-border text-text-secondary hover:bg-surface-secondary transition-colors"
                        >
                          <RefreshCw className="w-3.5 h-3.5" /> Check
                        </button>
                      </>
                    );
                  })()}
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      {/* Drivers Registrados */}
      <div className="bg-surface rounded-xl border border-border p-5">
        <h3 className="text-sm font-semibold text-text-primary mb-4 flex items-center gap-2">
          <Cpu className="w-4 h-4 text-text-tertiary" />
          Drivers Registrados
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {haDrivers.map((drv, i) => (
            <div key={i} className="flex items-center justify-between p-3 rounded-lg border border-border bg-surface-secondary">
              <div>
                <p className="text-sm font-medium text-text-primary">{drv.name}</p>
                <p className="text-xs text-text-tertiary">{drv.type} &middot; v{drv.version}</p>
              </div>
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
                drv.status === 'ok'
                  ? 'bg-success-50 dark:bg-success-950 text-success-700 dark:text-success-300'
                  : 'bg-danger-50 dark:bg-danger-950 text-danger-700 dark:text-danger-300'
              }`}>
                {drv.status === 'ok' ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                {drv.status === 'ok' ? 'OK' : 'Error'}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  // ── Render: Operaciones tab ──
  const renderOperationsTab = () => (
    <div className="space-y-6">
      {/* Running operation progress panel */}
      {runningOp && runningOp.status === 'running' && (
        <div className="bg-surface rounded-xl border border-primary-200 dark:border-primary-800 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">
              <Loader2 className="w-4 h-4 text-primary-600 animate-spin" />
              Operación en curso: {runningOp.type.replace('_', ' ')} &mdash; {runningOp.systemId}
            </h3>
            <div className="flex items-center gap-2">
              {strategyBadge(runningOp.strategy)}
              <span className="text-xs text-text-tertiary">
                Paso {Math.min(runningOp.currentStep, runningOp.totalSteps)} / {runningOp.totalSteps}
              </span>
            </div>
          </div>

          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
            <div
              className="bg-primary-600 h-2 rounded-full transition-all duration-500"
              style={{ width: `${Math.min((runningOp.currentStep / (runningOp.totalSteps || 1)) * 100, 100)}%` }}
            />
          </div>

          <div className="space-y-1.5">
            {runningOp.steps.map((step, idx) => {
              let icon, textClass;
              if (idx < runningOp.currentStep) {
                icon = <CheckCircle2 className="w-4 h-4 text-success-500 flex-shrink-0" />;
                textClass = 'text-success-700 dark:text-success-300';
              } else if (idx === runningOp.currentStep) {
                icon = <Loader2 className="w-4 h-4 text-primary-500 animate-spin flex-shrink-0" />;
                textClass = 'text-primary-700 dark:text-primary-300 font-medium';
              } else {
                icon = <div className="w-4 h-4 rounded-full border-2 border-gray-300 dark:border-gray-600 flex-shrink-0" />;
                textClass = 'text-text-tertiary';
              }
              return (
                <div key={idx} className="flex items-center gap-2">
                  {icon}
                  <span className={`text-xs ${textClass}`}>{step.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Completed operation banner */}
      {runningOp && runningOp.status === 'completed' && (
        <div className="bg-success-50 dark:bg-success-950 border border-success-200 dark:border-success-800 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-success-600" />
              <span className="text-sm font-medium text-success-700 dark:text-success-300">
                Operación demo completada: {runningOp.type.replace('_', ' ')} en {runningOp.systemId}.
              </span>
            </div>
            <button onClick={handleDismissComplete} className="text-xs text-success-600 dark:text-success-400 hover:underline">
              Cerrar
            </button>
          </div>
          {(runningOp.type === 'TAKEOVER' || runningOp.type === 'FAILOVER') && (
            <div className="flex items-center gap-3 pt-1 border-t border-success-200 dark:border-success-800">
              <p className="text-xs text-success-700 dark:text-success-300 flex-1">
                Para revertir esta operación y restaurar la configuración original, inicie un Failback.
              </p>
              <button
                onClick={() => { handleDismissComplete(); handleStartOp(runningOp.systemId, 'FAILBACK'); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-success-600 text-white hover:bg-success-700 transition-colors"
              >
                <ArrowLeftRight className="w-3.5 h-3.5" /> Failback
              </button>
            </div>
          )}
        </div>
      )}

      {/* History table */}
      <div className="bg-surface rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border bg-surface-secondary">
                <th className="px-4 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wider">ID</th>
                <th className="px-4 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wider">Sistema</th>
                <th className="px-4 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wider">Tipo</th>
                <th className="px-4 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wider">Estrategia</th>
                <th className="px-4 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wider">Estado</th>
                <th className="px-4 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wider">Iniciado por</th>
                <th className="px-4 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wider">Duración</th>
                <th className="px-4 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wider">Steps</th>
                <th className="px-4 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wider">Fecha</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {opsHistory.map((op) => (
                <tr key={op.id} className="hover:bg-surface-secondary transition-colors">
                  <td className="px-4 py-3 text-xs font-mono text-text-primary">{op.id}</td>
                  <td className="px-4 py-3 text-xs font-medium text-text-primary">{op.systemId}</td>
                  <td className="px-4 py-3">{opTypeBadge(op.type)}</td>
                  <td className="px-4 py-3">{op.strategy ? strategyBadge(op.strategy) : '—'}</td>
                  <td className="px-4 py-3">{opStatusBadge(op.status)}</td>
                  <td className="px-4 py-3 text-xs text-text-secondary">{op.triggeredBy}</td>
                  <td className="px-4 py-3 text-xs text-text-secondary font-mono">{op.duration}</td>
                  <td className="px-4 py-3 text-xs text-text-secondary">
                    <span className={op.stepsOk === op.steps ? 'text-success-600 dark:text-success-400' : 'text-danger-600 dark:text-danger-400'}>
                      {op.stepsOk}/{op.steps}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-text-tertiary">
                    {op.startedAt ? new Date(op.startedAt).toLocaleString('es-CO', { hour12: false }) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {opsHistory.length === 0 && (
          <div className="py-12 text-center text-text-tertiary text-sm">Sin operaciones registradas.</div>
        )}
      </div>
    </div>
  );

  // ── Render: Prerequisites tab ──
  const categoryBadge = (cat) => {
    const map = {
      cloud: { bg: 'bg-accent-50 dark:bg-accent-950', text: 'text-accent-700 dark:text-accent-300', label: 'CLOUD' },
      sap: { bg: 'bg-primary-50 dark:bg-primary-950', text: 'text-primary-700 dark:text-primary-300', label: 'SAP' },
      infra: { bg: 'bg-gray-100 dark:bg-gray-800', text: 'text-gray-600 dark:text-gray-400', label: 'INFRA' },
      system: { bg: 'bg-gray-100 dark:bg-gray-800', text: 'text-gray-600 dark:text-gray-400', label: 'SYSTEM' },
    };
    const c = map[cat];
    if (!c) return null;
    return (
      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase ${c.bg} ${c.text}`}>
        {c.label}
      </span>
    );
  };

  const renderPrerequisitesTab = () => {
    const strategiesWithPrereqs = Object.entries(haPrereqs);

    return (
      <div className="space-y-6">
        {/* Leyenda */}
        <div className="flex items-center gap-4 text-xs text-text-tertiary">
          <span className="font-medium text-text-secondary">Categorías:</span>
          <span className="flex items-center gap-1">{categoryBadge('sap')} Permisos SAP/BD</span>
          <span className="flex items-center gap-1">{categoryBadge('infra')} Infraestructura</span>
          <span className="flex items-center gap-1">{categoryBadge('cloud')} Permisos Cloud (AWS/Azure/GCP)</span>
          <span className="flex items-center gap-1">{categoryBadge('system')} Sistema</span>
        </div>

        {strategiesWithPrereqs.map(([strategy, prereqs]) => {
          const meta = HA_STRATEGY_META[strategy];
          if (!meta) return null;
          const allRequiredPass = prereqs.filter(p => p.required).every(p => p.status === 'PASS');
          const cloudPrereqs = prereqs.filter(p => p.category === 'cloud');
          const cloudOk = cloudPrereqs.every(p => p.status === 'PASS');

          return (
            <div key={strategy} className="space-y-3">
              <div className="flex items-center gap-3 flex-wrap">
                {strategyBadge(strategy)}
                {allRequiredPass ? (
                  <span className="inline-flex items-center gap-1 text-xs text-success-600 dark:text-success-400">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Ready
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs text-warning-600 dark:text-warning-400">
                    <AlertTriangle className="w-3.5 h-3.5" /> Issues
                  </span>
                )}
                {cloudPrereqs.length > 0 && (
                  <span className={`inline-flex items-center gap-1 text-xs ${cloudOk ? 'text-success-600 dark:text-success-400' : 'text-danger-600 dark:text-danger-400'}`}>
                    <Globe className="w-3.5 h-3.5" />
                    Cloud: {cloudOk ? 'OK' : `${cloudPrereqs.filter(p => p.status !== 'PASS').length} pendientes`}
                  </span>
                )}
              </div>

              <div className="bg-surface rounded-xl border border-border divide-y divide-border">
                {prereqs.map((prereq, idx) => (
                  <div key={idx} className={`flex items-center gap-4 px-5 py-3 ${
                    prereq.category === 'cloud' ? 'bg-accent-50/30 dark:bg-accent-950/20' : ''
                  }`}>
                    {prereqIcon(prereq.status)}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-text-primary">{prereq.name}</p>
                        {prereq.required && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase bg-primary-50 dark:bg-primary-950 text-primary-700 dark:text-primary-300">
                            Required
                          </span>
                        )}
                        {prereq.category && categoryBadge(prereq.category)}
                      </div>
                      <p className="text-xs text-text-tertiary mt-0.5">{prereq.details}</p>
                    </div>
                    {prereqStatusBadge(prereq.status)}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  // ── Render: Evidence tab ──
  const renderEvidenceTab = () => (
    <div className="space-y-4">
      {opsHistory.map((op) => (
        <div key={op.id} className="bg-surface rounded-xl border border-border p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <FileJson className="w-4 h-4 text-text-tertiary" />
                <span className="text-sm font-semibold text-text-primary">{op.id}</span>
                {opTypeBadge(op.type)}
                {op.strategy && strategyBadge(op.strategy)}
                {opStatusBadge(op.status)}
              </div>
              <p className="text-xs text-text-tertiary mt-1">
                {op.systemId} &mdash; {op.startedAt ? new Date(op.startedAt).toLocaleString('es-CO', { hour12: false }) : '—'} &mdash; {op.triggeredBy}
              </p>
            </div>
            <button
              onClick={() => {
                const evidence = {
                  operationId: op.id, systemId: op.systemId, type: op.type,
                  strategy: op.strategy, status: op.status, triggeredBy: op.triggeredBy,
                  reason: op.reason, startedAt: op.startedAt, completedAt: op.completedAt,
                  duration: op.duration, steps: op.steps, stepsOk: op.stepsOk,
                  sha256: generateEvidenceHash(op.id), exportedAt: new Date().toISOString(),
                };
                const blob = new Blob([JSON.stringify(evidence, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a'); a.href = url; a.download = `evidence-${op.id}.json`; a.click();
                URL.revokeObjectURL(url);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-border text-text-secondary hover:bg-surface-secondary transition-colors"
            >
              <Download className="w-3.5 h-3.5" /> Export JSON
            </button>
          </div>
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-secondary">
            <Hash className="w-3.5 h-3.5 text-text-tertiary flex-shrink-0" />
            <span className="text-[11px] font-mono text-text-secondary break-all">
              SHA-256: {generateEvidenceHash(op.id)}
            </span>
          </div>
        </div>
      ))}
      {opsHistory.length === 0 && (
        <div className="py-12 text-center text-text-tertiary text-sm bg-surface rounded-xl border border-border">
          Sin evidencia disponible. Ejecute una operación HA para generar registros.
        </div>
      )}
    </div>
  );

  if (loading) return <PageLoading message="Cargando HA Control Center..." />;

  return (
    <div>
      <Header
        title="HA Control Center"
        subtitle="Orquestación de Alta Disponibilidad — Hot Standby, Warm Standby, Pilot Light, Cross-Region DR, Backup & Restore"
      />

      <div className="p-6 space-y-6">
        {/* Tabs */}
        <div className="border-b border-border">
          <nav className="flex gap-6 -mb-px">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`pb-3 text-sm font-medium transition-colors whitespace-nowrap ${
                  activeTab === tab.key
                    ? 'text-primary-600 dark:text-primary-400 border-b-2 border-primary-600 dark:border-primary-400'
                    : 'text-text-tertiary hover:text-text-primary'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {activeTab === 'systems' && renderSystemsTab()}
        {activeTab === 'operations' && renderOperationsTab()}
        {activeTab === 'prerequisites' && renderPrerequisitesTab()}
        {activeTab === 'evidence' && renderEvidenceTab()}
      </div>

      {/* Confirm dialog overlay */}
      {confirmDialog && (() => {
        const sys = systems.find(s => s.systemId === confirmDialog.systemId);
        const strategy = sys?.haStrategy;
        const meta = strategy ? HA_STRATEGY_META[strategy] : null;
        const descriptions = {
          TAKEOVER: 'Se ejecutará un Takeover planificado. SAP será detenido en el nodo primario y reiniciado en el secundario.',
          FAILOVER: strategy === 'WARM_STANDBY'
            ? `Se ejecutará un Failover con scale-up. El nodo secundario será escalado de ${sys?.secondary?.instanceType || '?'} a ${sys?.secondary?.targetInstanceType || '?'}, se aplicarán logs pendientes y se activará como primario. Tiempo estimado: ${meta?.rto || '5-15 min'}.`
            : 'Se ejecutará un Failover de emergencia. Los servicios se moverán al nodo secundario.',
          FAILBACK: 'Se ejecutará un Failback para restaurar la configuración original.',
          DR_ACTIVATION: `Se activará el entorno DR (Pilot Light). Se encenderá la instancia secundaria, se restaurarán datos y se redirigirá el tráfico. Tiempo estimado: ${meta?.rto || '30-60 min'}.`,
          DR_SWITCHOVER: `Se ejecutará un switchover de base de datos entre regiones. El tráfico se redirigirá a la región DR. Tiempo estimado: ${meta?.rto || '15-45 min'}.`,
          DR_TEST: 'Se ejecutará un test de DR sin afectar producción. Se validará que la activación funciona correctamente.',
          RESTORE: `Se desplegará nueva infraestructura y se restaurará desde el último backup disponible. Tiempo estimado: ${meta?.rto || '2-4 horas'}.`,
        };

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-surface rounded-xl border border-border shadow-xl p-6 max-w-md w-full mx-4 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-warning-100 dark:bg-warning-900 flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5 text-warning-600" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-text-primary">Confirmar {confirmDialog.type.replace('_', ' ')}</h3>
                  <p className="text-xs text-text-tertiary">{confirmDialog.systemId}</p>
                </div>
              </div>
              {strategy && (
                <div className="flex items-center gap-2">
                  {strategyBadge(strategy)}
                  {meta && <span className="text-xs text-text-tertiary">RTO: {meta.rto} &middot; RPO: {meta.rpo}</span>}
                </div>
              )}
              <p className="text-sm text-text-secondary">
                {descriptions[confirmDialog.type] || 'Se ejecutará la operación seleccionada.'}
              </p>
              <p className="text-xs text-text-tertiary italic">
                Operación simulada — En producción, esta acción ejecutaría un failover real en su sistema SAP.
              </p>
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  onClick={handleCancelConfirm}
                  className="px-4 py-2 rounded-lg text-sm font-medium border border-border text-text-secondary hover:bg-surface-secondary transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleConfirmOp}
                  className={`px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors ${
                    confirmDialog.type === 'DR_TEST'
                      ? 'bg-accent-600 hover:bg-accent-700'
                      : confirmDialog.type === 'FAILBACK'
                        ? 'bg-success-600 hover:bg-success-700'
                        : confirmDialog.type === 'TAKEOVER'
                          ? 'bg-primary-600 hover:bg-primary-700'
                          : 'bg-warning-600 hover:bg-warning-700'
                  }`}
                >
                  Confirmar {confirmDialog.type.replace('_', ' ')}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
