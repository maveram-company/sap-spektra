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
    const systems = await api.getSystems();
    return systems.find(s => s.id === id) || null;
  },

  getSystemMetrics: async (id, hours = 2) => {
    if (isDemoMode()) { await delay(300); return mockMetrics(); }
    return api.getSystemMetrics(id, hours);
  },

  getSystemBreaches: async (id, limit = 50) => {
    if (isDemoMode()) {
      await delay(300);
      return id
        ? mockBreaches.filter(b => b.systemId === id).slice(0, limit)
        : mockBreaches.slice(0, limit);
    }
    return api.getSystemBreaches(id, limit);
  },

  getSystemSla: async (id) => {
    if (isDemoMode()) {
      await delay(300);
      const sys = mockSystems.find(s => s.id === id);
      return sys ? { mttr: sys.mttr, mtbf: sys.mtbf, availability: sys.availability } : null;
    }
    return api.getSystemSla(id);
  },

  getServerMetrics: async (id) => {
    if (isDemoMode()) { await delay(300); return mockServerMetrics[id] || null; }
    return api.getSystems().then(() => mockServerMetrics[id]); // placeholder
  },

  getServerDeps: async (id) => {
    if (isDemoMode()) { await delay(300); return mockServerDeps[id] || null; }
    return mockServerDeps[id]; // placeholder
  },

  getSystemInstances: async (id) => {
    if (isDemoMode()) { await delay(300); return mockSystemInstances[id] || []; }
    return mockSystemInstances[id]; // placeholder
  },

  getMetricHistory: async (hostname) => {
    if (isDemoMode()) { await delay(300); return mockMetricHistory[hostname] || []; }
    return mockMetricHistory[hostname]; // placeholder
  },

  getSystemHosts: async (id) => {
    if (isDemoMode()) { await delay(200); return getSystemHosts(id); }
    return getSystemHosts(id); // placeholder
  },

  getSystemMeta: async (id) => {
    if (isDemoMode()) { await delay(200); return id ? (mockSystemMeta[id] || null) : mockSystemMeta; }
    return id ? (mockSystemMeta[id] || null) : mockSystemMeta; // placeholder
  },

  getSAPMonitoring: async (id) => {
    if (isDemoMode()) { await delay(300); return mockSAPMonitoring[id] || null; }
    return mockSAPMonitoring[id]; // placeholder
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

  approveAction: async (id, token) => {
    if (isDemoMode()) { await delay(300); return { success: true }; }
    return api.approveAction(id, token);
  },

  rejectAction: async (id, token) => {
    if (isDemoMode()) { await delay(300); return { success: true }; }
    return api.rejectAction(id, token);
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
    return api.getApprovals(); // placeholder — API endpoint TBD
  },

  // ── Eventos ──
  getEvents: async () => {
    if (isDemoMode()) { await delay(); return mockEvents; }
    return mockEvents; // placeholder — API endpoint TBD
  },

  // ── Runbooks ──
  getRunbooks: async () => {
    if (isDemoMode()) { await delay(); return mockRunbooks; }
    return mockRunbooks; // placeholder — API endpoint TBD
  },

  getRunbookExecutions: async () => {
    if (isDemoMode()) { await delay(300); return mockRunbookExecutions; }
    return mockRunbookExecutions; // placeholder — API endpoint TBD
  },

  // ── Discovery / Landscape ──
  getDiscovery: async () => {
    if (isDemoMode()) { await delay(); return mockDiscovery; }
    return mockDiscovery; // placeholder — API endpoint TBD
  },

  getSIDLines: async () => {
    if (isDemoMode()) { await delay(300); return mockSIDLines; }
    return mockSIDLines; // placeholder — API endpoint TBD
  },

  getLandscapeValidation: async () => {
    if (isDemoMode()) { await delay(300); return mockLandscapeValidation; }
    return mockLandscapeValidation; // placeholder — API endpoint TBD
  },

  // ── AI / Chat ──
  getAIUseCases: async () => {
    if (isDemoMode()) { await delay(300); return mockAIUseCases; }
    return mockAIUseCases; // placeholder — API endpoint TBD
  },

  getAIResponses: async () => {
    if (isDemoMode()) { await delay(300); return mockAIResponses; }
    return mockAIResponses; // placeholder — API endpoint TBD
  },

  chat: async (message, context) => {
    if (isDemoMode()) { await delay(800); return mockAIResponses.estado; }
    return api.chat(message, context);
  },

  // ── Conectores ──
  getConnectors: async () => {
    if (isDemoMode()) { await delay(); return mockConnectors; }
    return mockConnectors; // placeholder — API endpoint TBD
  },

  // ── HA / DR ──
  getHASystems: async () => {
    if (isDemoMode()) { await delay(); return mockHASystems; }
    return mockHASystems; // placeholder — API endpoint TBD
  },

  getHAPrereqs: async (strategy) => {
    if (isDemoMode()) { await delay(300); return strategy ? mockHAPrereqs[strategy] : mockHAPrereqs; }
    return mockHAPrereqs; // placeholder — API endpoint TBD
  },

  getHAOpsHistory: async () => {
    if (isDemoMode()) { await delay(300); return mockHAOpsHistory; }
    return mockHAOpsHistory; // placeholder — API endpoint TBD
  },

  getHADrivers: async () => {
    if (isDemoMode()) { await delay(300); return mockHADrivers; }
    return mockHADrivers; // placeholder — API endpoint TBD
  },

  // ── Analytics ──
  getAnalytics: async (systemId) => {
    if (isDemoMode()) { await delay(); return mockAnalytics; }
    return api.getAnalytics(systemId);
  },

  // ── Background Jobs ──
  getBackgroundJobs: async () => {
    if (isDemoMode()) { await delay(); return mockBackgroundJobs; }
    return mockBackgroundJobs; // placeholder — API endpoint TBD
  },

  // ── Transports ──
  getTransports: async () => {
    if (isDemoMode()) { await delay(); return mockTransports; }
    return mockTransports; // placeholder — API endpoint TBD
  },

  // ── Certificados y Licencias ──
  getCertificates: async () => {
    if (isDemoMode()) { await delay(); return mockCertificates; }
    return mockCertificates; // placeholder — API endpoint TBD
  },

  getLicenses: async () => {
    if (isDemoMode()) { await delay(300); return mockLicenses; }
    return mockLicenses; // placeholder — API endpoint TBD
  },

  // ── Settings ──
  getThresholds: async () => {
    if (isDemoMode()) { await delay(300); return mockThresholds; }
    return mockThresholds; // placeholder — API endpoint TBD
  },

  getEscalationPolicy: async () => {
    if (isDemoMode()) { await delay(300); return mockEscalationPolicy; }
    return mockEscalationPolicy; // placeholder — API endpoint TBD
  },

  getMaintenanceWindows: async () => {
    if (isDemoMode()) { await delay(300); return mockMaintenanceWindows; }
    return mockMaintenanceWindows; // placeholder — API endpoint TBD
  },

  getApiKeys: async () => {
    if (isDemoMode()) { await delay(300); return mockApiKeys; }
    return mockApiKeys; // placeholder — API endpoint TBD
  },
};
