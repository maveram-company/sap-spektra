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
  // RESTRICTED is a valid mode — pass through to registry
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

// ── Events (unwrap .data for backward compat) ──

export const getEvents = async () => (await registry().events.getEvents()).data;

// ── Operations (unwrap .data for backward compat) ──

export const getOperations = async () => (await registry().operations.getOperations()).data;
export const getBackgroundJobs = async () => (await registry().operations.getBackgroundJobs()).data;
export const getTransports = async () => (await registry().operations.getTransports()).data;
export const getCertificates = async () => (await registry().operations.getCertificates()).data;
export const getLicenses = async () => (await registry().operations.getLicenses()).data;

// ── Runbooks (unwrap .data for backward compat) ──

export const getRunbooks = async () => (await registry().runbooks.getRunbooks()).data;
export const getRunbookExecutions = async () => (await registry().runbooks.getRunbookExecutions()).data;
export const executeRunbook = async (runbookId: string, systemId: string, dryRun = false) => (await registry().runbooks.executeRunbook(runbookId, systemId, dryRun)).data;
export const getExecutionDetail = async (executionId: string) => (await registry().runbooks.getExecutionDetail(executionId)).data;

// ── Approvals (unwrap .data for backward compat) ──

export const getApprovals = async (status?: string) => (await registry().approvals.getApprovals(status)).data;
export const approveAction = async (id: string) => (await registry().approvals.approveAction(id)).data;
export const rejectAction = async (id: string) => (await registry().approvals.rejectAction(id)).data;

// ── Analytics (unwrap .data for backward compat) ──

export const getAnalytics = async () => (await registry().analytics.getAnalytics()).data;
export const getRunbookAnalytics = async () => (await registry().analytics.getRunbookAnalytics()).data;

// ── HA / DR (unwrap .data for backward compat) ──

export const getHASystems = async () => (await registry().ha.getHASystems()).data;
export const getHAPrereqs = async (systemId?: string) => (await registry().ha.getHAPrereqs(systemId)).data;
export const getHAOpsHistory = async (systemId?: string) => (await registry().ha.getHAOpsHistory(systemId)).data;
export const getHADrivers = async (systemId?: string) => (await registry().ha.getHADrivers(systemId)).data;

// ── Admin (unwrap .data for backward compat) ──

export const getUsers = async () => (await registry().admin.getUsers()).data;
export const getAuditLog = async () => (await registry().admin.getAuditLog()).data;
export const getPlans = async () => (await registry().admin.getPlans()).data;
export const getApiKeys = async () => (await registry().admin.getApiKeys()).data;
export const getThresholds = async () => (await registry().admin.getThresholds()).data;
export const getEscalationPolicy = async () => (await registry().admin.getEscalationPolicy()).data;
export const getMaintenanceWindows = async () => (await registry().admin.getMaintenanceWindows()).data;

// ── Landscape (unwrap .data for backward compat) ──

export const getDiscovery = async () => (await registry().landscape.getDiscovery()).data;
export const getSIDLines = async () => (await registry().landscape.getSIDLines()).data;
export const getLandscapeValidation = async () => (await registry().landscape.getLandscapeValidation()).data;

// ── Connectors (unwrap .data for backward compat) ──

export const getConnectors = async () => (await registry().connectors.getConnectors()).data;

// ── Chat / AI (unwrap .data for backward compat) ──

export const chat = async (message: string, context: unknown) => (await registry().chat.chat(message, context)).data;
export const getAIUseCases = async () => (await registry().chat.getAIUseCases()).data;
export const getAIResponses = async () => (await registry().chat.getAIResponses()).data;

// ── Full ProviderResult accessors for all domains ──

export const getSystemsResult = async () => registry().systems.getSystems();
export const getAlertsResult = async (filters?: { status?: string; level?: string; systemId?: string }) => registry().alerts.getAlerts(filters);
export const getRunbooksResult = async () => registry().runbooks.getRunbooks();
export const getApprovalsResult = async (status?: string) => registry().approvals.getApprovals(status);
export const getEventsResult = async () => registry().events.getEvents();
export const getOperationsResult = async () => registry().operations.getOperations();
export const getHASystemsResult = async () => registry().ha.getHASystems();
export const getConnectorsResult = async () => registry().connectors.getConnectors();
export const getUsersResult = async () => registry().admin.getUsers();
export const getDiscoveryResult = async () => registry().landscape.getDiscovery();
export const getAnalyticsResult = async () => registry().analytics.getAnalytics();
export const chatResult = async (message: string, context: unknown) => registry().chat.chat(message, context);
export const executeRunbookResult = async (runbookId: string, systemId: string, dryRun = false) => registry().runbooks.executeRunbook(runbookId, systemId, dryRun);
export const approveActionResult = async (id: string) => registry().approvals.approveAction(id);
export const rejectActionResult = async (id: string) => registry().approvals.rejectAction(id);

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

  // Full ProviderResult accessors
  getSystemsResult,
  getAlertsResult,
  getRunbooksResult,
  getApprovalsResult,
  getEventsResult,
  getOperationsResult,
  getHASystemsResult,
  getConnectorsResult,
  getUsersResult,
  getDiscoveryResult,
  getAnalyticsResult,
  chatResult,
  executeRunbookResult,
  approveActionResult,
  rejectActionResult,
};
