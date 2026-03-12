import { useState, useRef, useEffect } from 'react';
import { BookOpen, Play, FlaskConical, Clock, ShieldCheck, ShieldAlert, CheckCircle, X } from 'lucide-react';
import Header from '../components/layout/Header';
import PageHeader from '../components/layout/PageHeader';
import Card from '../components/ui/Card';
import Tabs from '../components/ui/Tabs';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Table, { TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/Table';
import EmptyState from '../components/ui/EmptyState';
import { useAuth } from '../contexts/AuthContext';
import PageLoading from '../components/ui/PageLoading';
import { dataService } from '../services/dataService';

export default function RunbooksPage() {
  const [runbooks, setRunbooks] = useState([]);
  const [executions, setExecutions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('catalog');
  const [toast, setToast] = useState(null);
  const { hasRole } = useAuth();
  const canExecute = hasRole('operator');
  const toastTimerRef = useRef(null);

  useEffect(() => {
    Promise.all([dataService.getRunbooks(), dataService.getRunbookExecutions()]).then(([rb, ex]) => {
      setRunbooks(rb);
      setExecutions(ex);
      setLoading(false);
    });
    return () => { clearTimeout(toastTimerRef.current); };
  }, []);

  // Mostrar notificación temporal
  const showToast = (message, type = 'info') => {
    clearTimeout(toastTimerRef.current);
    setToast({ message, type });
    toastTimerRef.current = setTimeout(() => setToast(null), 3000);
  };

  // Ejecutar runbook
  const handleExecute = (runbook) => {
    if (!canExecute) {
      showToast('No tienes permisos para ejecutar runbooks (demo)', 'info');
      return;
    }
    if (runbook.costSafe) {
      showToast(`Runbook ${runbook.id} ejecutado exitosamente (demo)`, 'success');
    } else {
      showToast(`${runbook.id} requiere aprobación humana — costSafe=false (demo)`, 'info');
    }
  };

  // Dry-run de runbook
  const handleDryRun = (runbook) => {
    if (!canExecute) {
      showToast('No tienes permisos para ejecutar dry-runs (demo)', 'info');
      return;
    }
    showToast(`Dry-run de ${runbook.id} completado — sin cambios aplicados (demo)`, 'info');
  };

  // Configuración de tabs
  const tabs = [
    { value: 'catalog', label: `Catálogo (${runbooks.length})` },
    { value: 'executions', label: 'Ejecuciones' },
  ];

  // Variante de badge para resultado de ejecución
  const resultVariant = (result) => {
    const map = { SUCCESS: 'success', PENDING: 'warning', FAILED: 'danger' };
    return map[result] || 'default';
  };

  // Variante de badge para safety gate
  const gateVariant = (gate) => {
    return gate === 'SAFE' ? 'success' : 'warning';
  };

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
                <TableHead>ID</TableHead>
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
                  {/* ID con color de acento */}
                  <TableCell>
                    <span className="font-mono text-xs text-primary-600 dark:text-primary-400 font-medium">
                      {rb.id}
                    </span>
                  </TableCell>

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
                    <Badge variant="default" size="sm">{rb.dbType}</Badge>
                  </TableCell>

                  {/* Total runs */}
                  <TableCell className="text-xs text-text-secondary tabular-nums">{rb.totalRuns}</TableCell>

                  {/* Success rate */}
                  <TableCell className="text-xs text-text-secondary tabular-nums">{rb.successRate}%</TableCell>

                  {/* Avg duration */}
                  <TableCell className="text-xs text-text-secondary">{rb.avgDuration}</TableCell>

                  {/* Transaction Code (P4) */}
                  <TableCell>
                    {rb.txCode ? (
                      <code className="text-[10px] bg-surface-tertiary px-1.5 py-0.5 rounded font-mono text-primary-600 dark:text-primary-400">
                        {rb.txCode}
                      </code>
                    ) : (
                      <span className="text-text-tertiary text-xs">—</span>
                    )}
                  </TableCell>

                  {/* Prerequisites (P2.2) */}
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
                    <TableRow key={`${exec.runbookId}-${exec.ts}-${idx}`}>
                      {/* Hora */}
                      <TableCell className="text-xs font-mono text-text-secondary whitespace-nowrap">
                        {exec.ts}
                      </TableCell>

                      {/* Sistema (SID) */}
                      <TableCell>
                        <div>
                          <p className="font-medium text-sm">{exec.sid}</p>
                          <p className="text-[10px] text-text-tertiary">{exec.systemId}</p>
                        </div>
                      </TableCell>

                      {/* Runbook ID */}
                      <TableCell>
                        <code className="text-xs bg-surface-tertiary px-1.5 py-0.5 rounded font-mono">
                          {exec.runbookId}
                        </code>
                      </TableCell>

                      {/* Safety Gate */}
                      <TableCell>
                        <Badge variant={gateVariant(exec.gate)} size="sm" dot>
                          {exec.gate === 'SAFE' ? 'SAFE' : 'HUMAN'}
                        </Badge>
                      </TableCell>

                      {/* Resultado */}
                      <TableCell>
                        <Badge variant={resultVariant(exec.result)} size="sm" dot>
                          {exec.result}
                        </Badge>
                      </TableCell>

                      {/* Duración */}
                      <TableCell className="text-xs text-text-secondary whitespace-nowrap">
                        {exec.duration}
                      </TableCell>

                      {/* Detalle */}
                      <TableCell className="max-w-[300px]">
                        <p className="text-xs text-text-secondary truncate">{exec.detail}</p>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </>
        )}
      </div>

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
