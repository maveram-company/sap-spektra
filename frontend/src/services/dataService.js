// ══════════════════════════════════════════════════════════════
// SAP Spektra — Data Service Layer
// Capa intermedia entre páginas y fuente de datos.
// En demoMode: retorna mocks con delay simulado.
// En producción: llama a la API real vía useApi.js.
// ══════════════════════════════════════════════════════════════

import config from '../config';
import { api } from '../hooks/useApi';
import {
  mockSystems,
  mockUsers,
  mockApprovals,
  mockOperations,
  mockAuditLog,
  mockBreaches,
  mockAlerts,
  mockRunbooks,
  mockRunbookExecutions,
  mockEvents,
  mockDiscovery,
  mockAIResponses,
  mockAIUseCases,
  mockConnectors,
  mockHASystems,
  mockHAPrereqs,
  mockHAOpsHistory,
  mockHADrivers,
  mockMetrics,
  mockAnalytics,
  mockServerMetrics,
  mockServerDeps,
  mockSystemInstances,
  mockMetricHistory,
  getSystemHosts,
  mockSystemMeta,
  mockSIDLines,
  mockSAPMonitoring,
  mockBackgroundJobs,
  mockTransports,
  mockCertificates,
  mockLicenses,
  mockLandscapeValidation,
  mockThresholds,
  mockEscalationPolicy,
  mockMaintenanceWindows,
  mockApiKeys,
} from '../lib/mockData';

// Simula latencia de red en modo demo
const delay = (ms = 400) => new Promise(r => setTimeout(r, ms));

const isDemoMode = () => config.features.demoMode;

