import { useState, useEffect } from 'react';
import { Calendar, Clock, AlertTriangle, CheckCircle, XCircle, Play, Plus, Save } from 'lucide-react';
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

export default function OperationsPage() {
  const [operations, setOperations] = useState([]);
  const [systems, setSystems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all');
  const [showNewModal, setShowNewModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newOp, setNewOp] = useState({ systemId: '', type: 'BACKUP', description: '', riskLevel: 'LOW', scheduledTime: '' });

  useEffect(() => {
    Promise.all([dataService.getOperations(), dataService.getSystems()]).then(([ops, sys]) => {
      setOperations(ops);
      setSystems(sys);
      setLoading(false);
    });
  }, []);

  if (loading) return <PageLoading />;

  const handleCreateOperation = async () => {
    setSaving(true);
    await new Promise(r => setTimeout(r, 800));
    const sys = systems.find(s => s.id === newOp.systemId);
    setOperations(prev => [...prev, {
      id: `OP-${String(prev.length + 1).padStart(3, '0')}`,
      systemId: newOp.systemId,
      sid: sys?.sid || 'N/A',
      type: newOp.type,
      scheduledTime: newOp.scheduledTime || new Date(Date.now() + 86400000).toISOString(),
      status: 'SCHEDULED',
      riskLevel: newOp.riskLevel,
      requestedBy: 'demo@empresa.com',
      description: newOp.description,
    }]);
    setShowNewModal(false);
    setNewOp({ systemId: '', type: 'BACKUP', description: '', riskLevel: 'LOW', scheduledTime: '' });
    setSaving(false);
  };

  const filtered = activeTab === 'all' ? operations : operations.filter(o => o.status === activeTab);

  const riskVariant = (r) => {
    const map = { HIGH: 'danger', MEDIUM: 'warning', LOW: 'success', CRITICAL: 'danger' };
    return map[r] || 'default';
  };

  const tabs = [
    { value: 'all', label: 'Todas', count: operations.length },
    { value: 'SCHEDULED', label: 'Programadas', count: operations.filter(o => o.status === 'SCHEDULED').length },
    { value: 'COMPLETED', label: 'Completadas', count: operations.filter(o => o.status === 'COMPLETED').length },
    { value: 'FAILED', label: 'Fallidas', count: operations.filter(o => o.status === 'FAILED').length },
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
              {filtered.map(op => (
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
          onClose={() => setShowNewModal(false)}
          title="Nueva Operación"
          description="Programa una nueva operación para un sistema SAP"
          footer={
            <>
              <Button variant="outline" onClick={() => setShowNewModal(false)}>Cancelar</Button>
              <Button icon={Save} loading={saving} onClick={handleCreateOperation} disabled={!newOp.systemId || !newOp.description}>
                Programar
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <Select
              label="Sistema"
              value={newOp.systemId}
              onChange={(e) => setNewOp({ ...newOp, systemId: e.target.value })}
              options={[
                { value: '', label: 'Seleccionar sistema...' },
                ...systems.map(s => ({ value: s.id, label: `${s.sid} — ${s.type} (${s.environment})` }))
              ]}
            />
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
            <Input
              label="Descripción"
              value={newOp.description}
              onChange={(e) => setNewOp({ ...newOp, description: e.target.value })}
              placeholder="Descripción de la operación..."
            />
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
