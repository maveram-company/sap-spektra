import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Play, Square, Clock, AlertTriangle, CheckCircle, XCircle, RotateCcw, Filter } from 'lucide-react';
import Header from '../components/layout/Header';
import Card, { CardHeader, CardTitle } from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Table, { TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/Table';
import PageLoading from '../components/ui/PageLoading';
import { dataService } from '../services/dataService';

const statusConfig = {
  running: { icon: Play, labelKey: 'backgroundJobs.statusRunning', color: 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400', dot: 'bg-primary-500 animate-pulse' },
  scheduled: { icon: Clock, labelKey: 'backgroundJobs.statusScheduled', color: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400', dot: 'bg-blue-500' },
  finished: { icon: CheckCircle, labelKey: 'backgroundJobs.statusFinished', color: 'bg-success-100 dark:bg-success-900/30 text-success-700 dark:text-success-400', dot: 'bg-success-500' },
  failed: { icon: XCircle, labelKey: 'backgroundJobs.statusFailed', color: 'bg-danger-100 dark:bg-danger-900/30 text-danger-700 dark:text-danger-400', dot: 'bg-danger-500' },
  canceled: { icon: Square, labelKey: 'backgroundJobs.statusCanceled', color: 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-400', dot: 'bg-gray-500' },
};

const classLabels = { A: 'Clase A (alta)', B: 'Clase B (media)', C: 'Clase C (baja)' };

function JobStatusBadge({ status }) {
  const { t } = useTranslation();
  const cfg = statusConfig[status] || statusConfig.finished;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${cfg.color}`}>
      <Icon size={12} />
      {t(cfg.labelKey)}
    </span>
  );
}

export default function BackgroundJobsPage() {
  const { t } = useTranslation();
  const [jobs, setJobs] = useState([]);
  const [systems, setSystems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [systemFilter, setSystemFilter] = useState('all');

  useEffect(() => {
    Promise.all([dataService.getBackgroundJobs(), dataService.getSystems()]).then(([j, s]) => {
      setJobs(j);
      setSystems(s);
      setLoading(false);
    }).catch((err) => {
      console.warn('[BackgroundJobsPage] fetch failed:', err);
      setError('Error al cargar datos. Intenta de nuevo.');
      setLoading(false);
    });
  }, []);

  const filtered = useMemo(() => {
    return jobs.filter(job => {
      if (statusFilter !== 'all' && job.status !== statusFilter) return false;
      if (systemFilter !== 'all' && job.systemId !== systemFilter) return false;
      return true;
    });
  }, [statusFilter, systemFilter, jobs]);

  // KPI summaries
  const running = jobs.filter(j => j.status === 'running').length;
  const scheduled = jobs.filter(j => j.status === 'scheduled').length;
  const failed = jobs.filter(j => j.status === 'failed').length;
  const finished = jobs.filter(j => j.status === 'finished').length;

  if (loading) return <PageLoading message="Cargando jobs..." />;

  if (error) return (
    <div className="flex items-center justify-center h-64">
      <div className="text-center">
        <p className="text-red-400 mb-4">{error}</p>
        <button onClick={() => window.location.reload()} className="px-4 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 transition-colors">
          Reintentar
        </button>
      </div>
    </div>
  );

  return (
    <div>
      <Header title="Background Jobs" subtitle="Monitor de jobs SAP — equivalente SM37 (datos de demostración)" />
      <div className="p-6 space-y-6">
        {/* KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
                <Play size={20} className="text-primary-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-text-primary">{running}</p>
                <p className="text-xs text-text-secondary">{t('backgroundJobs.kpiRunning')}</p>
              </div>
            </div>
          </Card>
          <Card>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <Clock size={20} className="text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-text-primary">{scheduled}</p>
                <p className="text-xs text-text-secondary">{t('backgroundJobs.kpiScheduled')}</p>
              </div>
            </div>
          </Card>
          <Card>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-success-100 dark:bg-success-900/30 flex items-center justify-center">
                <CheckCircle size={20} className="text-success-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-text-primary">{finished}</p>
                <p className="text-xs text-text-secondary">{t('backgroundJobs.kpiFinished')}</p>
              </div>
            </div>
          </Card>
          <Card>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-danger-100 dark:bg-danger-900/30 flex items-center justify-center">
                <AlertTriangle size={20} className="text-danger-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-text-primary">{failed}</p>
                <p className="text-xs text-text-secondary">{t('backgroundJobs.kpiFailed')}</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Filter size={14} className="text-text-tertiary" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="appearance-none bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary-500 cursor-pointer"
            >
              <option value="all">Todos los estados</option>
              <option value="running">{t('backgroundJobs.statusRunning')}</option>
              <option value="scheduled">{t('backgroundJobs.statusScheduled')}</option>
              <option value="finished">{t('backgroundJobs.statusFinished')}</option>
              <option value="failed">{t('backgroundJobs.statusFailed')}</option>
              <option value="canceled">{t('backgroundJobs.statusCanceled')}</option>
            </select>
          </div>
          <select
            value={systemFilter}
            onChange={(e) => setSystemFilter(e.target.value)}
            className="appearance-none bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary-500 cursor-pointer"
          >
            <option value="all">Todos los sistemas</option>
            {systems.map(s => (
              <option key={s.id} value={s.id}>{s.sid} — {s.description || s.type}</option>
            ))}
          </select>
          <span className="text-sm text-text-secondary ml-auto">
            {filtered.length} job{filtered.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Jobs Table */}
        <Card padding="none">
          <Table>
            <TableHeader>
              <tr>
                <TableHead>Job Name</TableHead>
                <TableHead>Sistema</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Clase</TableHead>
                <TableHead>Duración</TableHead>
                <TableHead>Programado por</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Pasos</TableHead>
              </tr>
            </TableHeader>
            <TableBody>
              {filtered.map(job => (
                <TableRow key={job.id}>
                  <TableCell>
                    <div>
                      <p className="font-mono text-sm font-medium text-text-primary">{job.name}</p>
                      <p className="text-[10px] text-text-tertiary">{job.id}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="primary" size="sm">{job.sid}</Badge>
                  </TableCell>
                  <TableCell>
                    <JobStatusBadge status={job.status} />
                  </TableCell>
                  <TableCell className="text-xs text-text-secondary">
                    {classLabels[job.class] || job.class}
                  </TableCell>
                  <TableCell className="text-sm font-mono text-text-primary">
                    {job.runtime || '—'}
                  </TableCell>
                  <TableCell className="text-xs text-text-secondary">
                    {job.scheduledBy}
                  </TableCell>
                  <TableCell className="text-xs font-mono text-text-secondary">
                    {job.client}
                  </TableCell>
                  <TableCell className="text-xs text-text-secondary">
                    {job.currentStep}/{job.stepCount}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {filtered.length === 0 && (
            <div className="py-12 text-center text-text-tertiary text-sm">
              No se encontraron jobs con los filtros seleccionados.
            </div>
          )}
        </Card>

        {/* Failed jobs detail */}
        {filtered.some(j => j.status === 'failed') && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <XCircle size={18} className="text-danger-500" />
                Jobs Fallidos — Detalle
              </CardTitle>
              <Badge variant="danger" size="sm" dot>
                {filtered.filter(j => j.status === 'failed').length}
              </Badge>
            </CardHeader>
            <div className="space-y-3">
              {filtered.filter(j => j.status === 'failed').map(job => (
                <div key={job.id} className="border border-danger-200 dark:border-danger-800 rounded-lg p-4 bg-danger-50 dark:bg-danger-900/20">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="font-mono text-sm font-bold text-text-primary">{job.name}</span>
                    <Badge variant="primary" size="sm">{job.sid}</Badge>
                  </div>
                  {job.error && (
                    <div className="bg-surface rounded-lg p-3 text-xs font-mono text-danger-700 dark:text-danger-400">
                      <RotateCcw size={12} className="inline mr-1.5" />
                      {job.error}
                    </div>
                  )}
                  <p className="text-xs text-text-tertiary mt-2">
                    Inicio: {job.startedAt ? new Date(job.startedAt).toLocaleString('es-CO', { hour12: false }) : '—'} | Duración: {job.runtime || '—'} | Paso: {job.currentStep}/{job.stepCount}
                  </p>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