export const dataService = {
  // ── Sistemas SAP ──
  getSystems: async () => {
    if (isDemoMode()) { await delay(); return mockSystems; }
    return api.getSystems();
  },

  getSystemById: async (id) => {
    if (isDemoMode()) { await delay(); return mockSystems.find(s => s.id === id) || null; }
    return api.getSystemById(id);
  },

  getSystemMetrics: async (id, hours = 2) => {
    if (isDemoMode()) { await delay(300); return mockMetrics(); }
    return api.getSystemHostMetrics(id, hours);
  },

  getSystemBreaches: async (id, limit = 50) => {
    if (isDemoMode()) {
      await delay(300);
      return id
        ? mockBreaches.filter(b => b.systemId === id).slice(0, limit)
        : mockBreaches.slice(0, limit);
    }
    return api.getBreaches(id);
  },

  getSystemSla: async (id) => {
    if (isDemoMode()) {
      await delay(300);
      const sys = mockSystems.find(s => s.id === id);
      return sys ? { mttr: sys.mttr, mtbf: sys.mtbf, availability: sys.availability } : null;
    }
    // SLA endpoint to be built — use health snapshots for now
    return api.getHealthSnapshots(id, 720);
  },

  getServerMetrics: async (id) => {
    if (isDemoMode()) { await delay(300); return mockServerMetrics[id] || null; }
    return api.getHosts(id);
  },

  getServerDeps: async (id) => {
    if (isDemoMode()) { await delay(300); return mockServerDeps[id] || null; }
    return api.getDependencies(id);
  },

  getSystemInstances: async (id) => {
    if (isDemoMode()) { await delay(300); return mockSystemInstances[id] || []; }
    return api.getComponents(id);
  },

  getMetricHistory: async (hostname) => {
    if (isDemoMode()) { await delay(300); return mockMetricHistory[hostname] || []; }
    // In production, find host by hostname and get metrics
    return mockMetricHistory[hostname] || [];
  },

  getSystemHosts: async (id) => {
    if (isDemoMode()) { await delay(200); return getSystemHosts(id); }
    return api.getHosts(id);
  },

  getSystemMeta: async (id) => {
    if (isDemoMode()) { await delay(200); return id ? (mockSystemMeta[id] || null) : mockSystemMeta; }
    return api.getSystemMeta(id);
  },

  getSAPMonitoring: async (id) => {
    if (isDemoMode()) { await delay(300); return mockSAPMonitoring[id] || null; }
    return mockSAPMonitoring[id] || null; // SAP-specific monitoring — future endpoint
  },

  // ── Usuarios ──
  getUsers: async () => {
    if (isDemoMode()) { await delay(); return mockUsers; }
    return api.getUsers();
  },

  // ── Aprobaciones ──
  getApprovals: async (status) => {
    if (isDemoMode()) {
      await delay();
      return status ? mockApprovals.filter(a => a.status === status) : mockApprovals;
    }
    return api.getApprovals(status);
  },

  approveAction: async (id) => {
    if (isDemoMode()) { await delay(300); return { success: true }; }
    return api.approveAction(id);
  },

  rejectAction: async (id) => {
    if (isDemoMode()) { await delay(300); return { success: true }; }
    return api.rejectAction(id);
  },

  // ── Operaciones ──
  getOperations: async () => {
    if (isDemoMode()) { await delay(); return mockOperations; }
    return api.getOperations();
  },

  // ── Audit Log ──
  getAuditLog: async () => {
    if (isDemoMode()) { await delay(); return mockAuditLog; }
    return api.getAuditLog();
  },

  // ── Alertas ──
  getAlerts: async () => {
    if (isDemoMode()) { await delay(); return mockAlerts; }
    return api.getAlerts();
  },

  // ── Eventos ──
  getEvents: async () => {
    if (isDemoMode()) { await delay(); return mockEvents; }
    return api.getEvents();
  },

  // ── Runbooks ──
  getRunbooks: async () => {
    if (isDemoMode()) { await delay(); return mockRunbooks; }
    return api.getRunbooks();
  },

  getRunbookExecutions: async () => {
    if (isDemoMode()) { await delay(300); return mockRunbookExecutions; }
    return api.getRunbookExecutions();
  },

  // ── Discovery / Landscape ──
  getDiscovery: async () => {
    if (isDemoMode()) { await delay(); return mockDiscovery; }
    // Discovery is derived from systems + components
    const systems = await api.getSystems();
    return systems;
  },

  getSIDLines: async () => {
    if (isDemoMode()) { await delay(300); return mockSIDLines; }
    return mockSIDLines; // Frontend-only visualization data
  },

  getLandscapeValidation: async () => {
    if (isDemoMode()) { await delay(300); return mockLandscapeValidation; }
    return mockLandscapeValidation; // Frontend-only validation rules
  },

  // ── AI / Chat ──
  getAIUseCases: async () => {
    if (isDemoMode()) { await delay(300); return mockAIUseCases; }
    return mockAIUseCases; // Static UI content
  },

  getAIResponses: async () => {
    if (isDemoMode()) { await delay(300); return mockAIResponses; }
    return mockAIResponses; // Static UI content
  },

  chat: async (message, context) => {
    if (isDemoMode()) { await delay(800); return mockAIResponses.estado; }
    return api.chat(message, context);
  },

  // ── Conectores ──
  getConnectors: async () => {
    if (isDemoMode()) { await delay(); return mockConnectors; }
    return api.getConnectors();
  },

  // ── HA / DR ──
  getHASystems: async () => {
    if (isDemoMode()) { await delay(); return mockHASystems; }
    return api.getHAConfigs();
  },

  getHAPrereqs: async (strategy) => {
    if (isDemoMode()) { await delay(300); return strategy ? mockHAPrereqs[strategy] : mockHAPrereqs; }
    return mockHAPrereqs; // Static prerequisite data
  },

  getHAOpsHistory: async () => {
    if (isDemoMode()) { await delay(300); return mockHAOpsHistory; }
    return mockHAOpsHistory; // Future: operations filtered by HA type
  },

  getHADrivers: async () => {
    if (isDemoMode()) { await delay(300); return mockHADrivers; }
    return mockHADrivers; // Static driver configuration data
  },

  // ── Analytics ──
  getAnalytics: async (systemId) => {
    if (isDemoMode()) { await delay(); return mockAnalytics; }
    return api.getAnalytics(systemId);
  },

  // ── Background Jobs ──
  getBackgroundJobs: async () => {
    if (isDemoMode()) { await delay(); return mockBackgroundJobs; }
    return api.getJobs();
  },

  // ── Transports ──
  getTransports: async () => {
    if (isDemoMode()) { await delay(); return mockTransports; }
    return api.getTransports();
  },

  // ── Certificados y Licencias ──
  getCertificates: async () => {
    if (isDemoMode()) { await delay(); return mockCertificates; }
    return api.getCertificates();
  },

  getLicenses: async () => {
    if (isDemoMode()) { await delay(300); return mockLicenses; }
    return mockLicenses; // Future: license management endpoint
  },

  // ── Settings ──
  getThresholds: async () => {
    if (isDemoMode()) { await delay(300); return mockThresholds; }
    return mockThresholds; // Future: settings endpoint
  },

  getEscalationPolicy: async () => {
    if (isDemoMode()) { await delay(300); return mockEscalationPolicy; }
    return mockEscalationPolicy; // Future: settings endpoint
  },

  getMaintenanceWindows: async () => {
    if (isDemoMode()) { await delay(300); return mockMaintenanceWindows; }
    return mockMaintenanceWindows; // Future: settings endpoint
  },

  getApiKeys: async () => {
    if (isDemoMode()) { await delay(300); return mockApiKeys; }
    return mockApiKeys; // Future: API key management endpoint
  },
};
