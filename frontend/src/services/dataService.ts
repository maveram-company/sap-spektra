// ══════════════════════════════════════════════════════════════
// SAP Spektra — Data Service Layer (Barrel)
// ══════════════════════════════════════════════════════════════
// Split by domain for maintainability. Each module handles:
//   - Real API calls (production mode)
//   - Mock fallback (demo mode or API failure)
//   - Transform functions (API → frontend ViewModel)
//
// See individual service files for data source documentation.
// ══════════════════════════════════════════════════════════════

export * from './systems.service';
export * from './alerts.service';
export * from './events.service';
export * from './operations.service';
export * from './runbooks.service';
export * from './approvals.service';
export * from './analytics.service';
export * from './ha.service';
export * from './admin.service';
export * from './landscape.service';
export * from './connectors.service';
export * from './chat.service';

// ── Backward-compatible dataService object ──
// All pages import { dataService } and call dataService.getSystems(), etc.
// This aggregated object preserves that API contract.

import {
  getSystems, getSystemById, getSystemMetrics, getSystemBreaches,
  getSystemSla, getServerMetrics, getServerDeps, getSystemInstances,
  getSystemHosts, getSystemMeta, getSAPMonitoring, getMetricHistory,
} from './systems.service';
import { getAlerts, getAlertStats } from './alerts.service';
import { getEvents } from './events.service';
import {
  getOperations, getBackgroundJobs, getTransports, getCertificates, getLicenses,
} from './operations.service';
import {
  getRunbooks, getRunbookExecutions, executeRunbook, getExecutionDetail,
} from './runbooks.service';
import { getApprovals, approveAction, rejectAction } from './approvals.service';
import { getAnalytics, getRunbookAnalytics } from './analytics.service';
import { getHASystems, getHAPrereqs, getHAOpsHistory, getHADrivers } from './ha.service';
import {
  getUsers, getAuditLog, getPlans, getApiKeys,
  getThresholds, getEscalationPolicy, getMaintenanceWindows,
} from './admin.service';
import { getDiscovery, getSIDLines, getLandscapeValidation } from './landscape.service';
import { getConnectors } from './connectors.service';
import { chat, getAIUseCases, getAIResponses } from './chat.service';

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
