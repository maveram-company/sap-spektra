import { useState, useEffect, useMemo } from 'react';
import { Network, CheckCircle, XCircle, Shield, Server, Monitor } from 'lucide-react';
import Header from '../components/layout/Header';
import PageLoading from '../components/ui/PageLoading';
import { getDiscoveryResult } from '../services/dataService';
import { ModeBadge, SourceIndicator } from '../components/mode';
import { createLogger } from '../lib/logger';
import type { ProviderTier } from '../mode/types';
import type { ApiRecord } from '../types';

interface SourceInfo {
  source: ProviderTier;
  confidence: 'high' | 'medium' | 'low';
  degraded: boolean;
  reason?: string;
  timestamp: string;
}

const log = createLogger('LandscapePage');

// Colores para la columna de confianza
const confidenceColors = {
  high: 'bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-400',
  medium: 'bg-warning-100 text-warning-700 dark:bg-warning-900/30 dark:text-warning-400',
  low: 'bg-danger-100 text-danger-700 dark:bg-danger-900/30 dark:text-danger-400',
};

// Colores para el estado de escaneo
const scanStatusColors = {
  success: 'bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-400',
  fail: 'bg-danger-100 text-danger-700 dark:bg-danger-900/30 dark:text-danger-400',
};

// Colores para el badge del ambiente
const envColors = {
  PRD: 'bg-danger-100 text-danger-700 dark:bg-danger-900/30 dark:text-danger-400',
  QAS: 'bg-warning-100 text-warning-700 dark:bg-warning-900/30 dark:text-warning-400',
  DEV: 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400',
};

