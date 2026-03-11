import { useState, useEffect } from 'react';
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
import { mockSystems } from '../lib/mockData';

export default function AdminPage() {
  const [systems, setSystems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    setTimeout(() => { setSystems(mockSystems); setLoading(false); }, 400);
  }, []);

  const handleHealthCheck = async (id) => {
    setChecking(id);
    await new Promise(r => setTimeout(r, 1500));
    setChecking(null);
  };

  const handleEdit = (sys) => {
    navigate(`/systems/${sys.id}`);
  };

  const handleDelete = async (id) => {
    if (deleteConfirm === id) {
      await new Promise(r => setTimeout(r, 500));
      setSystems(prev => prev.filter(s => s.id !== id));
      setDeleteConfirm(null);
    } else {
      setDeleteConfirm(id);
      setTimeout(() => setDeleteConfirm(null), 3000);
    }
  };

  if (loading) return <PageLoading />;

  return (
    <div>
      <Header title="Administración" subtitle="Gestión de sistemas y configuración" />
      <div className="p-6">
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
            {systems.map(sys => (
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
