import { useState, useEffect } from 'react';
import { ScrollText, Search, Download, Filter, AlertTriangle } from 'lucide-react';
import Card from '../../components/ui/Card';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Table, { TableHeader, TableBody, TableRow, TableHead, TableCell } from '../../components/ui/Table';
import EmptyState from '../../components/ui/EmptyState';
import PageLoading from '../../components/ui/PageLoading';
import Pagination from '../../components/ui/Pagination';
import usePagination from '../../hooks/usePagination';
import { dataService } from '../../services/dataService';

export default function AuditLogPage() {
  const [search, setSearch] = useState('');
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let mounted = true;
    dataService.getAuditLog()
      .then(data => { if (mounted) setEvents(data); })
      .catch(err => { if (mounted) setError(err.message); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, []);

  const filtered = events.filter(e =>
    e.action.toLowerCase().includes(search.toLowerCase()) ||
    e.user.toLowerCase().includes(search.toLowerCase()) ||
    e.details.toLowerCase().includes(search.toLowerCase())
  );

  const { items: paginatedAudit, page: auditPage, totalPages: auditTotalPages, total: auditTotal, setPage: setAuditPage } = usePagination(filtered, 25);

  if (loading) return <PageLoading message="Cargando log de auditoría..." />;

  if (error) return (
    <div className="max-w-5xl">
      <EmptyState icon={AlertTriangle} title="Error al cargar auditoría" description={error} />
    </div>
  );

  const severityVariant = (s) => ({ critical: 'danger', warning: 'warning', info: 'default' }[s] || 'default');

  const actionLabels = {
    'system.register': 'Sistema registrado',
    'approval.approve': 'Aprobación procesada',
    'breach.detected': 'Breach detectado',
    'runbook.execute': 'Runbook ejecutado',
    'user.invite': 'Usuario invitado',
    'ha.failover': 'Failover HA',
    'settings.update': 'Config actualizada',
    'compliance.report': 'Reporte generado',
  };

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-text-primary">Log de Auditoría</h2>
          <p className="text-sm text-text-secondary mt-1">Registro de todas las acciones en la plataforma</p>
        </div>
        <Button variant="outline" icon={Download} size="sm">Exportar CSV</Button>
      </div>

      <div className="mb-4">
        <Input
          icon={Search}
          placeholder="Buscar por acción, usuario o detalle..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <Table>
        <TableHeader>
          <tr>
            <TableHead>Fecha</TableHead>
            <TableHead>Usuario</TableHead>
            <TableHead>Acción</TableHead>
            <TableHead>Recurso</TableHead>
            <TableHead>Detalle</TableHead>
            <TableHead>Nivel</TableHead>
          </tr>
        </TableHeader>
        <TableBody>
          {paginatedAudit.map(event => (
            <TableRow key={event.id}>
              <TableCell className="text-xs text-text-secondary whitespace-nowrap">
                {new Date(event.timestamp).toLocaleString('es-CO', { hour12: false })}
              </TableCell>
              <TableCell className="text-xs">{event.user}</TableCell>
              <TableCell>
                <code className="text-xs bg-surface-tertiary px-1.5 py-0.5 rounded">
                  {actionLabels[event.action] || event.action}
                </code>
              </TableCell>
              <TableCell className="text-xs font-mono text-text-secondary">{event.resource}</TableCell>
              <TableCell className="text-xs max-w-[200px] truncate">{event.details}</TableCell>
              <TableCell>
                <Badge variant={severityVariant(event.severity)} size="sm">
                  {event.severity}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Pagination page={auditPage} totalPages={auditTotalPages} total={auditTotal} onPageChange={setAuditPage} />
    </div>
  );
}
