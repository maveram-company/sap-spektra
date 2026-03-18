import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft, Activity, Clock, Shield, ShieldAlert, AlertTriangle, TrendingUp, Server,
  CheckCircle, XCircle, Database, Cpu, HardDrive, MemoryStick, Users, Zap, Terminal,
  Lock, Layers, FileWarning, Network, Globe, Mail, Radio, Bell, BarChart3
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import Header from '../components/layout/Header';
import Card, { CardHeader, CardTitle } from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import StatusBadge from '../components/ui/StatusBadge';
import HealthGauge from '../components/ui/HealthGauge';
import Button from '../components/ui/Button';
import Select from '../components/ui/Select';
import Tabs from '../components/ui/Tabs';
import Table, { TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/Table';
import PageLoading from '../components/ui/PageLoading';
import { depRemediation, backupRunbooks } from '../lib/constants';
import { dataService } from '../services/dataService';
import { createLogger } from '../lib/logger';
import type { ApiRecord } from '../types';

const log = createLogger('SystemDetailPage');

// ── Local Helpers ──

function colorDot(color: any) {
  const bg =
    color === 'green' ? 'bg-success-500' :
    color === 'yellow' ? 'bg-warning-500' :
    'bg-danger-500';
  return <span className={`inline-block w-2.5 h-2.5 rounded-full ${bg}`} />;
}

function MetricCard({ label, value, sub, warn, danger }: { label: any; value: any; sub?: any; warn?: any; danger?: any }) {
  let textColor = 'text-text-primary';
  if (danger) textColor = 'text-danger-600';
  else if (warn) textColor = 'text-warning-600';
  return (
    <div className="bg-surface-secondary rounded-lg p-3 border border-border">
      <p className="text-[10px] text-text-tertiary uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-lg font-bold leading-tight ${textColor}`}>{value}</p>
      {sub && <p className="text-[10px] text-text-tertiary mt-0.5">{sub}</p>}
    </div>
  );
}

function DepStatusIcon({ status }: { status: any }) {
  if (status === 'ok') return <CheckCircle size={16} className="text-success-500" />;
  if (status === 'warn') return <AlertTriangle size={16} className="text-warning-500" />;
  return <XCircle size={16} className="text-danger-500" />;
}

function pctColor(val: any, warnAt = 70, dangerAt = 85) {
  if (val >= dangerAt) return { warn: false, danger: true };
  if (val >= warnAt) return { warn: true, danger: false };
  return { warn: false, danger: false };
}

function calcUptime(startedAt: any) {
  if (!startedAt) return 'N/A';
  const diffMs = new Date().getTime() - new Date(startedAt).getTime();
  if (diffMs <= 0) return '< 1m';
  const days = Math.floor(diffMs / 86400000);
  const hours = Math.floor((diffMs % 86400000) / 3600000);
  const mins = Math.floor((diffMs % 3600000) / 60000);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

// Color classes for a percentage bar fill
function barColor(val: any, warnAt = 70, dangerAt = 85) {
  if (val >= dangerAt) return 'bg-danger-500';
  if (val >= warnAt) return 'bg-warning-500';
  return 'bg-success-500';
}

// ── Main Component ──

export default function SystemDetailPage() {
  const { t } = useTranslation();
  const { systemId } = useParams();
  const navigate = useNavigate();
  const [system, setSystem] = useState<Record<string, any> | null>(null);
  const [sm, setSm] = useState<Record<string, any> | null>(null);
  const [deps, setDeps] = useState<ApiRecord[]>([]);
  const [sapMon, setSapMon] = useState<Record<string, any> | null>(null);
  const [instancesData, setInstancesData] = useState<ApiRecord[]>([]);
  const [sysMeta, setSysMeta] = useState<Record<string, any> | null>(null);
  const [breachesData, setBreachesData] = useState<ApiRecord[]>([]);
  const [hostsData, setHostsData] = useState<ApiRecord[]>([]);
  const [metricHistoryData, setMetricHistoryData] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [chartRange, setChartRange] = useState('6h');
  const [selectedHost, setSelectedHost] = useState('');
  useEffect(() => {
    let mounted = true;
    Promise.all([
      dataService.getSystemById(systemId),
      dataService.getServerMetrics(systemId),
      dataService.getServerDeps(systemId),
      dataService.getSAPMonitoring(systemId),
      dataService.getSystemInstances(systemId),
      dataService.getSystemMeta(systemId),
      dataService.getSystemBreaches(systemId),
      dataService.getSystemHosts(systemId),
    ]).then(([sys, metrics, dependencies, monitoring, inst, meta, breaches, hosts]) => {
      if (!mounted) return;
      setSystem(sys);
      setSm(metrics);
      setDeps(dependencies || []);
      setSapMon(monitoring);
      setInstancesData(inst || []);
      setSysMeta(meta);
      setBreachesData(breaches);
      setHostsData(hosts);
      // Pre-load metric history for all hosts
      if (hosts && hosts.length) {
        // Fetch metric history for all hosts concurrently (bounded by Promise.all)
        Promise.all(
          hosts.map(async (h: any) => {
            try {
              const hist = await dataService.getMetricHistory(h.hostname);
              return [h.hostname, hist] as const;
            } catch {
              return [h.hostname, []] as const;
            }
          })
        ).then(historyEntries => {
          if (!mounted) return;
          const historyMap: Record<string, typeof historyEntries[0][1]> = {};
          for (const [hostname, hist] of historyEntries) {
            historyMap[hostname] = hist;
          }
          setMetricHistoryData(historyMap);
        }).catch((err: any) => log.warn('Metric history fetch failed', { error: err.message }));
      }
      setLoading(false);
    }).catch((err: any) => {
      log.warn('Fetch failed', { error: err.message });
      if (!mounted) return;
      setError(t('common.error.loadData'));
      setLoading(false);
    });
    return () => { mounted = false; };
  }, [systemId]);

  // Derived data
  const instances = instancesData;
  const systemBreaches = breachesData;
  // Host-grouped data for the Hosts tab
  const hosts = hostsData;

  // Derive effective selected host (fallback to first host if none selected)
  const effectiveHost = selectedHost || (hosts.length ? hosts[0].hostname : '');

  // Unique host count
  const uniqueHostCount = useMemo(() => {
    const names = new Set(instances.map((i: any) => i.hostname));
    return names.size;
  }, [instances]);

  // Chart data per selected host — Date.now() es necesario para labels de tiempo relativo
  const chartData = useMemo(() => {
    if (!effectiveHost) return [];
    const history = metricHistoryData[effectiveHost] || [];
    if (!history.length) return [];
    // Date.now() inside useMemo is intentional: it generates relative time labels for chart
    // x-axis. The memo recomputes only when effectiveHost, chartRange, or metricHistoryData change.
    // eslint-disable-next-line react-hooks/purity
    const now = Date.now();
    const rangeMinutes = chartRange === '1h' ? 60 : chartRange === '3h' ? 180 : 360;
    const pointsToShow = Math.min(history.length, Math.ceil(rangeMinutes / 5));
    const slice = history.slice(history.length - pointsToShow);
    return slice.map((p: any, i: any) => ({
      time: new Date(now - (pointsToShow - 1 - i) * 5 * 60000).toLocaleTimeString('es-CO', {
        hour: '2-digit',
        minute: '2-digit',
      }),
      CPU: p.cpu,
      Memory: p.mem,
      Disk: p.disk,
    }));
  }, [effectiveHost, chartRange, metricHistoryData]);

  if (loading) return <PageLoading message="Cargando sistema..." />;

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

  if (!system) return <div className="p-6 text-text-secondary">Sistema no encontrado</div>;

  const db = sm?.dbInfo;
  const backupRb = db ? (backupRunbooks as Record<string, any>)[db.type] : null;

  // ── Tab definitions (new order with hosts + topology) ──
  const tabs = [
    { value: 'overview',      label: 'Overview' },
    { value: 'hosts',         label: 'Hosts',        count: uniqueHostCount || undefined },
    { value: 'topology',      label: 'Topology' },
    { value: 'sapmonitor',    label: 'SAP Monitor' },
    { value: 'database',      label: 'Database' },
    { value: 'instances',     label: 'Components',   count: instances.length || undefined },
    { value: 'dependencies',  label: 'Dependencies', count: deps.filter((d: any) => d.status !== 'ok').length || undefined },
    { value: 'breaches',      label: 'Breaches',     count: systemBreaches.length || undefined },
  ];

  // ── Render: SAP Application Layer Overview ──

  function renderOverview() {
    if (!sm) return <p className="text-text-secondary p-4">No hay datos de servidor disponibles.</p>;
    const isJava = sm.stack === 'java';

    return (
      <div className="space-y-6">
        {/* SAP Application metrics */}
        <Card>
          <CardHeader>
            <CardTitle>SAP Application Layer</CardTitle>
            <Badge variant="primary" size="sm">{system!.type}</Badge>
          </CardHeader>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            <MetricCard label="Availability" value={`${sm.avail}%`} {...pctColor(sm.avail, 99.0, 98.0)} />
            <div className="bg-surface-secondary rounded-lg p-3 border border-border">
              <p className="text-[10px] text-text-tertiary uppercase tracking-wider mb-1">Mon. Status</p>
              <div className="flex items-center gap-2">
                {colorDot(sm.monSt)}
                <span className="text-sm font-medium text-text-primary capitalize">
                  {sm.monSt === 'green' ? 'OK' : sm.monSt === 'yellow' ? 'Warning' : 'Critical'}
                </span>
              </div>
            </div>
            <div className="bg-surface-secondary rounded-lg p-3 border border-border">
              <p className="text-[10px] text-text-tertiary uppercase tracking-wider mb-1">Mon. Performance</p>
              <div className="flex items-center gap-2">
                {colorDot(sm.monPerf)}
                <span className="text-sm font-medium text-text-primary capitalize">
                  {sm.monPerf === 'green' ? 'OK' : sm.monPerf === 'yellow' ? 'Warning' : 'Critical'}
                </span>
              </div>
            </div>
            <MetricCard
              label="Logged Users"
              value={sm.users}
              sub={<span className="inline-flex items-center gap-1"><Users size={10} /> sessions</span>}
            />
            {isJava ? (
              <>
                <div className="bg-surface-secondary rounded-lg p-3 border border-border">
                  <p className="text-[10px] text-text-tertiary uppercase tracking-wider mb-1">JVM Heap</p>
                  <p className="text-lg font-bold text-text-primary leading-tight">
                    {sm.jvm?.heapUsed ?? 0} / {sm.jvm?.heapMax ?? 0} GB
                  </p>
                  <div className="h-1.5 bg-surface-tertiary rounded-full overflow-hidden mt-1">
                    <div
                      className={`h-full rounded-full ${(sm.jvm?.heapMax ?? 0) > 0 && (sm.jvm?.heapUsed ?? 0) / sm.jvm.heapMax > 0.85 ? 'bg-danger-500' : (sm.jvm?.heapMax ?? 0) > 0 && (sm.jvm?.heapUsed ?? 0) / sm.jvm.heapMax > 0.7 ? 'bg-warning-500' : 'bg-success-500'}`}
                      style={{ width: `${(sm.jvm?.heapMax ?? 0) > 0 ? ((sm.jvm?.heapUsed ?? 0) / sm.jvm.heapMax * 100) : 0}%` }}
                    />
                  </div>
                </div>
                <div className="bg-surface-secondary rounded-lg p-3 border border-border">
                  <p className="text-[10px] text-text-tertiary uppercase tracking-wider mb-1">Threads</p>
                  <p className="text-lg font-bold text-text-primary leading-tight">{sm.jvm?.threads ?? 0}</p>
                  <div className="flex gap-2 mt-1 text-[10px]">
                    <span className="text-text-tertiary">max {sm.jvm?.threadsMax ?? 0}</span>
                    <span className={(sm.jvm?.gcPausePct ?? 0) > 5 ? 'text-danger-600' : 'text-text-tertiary'}>GC {sm.jvm?.gcPausePct ?? 0}%</span>
                  </div>
                </div>
                <MetricCard label="ICM Connections" value={sm.icm.connections} sub={`max ${sm.icm.connectionsMax}`} />
                <MetricCard label="Avg Response" value={`${sm.icm.avgResponseMs} ms`} {...pctColor(sm.icm.avgResponseMs, 200, 500)} />
              </>
            ) : (
              <>
                <div className="bg-surface-secondary rounded-lg p-3 border border-border">
                  <p className="text-[10px] text-text-tertiary uppercase tracking-wider mb-1">Dialog WPs</p>
                  <p className="text-lg font-bold text-text-primary leading-tight">{sm.dialogWP?.total ?? 0}</p>
                  <div className="flex gap-2 mt-1 text-[10px]">
                    <span className="text-success-600">{sm.dialogWP?.active ?? 0} act</span>
                    <span className="text-text-tertiary">{sm.dialogWP?.free ?? 0} free</span>
                    <span className={(sm.dialogWP?.hold ?? 0) > 0 ? 'text-warning-600' : 'text-text-tertiary'}>{sm.dialogWP?.hold ?? 0} hold</span>
                  </div>
                </div>
                <MetricCard label="Last Min Load" value={(sm.lastMinLoad ?? 0).toLocaleString()} sub="dialog steps/min" />
              </>
            )}
            <MetricCard label="Avg DB Time" value={`${sm.avgDbTime} ms`} {...pctColor(sm.avgDbTime, 15, 25)} />
            <MetricCard label="Free Mem %" value={`${sm.freeMemPct}%`} warn={sm.freeMemPct < 25} danger={sm.freeMemPct < 15} />
          </div>
        </Card>

        {/* Java stack: Message Queue & Channels / ABAP stack: Response Distribution */}
        {isJava ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Message Queue</CardTitle>
                <span className="text-xs text-text-tertiary">{(sm.msgQueue?.processed24h ?? 0).toLocaleString()} processed (24h)</span>
              </CardHeader>
              <div className="space-y-3">
                {[
                  { label: 'Pending', value: sm.msgQueue?.pending ?? 0, color: 'bg-warning-500', max: 100 },
                  { label: 'Failed', value: sm.msgQueue?.failed ?? 0, color: 'bg-danger-500', max: 50 },
                ].map(({ label, value, color, max }: any) => (
                  <div key={label}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-text-secondary font-medium flex items-center gap-1.5">
                        <span className={`inline-block w-2.5 h-2.5 rounded-full ${color}`} />
                        {label}
                      </span>
                      <span className="text-text-tertiary">{value}</span>
                    </div>
                    <div className="h-2.5 bg-surface-tertiary rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min((value / max) * 100, 100)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Channels</CardTitle>
                <span className="text-xs text-text-tertiary">{(sm.channels?.active ?? 0) + (sm.channels?.inactive ?? 0) + (sm.channels?.error ?? 0)} total</span>
              </CardHeader>
              <div className="space-y-3">
                {[
                  { label: 'Active', value: sm.channels?.active ?? 0, color: 'bg-success-500' },
                  { label: 'Inactive', value: sm.channels?.inactive ?? 0, color: 'bg-warning-500' },
                  { label: 'Error', value: sm.channels?.error ?? 0, color: 'bg-danger-500' },
                ].map(({ label, value, color }: any) => {
                  const total = (sm.channels?.active ?? 0) + (sm.channels?.inactive ?? 0) + (sm.channels?.error ?? 0);
                  return (
                    <div key={label}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-text-secondary font-medium flex items-center gap-1.5">
                          <span className={`inline-block w-2.5 h-2.5 rounded-full ${color}`} />
                          {label}
                        </span>
                        <span className="text-text-tertiary">{value} ({total > 0 ? ((value / total) * 100).toFixed(0) : 0}%)</span>
                      </div>
                      <div className="h-2.5 bg-surface-tertiary rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${color}`} style={{ width: `${total > 0 ? (value / total) * 100 : 0}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Response Distribution</CardTitle>
              <span className="text-xs text-text-tertiary">{((sm.respDist?.Dialog ?? 0) + (sm.respDist?.Update ?? 0) + (sm.respDist?.Background ?? 0) + (sm.respDist?.RFC ?? 0)).toLocaleString()} dialog steps</span>
            </CardHeader>
            <div className="space-y-3">
              {Object.entries(sm.respDist ?? {}).map(([key, val]: [string, any]) => {
                const rdTotal = (sm.respDist?.Dialog ?? 0) + (sm.respDist?.Update ?? 0) + (sm.respDist?.Background ?? 0) + (sm.respDist?.RFC ?? 0);
                const pct = rdTotal > 0 ? ((val / rdTotal) * 100).toFixed(1) : '0.0';
                const colors = {
                  Dialog: 'bg-primary-500',
                  Update: 'bg-accent-500',
                  Background: 'bg-warning-500',
                  RFC: 'bg-success-500',
                };
                return (
                  <div key={key}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-text-secondary font-medium flex items-center gap-1.5">
                        <span className={`inline-block w-2.5 h-2.5 rounded-full ${(colors as Record<string, string>)[key] || 'bg-primary-500'}`} />
                        {key}
                      </span>
                      <span className="text-text-tertiary">{val} ({pct}%)</span>
                    </div>
                    <div className="h-2.5 bg-surface-tertiary rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${(colors as Record<string, string>)[key] || 'bg-primary-500'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {/* Quick stats row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {isJava ? (
            <Card>
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  sm.msgQueue.failed > 10 ? 'bg-danger-100 text-danger-600' :
                  sm.msgQueue.failed > 0 ? 'bg-warning-100 text-warning-600' :
                  'bg-success-50 text-success-600'
                }`}>
                  <AlertTriangle size={20} />
                </div>
                <div>
                  <p className="text-xs text-text-tertiary">Failed Messages</p>
                  <p className={`text-xl font-bold ${
                    sm.msgQueue.failed > 10 ? 'text-danger-600' :
                    sm.msgQueue.failed > 0 ? 'text-warning-600' :
                    'text-text-primary'
                  }`}>{sm.msgQueue.failed}</p>
                </div>
              </div>
            </Card>
          ) : (
            <Card>
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  sm.shortDumps > 50 ? 'bg-danger-100 text-danger-600' :
                  sm.shortDumps > 10 ? 'bg-warning-100 text-warning-600' :
                  'bg-success-50 text-success-600'
                }`}>
                  <AlertTriangle size={20} />
                </div>
                <div>
                  <p className="text-xs text-text-tertiary">Short Dumps (24h)</p>
                  <p className={`text-xl font-bold ${
                    sm.shortDumps > 50 ? 'text-danger-600' :
                    sm.shortDumps > 10 ? 'text-warning-600' :
                    'text-text-primary'
                  }`}>{sm.shortDumps}</p>
                </div>
              </div>
            </Card>
          )}
          <Card>
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                sm.failedJobs > 0 ? 'bg-danger-100 text-danger-600' : 'bg-success-50 text-success-600'
              }`}>
                <Zap size={20} />
              </div>
              <div>
                <p className="text-xs text-text-tertiary">Failed Jobs (24h)</p>
                <p className={`text-xl font-bold ${sm.failedJobs > 0 ? 'text-danger-600' : 'text-text-primary'}`}>
                  {sm.failedJobs}
                </p>
              </div>
            </div>
          </Card>
          <Card>
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                sm.ping ? 'bg-success-50 text-success-600' : 'bg-danger-100 text-danger-600'
              }`}>
                <Activity size={20} />
              </div>
              <div>
                <p className="text-xs text-text-tertiary">Ping Status</p>
                <p className={`text-xl font-bold ${sm.ping ? 'text-success-600' : 'text-danger-600'}`}>
                  {sm.ping ? 'OK' : 'FAIL'}
                </p>
              </div>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  // ── Render: OS Metrics per Host (new) ──

  function renderHosts() {
    if (!hosts.length) {
      return <p className="text-text-secondary p-4">No hay datos de hosts disponibles.</p>;
    }

    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <Globe size={16} className="text-text-tertiary" />
          <p className="text-sm text-text-secondary">
            {hosts.length} host{hosts.length !== 1 ? 's' : ''} — {instances.length} instance{instances.length !== 1 ? 's' : ''} total
          </p>
        </div>

        {/* Metric History chart — hidden for RISE_RESTRICTED (no OS-level metrics) */}
        {system!.isRiseRestricted ? (
          <Card>
            <div className="flex flex-col items-center gap-2 py-6">
              <ShieldAlert size={24} className="text-text-tertiary" />
              <p className="text-sm font-medium text-text-primary">SAP RISE — Infraestructura gestionada</p>
              <p className="text-xs text-text-tertiary text-center max-w-md">
                Las metricas de infraestructura (CPU, Memoria, Disco) no estan disponibles para sistemas
                SAP RISE. SAP gestiona la infraestructura subyacente.
              </p>
            </div>
          </Card>
        ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp size={18} />
              Metric History
            </CardTitle>
            <div className="flex items-center gap-2">
              <Select
                value={effectiveHost}
                onChange={(e) => setSelectedHost(e.target.value)}
                options={hosts.map((h: any) => ({ value: h.hostname, label: h.hostname }))}
              />
              <Select
                value={chartRange}
                onChange={(e) => setChartRange(e.target.value)}
                options={[
                  { value: '1h', label: 'Last 1h' },
                  { value: '3h', label: 'Last 3h' },
                  { value: '6h', label: 'Last 6h' },
                ]}
              />
            </div>
          </CardHeader>
          <div className="h-80">
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="time" stroke="var(--color-text-tertiary)" fontSize={11} interval="preserveStartEnd" />
                  <YAxis stroke="var(--color-text-tertiary)" fontSize={11} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                  <Tooltip
                    contentStyle={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '8px', fontSize: '12px' }}
                    formatter={(value) => [`${value}%`]}
                  />
                  <Legend />
                  <Line type="monotone" dataKey="CPU"    stroke="#3b82f6" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="Memory" stroke="#8b5cf6" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="Disk"   stroke="#f59e0b" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-text-tertiary">
                No hay datos de historial
              </div>
            )}
          </div>
          {chartData.length > 0 && (
            <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-border">
              <div className="text-center">
                <div className="flex items-center justify-center gap-1.5 mb-1">
                  <Cpu size={14} className="text-blue-500" />
                  <span className="text-xs text-text-tertiary">CPU</span>
                </div>
                <p className="text-lg font-bold text-text-primary">{chartData[chartData.length - 1].CPU}%</p>
              </div>
              <div className="text-center">
                <div className="flex items-center justify-center gap-1.5 mb-1">
                  <MemoryStick size={14} className="text-purple-500" />
                  <span className="text-xs text-text-tertiary">Memory</span>
                </div>
                <p className="text-lg font-bold text-text-primary">{chartData[chartData.length - 1].Memory}%</p>
              </div>
              <div className="text-center">
                <div className="flex items-center justify-center gap-1.5 mb-1">
                  <HardDrive size={14} className="text-amber-500" />
                  <span className="text-xs text-text-tertiary">Disk</span>
                </div>
                <p className="text-lg font-bold text-text-primary">{chartData[chartData.length - 1].Disk}%</p>
              </div>
            </div>
          )}
        </Card>
        )}

        {hosts.map((host: any) => {
          // Determine card header accent based on worst metric (skip for RISE)
          const cpuDanger  = !system!.isRiseRestricted && host.cpu  >= 85;
          const cpuWarn    = !system!.isRiseRestricted && host.cpu  >= 70;
          const memDanger  = !system!.isRiseRestricted && host.mem  >= 85;
          const memWarn    = !system!.isRiseRestricted && host.mem  >= 70;
          const diskDanger = !system!.isRiseRestricted && host.disk >= 85;
          const diskWarn   = !system!.isRiseRestricted && host.disk >= 70;
          const anyDanger  = cpuDanger || memDanger || diskDanger;
          const anyWarn    = cpuWarn   || memWarn   || diskWarn;

          const headerAccent = anyDanger
            ? 'border-l-4 border-l-danger-500'
            : anyWarn
            ? 'border-l-4 border-l-warning-500'
            : 'border-l-4 border-l-success-500';

          return (
            <Card key={host.hostname} className={headerAccent}>
              {/* Host header info */}
              <CardHeader>
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Server size={16} className="text-text-tertiary" />
                    <span className="font-mono">{host.hostname}</span>
                    {anyDanger && <Badge variant="danger" size="sm">Critical</Badge>}
                    {!anyDanger && anyWarn && <Badge variant="warning" size="sm">Warning</Badge>}
                    {!anyDanger && !anyWarn && <Badge variant="success" size="sm">OK</Badge>}
                  </CardTitle>
                  <div className="flex flex-wrap gap-4 mt-1 text-xs text-text-tertiary">
                    <span>IP: <span className="font-mono text-text-secondary">{host.ip}</span></span>
                    <span>OS: <span className="text-text-secondary">{host.os}</span></span>
                    <span>EC2: <span className="font-mono text-text-secondary">{host.ec2Id}</span></span>
                    <span>Type: <span className="text-text-secondary">{host.ec2Type}</span></span>
                    <span>Zone: <span className="text-text-secondary">{host.zone}</span></span>
                  </div>
                </div>
              </CardHeader>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Metric bars — hidden for RISE_RESTRICTED */}
                {system!.isRiseRestricted ? (
                <div className="flex items-center justify-center text-xs text-text-tertiary py-4">
                  Metricas OS no disponibles (SAP RISE)
                </div>
                ) : (
                <div className="space-y-3">
                  {[
                    { label: 'CPU', value: host.cpu, icon: <Cpu size={12} /> },
                    { label: 'Memory', value: host.mem, icon: <MemoryStick size={12} /> },
                    { label: 'Disk', value: host.disk, icon: <HardDrive size={12} /> },
                  ].map(({ label, value, icon }: any) => (
                    <div key={label}>
                      <div className="flex justify-between items-center text-xs mb-1">
                        <span className="flex items-center gap-1 text-text-secondary font-medium">
                          {icon} {label}
                        </span>
                        <span className={`font-bold ${
                          value >= 85 ? 'text-danger-600' :
                          value >= 70 ? 'text-warning-600' :
                          'text-text-primary'
                        }`}>{value}%</span>
                      </div>
                      <div className="h-2 bg-surface-tertiary rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${barColor(value)}`}
                          style={{ width: `${Math.min(value, 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                  <div className="flex justify-between items-center text-xs mt-1">
                    <span className="flex items-center gap-1 text-text-secondary font-medium">
                      <Activity size={12} /> Availability
                    </span>
                    <span className={`font-bold ${
                      host.availability < 98 ? 'text-danger-600' :
                      host.availability < 99.5 ? 'text-warning-600' :
                      'text-success-600'
                    }`}>{host.availability}%</span>
                  </div>
                </div>
                )}

                {/* Instances on this host */}
                <div>
                  <p className="text-[10px] text-text-tertiary uppercase tracking-wider mb-2">
                    Instances on this host
                  </p>
                  <div className="space-y-1.5">
                    {(host.instances || []).map((inst: any, idx: any) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between rounded-md px-3 py-2 bg-surface-secondary border border-border"
                      >
                        <div className="flex items-center gap-2">
                          <span className={`inline-block w-2 h-2 rounded-full ${
                            inst.status === 'running' ? 'bg-success-500' : 'bg-danger-500'
                          }`} />
                          <span className="text-sm font-medium text-text-primary">{inst.role}</span>
                          <span className="text-xs text-text-tertiary font-mono">#{inst.nr}</span>
                        </div>
                        <Badge
                          variant={inst.status === 'running' ? 'success' : 'danger'}
                          size="sm"
                        >
                          {inst.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    );
  }

  // ── Render: Instance Topology (new) ──

  function renderTopology() {
    if (!instances.length) {
      return <p className="text-text-secondary p-4">No hay datos de topologia disponibles.</p>;
    }

    // Classify instances into layers
    const appRoles  = ['ASCS', 'ERS', 'PAS', 'AAS'];
    const dbRoles   = ['HANA Primary', 'HANA Secondary', 'HANA', 'DB2', 'Oracle', 'MSSQL', 'ASE', 'MaxDB'];

    const appLayer = instances.filter((i: any) => appRoles.includes(i.role));
    const knownRoles = new Set([...appRoles, ...dbRoles]);
    const otherLayer = instances.filter((i: any) => !knownRoles.has(i.role));
    const actualDbLayer = instances.filter((i: any) => dbRoles.includes(i.role));

    function InstanceBox({ inst }: { inst: any }) {
      const isRunning = inst.status === 'running';
      return (
        <div className={`
          rounded-lg border-2 p-3 min-w-[140px] bg-surface-secondary
          ${isRunning ? 'border-success-500' : 'border-danger-500'}
        `}>
          <div className="flex items-center gap-1.5 mb-2">
            <span className={`inline-block w-2.5 h-2.5 rounded-full ${
              isRunning ? 'bg-success-500' : 'bg-danger-500'
            }`} />
            <span className={`text-xs font-bold ${
              isRunning ? 'text-success-600' : 'text-danger-600'
            }`}>
              {inst.role}
            </span>
          </div>
          <p className="text-[10px] text-text-tertiary uppercase tracking-wider mb-0.5">Instance</p>
          <p className="text-sm font-mono font-semibold text-text-primary">#{inst.nr}</p>
          <p className="text-[10px] text-text-tertiary mt-1.5 truncate" title={inst.hostname}>
            {inst.hostname}
          </p>
          <p className="text-[10px] font-mono text-text-tertiary">{inst.ip}</p>
          {inst.zone && (
            <p className="text-[10px] text-text-tertiary mt-1">{inst.zone}</p>
          )}
        </div>
      );
    }

    function LayerSection({ title, layerInstances, colorClass, icon }: { title: any; layerInstances: any; colorClass: any; icon: any }) {
      if (!layerInstances.length) return null;
      return (
        <div className={`rounded-xl border-2 ${colorClass} p-4`}>
          <div className="flex items-center gap-2 mb-4">
            {icon}
            <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
            <Badge variant="primary" size="sm">{layerInstances.length} instance{layerInstances.length !== 1 ? 's' : ''}</Badge>
          </div>
          <div className="flex flex-wrap gap-3">
            {layerInstances.map((inst: any, idx: any) => (
              <InstanceBox key={idx} inst={inst} />
            ))}
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Network size={18} />
              Instance Topology
            </CardTitle>
            <div className="flex items-center gap-3 text-xs text-text-tertiary">
              <span className="flex items-center gap-1">
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-success-500" /> Running
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-danger-500" /> Stopped
              </span>
            </div>
          </CardHeader>

          <div className="space-y-6">
            {/* SAP Application Layer */}
            <LayerSection
              title="SAP Application Layer"
              layerInstances={appLayer}
              colorClass="border-primary-300 bg-primary-50/30"
              icon={<Server size={16} className="text-primary-500" />}
            />

            {/* Connector arrow between layers */}
            {appLayer.length > 0 && actualDbLayer.length > 0 && (
              <div className="flex flex-col items-center gap-1 py-2">
                <div className="w-px h-4 bg-border" />
                <div className="flex items-center gap-2 text-xs text-text-tertiary">
                  <div className="h-px w-16 bg-border" />
                  <Database size={14} className="text-text-tertiary" />
                  <span>DB Connection</span>
                  <div className="h-px w-16 bg-border" />
                </div>
                <div className="w-px h-4 bg-border" />
              </div>
            )}

            {/* Database Layer */}
            <LayerSection
              title="Database Layer"
              layerInstances={actualDbLayer}
              colorClass="border-accent-300 bg-accent-50/30"
              icon={<Database size={16} className="text-accent-500" />}
            />

            {/* Other / unknown roles */}
            {otherLayer.length > 0 && (
              <LayerSection
                title="Other Instances"
                layerInstances={otherLayer}
                colorClass="border-border bg-surface-secondary/50"
                icon={<Layers size={16} className="text-text-tertiary" />}
              />
            )}
          </div>

          {/* System summary footer */}
          <div className="mt-6 pt-4 border-t border-border grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
            <div>
              <p className="text-[10px] text-text-tertiary uppercase tracking-wider">Total Instances</p>
              <p className="text-lg font-bold text-text-primary">{instances.length}</p>
            </div>
            <div>
              <p className="text-[10px] text-text-tertiary uppercase tracking-wider">Unique Hosts</p>
              <p className="text-lg font-bold text-text-primary">{uniqueHostCount}</p>
            </div>
            <div>
              <p className="text-[10px] text-text-tertiary uppercase tracking-wider">Running</p>
              <p className="text-lg font-bold text-success-600">
                {instances.filter((i: any) => i.status === 'running').length}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-text-tertiary uppercase tracking-wider">Stopped</p>
              <p className={`text-lg font-bold ${
                instances.filter((i: any) => i.status !== 'running').length > 0 ? 'text-danger-600' : 'text-text-primary'
              }`}>
                {instances.filter((i: any) => i.status !== 'running').length}
              </p>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  // ── Render: Database ──

  function renderDatabase() {
    if (!sm || !db) return <p className="text-text-secondary p-4">No hay datos de base de datos.</p>;

    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database size={20} />
              {db.type} Database
            </CardTitle>
            <Badge variant="primary" size="sm">{db.version}</Badge>
          </CardHeader>

          {db.type === 'HANA'   && renderHanaPanel()}
          {db.type === 'ASE'    && renderAsePanel()}
          {db.type === 'MaxDB'  && renderMaxdbPanel()}
          {db.type === 'Oracle' && renderOraclePanel()}
          {db.type === 'MSSQL'  && renderMssqlPanel()}
          {db.type === 'DB2'    && renderDb2Panel()}
        </Card>

        {backupRb && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Terminal size={18} />
                Backup Command
              </CardTitle>
              <Badge variant="info" size="sm">{backupRb.rb}</Badge>
            </CardHeader>
            <div className="bg-gray-900 text-green-400 rounded-lg p-4 font-mono text-sm overflow-x-auto">
              <span className="text-gray-500 select-none">$ </span>{backupRb.cmd}
            </div>
          </Card>
        )}
      </div>
    );
  }

  function renderHanaPanel() {
    const a = db?.alerts || { errors: 0, high: 0, medium: 0 };
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
        <MetricCard label="Version" value={db.version} />
        <MetricCard label="Backup Age" value={`${db.backupHrs}h`} warn={db.backupHrs > 12} danger={db.backupHrs > 24} />
        <div className="bg-surface-secondary rounded-lg p-3 border border-border">
          <p className="text-[10px] text-text-tertiary uppercase tracking-wider mb-1">Alerts Grid</p>
          <div className="flex gap-3 text-sm">
            <span className={a.errors > 0 ? 'text-danger-600 font-bold' : 'text-text-tertiary'}>{a.errors} err</span>
            <span className={a.high > 0 ? 'text-warning-600 font-bold' : 'text-text-tertiary'}>{a.high} high</span>
            <span className={a.medium > 0 ? 'text-yellow-500 font-medium' : 'text-text-tertiary'}>{a.medium} med</span>
          </div>
        </div>
        <div className="bg-surface-secondary rounded-lg p-3 border border-border">
          <p className="text-[10px] text-text-tertiary uppercase tracking-wider mb-1">HSR Status</p>
          <div className="flex items-center gap-2">
            {db.hsrSt ? (
              <>
                {colorDot(db.hsrSt === 'SOK' ? 'green' : db.hsrSt === 'SFAIL' ? 'red' : 'yellow')}
                <span className="text-sm font-bold text-text-primary">{db.hsrSt}</span>
              </>
            ) : (
              <span className="text-sm text-text-tertiary">N/A</span>
            )}
          </div>
        </div>
        <MetricCard label="HSR Mode" value={db.hsrMode ? db.hsrMode.toUpperCase() : 'N/A'} />
        {db.hsrLag !== undefined && db.hsrLag !== null && (
          <MetricCard label="HSR Lag" value={`${db.hsrLag}s`} sub="replication delay" warn={db.hsrLag > 5} danger={db.hsrLag > 30} />
        )}
        <MetricCard label="CPU DB" value={`${db.cpuDb}%`} {...pctColor(db.cpuDb)} />
        <MetricCard label="RAM %" value={`${db.ramPct}%`} {...pctColor(db.ramPct, 75, 90)} />
        <MetricCard label="Disk Data" value={`${db.diskData}%`} {...pctColor(db.diskData, 75, 90)} />
        <MetricCard label="Disk Log" value={`${db.diskLog}%`} {...pctColor(db.diskLog, 70, 85)} />
        <MetricCard label="Disk Trace" value={`${db.diskTrace}%`} {...pctColor(db.diskTrace, 60, 80)} />
        <MetricCard label="Connections" value={db.connections} />
      </div>
    );
  }

  function renderAsePanel() {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        <MetricCard label="Version" value={db.version} />
        <MetricCard label="Backup Age" value={`${db.backupHrs}h`} warn={db.backupHrs > 12} danger={db.backupHrs > 24} />
        <MetricCard label="State" value={db.state} />
        <MetricCard label="Cache Hit %" value={`${db.cacheHitPct}%`} warn={db.cacheHitPct < 95} danger={db.cacheHitPct < 90} />
        <MetricCard label="Blocking Chains" value={db.blockingChains} warn={db.blockingChains > 0} danger={db.blockingChains > 3} />
        <MetricCard label="TxLog %" value={`${db.txLogPct}%`} {...pctColor(db.txLogPct, 60, 80)} />
        <MetricCard label="Phys Data %" value={`${db.physDataPct}%`} {...pctColor(db.physDataPct, 70, 85)} />
        <MetricCard label="Phys Log %" value={`${db.physLogPct}%`} {...pctColor(db.physLogPct, 60, 80)} />
      </div>
    );
  }

  function renderMaxdbPanel() {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        <MetricCard label="Version" value={db.version} />
        <MetricCard label="Backup Age" value={`${db.backupHrs}h`} warn={db.backupHrs > 12} danger={db.backupHrs > 24} />
        <MetricCard label="Data Vol %" value={`${db.dataVolPct}%`} {...pctColor(db.dataVolPct, 70, 85)} />
        <MetricCard label="Log Vol %" value={`${db.logVolPct}%`} {...pctColor(db.logVolPct, 60, 80)} />
        <MetricCard label="Cache Hit %" value={`${db.cacheHitPct}%`} warn={db.cacheHitPct < 95} danger={db.cacheHitPct < 90} />
        <MetricCard label="Lock Wait %" value={`${db.lockWaitPct}%`} warn={db.lockWaitPct > 1} danger={db.lockWaitPct > 5} />
        <MetricCard label="Sessions" value={db.sessions} />
        <MetricCard label="State" value={db.state} />
      </div>
    );
  }

  function renderOraclePanel() {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        <MetricCard label="Version" value={db.version} />
        <MetricCard label="Backup Age" value={`${db.backupHrs}h`} warn={db.backupHrs > 12} danger={db.backupHrs > 24} />
        <MetricCard label="State" value={db.state} />
        <MetricCard label="Tablespace %" value={`${db.tablespacePct}%`} {...pctColor(db.tablespacePct, 70, 85)} />
        <MetricCard label="Blocked Sessions" value={db.blockedSessions} warn={db.blockedSessions > 0} danger={db.blockedSessions > 5} />
      </div>
    );
  }

  function renderMssqlPanel() {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        <MetricCard label="Version" value={db.version} />
        <MetricCard label="Backup Age" value={`${db.backupHrs}h`} warn={db.backupHrs > 12} danger={db.backupHrs > 24} />
        <MetricCard label="State" value={db.state} />
        <MetricCard label="Log %" value={`${db.logPct}%`} {...pctColor(db.logPct, 60, 80)} />
        <MetricCard label="Data %" value={`${db.dataPct}%`} {...pctColor(db.dataPct, 70, 85)} />
      </div>
    );
  }

  function renderDb2Panel() {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        <MetricCard label="Version" value={db.version} />
        <MetricCard label="Backup Age" value={`${db.backupHrs}h`} warn={db.backupHrs > 12} danger={db.backupHrs > 24} />
        <MetricCard label="State" value={db.state} />
        <MetricCard label="Tablespace %" value={`${db.tablespacePct}%`} {...pctColor(db.tablespacePct, 70, 85)} />
        <MetricCard label="Log %" value={`${db.logPct}%`} {...pctColor(db.logPct, 60, 80)} />
      </div>
    );
  }


  // ── Render: Dependencies ──

  function renderDependencies() {
    if (!deps.length) return <p className="text-text-secondary p-4">No hay datos de dependencias.</p>;

    const hasIssues = deps.some((d: any) => d.status !== 'ok');

    return (
      <div className="space-y-6">
        <Card padding="none">
          <Table>
            <TableHeader>
              <tr>
                <TableHead>Dependency</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Detail</TableHead>
              </tr>
            </TableHeader>
            <TableBody>
              {deps.map((dep: any, i: any) => (
                <TableRow key={i}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Server size={14} className="text-text-tertiary" />
                      <span className="font-medium text-sm">{dep.name}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <DepStatusIcon status={dep.status} />
                      <span className={`text-sm font-medium ${
                        dep.status === 'ok'   ? 'text-success-600' :
                        dep.status === 'warn' ? 'text-warning-600' :
                        'text-danger-600'
                      }`}>
                        {dep.status === 'ok' ? 'OK' : dep.status === 'warn' ? 'Warning' : 'Error'}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-text-secondary">{dep.detail}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>

        {hasIssues && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield size={18} />
                Remediation Steps
              </CardTitle>
            </CardHeader>
            <div className="space-y-4">
              {deps
                .filter((d: any) => d.status === 'err' || d.status === 'warn')
                .map((dep: any, i: any) => {
                  const remediation = (depRemediation as Record<string, any>)[dep.name];
                  return (
                    <div key={i} className="border border-border rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <DepStatusIcon status={dep.status} />
                        <span className="font-semibold text-sm text-text-primary">{dep.name}</span>
                        <Badge variant={dep.status === 'err' ? 'danger' : 'warning'} size="sm">
                          {dep.status === 'err' ? 'Error' : 'Warning'}
                        </Badge>
                      </div>
                      {remediation ? (
                        <div className="bg-surface-secondary rounded-lg p-3 text-xs text-text-secondary font-mono leading-relaxed whitespace-pre-wrap">
                          {remediation}
                        </div>
                      ) : (
                        <p className="text-xs text-text-tertiary italic">
                          No hay pasos de remediacion disponibles para esta dependencia.
                        </p>
                      )}
                    </div>
                  );
                })}
            </div>
          </Card>
        )}
      </div>
    );
  }

  // ── Render: SAP Monitor ──

  function renderSAPMonitor() {
    if (!sapMon) return <p className="text-text-secondary p-4">No hay datos de monitoreo SAP disponibles.</p>;

    // Java stack (PI/PO) — NWA-style monitors instead of ABAP transactions
    if (sapMon.javaStack) {
      const { messageMonitor: mm = {}, channelMonitor: cm = {}, alertInbox: ai = {}, cacheStats: cs = {} } = sapMon || {};
      return (
        <div className="space-y-6">
          {/* Message Monitor */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail size={18} />
                Message Monitor (24h)
              </CardTitle>
              <span className="text-xs text-text-tertiary">{(mm?.total24h ?? 0).toLocaleString()} messages processed</span>
            </CardHeader>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 mb-4">
              <MetricCard label="Total (24h)" value={(mm?.total24h ?? 0).toLocaleString()} />
              <MetricCard label="Success" value={(mm?.success ?? 0).toLocaleString()} />
              <MetricCard label="Error" value={mm.error} warn={mm.error > 10} danger={mm.error > 50} />
              <MetricCard label="Waiting" value={mm.waiting} warn={mm.waiting > 50} danger={mm.waiting > 200} />
              <MetricCard label="In Process" value={mm.inProcess} />
              <MetricCard label="Error Rate" value={`${mm.errorRate}%`} warn={mm.errorRate > 0.5} danger={mm.errorRate > 2} />
            </div>
            {/* Top Interfaces */}
            <div className="mb-4">
              <p className="text-xs text-text-tertiary uppercase tracking-wider mb-2">Top Interfaces (by volume)</p>
              <Table>
                <TableHeader>
                  <tr>
                    <TableHead>Interface</TableHead>
                    <TableHead>Namespace</TableHead>
                    <TableHead>Messages (24h)</TableHead>
                    <TableHead>Errors</TableHead>
                  </tr>
                </TableHeader>
                <TableBody>
                  {(mm.topInterfaces || []).map((iface: any, i: any) => (
                    <TableRow key={i}>
                      <TableCell className="font-mono text-sm">{iface.name}</TableCell>
                      <TableCell className="text-xs text-text-tertiary truncate max-w-[200px]">{iface.namespace}</TableCell>
                      <TableCell className="text-sm">{(iface.messages24h ?? 0).toLocaleString()}</TableCell>
                      <TableCell>
                        <span className={iface.errors > 0 ? 'text-danger-600 font-semibold' : 'text-text-secondary'}>{iface.errors}</span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {/* Top Errors */}
            {(mm.topErrors || []).length > 0 && (
              <div>
                <p className="text-xs text-text-tertiary uppercase tracking-wider mb-2">Recent Errors</p>
                <Table>
                  <TableHeader>
                    <tr>
                      <TableHead>Interface</TableHead>
                      <TableHead>Error</TableHead>
                      <TableHead>Count</TableHead>
                      <TableHead>Last Occurred</TableHead>
                    </tr>
                  </TableHeader>
                  <TableBody>
                    {(mm.topErrors || []).map((err: any, i: any) => (
                      <TableRow key={i}>
                        <TableCell className="font-mono text-sm">{err.interface}</TableCell>
                        <TableCell className="text-sm text-danger-600 max-w-[300px] truncate">{err.error}</TableCell>
                        <TableCell className="font-semibold">{err.count}</TableCell>
                        <TableCell className="text-sm text-text-tertiary">
                          {new Date(err.lastOccurred).toLocaleString('es-CO', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </Card>

          {/* Communication Channel Monitor */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Radio size={18} />
                Communication Channels
              </CardTitle>
            </CardHeader>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              <MetricCard label="Total" value={cm.total} />
              <MetricCard label="Active" value={cm.active} />
              <MetricCard label="Inactive" value={cm.inactive} warn={cm.inactive > 0} />
              <MetricCard label="Error" value={cm.error} warn={cm.error > 0} danger={cm.error > 2} />
            </div>
            <Table>
              <TableHeader>
                <tr>
                  <TableHead>Channel</TableHead>
                  <TableHead>Adapter</TableHead>
                  <TableHead>Direction</TableHead>
                  <TableHead>Party</TableHead>
                  <TableHead>Status</TableHead>
                </tr>
              </TableHeader>
              <TableBody>
                {(cm.channels || []).map((ch: any, i: any) => (
                  <TableRow key={i}>
                    <TableCell className="font-mono text-sm">{ch.name}</TableCell>
                    <TableCell><Badge variant="outline" size="sm">{ch.adapter}</Badge></TableCell>
                    <TableCell className="text-sm">{ch.direction}</TableCell>
                    <TableCell className="text-sm text-text-tertiary">{ch.party}</TableCell>
                    <TableCell>
                      <Badge variant={ch.status === 'active' ? 'success' : ch.status === 'error' ? 'danger' : 'warning'} size="sm">
                        {ch.status}
                      </Badge>
                      {ch.errorMsg && <p className="text-xs text-danger-600 mt-1">{ch.errorMsg}</p>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          {/* NWA Alert Inbox */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell size={18} />
                NWA Alert Inbox
              </CardTitle>
              <span className="text-xs text-text-tertiary">{ai.total} alerts</span>
            </CardHeader>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              <MetricCard label="Total" value={ai.total} />
              <MetricCard label="Critical" value={ai.critical} warn={ai.critical > 0} danger={ai.critical > 1} />
              <MetricCard label="Warning" value={ai.warning} warn={ai.warning > 5} />
              <MetricCard label="Info" value={ai.info} />
            </div>
            <div className="space-y-2">
              {(ai.alerts || []).map((alert: any, i: any) => (
                <div key={i} className={`flex items-start gap-3 p-3 rounded-lg border ${
                  alert.severity === 'critical' ? 'border-danger-300 bg-danger-50' :
                  alert.severity === 'warning' ? 'border-warning-300 bg-warning-50' :
                  'border-border bg-surface-secondary'
                }`}>
                  {alert.severity === 'critical' ? <XCircle size={16} className="text-danger-500 mt-0.5 shrink-0" /> :
                   alert.severity === 'warning' ? <AlertTriangle size={16} className="text-warning-500 mt-0.5 shrink-0" /> :
                   <CheckCircle size={16} className="text-text-tertiary mt-0.5 shrink-0" />}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      <Badge variant={alert.severity === 'critical' ? 'danger' : alert.severity === 'warning' ? 'warning' : 'outline'} size="sm">{alert.category}</Badge>
                      <span className="text-xs text-text-tertiary">
                        {new Date(alert.time).toLocaleString('es-CO', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className="text-sm text-text-primary">{alert.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Cache Statistics */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 size={18} />
                Cache Statistics
              </CardTitle>
            </CardHeader>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-surface-secondary rounded-lg p-4 border border-border">
                <p className="text-xs text-text-tertiary uppercase tracking-wider mb-2">ICM Cache</p>
                <MetricCard label="Hit Rate" value={`${cs.icmCache?.hitRate ?? 0}%`} warn={(cs.icmCache?.hitRate ?? 100) < 90} danger={(cs.icmCache?.hitRate ?? 100) < 80} />
                <p className="text-xs text-text-tertiary mt-2">{cs.icmCache?.size ?? '—'} / {cs.icmCache?.maxSize ?? '—'}</p>
              </div>
              <div className="bg-surface-secondary rounded-lg p-4 border border-border">
                <p className="text-xs text-text-tertiary uppercase tracking-wider mb-2">Metadata Cache</p>
                <MetricCard label="Hit Rate" value={`${cs.metadataCache?.hitRate ?? 0}%`} warn={(cs.metadataCache?.hitRate ?? 100) < 95} />
                <p className="text-xs text-text-tertiary mt-2">{cs.metadataCache?.entries ?? 0} entries ({cs.metadataCache?.staleEntries ?? 0} stale)</p>
              </div>
              <div className="bg-surface-secondary rounded-lg p-4 border border-border">
                <p className="text-xs text-text-tertiary uppercase tracking-wider mb-2">Mapping Cache</p>
                <MetricCard label="Hit Rate" value={`${cs.mappingCache?.hitRate ?? 0}%`} warn={(cs.mappingCache?.hitRate ?? 100) < 90} />
                <p className="text-xs text-text-tertiary mt-2">{cs.mappingCache?.compiledMappings ?? 0} mappings — {cs.mappingCache?.cacheSize ?? '—'}</p>
              </div>
            </div>
          </Card>
        </div>
      );
    }

    // ABAP stack — standard transactions
    const { sm12 = {}, sm13 = {}, sm37 = {}, sm21 = {}, st22TopPrograms = [] } = sapMon;

    return (
      <div className="space-y-6">
        {/* SM12 — Enqueue Lock Monitor */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock size={18} />
              SM12 — Enqueue Locks
            </CardTitle>
          </CardHeader>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 mb-4">
            <MetricCard label="Total Locks" value={sm12.totalLocks} />
            <MetricCard label="Old Locks" value={sm12.oldLocks} warn={sm12.oldLocks > 5} danger={sm12.oldLocks > 20} />
            <MetricCard label="Max Age" value={sm12.maxAge} warn={parseFloat(sm12?.maxAge || '0') > 2} danger={parseFloat(sm12?.maxAge || '0') > 6} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-text-tertiary uppercase tracking-wider mb-2">Top Users</p>
              <ul className="space-y-1">
                {(sm12.topUsers || []).map((user: any, i: any) => (
                  <li key={i} className="text-sm text-text-secondary flex items-center gap-2">
                    <Users size={12} className="text-text-tertiary" />
                    <span className="font-mono">{user}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-xs text-text-tertiary uppercase tracking-wider mb-2">Top Tables</p>
              <ul className="space-y-1">
                {(sm12.topTables || []).map((table: any, i: any) => (
                  <li key={i} className="text-sm text-text-secondary flex items-center gap-2">
                    <Database size={12} className="text-text-tertiary" />
                    <span className="font-mono">{table}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Card>

        {/* SM13 — Update Request Monitor */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity size={18} />
              SM13 — Update Requests
            </CardTitle>
          </CardHeader>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            <MetricCard label="Pending"   value={sm13.pending}  warn={sm13.pending > 5}  danger={sm13.pending > 20} />
            <MetricCard label="Failed"    value={sm13.failed}   warn={sm13.failed > 0}   danger={sm13.failed > 5} />
            <MetricCard label="Active"    value={sm13.active} />
            <MetricCard label="Avg Delay" value={sm13.avgDelay} warn={parseFloat(sm13?.avgDelay || '0') > 3} danger={parseFloat(sm13?.avgDelay || '0') > 10} />
            <MetricCard
              label="Last Failed"
              value={
                sm13?.lastFailed
                  ? new Date(sm13.lastFailed).toLocaleString('es-CO', {
                      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                    })
                  : '—'
              }
              sub={sm13?.lastFailed ? 'last failure time' : 'no recent failures'}
            />
          </div>
        </Card>

        {/* SM37 — Background Job Monitor */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock size={18} />
              SM37 — Background Jobs
            </CardTitle>
          </CardHeader>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 mb-4">
            <MetricCard label="Running"   value={sm37.running} />
            <MetricCard label="Scheduled" value={sm37.scheduled} />
            <MetricCard label="Finished"  value={sm37.finished} />
            <MetricCard label="Failed"    value={sm37.failed}   warn={sm37.failed > 0}   danger={sm37.failed > 5} />
            <MetricCard label="Canceled"  value={sm37.canceled} warn={sm37.canceled > 0} />
          </div>
          {(sm37.longRunning || []).length > 0 && (
            <div>
              <p className="text-xs text-text-tertiary uppercase tracking-wider mb-2">Long-Running Jobs</p>
              <Table>
                <TableHeader>
                  <tr>
                    <TableHead>Job Name</TableHead>
                    <TableHead>Runtime</TableHead>
                    <TableHead>Status</TableHead>
                  </tr>
                </TableHeader>
                <TableBody>
                  {(sm37.longRunning || []).map((job: any, i: any) => (
                    <TableRow key={i}>
                      <TableCell className="font-mono text-sm">{job.name}</TableCell>
                      <TableCell className="text-sm">{job.runtime}</TableCell>
                      <TableCell>
                        <Badge
                          variant={job.status === 'running' ? 'warning' : job.status === 'failed' ? 'danger' : 'success'}
                          size="sm"
                        >
                          {job.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </Card>

        {/* SM21 — System Log */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileWarning size={18} />
              SM21 — System Log (24h)
            </CardTitle>
            <span className="text-xs text-text-tertiary">{sm21.total} total entries</span>
          </CardHeader>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <MetricCard label="Total"    value={sm21.total} />
            <MetricCard label="Errors"   value={sm21.errors}   warn={sm21.errors > 0}    danger={sm21.errors > 5} />
            <MetricCard label="Warnings" value={sm21.warnings} warn={sm21.warnings > 10}  danger={sm21.warnings > 30} />
            <MetricCard label="Security" value={sm21.security} warn={sm21.security > 0}   danger={sm21.security > 3} />
          </div>
        </Card>

        {/* ST22 Top Programs */}
        {st22TopPrograms.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle size={18} />
                ST22 — Top Short Dump Programs
              </CardTitle>
            </CardHeader>
            <div className="flex flex-wrap gap-2">
              {st22TopPrograms.map((prog: any, i: any) => (
                <Badge key={i} variant="danger" size="sm">{prog}</Badge>
              ))}
            </div>
          </Card>
        )}
      </div>
    );
  }

  // ── Render: Enhanced Components Table (instances tab) ──

  function renderInstances() {
    if (!instances.length) {
      return <p className="text-text-secondary p-4">No hay datos de instancias disponibles.</p>;
    }

    const DB_ROLES = ['HANA Primary', 'HANA Secondary', 'HANA', 'DB2', 'Oracle', 'MSSQL', 'ASE', 'MaxDB'];

    return (
      <div className="space-y-4">
        {/* Header summary */}
        <Card>
          <div className="flex flex-wrap items-center gap-6">
            <div className="flex items-center gap-2">
              <Layers size={18} className="text-text-tertiary" />
              <span className="text-sm font-semibold text-text-primary">Instance Model</span>
              <Badge variant="primary" size="sm">{instances.length} instances</Badge>
              <Badge variant="secondary" size="sm">{uniqueHostCount} hosts</Badge>
            </div>
            <div className="flex gap-4 text-xs text-text-secondary">
              <span className="flex items-center gap-1">
                <span className="inline-block w-2 h-2 rounded-full bg-success-500" />
                {instances.filter((i: any) => i.status === 'running').length} running
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block w-2 h-2 rounded-full bg-danger-500" />
                {instances.filter((i: any) => i.status !== 'running').length} stopped
              </span>
            </div>
          </div>
        </Card>

        {/* Full instances table */}
        <Card padding="none">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <tr>
                  <TableHead>Role</TableHead>
                  <TableHead>Nr</TableHead>
                  <TableHead>Hostname</TableHead>
                  <TableHead>IP</TableHead>
                  <TableHead>OS</TableHead>
                  <TableHead>EC2 Type</TableHead>
                  <TableHead>Zone</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>CPU%</TableHead>
                  <TableHead>Mem%</TableHead>
                  <TableHead>Disk%</TableHead>
                  <TableHead>Avail%</TableHead>
                  <TableHead>Conns</TableHead>
                  <TableHead>Mon</TableHead>
                  <TableHead>PID</TableHead>
                  <TableHead>Uptime</TableHead>
                </tr>
              </TableHeader>
              <TableBody>
                {instances.map((inst: any, i: any) => {
                  const isDb   = DB_ROLES.includes(inst.role);

                  return (
                    <TableRow key={i}>
                      {/* Role with color coding */}
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          {isDb
                            ? <Database size={13} className="text-accent-500 flex-shrink-0" />
                            : <Server size={13} className="text-primary-500 flex-shrink-0" />
                          }
                          <span className="text-sm font-medium text-text-primary whitespace-nowrap">
                            {inst.role}
                          </span>
                        </div>
                      </TableCell>

                      <TableCell className="font-mono text-sm font-medium">{inst.nr}</TableCell>

                      <TableCell>
                        <span className="font-mono text-sm text-text-primary">{inst.hostname}</span>
                      </TableCell>

                      <TableCell className="font-mono text-sm text-text-secondary">{inst.ip}</TableCell>

                      <TableCell className="text-xs text-text-secondary whitespace-nowrap">{inst.os || '—'}</TableCell>

                      <TableCell className="font-mono text-xs text-text-secondary">{inst.ec2Type || '—'}</TableCell>

                      <TableCell className="text-xs text-text-secondary">{inst.zone || '—'}</TableCell>

                      {/* Status */}
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <span className={`inline-block w-2 h-2 rounded-full ${
                            inst.status === 'running' ? 'bg-success-500' : 'bg-danger-500'
                          }`} />
                          <span className={`text-xs font-medium ${
                            inst.status === 'running' ? 'text-success-600' : 'text-danger-600'
                          }`}>
                            {inst.status === 'running' ? 'Running' : 'Stopped'}
                          </span>
                        </div>
                      </TableCell>

                      {/* CPU% — hidden for RISE_RESTRICTED */}
                      <TableCell>
                        {system!.isRiseRestricted ? (
                          <span className="text-sm text-text-tertiary">—</span>
                        ) : (
                        <span className={`text-sm font-medium ${
                          (inst.cpu ?? 0) >= 85 ? 'text-danger-600' :
                          (inst.cpu ?? 0) >= 70 ? 'text-warning-600' :
                          'text-text-primary'
                        }`}>
                          {inst.cpu ?? 0}%
                        </span>
                        )}
                      </TableCell>

                      {/* Mem% — hidden for RISE_RESTRICTED */}
                      <TableCell>
                        {system!.isRiseRestricted ? (
                          <span className="text-sm text-text-tertiary">—</span>
                        ) : (
                        <span className={`text-sm font-medium ${
                          (inst.mem ?? 0) >= 85 ? 'text-danger-600' :
                          (inst.mem ?? 0) >= 70 ? 'text-warning-600' :
                          'text-text-primary'
                        }`}>
                          {inst.mem ?? 0}%
                        </span>
                        )}
                      </TableCell>

                      {/* Disk% — hidden for RISE_RESTRICTED */}
                      <TableCell>
                        {system!.isRiseRestricted ? (
                          <span className="text-sm text-text-tertiary">—</span>
                        ) : (
                        <span className={`text-sm font-medium ${
                          (inst.disk ?? 0) >= 85 ? 'text-danger-600' :
                          (inst.disk ?? 0) >= 70 ? 'text-warning-600' :
                          'text-text-primary'
                        }`}>
                          {inst.disk ?? 0}%
                        </span>
                        )}
                      </TableCell>

                      {/* Availability% */}
                      <TableCell>
                        <span className={`text-xs font-medium ${
                          (inst.availability ?? 0) < 98   ? 'text-danger-600' :
                          (inst.availability ?? 0) < 99.5 ? 'text-warning-600' :
                          'text-success-600'
                        }`}>
                          {inst.availability ?? 0}%
                        </span>
                      </TableCell>

                      {/* Connections */}
                      <TableCell className="text-sm text-text-secondary">
                        {inst.connections ?? 0}
                      </TableCell>

                      {/* Mon Status */}
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {colorDot(inst.monStatus || 'green')}
                          <span className="text-xs text-text-tertiary capitalize">
                            {inst.monStatus === 'green' ? 'OK' :
                             inst.monStatus === 'yellow' ? 'Warn' : 'Crit'}
                          </span>
                        </div>
                      </TableCell>

                      {/* PID */}
                      <TableCell className="font-mono text-sm text-text-secondary">
                        {inst.pid ?? '—'}
                      </TableCell>

                      {/* Uptime */}
                      <TableCell className="text-sm text-text-secondary whitespace-nowrap">
                        {calcUptime(inst.startedAt)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </Card>

        {/* Work Process details for app-layer instances */}
        {instances.some((i: any) => i.dialogWP) && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Cpu size={16} />
                Work Process Summary (PAS / AAS)
              </CardTitle>
            </CardHeader>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {instances
                .filter((i: any) => i.dialogWP)
                .map((inst: any, idx: any) => {
                  const wp = inst.dialogWP;
                  const bp = inst.batchWP;
                  return (
                    <div key={idx} className="border border-border rounded-lg p-4 bg-surface-secondary">
                      <div className="flex items-center gap-2 mb-3">
                        <span className={`inline-block w-2 h-2 rounded-full ${
                          inst.status === 'running' ? 'bg-success-500' : 'bg-danger-500'
                        }`} />
                        <span className="text-sm font-semibold text-text-primary">{inst.role}</span>
                        <span className="text-xs font-mono text-text-tertiary">{inst.hostname}</span>
                      </div>
                      <div className="space-y-2">
                        <div>
                          <p className="text-[10px] text-text-tertiary uppercase tracking-wider mb-1">Dialog WPs</p>
                          <div className="flex gap-3 text-xs">
                            <span className="text-text-secondary">Total: <span className="font-bold text-text-primary">{wp.total}</span></span>
                            <span className="text-success-600">{wp.active} active</span>
                            <span className="text-text-tertiary">{wp.free} free</span>
                            {wp.hold > 0 && <span className="text-warning-600">{wp.hold} hold</span>}
                          </div>
                          <div className="mt-1 h-1.5 bg-surface-tertiary rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${barColor((wp.active / wp.total) * 100, 70, 90)}`}
                              style={{ width: `${Math.round((wp.active / wp.total) * 100)}%` }}
                            />
                          </div>
                        </div>
                        {bp && (
                          <div>
                            <p className="text-[10px] text-text-tertiary uppercase tracking-wider mb-1">Batch WPs</p>
                            <div className="flex gap-3 text-xs">
                              <span className="text-text-secondary">Total: <span className="font-bold text-text-primary">{bp.total}</span></span>
                              <span className="text-success-600">{bp.active} active</span>
                              <span className="text-text-tertiary">{bp.free} free</span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          </Card>
        )}

        {/* HANA instance DB metrics */}
        {instances.some((i: any) => i.dbCpu !== undefined) && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database size={16} />
                HANA Instance DB Metrics
              </CardTitle>
            </CardHeader>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {instances
                .filter((i: any) => i.dbCpu !== undefined)
                .map((inst: any, idx: any) => (
                  <div key={idx} className="border border-border rounded-lg p-4 bg-surface-secondary">
                    <div className="flex items-center gap-2 mb-3">
                      <span className={`inline-block w-2 h-2 rounded-full ${
                        inst.status === 'running' ? 'bg-success-500' : 'bg-danger-500'
                      }`} />
                      <span className="text-sm font-semibold text-text-primary">{inst.role}</span>
                      <span className="text-xs font-mono text-text-tertiary">{inst.hostname}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-surface-tertiary rounded p-2">
                        <p className="text-[10px] text-text-tertiary uppercase">DB CPU</p>
                        <p className={`text-sm font-bold ${
                          inst.dbCpu >= 85 ? 'text-danger-600' :
                          inst.dbCpu >= 70 ? 'text-warning-600' :
                          'text-text-primary'
                        }`}>{inst.dbCpu}%</p>
                      </div>
                      <div className="bg-surface-tertiary rounded p-2">
                        <p className="text-[10px] text-text-tertiary uppercase">DB Mem</p>
                        <p className={`text-sm font-bold ${
                          inst.dbMem >= 85 ? 'text-danger-600' :
                          inst.dbMem >= 70 ? 'text-warning-600' :
                          'text-text-primary'
                        }`}>{inst.dbMem}%</p>
                      </div>
                      <div className="bg-surface-tertiary rounded p-2">
                        <p className="text-[10px] text-text-tertiary uppercase">Disk Data</p>
                        <p className={`text-sm font-bold ${
                          inst.dbDiskData >= 85 ? 'text-danger-600' :
                          inst.dbDiskData >= 70 ? 'text-warning-600' :
                          'text-text-primary'
                        }`}>{inst.dbDiskData}%</p>
                      </div>
                      <div className="bg-surface-tertiary rounded p-2">
                        <p className="text-[10px] text-text-tertiary uppercase">Disk Log</p>
                        <p className={`text-sm font-bold ${
                          inst.dbDiskLog >= 85 ? 'text-danger-600' :
                          inst.dbDiskLog >= 70 ? 'text-warning-600' :
                          'text-text-primary'
                        }`}>{inst.dbDiskLog}%</p>
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </Card>
        )}
      </div>
    );
  }

  // ── Render: Breaches ──

  function renderBreaches() {
    if (!systemBreaches.length) {
      return (
        <Card>
          <div className="flex flex-col items-center justify-center py-12 text-text-tertiary">
            <CheckCircle size={40} className="text-success-500 mb-3" />
            <p className="font-medium">Sin breaches activos</p>
            <p className="text-sm mt-1">Este sistema no tiene breaches registrados.</p>
          </div>
        </Card>
      );
    }

    return (
      <Card padding="none">
        <Table>
          <TableHeader>
            <tr>
              <TableHead>ID</TableHead>
              <TableHead>Metric</TableHead>
              <TableHead>Value</TableHead>
              <TableHead>Threshold</TableHead>
              <TableHead>Severity</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Status</TableHead>
            </tr>
          </TableHeader>
          <TableBody>
            {systemBreaches.map((b: any) => (
              <TableRow key={b.id}>
                <TableCell className="font-mono text-xs">{b.id}</TableCell>
                <TableCell>{b.metric === 'response_time' ? 'Response Time' : b.metric}</TableCell>
                <TableCell className="font-mono">{b.value}{b.metric.includes('time') ? 'ms' : '%'}</TableCell>
                <TableCell className="font-mono text-text-tertiary">{b.threshold}{b.metric.includes('time') ? 'ms' : '%'}</TableCell>
                <TableCell>
                  <Badge
                    variant={b.severity === 'CRITICAL' || b.severity === 'HIGH' ? 'danger' : 'warning'}
                    size="sm"
                  >
                    {b.severity}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs text-text-secondary">
                  {new Date(b.timestamp).toLocaleString('es-CO')}
                </TableCell>
                <TableCell>
                  <StatusBadge status={b.resolved ? 'completed' : 'critical'} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    );
  }

  // ── Main Render ──

  return (
    <div>
      <Header title={`Sistema ${system.sid}`} subtitle={system.description} />
      <div className="p-6">
        {/* Back button */}
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" icon={ArrowLeft} onClick={() => navigate(-1)}>Dashboard</Button>
        </div>

        {/* System Summary Card — shows instance count and host count instead of a single host field */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-6">
          {/* Health gauge */}
          <Card className="lg:col-span-1 flex flex-col items-center justify-center py-6">
            <HealthGauge score={system.healthScore} size={150} />
            <StatusBadge status={system.status} className="mt-3" />
            <p className="text-xs text-text-tertiary mt-2">{system.description}</p>
          </Card>

          {/* System metadata grid */}
          <Card className="lg:col-span-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-4">
              <div>
                <p className="text-xs text-text-tertiary uppercase tracking-wider mb-1">SID</p>
                <p className="text-lg font-bold text-text-primary">{system.sid}</p>
              </div>
              <div>
                <p className="text-xs text-text-tertiary uppercase tracking-wider mb-1">Type</p>
                <p className="text-sm font-medium text-text-primary">{system.type}</p>
              </div>
              <div>
                <p className="text-xs text-text-tertiary uppercase tracking-wider mb-1">Database</p>
                <p className="text-sm font-medium text-text-primary">{system.dbType}</p>
              </div>
              <div>
                <p className="text-xs text-text-tertiary uppercase tracking-wider mb-1">Environment</p>
                <Badge variant={
                  system.environment === 'PRD' ? 'danger' :
                  system.environment === 'QAS' ? 'warning' :
                  'info'
                }>
                  {system.environment}
                </Badge>
              </div>
              <div>
                <p className="text-xs text-text-tertiary uppercase tracking-wider mb-1">Mode</p>
                <StatusBadge status={system.mode === 'TRIAL' ? 'trial' : 'production'} />
              </div>
              {system.isRiseRestricted && (
              <div>
                <p className="text-xs text-text-tertiary uppercase tracking-wider mb-1">Monitoring</p>
                <Badge variant="warning" size="sm">RISE Managed</Badge>
                <p className="text-[10px] text-text-tertiary mt-1">Infraestructura gestionada por SAP</p>
              </div>
              )}
              <div>
                <p className="text-xs text-text-tertiary uppercase tracking-wider mb-1">Instances</p>
                <p className="text-sm font-medium text-text-primary">
                  {instances.length} instance{instances.length !== 1 ? 's' : ''}
                </p>
              </div>
              <div>
                <p className="text-xs text-text-tertiary uppercase tracking-wider mb-1">Breaches</p>
                <p className="text-sm font-medium">
                  {system.breaches > 0
                    ? <span className="text-danger-600">{system.breaches} activos</span>
                    : <span className="text-success-600">0</span>
                  }
                </p>
              </div>
              <div>
                <p className="text-xs text-text-tertiary uppercase tracking-wider mb-1">Last Check</p>
                <p className="text-xs text-text-secondary">
                  {new Date(system.lastCheck).toLocaleString('es-CO')}
                </p>
              </div>
              {sysMeta && (
                <>
                  <div>
                    <p className="text-xs text-text-tertiary uppercase tracking-wider mb-1">Client</p>
                    <p className="text-sm font-medium text-text-primary">{sysMeta.client}</p>
                  </div>
                  <div>
                    <p className="text-xs text-text-tertiary uppercase tracking-wider mb-1">SAP Release</p>
                    <p className="text-sm font-medium text-text-primary">{sysMeta.sapRelease}</p>
                  </div>
                  <div>
                    <p className="text-xs text-text-tertiary uppercase tracking-wider mb-1">Kernel Release</p>
                    <p className="text-sm font-medium text-text-primary">{sysMeta.kernelRelease}</p>
                  </div>
                </>
              )}
            </div>
          </Card>
        </div>

        {/* Tab bar */}
        <Tabs
          tabs={tabs}
          activeTab={activeTab}
          onChange={setActiveTab}
          className="mb-6"
        />

        {/* Tab content */}
        {activeTab === 'overview'     && renderOverview()}
        {activeTab === 'hosts'        && renderHosts()}
        {activeTab === 'topology'     && renderTopology()}
        {activeTab === 'sapmonitor'   && renderSAPMonitor()}
        {activeTab === 'database'     && renderDatabase()}
        {activeTab === 'instances'    && renderInstances()}
        {activeTab === 'dependencies' && renderDependencies()}
        {activeTab === 'breaches'     && renderBreaches()}
      </div>
    </div>
  );
}
