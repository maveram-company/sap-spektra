// ══════════════════════════════════════════════════════════════
// SAP Spektra — Data Service Layer (Provider-backed)
// ══════════════════════════════════════════════════════════════
// Delegates to the canonical multi-mode provider architecture.
// All functions and the dataService object maintain the exact
// same API contract as before — zero page changes required.
//
// Mode resolution:
//   1. Explicit setDataServiceMode() call
//   2. config.features.demoMode (backward compat)
// ══════════════════════════════════════════════════════════════

import config from '../config';
import type { OperationalMode } from '../mode/types';
import { getRegistry, type ProviderRegistry } from '../providers/provider-registry';

// Re-export transform functions so tests and any external consumers still work
export { transformSystem } from '../providers/systems/systems.real';
export { transformAlert } from '../providers/alerts/alerts.real';
export { transformEvent } from '../providers/events/events.real';
export { transformConnector } from '../providers/connectors/connectors.real';
export { transformApproval } from '../providers/approvals/approvals.real';
export { transformRunbook, transformRunbookExecution } from '../providers/runbooks/runbooks.real';
export { transformOperation, transformJob, transformTransport, transformCertificate } from '../providers/operations/operations.real';
export { transformAnalytics } from '../providers/analytics/analytics.real';
export { transformDiscovery } from '../providers/landscape/landscape.real';
export { transformHAConfig } from '../providers/ha/ha.real';
export { transformAudit } from '../providers/admin/admin.real';

// ── Mode state ──

let currentMode: OperationalMode = 'REAL';

function resolveMode(): OperationalMode {
  // If config.features.demoMode is true (set by tests or config),
  // treat it as MOCK mode for backward compatibility
  if (config.features.demoMode) return 'MOCK';
  return currentMode;
}

export function setDataServiceMode(mode: OperationalMode) {
  currentMode = mode;
}

export function getDataServiceMode(): OperationalMode {
  return resolveMode();
}

// ── Lazy provider access ──

function registry(): ProviderRegistry {
  return getRegistry(resolveMode());
}

// ── Systems ──

export const getSystems = async () => registry().systems.getSystems();
export const getSystemById = async (id: string) => registry().systems.getSystemById(id);
export const getSystemMetrics = async (id: string, hours = 2) => registry().systems.getSystemMetrics(id, hours);
export const getSystemBreaches = async (id: string, limit = 50) => registry().systems.getSystemBreaches(id, limit);
export const getSystemSla = async (id: string) => registry().systems.getSystemSla(id);
export const getServerMetrics = async (id: string) => registry().systems.getServerMetrics(id);
export const getServerDeps = async (id: string) => registry().systems.getServerDeps(id);
export const getSystemInstances = async (id: string) => registry().systems.getSystemInstances(id);
export const getSystemHosts = async (id: string) => registry().systems.getSystemHosts(id);
export const getSystemMeta = async (id?: string) => registry().systems.getSystemMeta(id);
export const getSAPMonitoring = async (id: string) => registry().systems.getSAPMonitoring(id);
export const getMetricHistory = async (hostname: string) => registry().systems.getMetricHistory(hostname);

// ── Alerts ──

export const getAlerts = async (filters?: { status?: string; level?: string; systemId?: string }) => registry().alerts.getAlerts(filters);
export const getAlertStats = async () => registry().alerts.getAlertStats();

// ── Events ──

export const getEvents = async () => registry().events.getEvents();

// ── Operations ──

export const getOperations = async () => registry().operations.getOperations();
export const getBackgroundJobs = async () => registry().operations.getBackgroundJobs();
export const getTransports = async () => registry().operations.getTransports();
export const getCertificates = async () => registry().operations.getCertificates();
export const getLicenses = async () => registry().operations.getLicenses();

// ── Runbooks ──

export const getRunbooks = async () => registry().runbooks.getRunbooks();
export const getRunbookExecutions = async () => registry().runbooks.getRunbookExecutions();
export const executeRunbook = async (runbookId: string, systemId: string, dryRun = false) => registry().runbooks.executeRunbook(runbookId, systemId, dryRun);
export const getExecutionDetail = async (executionId: string) => registry().runbooks.getExecutionDetail(executionId);

// ── Approvals ──

export const getApprovals = async (status?: string) => registry().approvals.getApprovals(status);
export const approveAction = async (id: string) => registry().approvals.approveAction(id);
export const rejectAction = async (id: string) => registry().approvals.rejectAction(id);

// ── Analytics ──

export const getAnalytics = async () => registry().analytics.getAnalytics();
export const getRunbookAnalytics = async () => registry().analytics.getRunbookAnalytics();

// ── HA / DR ──

export const getHASystems = async () => registry().ha.getHASystems();
export const getHAPrereqs = async (systemId?: string) => registry().ha.getHAPrereqs(systemId);
export const getHAOpsHistory = async (systemId?: string) => registry().ha.getHAOpsHistory(systemId);
export const getHADrivers = async (systemId?: string) => registry().ha.getHADrivers(systemId);

// ── Admin ──

export const getUsers = async () => registry().admin.getUsers();
export const getAuditLog = async () => registry().admin.getAuditLog();
export const getPlans = async () => registry().admin.getPlans();
export const getApiKeys = async () => registry().admin.getApiKeys();
export const getThresholds = async () => registry().admin.getThresholds();
export const getEscalationPolicy = async () => registry().admin.getEscalationPolicy();
export const getMaintenanceWindows = async () => registry().admin.getMaintenanceWindows();

// ── Landscape ──

export const getDiscovery = async () => registry().landscape.getDiscovery();
export const getSIDLines = async () => registry().landscape.getSIDLines();
export const getLandscapeValidation = async () => registry().landscape.getLandscapeValidation();

// ── Connectors ──

export const getConnectors = async () => registry().connectors.getConnectors();

// ── Chat / AI ──

export const chat = async (message: string, context: unknown) => registry().chat.chat(message, context);
export const getAIUseCases = async () => registry().chat.getAIUseCases();
export const getAIResponses = async () => registry().chat.getAIResponses();

// ── Backward-compatible dataService object ──
// All pages import { dataService } and call dataService.getSystems(), etc.

export const dataService = {
  // Systems
  getSystems,
  getSystemById,
  getSystemMetrics,
  getSystemBreaches,
  getSystemSla,
  getServerMetrics,
  getServerDeps,
  getSystemInstances,
  getSystemHosts,
  getSystemMeta,
  getSAPMonitoring,
  getMetricHistory,

  // Alerts
  getAlerts,
  getAlertStats,

  // Events
  getEvents,

  // Operations
  getOperations,
  getBackgroundJobs,
  getTransports,
  getCertificates,
  getLicenses,

  // Runbooks
  getRunbooks,
  getRunbookExecutions,
  executeRunbook,
  getExecutionDetail,

  // Approvals
  getApprovals,
  approveAction,
  rejectAction,

  // Analytics
  getAnalytics,
  getRunbookAnalytics,

  // HA / DR
  getHASystems,
  getHAPrereqs,
  getHAOpsHistory,
  getHADrivers,

  // Admin
  getUsers,
  getAuditLog,
  getPlans,
  getApiKeys,
  getThresholds,
  getEscalationPolicy,
  getMaintenanceWindows,

  // Landscape
  getDiscovery,
  getSIDLines,
  getLandscapeValidation,

  // Connectors
  getConnectors,

  // Chat / AI
  chat,
  getAIUseCases,
  getAIResponses,
};
