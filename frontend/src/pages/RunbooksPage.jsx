import { useState, useRef, useEffect } from 'react';
import { Play, FlaskConical, Clock, ShieldCheck, CheckCircle, X, AlertTriangle, Loader2 } from 'lucide-react';
import Header from '../components/layout/Header';
import PageHeader from '../components/layout/PageHeader';
import Tabs from '../components/ui/Tabs';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import Select from '../components/ui/Select';
import Table, { TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/Table';
import EmptyState from '../components/ui/EmptyState';
import { useAuth } from '../contexts/AuthContext';
import PageLoading from '../components/ui/PageLoading';
import { dataService } from '../services/dataService';

export default function RunbooksPage() {
  const [runbooks, setRunbooks] = useState([]);
  const [executions, setExecutions] = useState([]);
  const [systems, setSystems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('catalog');
  const [toast, setToast] = useState(null);
  const { hasRole } = useAuth();
  const canExecute = hasRole('operator');
  const toastTimerRef = useRef(null);

  // Estado de modales
  const [showExecuteModal, setShowExecuteModal] = useState(false);
  const [showDryRunModal, setShowDryRunModal] = useState(false);
  const [selectedRunbook, setSelectedRunbook] = useState(null);
  const [selectedSystemId, setSelectedSystemId] = useState('');
  const [executing, setExecuting] = useState(false);
  const [executionResult, setExecutionResult] = useState(null);
  const [executionSteps, setExecutionSteps] = useState([]);

  useEffect(() => {
    Promise.all([
      dataService.getRunbooks(),
      dataService.getRunbookExecutions(),
      dataService.getSystems(),
    ])
      .then(([rb, ex, sys]) => {
        setRunbooks(rb);
        setExecutions(ex);
        setSystems(sys);
      })
      .catch((err) => console.error('Error loading runbooks:', err))
      .finally(() => setLoading(false));
    return () => { clearTimeout(toastTimerRef.current); };
  }, []);

  // Mostrar notificación temporal
  const showToast = (message, type = 'info') => {
    clearTimeout(toastTimerRef.current);
    setToast({ message, type });
    toastTimerRef.current = setTimeout(() => setToast(null), 4000);
  };

  // Abrir modal de ejecución
  const handleExecute = (runbook) => {
    if (!canExecute) {
      showToast('No tienes permisos para ejecutar runbooks', 'info');
      return;
    }
    setSelectedRunbook(runbook);
    setSelectedSystemId('');
    setExecutionResult(null);
    setExecutionSteps([]);
    setShowExecuteModal(true);
  };

  // Abrir modal de dry-run
  const handleDryRun = (runbook) => {
    if (!canExecute) {
      showToast('No tienes permisos para ejecutar dry-runs', 'info');
      return;
    }
    setSelectedRunbook(runbook);
    setSelectedSystemId('');
    setExecutionResult(null);
    setShowDryRunModal(true);
  };

  // Confirmar ejecución real — primero valida compatibilidad via dry-run
  const confirmExecute = async () => {
    if (!selectedSystemId || !selectedRunbook) return;
    setExecuting(true);
    setExecutionResult(null);
    setExecutionSteps([]);

    try {
      // Paso 1: validar compatibilidad via dry-run
      const check = await dataService.executeRunbook(selectedRunbook.id, selectedSystemId, true);
      if (check.compatible === false) {
        setExecutionResult({
          result: 'BLOCKED',
          detail: 'No se puede ejecutar: sistema incompatible',
          failures: check.validationFailures,
        });
        setExecuting(false);
        return;
      }

      // Paso 2: animar pasos uno por uno
      const steps = selectedRunbook.steps || [];
      for (let i = 0; i < steps.length; i++) {
        setExecutionSteps(prev => [...prev, { ...steps[i], status: 'running' }]);
        await new Promise(r => setTimeout(r, 800 + Math.random() * 400));
        setExecutionSteps(prev =>
          prev.map((s, idx) => idx === i ? { ...s, status: 'done' } : s)
        );
      }

      // Paso 3: ejecutar realmente
      const result = await dataService.executeRunbook(selectedRunbook.id, selectedSystemId, false);
      setExecutionResult(result);
      showToast(`Runbook "${selectedRunbook.name}" ejecutado exitosamente`, 'success');
      // Refrescar lista de ejecuciones
      const updatedExecs = await dataService.getRunbookExecutions();
      setExecutions(updatedExecs);
    } catch (err) {
      // Parsear error de validación del backend
      let detail = err.message;
      let failures = [];
      try {
        const parsed = JSON.parse(err.message);
        if (parsed.failures) { detail = parsed.message; failures = parsed.failures; }
      } catch { /* no es JSON, usar message directo */ }
      setExecutionResult({ result: 'FAILED', detail, failures });
      showToast(`Error: ${detail}`, 'info');
    } finally {
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
      setExecutionResult(result);
    } catch (err) {
      setExecutionResult({ dryRun: true, error: err.message });
    } finally {
      setExecuting(false);
    }
  };

  // Cerrar modales
  const closeExecuteModal = () => {
    setShowExecuteModal(false);
    setExecutionResult(null);
    setExecutionSteps([]);
  };

  const closeDryRunModal = () => {
    setShowDryRunModal(false);
    setExecutionResult(null);
  };

  // Configuración de tabs
  const tabs = [
    { value: 'catalog', label: `Catálogo (${runbooks.length})` },
    { value: 'executions', label: `Ejecuciones (${executions.length})` },
  ];

  // Variante de badge para resultado de ejecución
  const resultVariant = (result) => {
    const map = { SUCCESS: 'success', PENDING: 'warning', FAILED: 'danger', RUNNING: 'warning', BLOCKED: 'danger' };
    return map[result] || 'default';
  };

  // Variante de badge para safety gate
  const gateVariant = (gate) => {
    return gate === 'SAFE' ? 'success' : 'warning';
  };

  // Nombre del sistema para el selector
  const systemLabel = (s) => `${s.sid} — ${s.type || s.product || 'SAP'} (${s.environment || s.tier || '—'})`;

  if (loading) return <PageLoading message="Cargando runbooks..." />;

  return (
    <div>
      <Header title="Runbooks" subtitle={`${runbooks.length} runbooks integrados + ejecución automática`} />
      <div className="p-6">
        <PageHeader
          title="Runbooks"
          description="Catálogo completo de runbooks de remediación automática y registro de ejecuciones"
        />

        <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} className="mb-6" />

        {/* ── Tab: Catálogo ── */}
        {activeTab === 'catalog' && (
          <Table>
            <TableHeader>
              <tr>
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
              {runbooks.map((rb) => (
                <TableRow key={rb.id}>
                  {/* Nombre + descripción */}
                  <TableCell>
                    <div className="max-w-[260px]">
                      <p className="font-medium text-text-primary text-sm">{rb.name}</p>
                      <p className="text-xs text-text-tertiary truncate">{rb.description}</p>
                    </div>
                  </TableCell>

                  {/* Cost-Safe */}
                  <TableCell>
                    {rb.costSafe ? (
                      <Badge variant="success" size="sm">Sí</Badge>
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
                        {rb.prereqs.map((p, pi) => (
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
        )}

        {/* ── Tab: Ejecuciones ── */}
        {activeTab === 'executions' && (
          <>
            {executions.length === 0 ? (
              <EmptyState
                icon={Clock}
                title="Sin ejecuciones"
                description="No hay ejecuciones de runbooks registradas"
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
                    <TableHead>Duración</TableHead>
                    <TableHead>Detalle</TableHead>
                  </tr>
                </TableHeader>
                <TableBody>
                  {executions.map((exec, idx) => (
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
          executionResult ? (
            <Button variant="outline" onClick={closeExecuteModal}>Cerrar</Button>
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
            {/* Alerta cost-safe */}
            {!selectedRunbook.costSafe && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-yellow-600 dark:text-yellow-400 text-sm">
                <AlertTriangle size={16} className="flex-shrink-0" />
                <span>Este runbook <strong>NO es cost-safe</strong>. Puede generar costos de infraestructura.</span>
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
                  {selectedRunbook.prereqs.map((p, i) => (
                    <li key={i} className="flex items-center gap-1.5 text-xs text-text-secondary">
                      <ShieldCheck size={12} className="text-success-500 flex-shrink-0" />
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Pasos de ejecución */}
            {Array.isArray(selectedRunbook.steps) && selectedRunbook.steps.length > 0 && (
              <div>
                <p className="text-xs font-medium text-text-secondary mb-1.5">Pasos de ejecución:</p>
                <ol className="space-y-2">
                  {(executionSteps.length > 0 ? executionSteps : selectedRunbook.steps).map((step, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-xs">
                      <span className="flex-shrink-0 mt-0.5">
                        {step.status === 'done' ? (
                          <CheckCircle size={14} className="text-success-500" />
                        ) : step.status === 'running' ? (
                          <Loader2 size={14} className="text-primary-500 animate-spin" />
                        ) : (
                          <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-surface-tertiary text-text-tertiary text-[10px] font-medium">
                            {step.order || i + 1}
                          </span>
                        )}
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
            {!executionResult && (
              <Select
                label="Sistema destino"
                value={selectedSystemId}
                onChange={(e) => setSelectedSystemId(e.target.value)}
                placeholder="Seleccionar sistema..."
                disabled={executing}
                options={systems.map(s => ({ value: s.id, label: systemLabel(s) }))}
              />
            )}

            {/* Resultado de ejecución */}
            {executionResult && (
              <div className={`p-3 rounded-lg border ${
                executionResult.result === 'BLOCKED' || executionResult.result === 'FAILED'
                  ? 'bg-red-500/5 border-red-500/20'
                  : 'bg-surface-tertiary border-border'
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
                    {executionResult.failures.map((f, i) => (
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

            {/* Pasos que se ejecutarían */}
            {Array.isArray(selectedRunbook.steps) && selectedRunbook.steps.length > 0 && (
              <div>
                <p className="text-xs font-medium text-text-secondary mb-1.5">Pasos que se ejecutarían:</p>
                <ol className="space-y-2">
                  {selectedRunbook.steps.map((step, i) => (
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
                  {selectedRunbook.prereqs.map((p, i) => (
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
                options={systems.map(s => ({ value: s.id, label: systemLabel(s) }))}
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
                    {/* Validación de compatibilidad */}
                    {executionResult.compatible === false && (
                      <div className="p-2 rounded bg-red-500/10 border border-red-500/20">
                        <p className="font-medium text-red-500 dark:text-red-400 mb-1">Sistema incompatible — no se puede ejecutar</p>
                        <ul className="space-y-1">
                          {executionResult.validationFailures?.map((f, i) => (
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
              onClick={() => setToast(null)}
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
