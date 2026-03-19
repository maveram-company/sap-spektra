import { useState, useRef, useEffect, useCallback } from 'react';
import { Play, FlaskConical, Clock, ShieldCheck, CheckCircle, X, AlertTriangle, Loader2, Filter, XCircle, SkipForward, Terminal, ChevronDown, ChevronRight } from 'lucide-react';
import Header from '../components/layout/Header';
import PageHeader from '../components/layout/PageHeader';
import Tabs from '../components/ui/Tabs';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import Select from '../components/ui/Select';
import Table, { TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/Table';
import EmptyState from '../components/ui/EmptyState';
import { ModeBadge, CapabilityBadge, GovernanceContext, EvidencePanel } from '../components/mode';
import { useMode } from '../mode/ModeContext';
import { useAuth } from '../contexts/AuthContext';
import PageLoading from '../components/ui/PageLoading';
import { dataService, executeRunbookResult } from '../services/dataService';
import { useToast } from '../hooks/useToast';
import { createLogger } from '../lib/logger';
import type { ApiRecord } from '../types';
import type { ProviderResult } from '../providers/types';

const log = createLogger('RunbooksPage');

const CATEGORY_LABELS = {
  SAP_HANA: 'SAP HANA',
  ORACLE: 'Oracle',
  MSSQL: 'SQL Server',
  IBM_DB2: 'IBM DB2',
  SAP_ASE: 'SAP ASE',
  SAP_MAXDB: 'SAP MaxDB',
  HANA_HA: 'HANA HA',
  SAP_ABAP: 'SAP ABAP',
  SAP_JAVA: 'SAP Java/PO',
  SAP_APPS: 'SAP Apps',
  CROSS_PLATFORM: 'Cross-Platform',
  LINUX_OS: 'Linux',
  WINDOWS_OS: 'Windows',
  AIX_OS: 'AIX',
  SOLARIS_OS: 'Solaris',
};

// Step status icon component
function StepStatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'SUCCESS':
      return <CheckCircle size={14} className="text-success-500" />;
    case 'RUNNING':
      return <Loader2 size={14} className="text-primary-500 animate-spin" />;
    case 'FAILED':
      return <XCircle size={14} className="text-danger-500" />;
    case 'SKIPPED':
      return <SkipForward size={14} className="text-text-tertiary" />;
    default:
      return (
        <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-surface-tertiary text-text-tertiary text-[10px] font-medium">
          -
        </span>
      );
  }
}

