import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Monitor, Search, Filter, Plus, AlertTriangle } from 'lucide-react';
import Header from '../components/layout/Header';
import PageHeader from '../components/layout/PageHeader';
import Card from '../components/ui/Card';
import StatusBadge from '../components/ui/StatusBadge';
import HealthGauge from '../components/ui/HealthGauge';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Button from '../components/ui/Button';
import EmptyState from '../components/ui/EmptyState';
import PageLoading from '../components/ui/PageLoading';
import { dataService } from '../services/dataService';

export default function SystemsListPage() {
  const [systems, setSystems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [envFilter, setEnvFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const navigate = useNavigate();

  useEffect(() => {
    let mounted = true;
    dataService.getSystems()
      .then(data => { if (mounted) setSystems(data); })
      .catch(err => { if (mounted) setError(err.message); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, []);

  if (loading) return <PageLoading message="Cargando sistemas..." />;

  if (error) return (
    <div>
      <Header title="Sistemas SAP" subtitle="Error al cargar" />
      <div className="p-6">
        <EmptyState icon={AlertTriangle} title="Error al cargar sistemas" description={error} />
      </div>
    </div>
  );

  const filtered = systems.filter(s => {
    const matchesSearch = !search || s.sid.toLowerCase().includes(search.toLowerCase()) || s.id.toLowerCase().includes(search.toLowerCase()) || s.description.toLowerCase().includes(search.toLowerCase());
    const matchesEnv = envFilter === 'ALL' || s.environment === envFilter;
    const matchesStatus = statusFilter === 'ALL' || s.status === statusFilter;
    return matchesSearch && matchesEnv && matchesStatus;
  });

  return (
    <div>
      <Header title="Sistemas SAP" subtitle={`${systems.length} sistemas en el landscape`} />
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <PageHeader title="Landscape SAP" description="Vista completa de todos los sistemas monitoreados" />
          <Button icon={Plus} onClick={() => navigate('/connect')}>
            Conectar Sistema
          </Button>
        </div>

        {/* Filtros */}
        <div className="flex flex-wrap items-center gap-3 mb-6">
          <div className="flex-1 min-w-[200px] max-w-sm">
            <Input
              placeholder="Buscar por SID, ID o descripción..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              icon={Search}
            />
          </div>
          <Select
            value={envFilter}
            onChange={(e) => setEnvFilter(e.target.value)}
            options={[
              { value: 'ALL', label: 'Todos los ambientes' },
              { value: 'PRD', label: 'Producción' },
              { value: 'QAS', label: 'Calidad' },
              { value: 'DEV', label: 'Desarrollo' },
            ]}
          />
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            options={[
              { value: 'ALL', label: 'Todos los estados' },
              { value: 'healthy', label: 'Saludable' },
              { value: 'warning', label: 'Advertencia' },
              { value: 'degraded', label: 'Degradado' },
              { value: 'critical', label: 'Crítico' },
            ]}
          />
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            icon={Monitor}
            title="Sin resultados"
            description="No se encontraron sistemas con los filtros seleccionados"
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map(system => (
              <Card key={system.id} hover onClick={() => navigate(`/systems/${system.id}`)} className="animate-fade-in">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-base font-semibold text-text-primary">{system.sid}</h3>
                      <StatusBadge status={system.mode === 'TRIAL' ? 'trial' : 'production'} size="sm" />
                    </div>
                    <p className="text-xs text-text-secondary">{system.description}</p>
                  </div>
                  <StatusBadge status={system.status} />
                </div>

                <div className="flex items-center justify-center my-4">
                  <HealthGauge score={system.healthScore} size={130} />
                </div>

                <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-border">
                  <div>
                    <p className="text-[10px] text-text-tertiary uppercase tracking-wider">Tipo</p>
                    <p className="text-xs font-medium text-text-primary mt-0.5">{system.type}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-text-tertiary uppercase tracking-wider">Base de Datos</p>
                    <p className="text-xs font-medium text-text-primary mt-0.5">{system.dbType}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-text-tertiary uppercase tracking-wider">Ambiente</p>
                    <p className="text-xs font-medium text-text-primary mt-0.5">{system.environment}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-text-tertiary uppercase tracking-wider">Breaches</p>
                    <p className="text-xs font-medium text-text-primary mt-0.5">
                      {system.breaches > 0 ? (
                        <span className="text-danger-600">{system.breaches} activos</span>
                      ) : (
                        <span className="text-success-600">Sin breaches</span>
                      )}
                    </p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