export default function LandscapePage() {
  const [discovery, setDiscovery] = useState<ApiRecord[]>([]);
  const [sourceInfo, setSourceInfo] = useState<SourceInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    getDiscoveryResult().then(result => {
      setDiscovery(result.data);
      setSourceInfo({ source: result.source, confidence: result.confidence, degraded: result.degraded, reason: result.reason, timestamp: result.timestamp });
      setLoading(false);
    }).catch((err: unknown) => log.warn('Fetch failed', { error: (err as Error).message }));
  }, []);

  // Agrupar instancias por SID para la topología
  const sidGroups = useMemo(() => {
    const groups: Record<string, ApiRecord> = {};
    discovery.forEach((inst: ApiRecord) => {
      if (!groups[inst.sid]) {
        groups[inst.sid] = {
          sid: inst.sid,
          product: inst.product,
          env: inst.env,
          nodes: [],
          haEnabled: false,
          haType: null,
        };
      }
      groups[inst.sid].nodes.push(inst);
      if (inst.haEnabled) {
        groups[inst.sid].haEnabled = true;
        groups[inst.sid].haType = inst.haType;
      }
    });
    return Object.values(groups);
  }, [discovery]);

  // Métricas del resumen
  const totalInstances = discovery.length;
  const successScans = discovery.filter((d: ApiRecord) => d.scanStatus === 'success').length;
  const failScans = discovery.filter((d: ApiRecord) => d.scanStatus === 'fail').length;
  const haClusters = sidGroups.filter((g: ApiRecord) => g.haEnabled).length;

  // Filtrar instancias para la tabla
  const filteredInstances = useMemo(() => {
    if (!search) return discovery;
    const q = search.toLowerCase();
    return discovery.filter(
      (d) =>
        d.instanceId.toLowerCase().includes(q) ||
        d.hostname.toLowerCase().includes(q) ||
        d.sid.toLowerCase().includes(q) ||
        d.role.toLowerCase().includes(q) ||
        d.product.toLowerCase().includes(q)
    );
  }, [search, discovery]);

  const summaryCards = [
    { label: 'Instancias Descubiertas', value: totalInstances, icon: Monitor, color: 'primary' },
    { label: 'Escaneo Exitoso', value: `${successScans}/${totalInstances}`, icon: CheckCircle, color: 'success' },
    { label: 'Escaneo Fallido', value: failScans, icon: XCircle, color: failScans > 0 ? 'danger' : 'success' },
    { label: 'Clusters HA', value: haClusters, icon: Shield, color: 'primary' },
  ];

  const cardVariants = {
    primary: 'bg-primary-50 dark:bg-primary-900/20 border-primary-200 dark:border-primary-800',
    success: 'bg-success-50 dark:bg-success-900/20 border-success-200 dark:border-success-800',
    danger: 'bg-danger-50 dark:bg-danger-900/20 border-danger-200 dark:border-danger-800',
  };

  if (loading) return <PageLoading message="Cargando landscape..." />;

  return (
    <div>
      <Header
        title="Landscape SAP"
        subtitle="Topología descubierta — instancias, roles y alta disponibilidad"
        actions={<ModeBadge />}
      />

      <div className="p-6">
        {sourceInfo && (
          <div className="mb-4">
            <SourceIndicator {...sourceInfo} />
          </div>
        )}
        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {summaryCards.map((card: ApiRecord) => (
            <div
              key={card.label}
              className={`rounded-xl border p-5 ${(cardVariants as Record<string, string>)[card.color]}`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 rounded-lg bg-surface flex items-center justify-center border border-border">
                  <card.icon size={20} className="text-text-secondary" />
                </div>
              </div>
              <p className="text-2xl font-bold text-text-primary">{card.value}</p>
              <p className="text-xs text-text-secondary mt-0.5">{card.label}</p>
            </div>
          ))}
        </div>

        {/* Topology Section */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Network size={20} className="text-text-secondary" />
            <h2 className="text-lg font-semibold text-text-primary">Topología por SID</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {sidGroups.map((group: ApiRecord) => (
              <div
                key={group.sid}
                className="bg-surface rounded-xl border border-border p-5"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="text-base font-semibold text-text-primary">{group.sid}</h3>
                    <p className="text-xs text-text-secondary mt-0.5">{group.product}</p>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${(envColors as Record<string, string>)[group.env] || 'bg-surface-secondary text-text-secondary'}`}>
                    {group.env}
                  </span>
                </div>

                {/* HA Status Badge */}
                <div className="mb-3">
                  {group.haEnabled ? (
                    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-400">
                      <Shield size={12} />
                      {group.haType}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-surface-secondary text-text-tertiary dark:bg-surface-tertiary">
                      Standalone
                    </span>
                  )}
                </div>

                {/* Nodes List */}
                <div className="space-y-2 pt-3 border-t border-border">
                  {group.nodes.map((node: ApiRecord) => (
                    <div key={node.instanceId} className="flex items-center gap-2">
                      <Server size={14} className="text-text-tertiary flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-text-primary truncate">{node.role}</p>
                        <p className="text-[10px] text-text-tertiary truncate">{node.hostname}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Discovery Instances Table */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-text-primary">Instancias Descubiertas</h2>
            <input
              type="text"
              placeholder="Buscar instancias..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="px-3 py-1.5 text-sm rounded-lg border border-border bg-surface text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          <div className="bg-surface rounded-xl border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left px-4 py-3 text-xs font-medium text-text-tertiary uppercase tracking-wider">Instance ID</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-text-tertiary uppercase tracking-wider">Hostname</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-text-tertiary uppercase tracking-wider">Scan Status</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-text-tertiary uppercase tracking-wider">SID</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-text-tertiary uppercase tracking-wider">Role</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-text-tertiary uppercase tracking-wider">Product</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-text-tertiary uppercase tracking-wider">Kernel</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-text-tertiary uppercase tracking-wider">HA</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-text-tertiary uppercase tracking-wider">Confidence</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredInstances.map((inst: ApiRecord) => (
                    <tr key={inst.instanceId} className="border-b border-border last:border-0 hover:bg-surface-secondary transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-text-primary">{inst.instanceId}</td>
                      <td className="px-4 py-3 text-text-primary">{inst.hostname}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${(scanStatusColors as Record<string, string>)[inst.scanStatus]}`}>
                          {inst.scanStatus === 'success' ? 'OK' : 'FAIL'}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-semibold text-text-primary">{inst.sid}</td>
                      <td className="px-4 py-3 text-text-secondary">{inst.role}</td>
                      <td className="px-4 py-3 text-text-secondary">{inst.product}</td>
                      <td className="px-4 py-3 text-text-secondary">{inst.kernel}</td>
                      <td className="px-4 py-3">
                        {inst.haEnabled ? (
                          <span className="rounded-full px-2 py-0.5 text-xs font-medium bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-400">
                            {inst.haType}
                          </span>
                        ) : (
                          <span className="text-text-tertiary text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${(confidenceColors as Record<string, string>)[inst.confidence]}`}>
                          {inst.confidence}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
