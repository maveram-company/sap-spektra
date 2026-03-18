// ══════════════════════════════════════════════════════════════
// SAP Spektra — EvidencePanel
// Expandable panel showing full ProviderResult metadata.
// ══════════════════════════════════════════════════════════════

import { useState } from 'react';
import { ChevronDown, ChevronRight, Info } from 'lucide-react';
import type { ProviderResult } from '../../providers/types';
import SourceIndicator from './SourceIndicator';

export interface EvidencePanelProps {
  result: ProviderResult<unknown>;
  domain: string;
  action: string;
}

export default function EvidencePanel({ result, domain, action }: EvidencePanelProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between w-full px-3 py-2 text-xs text-text-secondary hover:bg-white/5 transition-colors"
        aria-expanded={open}
      >
        <span className="inline-flex items-center gap-1.5">
          <Info size={12} className="text-text-tertiary" />
          Data Evidence — {domain} / {action}
        </span>
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-2 border-t border-border" data-testid="evidence-details">
          {/* Source indicator row */}
          <div className="pt-2">
            <SourceIndicator
              source={result.source}
              confidence={result.confidence}
              degraded={result.degraded}
              reason={result.reason}
              timestamp={result.timestamp}
            />
          </div>

          {/* Key-value pairs */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px]">
            <div>
              <span className="text-text-tertiary">Source:</span>{' '}
              <span className="text-text-primary font-medium">{result.source}</span>
            </div>
            <div>
              <span className="text-text-tertiary">Confidence:</span>{' '}
              <span className="text-text-primary font-medium">{result.confidence}</span>
            </div>
            <div>
              <span className="text-text-tertiary">Degraded:</span>{' '}
              <span className={`font-medium ${result.degraded ? 'text-amber-400' : 'text-text-primary'}`}>
                {result.degraded ? 'Yes' : 'No'}
              </span>
            </div>
            <div>
              <span className="text-text-tertiary">Timestamp:</span>{' '}
              <span className="text-text-primary font-medium font-mono">{result.timestamp}</span>
            </div>
          </div>

          {/* Reason */}
          {result.reason && (
            <div className="text-[10px]">
              <span className="text-text-tertiary">Reason:</span>{' '}
              <span className="text-amber-400">{result.reason}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
