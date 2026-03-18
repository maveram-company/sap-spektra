// ══════════════════════════════════════════════════════════════
// SAP Spektra — Mode Indicator
// Small component showing current operational mode and degraded domains.
// ══════════════════════════════════════════════════════════════

import { useMode } from './ModeContext';
import type { OperationalMode } from './types';

const MODE_STYLES: Record<OperationalMode, { bg: string; text: string; label: string }> = {
  REAL:     { bg: 'rgba(34, 197, 94, 0.15)', text: 'rgb(34, 197, 94)',  label: 'REAL' },
  FALLBACK: { bg: 'rgba(245, 158, 11, 0.15)', text: 'rgb(245, 158, 11)', label: 'FALLBACK' },
  MOCK:     { bg: 'rgba(59, 130, 246, 0.15)', text: 'rgb(59, 130, 246)', label: 'MOCK' },
};

export default function ModeIndicator() {
  const { state } = useMode();
  const style = MODE_STYLES[state.mode];

  const degradedDomains: string[] = [];
  state.capabilities.forEach((cap) => {
    if (cap.degraded) degradedDomains.push(cap.domain);
  });

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '2px 8px',
        borderRadius: '4px',
        fontSize: '11px',
        fontWeight: 600,
        letterSpacing: '0.04em',
        backgroundColor: style.bg,
        color: style.text,
        border: `1px solid ${style.text}33`,
      }}
      title={
        degradedDomains.length > 0
          ? `Degraded: ${degradedDomains.join(', ')}`
          : `Mode: ${style.label}${state.backendReachable ? '' : ' (backend unreachable)'}`
      }
    >
      <span
        style={{
          width: '6px',
          height: '6px',
          borderRadius: '50%',
          backgroundColor: style.text,
          display: 'inline-block',
        }}
      />
      {style.label}
      {degradedDomains.length > 0 && (
        <span style={{ opacity: 0.7, fontSize: '10px' }}>
          ({degradedDomains.length} degraded)
        </span>
      )}
    </div>
  );
}
