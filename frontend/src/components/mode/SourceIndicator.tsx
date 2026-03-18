// ══════════════════════════════════════════════════════════════
// SAP Spektra — SourceIndicator
// Shows data source metadata from a ProviderResult.
// ══════════════════════════════════════════════════════════════

import { Database, HardDrive, FlaskConical, AlertTriangle } from 'lucide-react';
import type { ProviderTier } from '../../mode/types';

export interface SourceIndicatorProps {
  source: ProviderTier;
  confidence: 'high' | 'medium' | 'low';
  degraded: boolean;
  reason?: string;
  timestamp: string;
}

const SOURCE_CONFIG: Record<ProviderTier, { Icon: typeof Database; label: string; color: string }> = {
  real:     { Icon: Database,     label: 'API',        color: 'text-emerald-400' },
  fallback: { Icon: HardDrive,    label: 'Cache',      color: 'text-amber-400' },
  mock:     { Icon: FlaskConical, label: 'Simulation', color: 'text-blue-400' },
};

const CONFIDENCE_CONFIG: Record<string, { bar: string; label: string }> = {
  high:   { bar: 'bg-emerald-500', label: 'High' },
  medium: { bar: 'bg-amber-500',   label: 'Medium' },
  low:    { bar: 'bg-red-500',     label: 'Low' },
};

function timeAgo(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

export default function SourceIndicator({ source, confidence, degraded, reason, timestamp }: SourceIndicatorProps) {
  const src = SOURCE_CONFIG[source];
  const conf = CONFIDENCE_CONFIG[confidence];

  return (
    <div
      className="inline-flex items-center gap-2 text-[10px] text-text-tertiary"
      title={reason ?? `Source: ${src.label}, Confidence: ${conf.label}`}
    >
      {/* Source icon + label */}
      <span className={`inline-flex items-center gap-1 ${src.color}`}>
        <src.Icon size={10} />
        {src.label}
      </span>

      {/* Confidence bar */}
      <span className="inline-flex items-center gap-1" data-testid="confidence-bar">
        <span className="flex gap-px">
          <span className={`w-1 h-2.5 rounded-sm ${confidence === 'high' || confidence === 'medium' || confidence === 'low' ? conf.bar : 'bg-white/10'}`} />
          <span className={`w-1 h-2.5 rounded-sm ${confidence === 'high' || confidence === 'medium' ? conf.bar : 'bg-white/10'}`} />
          <span className={`w-1 h-2.5 rounded-sm ${confidence === 'high' ? conf.bar : 'bg-white/10'}`} />
        </span>
      </span>

      {/* Degraded warning */}
      {degraded && (
        <span className="inline-flex items-center gap-0.5 text-amber-400" data-testid="degraded-warning">
          <AlertTriangle size={10} />
          Degraded
        </span>
      )}

      {/* Timestamp */}
      <span className="text-text-tertiary/70">
        {timeAgo(timestamp)}
      </span>
    </div>
  );
}
