import { useState, useEffect } from 'react';
import { Calendar, Clock, AlertTriangle, CheckCircle, XCircle, Play, Plus, Save, AlertCircle } from 'lucide-react';
import Header from '../components/layout/Header';
import PageHeader from '../components/layout/PageHeader';
import Card from '../components/ui/Card';
import Tabs from '../components/ui/Tabs';
import Badge from '../components/ui/Badge';
import StatusBadge from '../components/ui/StatusBadge';
import Button from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Table, { TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/Table';
import EmptyState from '../components/ui/EmptyState';
import PageLoading from '../components/ui/PageLoading';
import { dataService } from '../services/dataService';
import { useAuth } from '../contexts/AuthContext';
import type { ApiRecord } from '../types';

export default function OperationsPage() {
  const { user } = useAuth();
  const [operations, setOperations] = useState<ApiRecord[]>([]);
  const [systems, setSystems] = useState<ApiRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('all');
  const [showNewModal, setShowNewModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [formErrors, setFormErrors] = useState<{ systemId?: string; description?: string }>({});
  const [newOp, setNewOp] = useState({ systemId: '', type: 'BACKUP', description: '', riskLevel: 'LOW', scheduledTime: '' });

  useEffect(() => {
    let mounted = true;
    Promise.all([dataService.getOperations(), dataService.getSystems()])
      .then(([ops, sys]) => {
        if (mounted) { setOperations(ops); setSystems(sys); }
      })
      .catch((err: unknown) => { if (mounted) setError((err as Error).message); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, []);

  if (loading) return <PageLoading />;

  if (error) return (
    <div>
      <Header title="Operaciones" subtitle="Error al cargar" />
      <div className="p-6">
        <EmptyState icon={AlertTriangle} title="Error al cargar operaciones" description={error} />
      </div>
    </div>
  );

  const handleCreateOperation = async () => {
    const errors: { systemId?: string; description?: string } = {};
    if (!newOp.systemId) errors.systemId = 'Selecciona un sistema';
    if (!newOp.description.trim()) errors.description = 'La descripción es requerida';
    if (Object.keys(errors).length > 0) { setFormErrors(errors); return; }
    setFormErrors({});
    setSaving(true);
    setSaveError(null);
    try {
      // Demo mode: simulated delay — connect to real API when available
      await new Promise(r => setTimeout(r, 800));
      const sys = systems.find((s: ApiRecord) => s.id === newOp.systemId);
      setOperations(prev => [...prev, {
        id: `OP-${String(prev.length + 1).padStart(3, '0')}`,
        systemId: newOp.systemId,
        sid: sys?.sid || 'N/A',
        type: newOp.type,
        scheduledTime: newOp.scheduledTime || new Date(Date.now() + 86400000).toISOString(),
        status: 'SCHEDULED',
        riskLevel: newOp.riskLevel,
        requestedBy: user?.email || user?.username || 'unknown',
        description: newOp.description,
      }]);
      setShowNewModal(false);
      setNewOp({ systemId: '', type: 'BACKUP', description: '', riskLevel: 'LOW', scheduledTime: '' });
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? (err as Error).message : 'Error al crear operación');
    } finally {
      setSaving(false);
    }
  };

  const filtered = activeTab === 'all' ? operations : operations.filter((o: ApiRecord) => o.status === activeTab);

  const riskVariant = (r: string) => {
    const map: Record<string, string> = { HIGH: 'danger', MEDIUM: 'warning', LOW: 'success', CRITICAL: 'danger' };
    return map[r] || 'default';
  };

  const tabs = [
    { value: 'all', label: 'Todas', count: operations.length },
    { value: 'SCHEDULED', label: 'Programadas', count: operations.filter((o: ApiRecord) => o.status === 'SCHEDULED').length },
    { value: 'COMPLETED', label: 'Completadas', count: operations.filter((o: ApiRecord) => o.status === 'COMPLETED').length },
    { value: 'FAILED', label: 'Fallidas', count: operations.filter((o: ApiRecord) => o.status === 'FAILED').length },
  ];

  return (
    <div>
      <Header title="Operaciones" subtitle="Operaciones programadas y ejecutadas" />
      <div className="p-6">
        <PageHeader
          title="Operaciones"
          description="Gestiona las operaciones programadas, backups, mantenimientos y DR drills"
          actions={<Button icon={Plus} size="sm" onClick={() => setShowNewModal(true)}>Nueva Operación</Button>}
        />

        <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} className="mb-6" />

        {filtered.length === 0 ? (
          <EmptyState icon={Calendar} title="Sin operaciones" description="No hay operaciones en este estado" />
        ) : (
          <Table>
            <TableHeader>
              <tr>
                <TableHead>ID</TableHead>
                <TableHead>Sistema</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Descripción</TableHead>
                <TableHead>Programada</TableHead>
                <TableHead>Recurrencia</TableHead>
                <TableHead>Próxima</TableHead>
                <TableHead>Última</TableHead>
                <TableHead>Riesgo</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Solicitado por</TableHead>
              </tr>
            </TableHeader>
            <TableBody>
              {filtered.map((op: ApiRecord) => (
                <TableRow key={op.id}>
                  <TableCell className="font-mono text-xs">{op.id}</TableCell>
                  <TableCell><span className="font-medium">{op.sid}</span></TableCell>
                  <TableCell><Badge variant="info" size="sm">{op.type}</Badge></TableCell>
                  <TableCell className="max-w-[200px] truncate text-sm">{op.description}</TableCell>
                  <TableCell className="text-xs text-text-secondary">{new Date(op.scheduledTime).toLocaleString('es-CO', { hour12: false })}</TableCell>
                  <TableCell className="text-xs">{op.sched || '-'}</TableCell>
                  <TableCell className="text-xs text-text-secondary">{op.next ? new Date(op.next).toLocaleString('es-CO', { hour12: false }) : '-'}</TableCell>
                  <TableCell className="text-xs">
                    {op.last ? (
                      <span className={op.last.startsWith('✓') ? 'text-green-500' : op.last.startsWith('✗') ? 'text-red-500' : ''}>
                        {op.last}
                      </span>
                    ) : '-'}
                  </TableCell>
                  <TableCell><Badge variant={riskVariant(op.riskLevel)} size="sm">{op.riskLevel}</Badge></TableCell>
                  <TableCell><StatusBadge status={op.status.toLowerCase()} /></TableCell>
                  <TableCell className="text-xs text-text-secondary">{op.requestedBy}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {/* New Operation Modal */}
        <Modal
          isOpen={showNewModal}
          onClose={() => { setShowNewModal(false); setFormErrors({}); setSaveError(null); }}
          title="Nueva Operación"
          description="Programa una nueva operación para un sistema SAP"
          footer={
            <>
              <Button variant="outline" onClick={() => { setShowNewModal(false); setFormErrors({}); setSaveError(null); }}>Cancelar</Button>
              <Button icon={Save} loading={saving} onClick={handleCreateOperation} disabled={saving}>
                Programar
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            {saveError && (
              <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-danger-50 border border-danger-200 text-danger-700 text-sm">
                <AlertCircle size={14} className="flex-shrink-0" />
                {saveError}
              </div>
            )}
            <div>
              <Select
                label="Sistema"
                value={newOp.systemId}
                onChange={(e) => { setNewOp({ ...newOp, systemId: e.target.value }); if (formErrors.systemId) setFormErrors(prev => ({ ...prev, systemId: undefined })); }}
                options={[
                  { value: '', label: 'Seleccionar sistema...' },
                  ...systems.map((s: ApiRecord) => ({ value: s.id, label: `${s.sid} — ${s.type} (${s.environment})` }))
                ]}
              />
              {formErrors.systemId && <p className="mt-1 text-xs text-danger-600">{formErrors.systemId}</p>}
            </div>
            <Select
              label="Tipo de Operación"
              value={newOp.type}
              onChange={(e) => setNewOp({ ...newOp, type: e.target.value })}
              options={[
                { value: 'BACKUP', label: 'Backup' },
                { value: 'RESTART', label: 'Reinicio' },
                { value: 'MAINTENANCE', label: 'Mantenimiento' },
                { value: 'DR_DRILL', label: 'DR Drill' },
                { value: 'PATCH', label: 'Actualización / Parche' },
              ]}
            />
            <div>
              <Input
                label="Descripción"
                value={newOp.description}
                onChange={(e) => { setNewOp({ ...newOp, description: e.target.value }); if (formErrors.description) setFormErrors(prev => ({ ...prev, description: undefined })); }}
                placeholder="Descripción de la operación..."
                required
                error={formErrors.description}
              />
            </div>
            <Select
              label="Nivel de Riesgo"
              value={newOp.riskLevel}
              onChange={(e) => setNewOp({ ...newOp, riskLevel: e.target.value })}
              options={[
                { value: 'LOW', label: 'Bajo' },
                { value: 'MEDIUM', label: 'Medio' },
                { value: 'HIGH', label: 'Alto' },
                { value: 'CRITICAL', label: 'Crítico' },
              ]}
            />
            <Input
              label="Fecha programada"
              type="datetime-local"
              value={newOp.scheduledTime}
              onChange={(e) => setNewOp({ ...newOp, scheduledTime: e.target.value })}
            />
          </div>
        </Modal>
      </div>
    </div>
  );
}
