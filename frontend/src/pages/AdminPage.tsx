import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, RefreshCw, Server, Trash2, Edit, Activity, Plus } from 'lucide-react';
import Header from '../components/layout/Header';
import PageHeader from '../components/layout/PageHeader';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import StatusBadge from '../components/ui/StatusBadge';
import Table, { TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/Table';
import PageLoading from '../components/ui/PageLoading';
import { dataService } from '../services/dataService';
import { createLogger } from '../lib/logger';
import type { ApiRecord } from '../types';

const log = createLogger('AdminPage');

export default function AdminPage() {
  const [systems, setSystems] = useState<ApiRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const deleteTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const navigate = useNavigate();

  useEffect(() => {
    dataService.getSystems().then(data => { setSystems(data); setLoading(false); }).catch((err: any) => log.warn('Fetch failed', { error: err.message }));
    return () => {
      if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current);
    };
  }, []);

  const handleHealthCheck = async (id: any) => {
    setChecking(id);
    setActionError(null);
    try {
      // Demo mode: simulated delay — connect to real API when available
      await new Promise(r => setTimeout(r, 1500));
    } catch (err: any) {
      setActionError(err instanceof Error ? err.message : 'Error al ejecutar health check');
    } finally {
      setChecking(null);
    }
  };

  const handleEdit = (sys: any) => {
    navigate(`/systems/${sys.id}`);
  };

  const handleDelete = async (id: any) => {
    if (deleteConfirm === id) {
      setActionError(null);
      try {
        // Demo mode: simulated delay — connect to real API when available
        await new Promise(r => setTimeout(r, 500));
        setSystems(prev => prev.filter((s: any) => s.id !== id));
        setDeleteConfirm(null);
      } catch (err: any) {
        setActionError(err instanceof Error ? err.message : 'Error al eliminar sistema');
      }
    } else {
      setDeleteConfirm(id);
      deleteTimerRef.current = setTimeout(() => setDeleteConfirm(null), 3000);
    }
  };

  if (loading) return <PageLoading />;

  return (
    <div>
      <Header title="Administración" subtitle="Gestión de sistemas y configuración" />
      <div className="p-6">
        {actionError && (
          <div className="mb-4 flex items-center gap-2 px-4 py-3 rounded-lg bg-danger-50 border border-danger-200 text-danger-700 text-sm">
            <Activity size={14} className="flex-shrink-0" />
            {actionError}
            <button onClick={() => setActionError(null)} className="ml-auto opacity-60 hover:opacity-100">×</button>
          </div>
        )}
        <div className="flex items-center justify-between mb-6">
          <PageHeader
            title="Gestión de Sistemas"
            description={`${systems.length} sistemas registrados en la plataforma`}
          />
          <Button icon={Plus} onClick={() => navigate('/connect')}>
            Conectar Sistema
          </Button>
        </div>

        <Table>
          <TableHeader>
            <tr>
              <TableHead>Sistema</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Base de Datos</TableHead>
              <TableHead>Ambiente</TableHead>
              <TableHead>Modo</TableHead>
              <TableHead>Health</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Acciones</TableHead>
            </tr>
          </TableHeader>
          <TableBody>
            {systems.map((sys: any) => (
              <TableRow key={sys.id} onClick={() => navigate(`/systems/${sys.id}`)}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Server size={16} className="text-text-tertiary" />
                    <div>
                      <p className="font-semibold">{sys.sid}</p>
                      <p className="text-xs text-text-tertiary">{sys.id}</p>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-sm">{sys.type}</TableCell>
                <TableCell className="text-xs">{sys.dbType}</TableCell>
                <TableCell>
                  <Badge variant={sys.environment === 'PRD' ? 'danger' : sys.environment === 'QAS' ? 'warning' : 'info'} size="sm">
                    {sys.environment}
                  </Badge>
                </TableCell>
                <TableCell><StatusBadge status={sys.mode === 'TRIAL' ? 'trial' : 'production'} size="sm" /></TableCell>
                <TableCell>
                  <span className={`text-sm font-bold ${sys.healthScore >= 90 ? 'text-success-600' : sys.healthScore >= 70 ? 'text-warning-600' : 'text-danger-600'}`}>
                    {sys.healthScore}
                  </span>
                </TableCell>
                <TableCell><StatusBadge status={sys.status} /></TableCell>
                <TableCell>
                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => handleHealthCheck(sys.id)}
                      className="p-1.5 rounded-lg hover:bg-surface-tertiary text-text-tertiary hover:text-text-primary transition-colors"
                      title="Health Check"
                    >
                      <RefreshCw size={14} className={checking === sys.id ? 'animate-spin' : ''} />
                    </button>
                    <button onClick={() => handleEdit(sys)} className="p-1.5 rounded-lg hover:bg-surface-tertiary text-text-tertiary hover:text-text-primary transition-colors" title="Editar">
                      <Edit size={14} />
                    </button>
                    <button onClick={() => handleDelete(sys.id)} className={`p-1.5 rounded-lg transition-colors ${deleteConfirm === sys.id ? 'bg-danger-100 text-danger-600' : 'hover:bg-danger-50 text-text-tertiary hover:text-danger-600'}`} title={deleteConfirm === sys.id ? 'Confirmar eliminación' : 'Eliminar'}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
