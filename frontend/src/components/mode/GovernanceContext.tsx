// ══════════════════════════════════════════════════════════════
// SAP Spektra — GovernanceContext
// Shows governance info for critical actions.
// ══════════════════════════════════════════════════════════════

import { ShieldCheck, AlertTriangle, Info, Lock } from 'lucide-react';

export interface GovernanceContextProps {
  requiresApproval?: boolean;
  restrictions?: string[];
  riskLevel?: string;
  recommendedAction?: string;
  manualAssisted?: boolean;
}

const RISK_CONFIG: Record<string, { bg: string; text: string }> = {
  critical: { bg: 'bg-red-500/10',    text: 'text-red-400' },
  high:     { bg: 'bg-red-500/10',    text: 'text-red-400' },
  medium:   { bg: 'bg-amber-500/10',  text: 'text-amber-400' },
  low:      { bg: 'bg-emerald-500/10', text: 'text-emerald-400' },
};

export default function GovernanceContext({
  requiresApproval,
  restrictions,
  riskLevel,
  recommendedAction,
  manualAssisted,
}: GovernanceContextProps) {
  const hasContent = requiresApproval || (restrictions && restrictions.length > 0) || riskLevel || recommendedAction || manualAssisted;
  if (!hasContent) return null;

  const riskCfg = riskLevel ? (RISK_CONFIG[riskLevel.toLowerCase()] ?? RISK_CONFIG.medium) : null;

  return (
    <div className="flex flex-wrap items-center gap-2 text-[10px]" data-testid="governance-context">
      {/* Approval badge */}
      {requiresApproval && (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 font-medium">
          <ShieldCheck size={10} />
          Approval Required
        </span>
      )}

      {/* Risk level */}
      {riskLevel && riskCfg && (
        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-medium ${riskCfg.bg} ${riskCfg.text}`}>
          <AlertTriangle size={10} />
          Risk: {riskLevel}
        </span>
      )}

      {/* Manual assisted */}
      {manualAssisted && (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 font-medium">
          <Info size={10} />
          Manual Assisted
        </span>
      )}

      {/* Restrictions */}
      {restrictions && restrictions.length > 0 && (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 font-medium" data-testid="restrictions-badge">
          <Lock size={10} />
          {restrictions.length} restriction{restrictions.length !== 1 ? 's' : ''}
        </span>
      )}

      {/* Recommended action */}
      {recommendedAction && (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-white/5 text-text-secondary font-medium">
          <Info size={10} />
          {recommendedAction}
        </span>
      )}
    </div>
  );
}