// Step result row with expandable stdout/stderr
function StepResultRow({ step, isLast }: { step: ApiRecord; isLast: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const hasOutput = step.stdout || step.stderr;

  return (
    <li className={`${!isLast ? 'pb-2 border-b border-border/50' : ''}`}>
      <div
        className={`flex items-start gap-2.5 text-xs ${hasOutput ? 'cursor-pointer' : ''}`}
        onClick={() => hasOutput && setExpanded(!expanded)}
      >
        <span className="flex-shrink-0 mt-0.5">
          <StepStatusIcon status={step.status} />
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-text-primary font-medium">{step.action}</p>
            {step.duration && (
              <span className="text-[10px] text-text-tertiary">{step.duration}</span>
            )}
            {step.exitCode !== null && step.exitCode !== undefined && step.exitCode !== 0 && (
              <Badge variant="danger" size="sm">exit: {step.exitCode}</Badge>
            )}
            {hasOutput && (
              <span className="text-text-tertiary ml-auto flex-shrink-0">
                {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              </span>
            )}
          </div>
          {step.command && (
            <code className="text-[10px] text-text-tertiary font-mono block truncate">{step.command}</code>
          )}
        </div>
      </div>
      {expanded && hasOutput && (
        <div className="mt-2 ml-6 space-y-1.5">
          {step.stdout && (
            <div className="bg-surface-tertiary rounded-lg p-2 overflow-x-auto">
              <div className="flex items-center gap-1.5 mb-1">
                <Terminal size={10} className="text-success-500" />
                <span className="text-[10px] font-medium text-text-secondary">stdout</span>
              </div>
              <pre className="text-[10px] text-text-primary font-mono whitespace-pre-wrap break-all leading-relaxed">
                {step.stdout}
              </pre>
            </div>
          )}
          {step.stderr && (
            <div className="bg-red-500/5 border border-red-500/10 rounded-lg p-2 overflow-x-auto">
              <div className="flex items-center gap-1.5 mb-1">
                <Terminal size={10} className="text-danger-500" />
                <span className="text-[10px] font-medium text-danger-500">stderr</span>
              </div>
              <pre className="text-[10px] text-red-500 dark:text-red-400 font-mono whitespace-pre-wrap break-all leading-relaxed">
                {step.stderr}
              </pre>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

export default function RunbooksPage() {
  const [runbooks, setRunbooks] = useState<ApiRecord[]>([]);
  const [executions, setExecutions] = useState<ApiRecord[]>([]);
  const [systems, setSystems] = useState<ApiRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('catalog');
  const [categoryFilter, setCategoryFilter] = useState('');
  const { toast, showToast, dismissToast } = useToast();
  const { hasRole } = useAuth();
  const canExecute = hasRole('operator');
  const { state: modeState, getDomainCapability } = useMode();
  const runbooksCap = getDomainCapability('runbooks');
  const isMockMode = modeState.mode === 'MOCK';

  // Estado de modales
  const [showExecuteModal, setShowExecuteModal] = useState(false);
  const [showDryRunModal, setShowDryRunModal] = useState(false);
  const [selectedRunbook, setSelectedRunbook] = useState<Record<string, any> | null>(null);
  const [selectedSystemId, setSelectedSystemId] = useState('');
  const [executing, setExecuting] = useState(false);
  const [executionResult, setExecutionResult] = useState<Record<string, any> | null>(null);
  const [liveStepResults, setLiveStepResults] = useState<ApiRecord[]>([]);
  const [executionProgress, setExecutionProgress] = useState<Record<string, any> | null>(null);
  const [lastExecutionEvidence, setLastExecutionEvidence] = useState<ProviderResult<unknown> | null>(null);
  const pollingRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    let mounted = true;
    Promise.all([
      dataService.getRunbooks(),
      dataService.getRunbookExecutions(),
      dataService.getSystems(),
    ])
      .then(([rb, ex, sys]) => {
        if (!mounted) return;
        setRunbooks(rb);
        setExecutions(ex);
        setSystems(sys);
      })
      .catch((err: unknown) => { if (mounted) log.error('Failed to load runbooks data', { error: (err as Error).message }); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; stopPolling(); };
  }, []);

  // Polling para obtener el progreso de la ejecución
  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = undefined;
    }
  }, []);

  const startPolling = useCallback((executionId: string) => {
    stopPolling();
    pollingRef.current = setInterval(async () => {
      try {
        const detail = await dataService.getExecutionDetail(executionId) as Record<string, any>;
        if (!detail) return;

        setExecutionProgress({
          totalSteps: detail.totalSteps,
          completedSteps: detail.completedSteps,
          currentStep: detail.currentStep,
          result: detail.result,
        });

        if (detail.stepResults?.length > 0) {
          setLiveStepResults(detail.stepResults);
        }

        // Parar polling cuando la ejecución termine
        if (['SUCCESS', 'FAILED', 'CANCELLED'].includes(detail.result)) {
          stopPolling();
          setExecutionResult(detail);
          showToast(
            detail.result === 'SUCCESS'
              ? `Runbook ejecutado exitosamente (${detail.duration})`
              : `Runbook fallo en paso ${detail.currentStep}`,
            detail.result === 'SUCCESS' ? 'success' : 'info',
          );
          // Refrescar lista de ejecuciónes
          const updatedExecs = await dataService.getRunbookExecutions();
          setExecutions(updatedExecs);
        }
      } catch (err: unknown) {
        log.error('Polling failed', { error: (err as Error).message });
      }
    }, 1500);
  }, [stopPolling]);

  // Abrir modal de ejecución
  const handleExecute = (runbook: ApiRecord) => {
    if (!canExecute) {
      showToast('No tienes permisos para ejecutar runbooks', 'info');
      return;
    }
    setSelectedRunbook(runbook);
    setSelectedSystemId('');
    setExecutionResult(null);
    setLiveStepResults([]);
    setExecutionProgress(null);
    setLastExecutionEvidence(null);
    setShowExecuteModal(true);
  };

  // Abrir modal de dry-run
  const handleDryRun = (runbook: ApiRecord) => {
    if (!canExecute) {
      showToast('No tienes permisos para ejecutar dry-runs', 'info');
      return;
    }
    setSelectedRunbook(runbook);
    setSelectedSystemId('');
    setExecutionResult(null);
    setShowDryRunModal(true);
  };

  // Confirmar ejecución real
  const confirmExecute = async () => {
    if (!selectedSystemId || !selectedRunbook) return;
    setExecuting(true);
    setExecutionResult(null);
    setLiveStepResults([]);
    setExecutionProgress(null);

    try {
      // Paso 1: validar compatibilidad via dry-run
      const check = await dataService.executeRunbook(selectedRunbook.id, selectedSystemId, true) as Record<string, any>;
      if (check.compatible === false) {
        setExecutionResult({
          result: 'BLOCKED',
          detail: 'No se puede ejecutar: sistema incompatible',
          failures: check.validationFailures,
        });
        setExecuting(false);
        return;
      }

      // Paso 2: ejecutar realmente — el backend responde inmediatamente con RUNNING
      const fullResult = await executeRunbookResult(selectedRunbook.id, selectedSystemId, false);
      setLastExecutionEvidence(fullResult);
      const result = fullResult.data as Record<string, any>;

      if (result.id) {
        // Inicializar step results desde la definicion del runbook
        const initialSteps = (selectedRunbook.steps || []).map((s: ApiRecord, i: number) => ({
          stepOrder: s.order || i + 1,
          action: s.action,
          command: s.command,
          status: 'PENDING',
        }));
        setLiveStepResults(initialSteps);
        setExecutionProgress({
          totalSteps: initialSteps.length,
          completedSteps: 0,
          currentStep: 0,
          result: 'RUNNING',
        });

        // Iniciar polling para obtener progreso real
        startPolling(result.id);
      } else {
        // El resultado vino inmediato (demo mode o PENDING)
        setExecutionResult(result);
        setExecuting(false);
      }
    } catch (err: unknown) {
      let detail = (err as Error).message;
      let failures = [];
      try {
        const parsed = JSON.parse((err as Error).message);
        if (parsed.failures) { detail = parsed.message; failures = parsed.failures; }
      } catch { /* no es JSON */ }
      setExecutionResult({ result: 'FAILED', detail, failures });
      showToast(`Error: ${detail}`, 'info');
      setExecuting(false);
    }
  };

  // Confirmar dry-run
  const confirmDryRun = async () => {
    if (!selectedSystemId || !selectedRunbook) return;
    setExecuting(true);
    setExecutionResult(null);
    try {
      const result = await dataService.executeRunbook(selectedRunbook.id, selectedSystemId, true);
      setExecutionResult(result as Record<string, any>);
    } catch (err: unknown) {
      setExecutionResult({ dryRun: true, error: (err as Error).message });
    } finally {
      setExecuting(false);
    }
  };

  // Cerrar modales
  const closeExecuteModal = () => {
    stopPolling();
    setShowExecuteModal(false);
    setExecutionResult(null);
    setLiveStepResults([]);
    setExecutionProgress(null);
    setExecuting(false);
  };

  const closeDryRunModal = () => {
    setShowDryRunModal(false);
    setExecutionResult(null);
  };

  // Configuracion de tabs
  const tabs = [
    { value: 'catalog', label: `Catálogo (${runbooks.length})` },
    { value: 'executions', label: `Ejecuciones (${executions.length})` },
  ];

  // Variante de badge para resultado de ejecución
  const resultVariant = (result: string) => {
    const map: Record<string, string> = { SUCCESS: 'success', PENDING: 'warning', FAILED: 'danger', RUNNING: 'warning', BLOCKED: 'danger', CANCELLED: 'danger' };
    return map[result] || 'default';
  };

  // Variante de badge para safety gate
  const gateVariant = (gate: string) => {
    return gate === 'SAFE' ? 'success' : 'warning';
  };

  // Nombre del sistema para el selector
  const systemLabel = (s: ApiRecord) => `${s.sid} — ${s.type || s.product || 'SAP'} (${s.environment || s.tier || '—'})`;

  // Progress bar
  const progressPercent = executionProgress
    ? Math.round((executionProgress.completedSteps / Math.max(executionProgress.totalSteps, 1)) * 100)
    : 0;

  if (loading) return <PageLoading message="Cargando runbooks..." />;

  return (
    <div>
      <Header
        title="Runbooks"
        subtitle={`${runbooks.length} runbooks integrados + ejecución end-to-end`}
        actions={<ModeBadge />}
      />
      <div className="p-6">
        <div className="flex items-center justify-between mb-2">
          <PageHeader
            title="Runbooks"
            description="Catálogo completo de runbooks de remediación automática y registro de ejecuciónes"
          />
          {runbooksCap && (
            <CapabilityBadge action="Execute" tier={runbooksCap.tier} readOnly={runbooksCap.readOnly} restricted={isMockMode} />
          )}
        </div>

        <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} className="mb-6" />

        {/* ── Tab: Catalogo ── */}
        {activeTab === 'catalog' && (
          <>
          {/* Category filter */}
          <div className="flex items-center gap-3 mb-4">
            <Filter size={14} className="text-text-tertiary" />
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="text-sm bg-surface-secondary border border-border rounded-lg px-3 py-1.5 text-text-primary focus:outline-none focus:ring-1 focus:ring-primary-500"
            >
              <option value="">Todas las categorías ({runbooks.length})</option>
              {[...new Set(runbooks.map((rb: ApiRecord) => rb.category).filter(Boolean))].sort().map((cat: string) => (
                <option key={cat} value={cat}>
                  {(CATEGORY_LABELS as Record<string, string>)[cat] || cat} ({runbooks.filter((rb: ApiRecord) => rb.category === cat).length})
                </option>
              ))}
            </select>
            {categoryFilter && (
              <button onClick={() => setCategoryFilter('')} className="text-xs text-text-tertiary hover:text-text-primary">
                Limpiar filtro
              </button>
            )}
          </div>
          <Table>
            <TableHeader>
              <tr>
                <TableHead>Categoría</TableHead>
                <TableHead>Nombre</TableHead>
                <TableHead>Cost-Safe</TableHead>
                <TableHead>Modo</TableHead>
                <TableHead>DB / Tipo</TableHead>
                <TableHead>Runs</TableHead>
                <TableHead>Éxito</TableHead>
                <TableHead>Duración</TableHead>
                <TableHead>TCode</TableHead>
                <TableHead>Prerequisites</TableHead>
                <TableHead>Acciones</TableHead>
              </tr>
            </TableHeader>
            <TableBody>
              {runbooks.filter((rb: ApiRecord) => !categoryFilter || rb.category === categoryFilter).map((rb: ApiRecord) => (
                <TableRow key={rb.id}>
                  {/* Categoria */}
                  <TableCell>
                    <Badge variant="default" size="sm">{(CATEGORY_LABELS as Record<string, string>)[rb.category] || rb.category || '—'}</Badge>
                  </TableCell>
                  {/* Nombre + descripcion */}
                  <TableCell>
                    <div className="max-w-[260px]">
                      <p className="font-medium text-text-primary text-sm">{rb.name}</p>
                      <p className="text-xs text-text-tertiary truncate">{rb.description}</p>
                    </div>
                  </TableCell>

                  {/* Cost-Safe */}
                  <TableCell>
                    {rb.costSafe ? (
                      <Badge variant="success" size="sm">Si</Badge>
                    ) : (
                      <Badge variant="danger" size="sm">No</Badge>
                    )}
                  </TableCell>

                  {/* Auto / Aprobación */}
                  <TableCell>
                    {rb.auto ? (
                      <Badge variant="success" size="sm">Auto</Badge>
                    ) : (
                      <Badge variant="warning" size="sm">Aprobación</Badge>
                    )}
                  </TableCell>

                  {/* DB Type */}
                  <TableCell>
                    <Badge variant="default" size="sm">{rb.dbType || '—'}</Badge>
                  </TableCell>

                  {/* Total runs */}
                  <TableCell className="text-xs text-text-secondary tabular-nums">{rb.totalRuns}</TableCell>

                  {/* Success rate */}
                  <TableCell className="text-xs text-text-secondary tabular-nums">{rb.successRate}%</TableCell>

                  {/* Avg duration */}
                  <TableCell className="text-xs text-text-secondary">{rb.avgDuration}</TableCell>

                  {/* Transaction Code */}
                  <TableCell>
                    {rb.txCode ? (
                      <code className="text-[10px] bg-surface-tertiary px-1.5 py-0.5 rounded font-mono text-primary-600 dark:text-primary-400">
                        {rb.txCode}
                      </code>
                    ) : (
                      <span className="text-text-tertiary text-xs">—</span>
                    )}
                  </TableCell>

                  {/* Prerequisites */}
                  <TableCell>
                    {Array.isArray(rb.prereqs) && rb.prereqs.length > 0 ? (
                      <div className="max-w-[180px]">
                        {rb.prereqs.map((p: string, pi: number) => (
                          <span key={pi} className="inline-flex items-center gap-0.5 text-[10px] text-text-secondary mr-1">
                            <ShieldCheck size={8} className="text-success-500 flex-shrink-0" />
                            {p}
                            {pi < rb.prereqs.length - 1 && ','}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-text-tertiary text-xs">—</span>
                    )}
                  </TableCell>

                  {/* Acciones */}
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="primary"
                        icon={Play}
                        onClick={() => handleExecute(rb)}
                      >
                        Ejecutar
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        icon={FlaskConical}
                        onClick={() => handleDryRun(rb)}
                      >
                        Dry-run
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </>
        )}

        {/* ── Tab: Ejecuciones ── */}
        {activeTab === 'executions' && (
          <>
            {executions.length === 0 ? (
              <EmptyState
                icon={Clock}
                title="Sin ejecuciónes"
                description="No hay ejecuciónes de runbooks registradas"
              />
            ) : (
              <Table>
                <TableHeader>
                  <tr>
                    <TableHead>Hora</TableHead>
                    <TableHead>Sistema</TableHead>
                    <TableHead>Runbook</TableHead>
                    <TableHead>Safety Gate</TableHead>
                    <TableHead>Resultado</TableHead>
                    <TableHead>Progreso</TableHead>
                    <TableHead>Duración</TableHead>
                    <TableHead>Detalle</TableHead>
                  </tr>
                </TableHeader>
                <TableBody>
                  {executions.map((exec: ApiRecord, idx: number) => (
                    <TableRow key={`${exec.runbookId}-${idx}`}>
                      <TableCell className="text-xs font-mono text-text-secondary whitespace-nowrap">
                        {exec.ts}
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium text-sm">{exec.sid}</p>
                          <p className="text-[10px] text-text-tertiary">{exec.systemId}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="text-xs font-medium text-text-primary">{exec.runbook?.name || '—'}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={gateVariant(exec.gate)} size="sm" dot>
                          {exec.gate === 'SAFE' ? 'SAFE' : 'HUMAN'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={resultVariant(exec.result)} size="sm" dot>
                          {exec.result}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {exec.totalSteps > 0 ? (
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-1.5 bg-surface-tertiary rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${exec.result === 'SUCCESS' ? 'bg-success-500' : exec.result === 'FAILED' ? 'bg-danger-500' : 'bg-primary-500'}`}
                                style={{ width: `${Math.round((exec.completedSteps / exec.totalSteps) * 100)}%` }}
                              />
                            </div>
                            <span className="text-[10px] text-text-tertiary">{exec.completedSteps}/{exec.totalSteps}</span>
                          </div>
                        ) : (
                          <span className="text-text-tertiary text-xs">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-text-secondary whitespace-nowrap">
                        {exec.duration || '—'}
                      </TableCell>
                      <TableCell className="max-w-[300px]">
                        <p className="text-xs text-text-secondary truncate">{exec.detail || '—'}</p>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </>
        )}
      </div>

      {/* ══════════════════════════════════════════════ */}
      {/* Modal: Ejecutar Runbook                       */}
      {/* ══════════════════════════════════════════════ */}
      <Modal
        isOpen={showExecuteModal}
        onClose={closeExecuteModal}
        title={`Ejecutar: ${selectedRunbook?.name || ''}`}
        description={selectedRunbook?.description}
        size="lg"
        footer={
          executionResult && !['RUNNING'].includes(executionResult.result) ? (
            <Button variant="outline" onClick={closeExecuteModal}>Cerrar</Button>
          ) : executionProgress?.result === 'RUNNING' ? (
            <Button variant="outline" disabled>Ejecutando...</Button>
          ) : (
            <>
              <Button variant="outline" onClick={closeExecuteModal}>Cancelar</Button>
              <Button
                icon={Play}
                loading={executing}
                onClick={confirmExecute}
                disabled={!selectedSystemId || executing}
              >
                {executing ? 'Ejecutando...' : 'Ejecutar'}
              </Button>
            </>
          )
        }
      >
        {selectedRunbook && (
          <div className="space-y-4">
            {/* Governance context */}
            <GovernanceContext
              requiresApproval={!selectedRunbook.costSafe}
              restrictions={isMockMode ? ['Execution restricted in demo mode'] : undefined}
              riskLevel={selectedRunbook.costSafe ? 'low' : 'high'}
            />

            {/* Alerta cost-safe */}
            {!selectedRunbook.costSafe && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-yellow-600 dark:text-yellow-400 text-sm">
                <AlertTriangle size={16} className="flex-shrink-0" />
                <span>Este runbook <strong>NO es cost-safe</strong>. Requiere aprobación humana.</span>
              </div>
            )}

            {/* Badges de info */}
            <div className="flex flex-wrap gap-2">
              <Badge variant={selectedRunbook.costSafe ? 'success' : 'danger'} size="sm">
                {selectedRunbook.costSafe ? 'Cost-Safe' : 'No Cost-Safe'}
              </Badge>
              <Badge variant={selectedRunbook.gate === 'SAFE' ? 'success' : 'warning'} size="sm">
                Gate: {selectedRunbook.gate || (selectedRunbook.costSafe ? 'SAFE' : 'HUMAN')}
              </Badge>
              {selectedRunbook.category && (
                <Badge variant="default" size="sm">{(CATEGORY_LABELS as Record<string, string>)[selectedRunbook.category] || selectedRunbook.category}</Badge>
              )}
              {selectedRunbook.dbType && (
                <Badge variant="default" size="sm">{selectedRunbook.dbType}</Badge>
              )}
              {selectedRunbook.txCode && (
                <Badge variant="default" size="sm">TCode: {selectedRunbook.txCode}</Badge>
              )}
            </div>

            {/* Pre-requisitos */}
            {Array.isArray(selectedRunbook.prereqs) && selectedRunbook.prereqs.length > 0 && (
              <div>
                <p className="text-xs font-medium text-text-secondary mb-1.5">Pre-requisitos:</p>
                <ul className="space-y-1">
                  {selectedRunbook.prereqs.map((p: string, i: number) => (
                    <li key={i} className="flex items-center gap-1.5 text-xs text-text-secondary">
                      <ShieldCheck size={12} className="text-success-500 flex-shrink-0" />
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Progress bar cuando hay ejecución activa */}
            {executionProgress && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-text-primary">
                    {executionProgress.result === 'RUNNING' ? 'Ejecutando...' :
                     executionProgress.result === 'SUCCESS' ? 'Completado' :
                     executionProgress.result === 'FAILED' ? 'Fallido' : executionProgress.result}
                  </span>
                  <span className="text-text-secondary">
                    {executionProgress.completedSteps} / {executionProgress.totalSteps} pasos
                  </span>
                </div>
                <div className="w-full h-2 bg-surface-tertiary rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      executionProgress.result === 'SUCCESS' ? 'bg-success-500' :
                      executionProgress.result === 'FAILED' ? 'bg-danger-500' :
                      'bg-primary-500'
                    }`}
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>
            )}

            {/* Step results en vivo */}
            {liveStepResults.length > 0 && (
              <div>
                <p className="text-xs font-medium text-text-secondary mb-2">Pasos de ejecución:</p>
                <ol className="space-y-2">
                  {liveStepResults.map((step: ApiRecord, i: number) => (
                    <StepResultRow
                      key={step.id || i}
                      step={step}
                      isLast={i === liveStepResults.length - 1}
                    />
                  ))}
                </ol>
              </div>
            )}

            {/* Pasos pre-ejecución (cuando aun no hay live steps) */}
            {liveStepResults.length === 0 && Array.isArray(selectedRunbook.steps) && selectedRunbook.steps.length > 0 && (
              <div>
                <p className="text-xs font-medium text-text-secondary mb-1.5">Pasos de ejecución:</p>
                <ol className="space-y-2">
                  {selectedRunbook.steps.map((step: ApiRecord, i: number) => (
                    <li key={i} className="flex items-start gap-2.5 text-xs">
                      <span className="flex-shrink-0 mt-0.5">
                        <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-surface-tertiary text-text-tertiary text-[10px] font-medium">
                          {step.order || i + 1}
                        </span>
                      </span>
                      <div>
                        <p className="text-text-primary">{step.action}</p>
                        {step.command && (
                          <code className="text-[10px] text-text-tertiary font-mono">{step.command}</code>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {/* Selector de sistema */}
            {!executionResult && !executionProgress && (
              <Select
                label="Sistema destino"
                value={selectedSystemId}
                onChange={(e) => setSelectedSystemId(e.target.value)}
                placeholder="Seleccionar sistema..."
                disabled={executing}
                options={systems.map((s: ApiRecord) => ({ value: s.id, label: systemLabel(s) }))}
              />
            )}

            {/* Resultado final de ejecución */}
            {executionResult && !['RUNNING'].includes(executionResult.result) && (
              <div className={`p-3 rounded-lg border ${
                executionResult.result === 'BLOCKED' || executionResult.result === 'FAILED'
                  ? 'bg-red-500/5 border-red-500/20'
                  : 'bg-success-50 dark:bg-success-900/10 border-success-200 dark:border-success-800'
              }`}>
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-sm font-medium text-text-primary">Resultado:</p>
                  <Badge variant={resultVariant(executionResult.result)} size="sm" dot>
                    {executionResult.result}
                  </Badge>
                  {executionResult.duration && (
                    <span className="text-xs text-text-secondary">Duración: {executionResult.duration}</span>
                  )}
                </div>
                {executionResult.detail && (
                  <p className="text-xs text-text-secondary mt-1">{executionResult.detail}</p>
                )}
                {/* Mostrar fallos de validación */}
                {executionResult.failures?.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {executionResult.failures.map((f: string, i: number) => (
                      <li key={i} className="flex items-start gap-1.5 text-xs text-red-500 dark:text-red-400">
                        <AlertTriangle size={12} className="flex-shrink-0 mt-0.5" />
                        {f}
                      </li>
                    ))}
                  </ul>
                )}
                {executionResult.system?.sid && (
                  <p className="text-xs text-text-tertiary mt-1">Sistema: {executionResult.system.sid}</p>
                )}
              </div>
            )}

            {/* Evidence Panel */}
            {lastExecutionEvidence && executionResult && !['RUNNING'].includes(executionResult.result) && (
              <EvidencePanel result={lastExecutionEvidence} domain="runbooks" action="executeRunbook" />
            )}
          </div>
        )}
      </Modal>

      {/* ══════════════════════════════════════════════ */}
      {/* Modal: Dry-Run                                */}
      {/* ══════════════════════════════════════════════ */}
      <Modal
        isOpen={showDryRunModal}
        onClose={closeDryRunModal}
        title={`Dry-Run: ${selectedRunbook?.name || ''}`}
        description="Simulación — no se aplicarán cambios reales"
        size="lg"
        footer={
          executionResult ? (
            <Button variant="outline" onClick={closeDryRunModal}>Cerrar</Button>
          ) : (
            <>
              <Button variant="outline" onClick={closeDryRunModal}>Cancelar</Button>
              <Button
                icon={FlaskConical}
                variant="outline"
                loading={executing}
                onClick={confirmDryRun}
                disabled={!selectedSystemId || executing}
              >
                {executing ? 'Simulando...' : 'Simular'}
              </Button>
            </>
          )
        }
      >
        {selectedRunbook && (
          <div className="space-y-4">
            {/* Badges de info */}
            <div className="flex flex-wrap gap-2">
              <Badge variant="default" size="sm">DRY-RUN</Badge>
              <Badge variant={selectedRunbook.costSafe ? 'success' : 'danger'} size="sm">
                {selectedRunbook.costSafe ? 'Cost-Safe' : 'No Cost-Safe'}
              </Badge>
              {selectedRunbook.dbType && (
                <Badge variant="default" size="sm">{selectedRunbook.dbType}</Badge>
              )}
            </div>

            {/* Pasos que se ejecutarian */}
            {Array.isArray(selectedRunbook.steps) && selectedRunbook.steps.length > 0 && (
              <div>
                <p className="text-xs font-medium text-text-secondary mb-1.5">Pasos que se ejecutarían:</p>
                <ol className="space-y-2">
                  {selectedRunbook.steps.map((step: ApiRecord, i: number) => (
                    <li key={i} className="flex items-start gap-2.5 text-xs">
                      <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-surface-tertiary text-text-tertiary text-[10px] font-medium flex-shrink-0 mt-0.5">
                        {step.order || i + 1}
                      </span>
                      <div>
                        <p className="text-text-primary">{step.action}</p>
                        {step.command && (
                          <code className="text-[10px] text-text-tertiary font-mono">{step.command}</code>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {/* Pre-requisitos */}
            {Array.isArray(selectedRunbook.prereqs) && selectedRunbook.prereqs.length > 0 && (
              <div>
                <p className="text-xs font-medium text-text-secondary mb-1.5">Pre-requisitos necesarios:</p>
                <ul className="space-y-1">
                  {selectedRunbook.prereqs.map((p: string, i: number) => (
                    <li key={i} className="flex items-center gap-1.5 text-xs text-text-secondary">
                      <ShieldCheck size={12} className="text-success-500 flex-shrink-0" />
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Selector de sistema */}
            {!executionResult && (
              <Select
                label="Sistema destino"
                value={selectedSystemId}
                onChange={(e) => setSelectedSystemId(e.target.value)}
                placeholder="Seleccionar sistema..."
                disabled={executing}
                options={systems.map((s: ApiRecord) => ({ value: s.id, label: systemLabel(s) }))}
              />
            )}

            {/* Resultado del dry-run */}
            {executionResult && (
              <div className={`p-3 rounded-lg border ${
                executionResult.compatible === false ? 'bg-red-500/5 border-red-500/20' : 'bg-blue-500/5 border-blue-500/20'
              }`}>
                <p className="text-sm font-medium text-text-primary mb-2">Resultado de simulación:</p>
                {executionResult.error ? (
                  <p className="text-xs text-danger-500">{executionResult.error}</p>
                ) : (
                  <div className="space-y-2 text-xs text-text-secondary">
                    {/* Validacion de compatibilidad */}
                    {executionResult.compatible === false && (
                      <div className="p-2 rounded bg-red-500/10 border border-red-500/20">
                        <p className="font-medium text-red-500 dark:text-red-400 mb-1">Sistema incompatible — no se puede ejecutar</p>
                        <ul className="space-y-1">
                          {executionResult.validationFailures?.map((f: string, i: number) => (
                            <li key={i} className="flex items-start gap-1.5 text-red-500 dark:text-red-400">
                              <AlertTriangle size={11} className="flex-shrink-0 mt-0.5" />
                              {f}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {executionResult.compatible !== false && (
                      <div className="flex items-center gap-1.5 text-success-500">
                        <CheckCircle size={12} />
                        <span className="font-medium">Sistema compatible — validación OK</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <span className="font-medium">Gate:</span>
                      <Badge variant={gateVariant(executionResult.gate)} size="sm">{executionResult.gate}</Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">Acción:</span>
                      <span>{executionResult.wouldCreate === 'AUTO_EXECUTE' ? 'Ejecución automática' : executionResult.wouldCreate === 'PENDING_APPROVAL' ? 'Requiere aprobación humana' : 'Ejecución manual'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">Duración estimada:</span>
                      <span>{executionResult.estimatedDuration}</span>
                    </div>
                    {executionResult.autoExecute && executionResult.compatible !== false && (
                      <div className="flex items-center gap-1.5 text-success-500">
                        <CheckCircle size={12} />
                        <span>Auto-execute habilitado — se ejecutaría sin intervención</span>
                      </div>
                    )}
                    {!executionResult.costSafe && (
                      <div className="flex items-center gap-1.5 text-yellow-500">
                        <AlertTriangle size={12} />
                        <span>Generaría costos de infraestructura</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* ── Toast Notification ── */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 animate-fade-in">
          <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border shadow-lg max-w-md ${
            toast.type === 'success'
              ? 'bg-success-50 border-success-200 text-success-700 dark:bg-success-900/30 dark:border-success-800 dark:text-success-400'
              : 'bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-900/30 dark:border-blue-800 dark:text-blue-400'
          }`}>
            {toast.type === 'success' ? (
              <CheckCircle size={16} className="flex-shrink-0" />
            ) : (
              <ShieldCheck size={16} className="flex-shrink-0" />
            )}
            <p className="text-sm font-medium">{toast.message}</p>
            <button
              onClick={dismissToast}
              className="ml-auto flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
