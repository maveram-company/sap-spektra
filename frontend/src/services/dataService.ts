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

// ── Systems (unwrap .data for backward compat) ──

export const getSystems = async () => (await registry().systems.getSystems()).data;
export const getSystemById = async (id: string) => (await registry().systems.getSystemById(id)).data;
export const getSystemMetrics = async (id: string, hours = 2) => (await registry().systems.getSystemMetrics(id, hours)).data;
export const getSystemBreaches = async (id: string, limit = 50) => (await registry().systems.getSystemBreaches(id, limit)).data;
export const getSystemSla = async (id: string) => (await registry().systems.getSystemSla(id)).data;
export const getServerMetrics = async (id: string) => (await registry().systems.getServerMetrics(id)).data;
export const getServerDeps = async (id: string) => (await registry().systems.getServerDeps(id)).data;
export const getSystemInstances = async (id: string) => (await registry().systems.getSystemInstances(id)).data;
export const getSystemHosts = async (id: string) => (await registry().systems.getSystemHosts(id)).data;
export const getSystemMeta = async (id?: string) => (await registry().systems.getSystemMeta(id)).data;
export const getSAPMonitoring = async (id: string) => (await registry().systems.getSAPMonitoring(id)).data;
export const getMetricHistory = async (hostname: string) => (await registry().systems.getMetricHistory(hostname)).data;

// ── Alerts (unwrap .data for backward compat) ──

export const getAlerts = async (filters?: { status?: string; level?: string; systemId?: string }) => (await registry().alerts.getAlerts(filters)).data;
export const getAlertStats = async () => (await registry().alerts.getAlertStats()).data;

// ── Events ──

export const getEvents = async () => registry().events.getEvents();

// ── Operations ──

export const getOperations = async () => registry().operations.getOperations();
export const getBackgroundJobs = async () => registry().operations.getBackgroundJobs();
export const getTransports = async () => registry().operations.getTransports();
export const getCertificates = async () => registry().operations.getCertificates();
export const getLicenses = async () => registry().operations.getLicenses();

// ── Runbooks (unwrap .data for backward compat) ──

export const getRunbooks = async () => (await registry().runbooks.getRunbooks()).data;
export const getRunbookExecutions = async () => (await registry().runbooks.getRunbookExecutions()).data;
export const executeRunbook = async (runbookId: string, systemId: string, dryRun = false) => (await registry().runbooks.executeRunbook(runbookId, systemId, dryRun)).data;
export const getExecutionDetail = async (executionId: string) => (await registry().runbooks.getExecutionDetail(executionId)).data;

// ── Approvals (unwrap .data for backward compat) ──

export const getApprovals = async (status?: string) => (await registry().approvals.getApprovals(status)).data;
export const approveAction = async (id: string) => (await registry().approvals.approveAction(id)).data;
export const rejectAction = async (id: string) => (await registry().approvals.rejectAction(id)).data;

// ── Full ProviderResult accessors for core domains ──

export const getSystemsResult = async () => registry().systems.getSystems();
export const getAlertsResult = async (filters?: { status?: string; level?: string; systemId?: string }) => registry().alerts.getAlerts(filters);
export const getRunbooksResult = async () => registry().runbooks.getRunbooks();
export const getApprovalsResult = async (status?: string) => registry().approvals.getApprovals(status);

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
