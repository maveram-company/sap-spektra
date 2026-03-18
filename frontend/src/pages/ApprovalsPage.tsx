import { useState, useEffect } from 'react';
import { CheckCircle, XCircle, Clock, AlertTriangle, Filter } from 'lucide-react';
import Header from '../components/layout/Header';
import PageHeader from '../components/layout/PageHeader';
import Card from '../components/ui/Card';
import Tabs from '../components/ui/Tabs';
import Badge from '../components/ui/Badge';
import StatusBadge from '../components/ui/StatusBadge';
import Button from '../components/ui/Button';
import Table, { TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/Table';
import EmptyState from '../components/ui/EmptyState';
import PageLoading from '../components/ui/PageLoading';
import { useAuth } from '../contexts/AuthContext';
import { dataService } from '../services/dataService';
import { createLogger } from '../lib/logger';
import type { ApiRecord } from '../types';

const log = createLogger('ApprovalsPage');

export default function ApprovalsPage() {
  const [approvals, setApprovals] = useState<ApiRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('PENDING');
  const [processing, setProcessing] = useState<string | null>(null);
  const { hasRole } = useAuth();
  const canApprove = hasRole('escalation');

  useEffect(() => {
    let mounted = true;
    dataService.getApprovals()
      .then(data => {
        if (mounted) { setApprovals(data); setLoading(false); }
      })
      .catch((err: unknown) => {
        if (mounted) { log.warn('Fetch failed', { error: (err as Error).message }); setLoading(false); }
      });
    return () => { mounted = false; };
  }, []);

  const filtered = approvals.filter((a: ApiRecord) => a.status === activeTab);

  const handleApprove = async (id: string) => {
    if (!canApprove) return;
    setProcessing(id);
    await new Promise(r => setTimeout(r, 800));
    setApprovals(prev => prev.map((a: ApiRecord) => a.id === id ? { ...a, status: 'APPROVED', processedAt: new Date().toISOString() } : a));
    setProcessing(null);
  };

  const handleReject = async (id: string) => {
    if (!canApprove) return;
    setProcessing(id);
    await new Promise(r => setTimeout(r, 800));
    setApprovals(prev => prev.map((a: ApiRecord) => a.id === id ? { ...a, status: 'REJECTED', processedAt: new Date().toISOString() } : a));
    setProcessing(null);
  };

  const tabs = [
    { value: 'PENDING', label: 'Pendientes', count: approvals.filter((a: ApiRecord) => a.status === 'PENDING').length },
    { value: 'APPROVED', label: 'Aprobadas', count: approvals.filter((a: ApiRecord) => a.status === 'APPROVED').length },
    { value: 'REJECTED', label: 'Rechazadas', count: approvals.filter((a: ApiRecord) => a.status === 'REJECTED').length },
    { value: 'EXPIRED', label: 'Expiradas', count: approvals.filter((a: ApiRecord) => a.status === 'EXPIRED').length },
  ];

  if (loading) return <PageLoading message="Cargando aprobaciones..." />;

  const severityVariant = (s: string) => {
    const map: Record<string, string> = { CRITICAL: 'danger', HIGH: 'danger', MEDIUM: 'warning', LOW: 'default' };
    return map[s] || 'default';
  };

  return (
    <div>
      <Header title="Aprobaciones" subtitle="Gestiona las solicitudes de ejecución de runbooks (demo)" />
      <div className="p-6">
        <PageHeader title="Aprobaciones" description="Revisa y gestiona las solicitudes de ejecución automática" />

        <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} className="mb-6" />

        {filtered.length === 0 ? (
          <EmptyState
            icon={CheckCircle}
            title={`Sin aprobaciones ${activeTab.toLowerCase()}`}
            description="No hay solicitudes en este estado"
          />
        ) : (
          <Table>
            <TableHeader>
              <tr>
                <TableHead>Sistema</TableHead>
                <TableHead>Runbook</TableHead>
                <TableHead>Descripción</TableHead>
                <TableHead>Métrica</TableHead>
                <TableHead>Severidad</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Estado</TableHead>
                {activeTab === 'PENDING' && canApprove && <TableHead>Acciones</TableHead>}
              </tr>
            </TableHeader>
            <TableBody>
              {filtered.map((approval: ApiRecord) => (
                <TableRow key={approval.id}>
                  <TableCell>
                    <div>
                      <p className="font-medium">{approval.sid}</p>
                      <p className="text-xs text-text-tertiary">{approval.systemId}</p>
                    </div>
                  </TableCell>
                  <TableCell><code className="text-xs bg-surface-tertiary px-1.5 py-0.5 rounded">{approval.runbookId}</code></TableCell>
                  <TableCell className="max-w-[200px] truncate">{approval.description}</TableCell>
                  <TableCell>
                    <div>
                      <p className="text-xs">{approval.metric}</p>
                      <p className="text-xs font-mono text-text-tertiary">{approval.value}%</p>
                    </div>
                  </TableCell>
                  <TableCell><Badge variant={severityVariant(approval.severity)} size="sm">{approval.severity}</Badge></TableCell>
                  <TableCell className="text-xs text-text-secondary">{new Date(approval.createdAt).toLocaleString('es-CO', { hour12: false })}</TableCell>
                  <TableCell><StatusBadge status={approval.status.toLowerCase()} /></TableCell>
                  {activeTab === 'PENDING' && canApprove && (
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button size="sm" variant="success" icon={CheckCircle} loading={processing === approval.id} onClick={() => handleApprove(approval.id)}>
                          Aprobar
                        </Button>
                        <Button size="sm" variant="danger" icon={XCircle} loading={processing === approval.id} onClick={() => handleReject(approval.id)}>
                          Rechazar
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
