// ══════════════════════════════════════════════════════════════
// SAP Spektra — CapabilityBadge
// Shows capability status for a specific action and tier.
// ══════════════════════════════════════════════════════════════

import type { ProviderTier } from '../../mode/types';

export interface CapabilityBadgeProps {
  action: string;
  tier: ProviderTier;
  readOnly?: boolean;
  restricted?: boolean;
}

const TIER_CONFIG: Record<ProviderTier, { bg: string; text: string; label: string }> = {
  real:     { bg: 'bg-emerald-500/10', text: 'text-emerald-400', label: 'Live' },
  fallback: { bg: 'bg-amber-500/10',   text: 'text-amber-400',   label: 'Fallback' },
  mock:     { bg: 'bg-blue-500/10',    text: 'text-blue-400',    label: 'Demo' },
};

export default function CapabilityBadge({ action, tier, readOnly = false, restricted = false }: CapabilityBadgeProps) {
  const cfg = restricted
    ? { bg: 'bg-red-500/10', text: 'text-red-400', label: 'Restricted' }
    : TIER_CONFIG[tier];

  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${cfg.bg} ${cfg.text}`}
      title={readOnly ? `${action}: read-only (${cfg.label})` : `${action}: ${cfg.label}`}
    >
      {action}: {cfg.label}
      {readOnly && (
        <span className="text-text-tertiary">(RO)</span>
      )}
    </span>
  );
}
