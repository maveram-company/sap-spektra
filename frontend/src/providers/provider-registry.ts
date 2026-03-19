// ══════════════════════════════════════════════════════════════
// SAP Spektra — Provider Registry
// Maps domain + mode → provider instance.
// ══════════════════════════════════════════════════════════════

import type { OperationalMode } from '../mode/types';

// Systems
import type { SystemsProvider } from './systems/systems.contract';
import { SystemsRealProvider } from './systems/systems.real';
import { SystemsMockProvider } from './systems/systems.mock';
import { createSystemsFallbackProvider } from './systems/systems.fallback';

// Alerts
import type { AlertsProvider } from './alerts/alerts.contract';
import { AlertsRealProvider } from './alerts/alerts.real';
import { AlertsMockProvider } from './alerts/alerts.mock';
import { createAlertsFallbackProvider } from './alerts/alerts.fallback';

// Events
import type { EventsProvider } from './events/events.contract';
import { EventsRealProvider } from './events/events.real';
import { EventsMockProvider } from './events/events.mock';
import { createEventsFallbackProvider } from './events/events.fallback';

// Operations
import type { OperationsProvider } from './operations/operations.contract';
import { OperationsRealProvider } from './operations/operations.real';
import { OperationsMockProvider } from './operations/operations.mock';
import { createOperationsFallbackProvider } from './operations/operations.fallback';

// Runbooks
import type { RunbooksProvider } from './runbooks/runbooks.contract';
import { RunbooksRealProvider } from './runbooks/runbooks.real';
import { RunbooksMockProvider } from './runbooks/runbooks.mock';
import { createRunbooksFallbackProvider } from './runbooks/runbooks.fallback';

// Approvals
import type { ApprovalsProvider } from './approvals/approvals.contract';
import { ApprovalsRealProvider } from './approvals/approvals.real';
import { ApprovalsMockProvider } from './approvals/approvals.mock';
import { createApprovalsFallbackProvider } from './approvals/approvals.fallback';

// Analytics
import type { AnalyticsProvider } from './analytics/analytics.contract';
import { AnalyticsRealProvider } from './analytics/analytics.real';
import { AnalyticsMockProvider } from './analytics/analytics.mock';
import { createAnalyticsFallbackProvider } from './analytics/analytics.fallback';

// HA
import type { HAProvider } from './ha/ha.contract';
import { HARealProvider } from './ha/ha.real';
import { HAMockProvider } from './ha/ha.mock';
import { createHAFallbackProvider } from './ha/ha.fallback';

// Admin
import type { AdminProvider } from './admin/admin.contract';
import { AdminRealProvider } from './admin/admin.real';
import { AdminMockProvider } from './admin/admin.mock';
import { createAdminFallbackProvider } from './admin/admin.fallback';

// Landscape
import type { LandscapeProvider } from './landscape/landscape.contract';
import { LandscapeRealProvider } from './landscape/landscape.real';
import { LandscapeMockProvider } from './landscape/landscape.mock';
import { createLandscapeFallbackProvider } from './landscape/landscape.fallback';

// Connectors
import type { ConnectorsProvider } from './connectors/connectors.contract';
import { ConnectorsRealProvider } from './connectors/connectors.real';
import { ConnectorsMockProvider } from './connectors/connectors.mock';
import { createConnectorsFallbackProvider } from './connectors/connectors.fallback';

// Chat
import type { ChatProvider } from './chat/chat.contract';
import { ChatRealProvider } from './chat/chat.real';
import { ChatMockProvider } from './chat/chat.mock';
import { createChatFallbackProvider } from './chat/chat.fallback';

// Restricted providers (all 12 domains)
import { SystemsRestrictedProvider } from './systems/systems.restricted';
import { AlertsRestrictedProvider } from './alerts/alerts.restricted';
import { EventsRestrictedProvider } from './events/events.restricted';
import { OperationsRestrictedProvider } from './operations/operations.restricted';
import { RunbooksRestrictedProvider } from './runbooks/runbooks.restricted';
import { ApprovalsRestrictedProvider } from './approvals/approvals.restricted';
import { AnalyticsRestrictedProvider } from './analytics/analytics.restricted';
import { HARestrictedProvider } from './ha/ha.restricted';
import { AdminRestrictedProvider } from './admin/admin.restricted';
import { LandscapeRestrictedProvider } from './landscape/landscape.restricted';
import { ConnectorsRestrictedProvider } from './connectors/connectors.restricted';
import { ChatRestrictedProvider } from './chat/chat.restricted';

export interface ProviderRegistry {
  systems: SystemsProvider;
  alerts: AlertsProvider;
  events: EventsProvider;
  operations: OperationsProvider;
  runbooks: RunbooksProvider;
  approvals: ApprovalsProvider;
  analytics: AnalyticsProvider;
  ha: HAProvider;
  admin: AdminProvider;
  landscape: LandscapeProvider;
  connectors: ConnectorsProvider;
  chat: ChatProvider;
}

function createRegistry(mode: OperationalMode): ProviderRegistry {
  switch (mode) {
    case 'REAL':
      return {
        systems: new SystemsRealProvider(),
        alerts: new AlertsRealProvider(),
        events: new EventsRealProvider(),
        operations: new OperationsRealProvider(),
        runbooks: new RunbooksRealProvider(),
        approvals: new ApprovalsRealProvider(),
        analytics: new AnalyticsRealProvider(),
        ha: new HARealProvider(),
        admin: new AdminRealProvider(),
        landscape: new LandscapeRealProvider(),
        connectors: new ConnectorsRealProvider(),
        chat: new ChatRealProvider(),
      };

    case 'MOCK':
      return {
        systems: new SystemsMockProvider(),
        alerts: new AlertsMockProvider(),
        events: new EventsMockProvider(),
        operations: new OperationsMockProvider(),
        runbooks: new RunbooksMockProvider(),
        approvals: new ApprovalsMockProvider(),
        analytics: new AnalyticsMockProvider(),
        ha: new HAMockProvider(),
        admin: new AdminMockProvider(),
        landscape: new LandscapeMockProvider(),
        connectors: new ConnectorsMockProvider(),
        chat: new ChatMockProvider(),
      };

    case 'RESTRICTED':
      return {
        systems: new SystemsRestrictedProvider(),
        alerts: new AlertsRestrictedProvider(),
        events: new EventsRestrictedProvider(),
        operations: new OperationsRestrictedProvider(),
        runbooks: new RunbooksRestrictedProvider(),
        approvals: new ApprovalsRestrictedProvider(),
        analytics: new AnalyticsRestrictedProvider(),
        ha: new HARestrictedProvider(),
        admin: new AdminRestrictedProvider(),
        landscape: new LandscapeRestrictedProvider(),
        connectors: new ConnectorsRestrictedProvider(),
        chat: new ChatRestrictedProvider(),
      };

    case 'FALLBACK':
    default:
      return {
        systems: createSystemsFallbackProvider(),
        alerts: createAlertsFallbackProvider(),
        events: createEventsFallbackProvider(),
        operations: createOperationsFallbackProvider(),
        runbooks: createRunbooksFallbackProvider(),
        approvals: createApprovalsFallbackProvider(),
        analytics: createAnalyticsFallbackProvider(),
        ha: createHAFallbackProvider(),
        admin: createAdminFallbackProvider(),
        landscape: createLandscapeFallbackProvider(),
        connectors: createConnectorsFallbackProvider(),
        chat: createChatFallbackProvider(),
      };
  }
}

export function getRegistry(mode: OperationalMode): ProviderRegistry {
  return createRegistry(mode);
}
