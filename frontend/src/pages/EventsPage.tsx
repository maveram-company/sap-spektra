import { useState, useEffect, useMemo } from 'react';
import Header from '../components/layout/Header';
import PageLoading from '../components/ui/PageLoading';
import Pagination from '../components/ui/Pagination';
import usePagination from '../hooks/usePagination';
import { dataService } from '../services/dataService';
import { Search, Filter, ChevronDown, AlertCircle, AlertTriangle, Info, CheckCircle } from 'lucide-react';

const levelConfig = {
  critical: {
    label: 'Critico',
    icon: AlertCircle,
    bg: 'bg-red-100 dark:bg-red-900/30',
    text: 'text-red-700 dark:text-red-400',
    dot: 'bg-red-500',
  },
  warning: {
    label: 'Warning',
    icon: AlertTriangle,
    bg: 'bg-yellow-100 dark:bg-yellow-900/30',
    text: 'text-yellow-700 dark:text-yellow-400',
    dot: 'bg-yellow-500',
  },
  info: {
    label: 'Info',
    icon: Info,
    bg: 'bg-blue-100 dark:bg-blue-900/30',
    text: 'text-blue-700 dark:text-blue-400',
    dot: 'bg-blue-500',
  },
  success: {
    label: 'Success',
    icon: CheckCircle,
    bg: 'bg-green-100 dark:bg-green-900/30',
    text: 'text-green-700 dark:text-green-400',
    dot: 'bg-green-500',
  },
};

function LevelBadge({ level }) {
  const config = levelConfig[level];
  if (!config) return null;
  const Icon = config.icon;

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${config.bg} ${config.text}`}>
      <Icon size={12} />
      {config.label}
    </span>
  );
}

function formatTimestamp(iso) {
  const date = new Date(iso);
  return date.toLocaleString('es-CO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

export default function EventsPage() {
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState([]);
  const [systems, setSystems] = useState([]);
  const [search, setSearch] = useState('');
  const [levelFilter, setLevelFilter] = useState('all');
  const [systemFilter, setSystemFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all'); // P2.4: SAP vs Platform

  useEffect(() => {
    Promise.all([dataService.getEvents(), dataService.getSystems()]).then(([evts, sys]) => {
      setEvents(evts);
      setSystems(sys);
      setLoading(false);
    });
  }, []);

  const filtered = useMemo(() => {
    return events.filter((evt) => {
      if (levelFilter !== 'all' && evt.level !== levelFilter) return false;
      if (systemFilter !== 'all' && evt.systemId !== systemFilter) return false;
      if (sourceFilter !== 'all' && evt.source !== sourceFilter) return false; // P2.4
      if (search) {
        const q = search.toLowerCase();
        if (
          !evt.message.toLowerCase().includes(q) &&
          !evt.component.toLowerCase().includes(q)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [search, levelFilter, systemFilter, sourceFilter, events]);

  const { items: paginatedEvents, page, totalPages, total, setPage } = usePagination(filtered, 25);

  if (loading) return <PageLoading message="Cargando eventos..." />;

  return (
    <div>
      <Header title="Eventos" subtitle="Registro completo de actividad" />

      <div className="p-6">
        {/* Toolbar */}
        <div className="bg-surface border border-border rounded-xl p-4 mb-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            {/* Search */}
            <div className="relative flex-1 w-full sm:w-auto">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
              <input
                type="text"
                placeholder="Buscar por mensaje o componente..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="w-full bg-surface border border-border rounded-lg pl-9 pr-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>

            {/* Level filter */}
            <div className="relative">
              <Filter size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary pointer-events-none" />
              <select
                value={levelFilter}
                onChange={(e) => {
                  setLevelFilter(e.target.value);
                  setPage(1);
                }}
                className="appearance-none bg-surface border border-border rounded-lg pl-8 pr-8 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 cursor-pointer"
              >
                <option value="all">Todos</option>
                <option value="critical">Critico</option>
                <option value="warning">Warning</option>
                <option value="info">Info</option>
                <option value="success">Success</option>
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary pointer-events-none" />
            </div>

            {/* Source filter (P2.4) */}
            <div className="relative">
              <select
                value={sourceFilter}
                onChange={(e) => {
                  setSourceFilter(e.target.value);
                  setPage(1);
                }}
                className="appearance-none bg-surface border border-border rounded-lg px-3 pr-8 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 cursor-pointer"
              >
                <option value="all">Origen: Todos</option>
                <option value="SAP">SAP</option>
                <option value="Platform">Plataforma</option>
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary pointer-events-none" />
            </div>

            {/* System filter */}
            <div className="relative">
              <select
                value={systemFilter}
                onChange={(e) => {
                  setSystemFilter(e.target.value);
                  setPage(1);
                }}
                className="appearance-none bg-surface border border-border rounded-lg px-3 pr-8 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 cursor-pointer"
              >
                <option value="all">Todos los sistemas</option>
                {systems.map((sys) => (
                  <option key={sys.id} value={sys.id}>
                    {sys.sid} — {sys.id}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary pointer-events-none" />
            </div>

            {/* Count */}
            <div className="sm:ml-auto flex-shrink-0">
              <span className="text-sm text-text-secondary">
                {filtered.length} evento{filtered.length !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-secondary dark:bg-surface-secondary">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-text-tertiary uppercase tracking-wider">
                    Timestamp
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-text-tertiary uppercase tracking-wider">
                    Nivel
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-text-tertiary uppercase tracking-wider">
                    Sistema
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-text-tertiary uppercase tracking-wider">
                    Origen
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-text-tertiary uppercase tracking-wider">
                    Componente
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-text-tertiary uppercase tracking-wider">
                    Mensaje
                  </th>
                </tr>
              </thead>
              <tbody>
                {paginatedEvents.map((evt) => (
                  <tr
                    key={evt.id}
                    className="border-b border-border last:border-0 hover:bg-surface-secondary dark:hover:bg-surface-secondary transition-colors"
                  >
                    <td className="px-4 py-3 text-text-secondary whitespace-nowrap">
                      {formatTimestamp(evt.timestamp)}
                    </td>
                    <td className="px-4 py-3">
                      <LevelBadge level={evt.level} />
                    </td>
                    <td className="px-4 py-3 text-text-primary font-medium whitespace-nowrap">
                      {evt.sid}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                        evt.source === 'SAP'
                          ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                          : 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400'
                      }`}>
                        {evt.source}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-text-secondary whitespace-nowrap">
                      {evt.component}
                    </td>
                    <td className="px-4 py-3 text-text-primary">
                      {evt.message}
                    </td>
                  </tr>
                ))}
                {paginatedEvents.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-text-tertiary">
                      No se encontraron eventos con los filtros seleccionados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="border-t border-border px-4">
            <Pagination page={page} totalPages={totalPages} total={total} onPageChange={setPage} />
          </div>
        </div>
      </div>
    </div>
  );
}
