// ══════════════════════════════════════════════════════════════
// SAP Spektra — Mode Context
// React context providing mode state to the application.
// ══════════════════════════════════════════════════════════════

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import type { OperationalMode, ModeState, DomainName, DomainCapability } from './types';
import { resolveCapabilities } from './capability-engine';
import { setDataServiceMode } from '../services/dataService';
import { api } from '../hooks/useApi';
import { createLogger } from '../lib/logger';

const log = createLogger('ModeContext');

const STORAGE_KEY = 'spektra-mode';

interface ModeContextValue {
  state: ModeState;
  setMode: (mode: OperationalMode) => void;
  getDomainCapability: (domain: DomainName) => DomainCapability | undefined;
}

const ModeContext = createContext<ModeContextValue | null>(null);

function getInitialMode(): OperationalMode {
  // 1. Check environment variable
  const envMode = import.meta.env.VITE_OPERATIONAL_MODE as string | undefined;
  if (envMode === 'REAL' || envMode === 'FALLBACK' || envMode === 'MOCK') return envMode;

  // 2. Check localStorage
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'REAL' || stored === 'FALLBACK' || stored === 'MOCK') return stored;
  } catch { /* ignore */ }

  // 3. Default
  return 'FALLBACK';
}

// Exporting both ModeProvider and useMode from the same file triggers
// react-refresh/only-export-components. The disable is necessary because
// the hook must live alongside its context provider for encapsulation.
// eslint-disable-next-line react-refresh/only-export-components
export function useMode(): ModeContextValue {
  const ctx = useContext(ModeContext);
  if (!ctx) throw new Error('useMode must be used within ModeProvider');
  return ctx;
}

export function ModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<OperationalMode>(getInitialMode);
  const [backendReachable, setBackendReachable] = useState(false);

  // Probe backend health on mount
  useEffect(() => {
    let cancelled = false;
    async function probe() {
      try {
        await api.healthCheck();
        if (!cancelled) setBackendReachable(true);
      } catch {
        if (!cancelled) setBackendReachable(false);
        log.warn('Backend health check failed — backend unreachable');
      }
    }
    probe();
    return () => { cancelled = true; };
  }, []);

  // Sync mode to dataService and localStorage
  useEffect(() => {
    setDataServiceMode(mode);
    try { localStorage.setItem(STORAGE_KEY, mode); } catch { /* ignore */ }
    log.info('Operational mode set', { mode });
  }, [mode]);

  const setMode = useCallback((newMode: OperationalMode) => {
    setModeState(newMode);
  }, []);

  const capabilities = resolveCapabilities(mode, backendReachable);

  const state: ModeState = {
    mode,
    resolvedAt: new Date().toISOString(),
    capabilities,
    backendReachable,
  };

  const getDomainCapability = useCallback((domain: DomainName) => {
    return capabilities.get(domain);
  }, [capabilities]);

  return (
    <ModeContext.Provider value={{ state, setMode, getDomainCapability }}>
      {children}
    </ModeContext.Provider>
  );
}
