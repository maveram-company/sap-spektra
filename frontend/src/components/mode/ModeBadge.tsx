// ══════════════════════════════════════════════════════════════
// SAP Spektra — ModeBadge
// Compact pill badge showing current operational mode.
// ══════════════════════════════════════════════════════════════

import { useMode } from '../../mode/ModeContext';
import type { OperationalMode } from '../../mode/types';

const MODE_CONFIG: Record<OperationalMode, { dot: string; bg: string; text: string; label: string }> = {
  REAL:       { dot: 'bg-emerald-500', bg: 'bg-emerald-500/10', text: 'text-emerald-400', label: 'Live' },
  FALLBACK:   { dot: 'bg-amber-500',   bg: 'bg-amber-500/10',   text: 'text-amber-400',   label: 'Fallback' },
  MOCK:       { dot: 'bg-blue-500',    bg: 'bg-blue-500/10',    text: 'text-blue-400',    label: 'Demo' },
  RESTRICTED: { dot: 'bg-red-500',     bg: 'bg-red-500/10',     text: 'text-red-400',     label: 'Restricted' },
};

export default function ModeBadge() {
  const { state } = useMode();
  const cfg = MODE_CONFIG[state.mode];

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold ${cfg.bg} ${cfg.text} border border-current/20`}
      title={`Mode: ${state.mode}${state.backendReachable ? '' : ' (backend unreachable)'}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}
