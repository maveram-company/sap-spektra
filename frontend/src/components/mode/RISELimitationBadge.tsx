import { AlertTriangle } from 'lucide-react';

interface RISELimitationBadgeProps {
  compact?: boolean;
}

export default function RISELimitationBadge({ compact = false }: RISELimitationBadgeProps) {
  if (compact) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400" title="SAP RISE — Limited capabilities via Cloud Connector">
        <AlertTriangle size={12} />
        RISE
      </span>
    );
  }

  return (
    <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
      <div className="flex items-center gap-2 text-amber-400 text-sm font-medium mb-2">
        <AlertTriangle size={16} />
        SAP RISE — Cloud Connector Limitations
      </div>
      <div className="text-xs text-text-secondary space-y-1">
        <p>This system connects via SAP Cloud Connector. The following capabilities are not available:</p>
        <ul className="list-disc list-inside mt-1 space-y-0.5">
          <li>OS-level metrics (CPU, RAM, disk)</li>
          <li>Host-level runbook execution</li>
          <li>HA/DR physical failover</li>
          <li>Local evidence collection</li>
        </ul>
      </div>
    </div>
  );
}
