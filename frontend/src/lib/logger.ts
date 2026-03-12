// ══════════════════════════════════════════════════════════════
// SAP Spektra — Structured Logger
// Lightweight structured logging for frontend observability.
// In production (import.meta.env.PROD), debug logs are suppressed.
// ══════════════════════════════════════════════════════════════

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  component?: string;
  message: string;
  data?: Record<string, unknown>;
}

function emit(level: LogLevel, component: string | undefined, message: string, data?: Record<string, unknown>) {
  if (level === 'debug' && import.meta.env.PROD) return;

  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    ...(component && { component }),
    message,
    ...(data && { data }),
  };

  const consoleFn =
    level === 'error' ? console.error :
    level === 'warn' ? console.warn :
    level === 'debug' ? console.debug :
    console.info;

  consoleFn(`[${entry.level.toUpperCase()}]`, JSON.stringify(entry));
}

/** Create a logger scoped to a component name. */
export function createLogger(component: string) {
  return {
    debug: (message: string, data?: Record<string, unknown>) => emit('debug', component, message, data),
    info:  (message: string, data?: Record<string, unknown>) => emit('info',  component, message, data),
    warn:  (message: string, data?: Record<string, unknown>) => emit('warn',  component, message, data),
    error: (message: string, data?: Record<string, unknown>) => emit('error', component, message, data),
  };
}

/** Default (unscoped) logger. */
const logger = {
  debug: (message: string, data?: Record<string, unknown>) => emit('debug', undefined, message, data),
  info:  (message: string, data?: Record<string, unknown>) => emit('info',  undefined, message, data),
  warn:  (message: string, data?: Record<string, unknown>) => emit('warn',  undefined, message, data),
  error: (message: string, data?: Record<string, unknown>) => emit('error', undefined, message, data),
};

export default logger;
