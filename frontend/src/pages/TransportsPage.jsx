import { useMemo, useState } from 'react';
import { Package, ArrowRight, CheckCircle, XCircle, Clock, AlertTriangle, Filter } from 'lucide-react';
import Header from '../components/layout/Header';
import Card, { CardHeader, CardTitle } from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Table, { TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/Table';
import { mockTransports, mockSystems } from '../lib/mockData';

const transportStatus = {
  released: { label: 'Liberado', color: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400', icon: ArrowRight },
  imported: { label: 'Importado', color: 'bg-success-100 dark:bg-success-900/30 text-success-700 dark:text-success-400', icon: CheckCircle },
  error: { label: 'Error', color: 'bg-danger-100 dark:bg-danger-900/30 text-danger-700 dark:text-danger-400', icon: XCircle },
  modifiable: { label: 'Modificable', color: 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-400', icon: Clock },
};

function TransportStatusBadge({ status }) {
  const cfg = transportStatus[status] || transportStatus.modifiable;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${cfg.color}`}>
      <Icon size={12} />
      {cfg.label}
    </span>
  );
}

function RCBadge({ rc }) {
  if (rc === null || rc === undefined) return <span className="text-text-tertiary text-xs">—</span>;
  if (rc === 0) return <Badge variant="success" size="sm">RC=0</Badge>;
  if (rc <= 4) return <Badge variant="warning" size="sm">RC={rc}</Badge>;
  return <Badge variant="danger" size="sm">RC={rc}</Badge>;
}

export default function TransportsPage() {
  const [statusFilter, setStatusFilter] = useState('all');

  const filtered = useMemo(() => {
    if (statusFilter === 'all') return mockTransports;
    return mockTransports.filter(t => t.status === statusFilter);
  }, [statusFilter]);

  const released = mockTransports.filter(t => t.status === 'released').length;
  const imported = mockTransports.filter(t => t.status === 'imported').length;
  const errors = mockTransports.filter(t => t.status === 'error').length;

  return (
    <div>
      <Header title="Transporte de Órdenes" subtitle="Monitor STMS — gestión de transportes SAP (datos de demostración)" />
      <div className="p-6 space-y-6">
        {/* KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <Package size={20} className="text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-text-primary">{mockTransports.length}</p>
                <p className="text-xs text-text-secondary">Total Transportes</p>
              </div>
            </div>
          </Card>
          <Card>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
                <ArrowRight size={20} className="text-primary-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-text-primary">{released}</p>
                <p className="text-xs text-text-secondary">Pendientes Import</p>
              </div>
            </div>
          </Card>
          <Card>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-success-100 dark:bg-success-900/30 flex items-center justify-center">
                <CheckCircle size={20} className="text-success-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-text-primary">{imported}</p>
                <p className="text-xs text-text-secondary">Importados OK</p>
              </div>
            </div>
          </Card>
          <Card>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-danger-100 dark:bg-danger-900/30 flex items-center justify-center">
                <XCircle size={20} className="text-danger-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-danger-600">{errors}</p>
                <p className="text-xs text-text-secondary">Con Error</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Transport Path Diagram */}
        <Card>
          <CardHeader>
            <CardTitle>Landscape Transport Path</CardTitle>
          </CardHeader>
          <div className="flex items-center justify-center gap-4 py-4">
            {/* Find ERP line systems */}
            {['DEV', 'QAS', 'PRD'].map((env, idx) => {
              const sys = mockSystems.find(s => s.environment === env && s.type === 'S/4HANA');
              return (
                <div key={env} className="flex items-center gap-4">
                  <div className={`px-6 py-4 rounded-xl border-2 text-center ${
                    env === 'PRD' ? 'border-danger-300 dark:border-danger-700 bg-danger-50 dark:bg-danger-900/20' :
                    env === 'QAS' ? 'border-warning-300 dark:border-warning-700 bg-warning-50 dark:bg-warning-900/20' :
                    'border-primary-300 dark:border-primary-700 bg-primary-50 dark:bg-primary-900/20'
                  }`}>
                    <p className="text-lg font-bold text-text-primary">{sys?.sid || env}</p>
                    <p className="text-xs text-text-secondary">{env}</p>
                  </div>
                  {idx < 2 && (
                    <ArrowRight size={24} className="text-text-tertiary flex-shrink-0" />
                  )}
                </div>
              );
            })}
          </div>
        </Card>

        {/* Filter */}
        <div className="flex items-center gap-3">
          <Filter size={14} className="text-text-tertiary" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="appearance-none bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary-500 cursor-pointer"
          >
            <option value="all">Todos los estados</option>
            <option value="released">Liberados</option>
            <option value="imported">Importados</option>
            <option value="error">Con Error</option>
          </select>
          <span className="text-sm text-text-secondary ml-auto">{filtered.length} transportes</span>
        </div>

        {/* Transports Table */}
        <Card padding="none">
          <Table>
            <TableHeader>
              <tr>
                <TableHead>Transporte</TableHead>
                <TableHead>Descripción</TableHead>
                <TableHead>Origen</TableHead>
                <TableHead>Destino</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>RC</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>Fecha</TableHead>
              </tr>
            </TableHeader>
            <TableBody>
              {filtered.map(t => (
                <TableRow key={t.id}>
                  <TableCell className="font-mono text-sm font-bold text-text-primary">
                    {t.id}
                  </TableCell>
                  <TableCell className="text-sm text-text-primary max-w-xs truncate">
                    {t.description}
                  </TableCell>
                  <TableCell>
                    <Badge variant="primary" size="sm">{t.systemId.split('-')[1]}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-text-secondary">
                    {t.targetSystem}
                  </TableCell>
                  <TableCell>
                    <TransportStatusBadge status={t.status} />
                  </TableCell>
                  <TableCell>
                    <RCBadge rc={t.rc} />
                  </TableCell>
                  <TableCell className="text-xs text-text-secondary">
                    {t.owner}
                  </TableCell>
                  <TableCell className="text-xs text-text-secondary whitespace-nowrap">
                    {new Date(t.createdAt).toLocaleDateString('es-CO')}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>

        {/* Error detail */}
        {errors > 0 && (
          <Card className="border-danger-200 dark:border-danger-800 bg-danger-50 dark:bg-danger-900/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle size={18} className="text-danger-500" />
                Transportes con Error
              </CardTitle>
            </CardHeader>
            <div className="space-y-3">
              {mockTransports.filter(t => t.status === 'error').map(t => (
                <div key={t.id} className="border border-danger-200 dark:border-danger-800 rounded-lg p-3 bg-surface">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-sm font-bold text-text-primary">{t.id}</span>
                    <RCBadge rc={t.rc} />
                  </div>
                  <p className="text-xs text-text-secondary">{t.description}</p>
                  {t.error && (
                    <p className="text-xs font-mono text-danger-600 dark:text-danger-400 mt-1">{t.error}</p>
                  )}
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
