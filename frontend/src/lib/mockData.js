// ══════════════════════════════════════════════════════════════
// SAP Spektra v1.4 — Mock Data completo
// ══════════════════════════════════════════════════════════════

function seeded(seed) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

// ── Sistemas SAP ──
export const mockSystems = [
  { id: 'SAP-ERP-P01', sid: 'EP1', type: 'S/4HANA', dbType: 'SAP HANA 2.0', environment: 'PRD', mode: 'PRODUCTION', healthScore: 94, breaches: 0, status: 'healthy', host: '10.0.1.10', os: 'SUSE Linux 15', instanceId: 'i-0a1b2c3d4e5f00001', instanceType: 'r5.xlarge', cpu: 42, mem: 65, disk: 58, uptime: '12d 4h', mttr: 25, mtbf: 1440, availability: 99.8, lastCheck: new Date().toISOString(), description: 'Sistema ERP Productivo' },
  { id: 'SAP-ERP-Q01', sid: 'EQ1', type: 'S/4HANA', dbType: 'SAP HANA 2.0', environment: 'QAS', mode: 'PRODUCTION', healthScore: 87, breaches: 1, status: 'warning', host: '10.0.2.10', os: 'SUSE Linux 15', instanceId: 'i-0a1b2c3d4e5f00002', instanceType: 'r5.xlarge', cpu: 45, mem: 78, disk: 85, uptime: '8d 12h', mttr: 32, mtbf: 480, availability: 99.2, lastCheck: new Date().toISOString(), description: 'Sistema ERP Calidad' },
  { id: 'SAP-ERP-D01', sid: 'ED1', type: 'S/4HANA', dbType: 'SAP HANA 2.0', environment: 'DEV', mode: 'TRIAL', healthScore: 72, breaches: 3, status: 'degraded', host: '10.0.3.10', os: 'SUSE Linux 15', instanceId: 'i-0a1b2c3d4e5f00003', instanceType: 'r5.large', cpu: 32, mem: 52, disk: 41, uptime: '30d 6h', mttr: 15, mtbf: 2160, availability: 99.9, lastCheck: new Date().toISOString(), description: 'Sistema ERP Desarrollo' },
  { id: 'SAP-BW-P01', sid: 'BP1', type: 'BW/4HANA', dbType: 'SAP ASE 16.0', environment: 'PRD', mode: 'PRODUCTION', healthScore: 91, breaches: 0, status: 'healthy', host: '10.0.1.20', os: 'SUSE Linux 15', instanceId: 'i-0a1b2c3d4e5f00010', instanceType: 'r5.2xlarge', cpu: 55, mem: 71, disk: 63, uptime: '22d 8h', mttr: 38, mtbf: 960, availability: 99.5, lastCheck: new Date().toISOString(), description: 'BW Productivo' },
  { id: 'SAP-SOL-P01', sid: 'SM1', type: 'SolMan 7.2', dbType: 'MaxDB 7.9', environment: 'PRD', mode: 'PRODUCTION', healthScore: 45, breaches: 5, status: 'critical', host: '10.0.1.30', os: 'Windows Server 2019', instanceId: 'i-0a1b2c3d4e5f00004', instanceType: 'r5.large', cpu: 28, mem: 45, disk: 37, uptime: '45d 2h', mttr: 20, mtbf: 4320, availability: 99.95, lastCheck: new Date().toISOString(), description: 'Solution Manager' },
  { id: 'SAP-CRM-P01', sid: 'CR1', type: 'CRM 7.0', dbType: 'Oracle 19c', environment: 'PRD', mode: 'PRODUCTION', healthScore: 88, breaches: 0, status: 'healthy', host: '10.0.1.40', os: 'RHEL 8', instanceId: 'i-0a1b2c3d4e5f00011', instanceType: 'r5.xlarge', cpu: 48, mem: 62, disk: 55, uptime: '18d 14h', mttr: 28, mtbf: 1200, availability: 99.7, lastCheck: new Date().toISOString(), description: 'CRM Productivo' },
  { id: 'SAP-GRC-P01', sid: 'GR1', type: 'GRC 12.0', dbType: 'MSSQL 2019', environment: 'QAS', mode: 'PRODUCTION', healthScore: 96, breaches: 0, status: 'healthy', host: '10.0.1.50', os: 'Windows Server 2022', instanceId: 'i-0a1b2c3d4e5f00012', instanceType: 'r5.large', cpu: 35, mem: 48, disk: 42, uptime: '15d 6h', mttr: 22, mtbf: 1800, availability: 99.8, lastCheck: new Date().toISOString(), description: 'GRC Compliance' },
  { id: 'SAP-PO-P01', sid: 'PO1', type: 'PI/PO 7.5', dbType: 'DB2 11.5', environment: 'PRD', mode: 'PRODUCTION', healthScore: 63, breaches: 2, status: 'degraded', host: '10.0.1.60', os: 'RHEL 9', instanceId: 'i-0a1b2c3d4e5f00013', instanceType: 'r5.large', cpu: 42, mem: 58, disk: 51, uptime: '25d 3h', mttr: 30, mtbf: 1440, availability: 99.6, lastCheck: new Date().toISOString(), description: 'Process Orchestration' },
  { id: 'SAP-EWM-P01', sid: 'EW1', type: 'S/4HANA', dbType: 'SAP HANA 2.0', environment: 'PRD', mode: 'PRODUCTION', healthScore: 82, breaches: 1, status: 'warning', host: '10.0.1.70', os: 'SUSE Linux 15', instanceId: 'i-0a1b2c3d4e5f00014', instanceType: 'r5.xlarge', cpu: 38, mem: 60, disk: 48, uptime: '20d 1h', mttr: 26, mtbf: 1100, availability: 99.6, lastCheck: new Date().toISOString(), description: 'Extended Warehouse Mgmt' },
];

// ── Usuarios ──
export const mockUsers = [
  { id: 'usr-001', name: 'Carlos Mendoza', email: 'carlos.mendoza@empresa.com', role: 'admin', status: 'active', lastLogin: '2026-03-10T08:30:00Z', mfa: true, avatar: null },
  { id: 'usr-002', name: 'Ana García', email: 'ana.garcia@empresa.com', role: 'operator', status: 'active', lastLogin: '2026-03-10T07:15:00Z', mfa: false, avatar: null },
  { id: 'usr-003', name: 'Roberto Pérez', email: 'roberto.perez@empresa.com', role: 'escalation', status: 'active', lastLogin: '2026-03-09T16:45:00Z', mfa: true, avatar: null },
  { id: 'usr-004', name: 'María López', email: 'maria.lopez@empresa.com', role: 'viewer', status: 'active', lastLogin: '2026-03-08T11:20:00Z', mfa: false, avatar: null },
  { id: 'usr-005', name: 'Diego Ramírez', email: 'diego.ramirez@empresa.com', role: 'operator', status: 'invited', lastLogin: null, mfa: false, avatar: null },
];

// ── Aprobaciones ──
export const mockApprovals = [
  { id: 'APR-001', systemId: 'SAP-ERP-P01', sid: 'EP1', runbookId: 'RB-HANA-001', metric: 'disk_usage', value: 92, severity: 'HIGH', status: 'PENDING', createdAt: '2026-03-10T08:00:00Z', expiresAt: '2026-03-10T12:00:00Z', requestedBy: 'system', description: 'Expansión de disco HANA Data', token: 'hmac-sha256-a3f8c1d2e4b6' },
  { id: 'APR-002', systemId: 'SAP-SOL-P01', sid: 'SM1', runbookId: 'RB-ASE-002', metric: 'cpu_usage', value: 95, severity: 'CRITICAL', status: 'PENDING', createdAt: '2026-03-10T07:30:00Z', expiresAt: '2026-03-10T11:30:00Z', requestedBy: 'system', description: 'Reinicio de work processes', token: 'hmac-sha256-b7d2e4f5a1c3' },
  { id: 'APR-003', systemId: 'SAP-BW-P01', sid: 'BP1', runbookId: 'RB-BACKUP-001', metric: 'backup_age', value: 48, severity: 'MEDIUM', status: 'APPROVED', createdAt: '2026-03-09T22:00:00Z', processedAt: '2026-03-09T22:15:00Z', processedBy: 'carlos.mendoza@empresa.com', description: 'Backup de emergencia', token: 'hmac-sha256-c9e1f3a5b7d4' },
  { id: 'APR-004', systemId: 'SAP-CRM-P01', sid: 'CR1', runbookId: 'RB-JOB-001', metric: 'failed_jobs', value: 12, severity: 'LOW', status: 'REJECTED', createdAt: '2026-03-09T15:00:00Z', processedAt: '2026-03-09T15:30:00Z', processedBy: 'ana.garcia@empresa.com', description: 'Reprogramación de jobs', token: 'hmac-sha256-d2a4b6c8e0f1' },
  { id: 'APR-005', systemId: 'SAP-PO-P01', sid: 'PO1', runbookId: 'RB-WP-002', metric: 'response_time', value: 8500, severity: 'MEDIUM', status: 'EXPIRED', createdAt: '2026-03-08T10:00:00Z', expiresAt: '2026-03-08T14:00:00Z', requestedBy: 'system', description: 'Reinicio de adaptadores PI/PO', token: 'hmac-sha256-e5f7a9b1c3d2' },
];

// ── Operaciones ──
export const mockOperations = [
  { id: 'OP-001', systemId: 'SAP-ERP-P01', sid: 'EP1', type: 'BACKUP', scheduledTime: '2026-03-10T22:00:00Z', status: 'SCHEDULED', riskLevel: 'LOW', requestedBy: 'carlos.mendoza@empresa.com', description: 'Backup nocturno programado', sched: 'Diario 22:00', next: '2026-03-10T22:00:00Z', last: '✓ 2026-03-09' },
  { id: 'OP-002', systemId: 'SAP-BW-P01', sid: 'BP1', type: 'RESTART', scheduledTime: '2026-03-10T03:00:00Z', status: 'COMPLETED', riskLevel: 'MEDIUM', requestedBy: 'ana.garcia@empresa.com', completedAt: '2026-03-10T03:12:00Z', description: 'Reinicio de servicios BW', sched: 'Semanal Dom 03:00', next: null, last: '✓ 2026-03-10' },
  { id: 'OP-003', systemId: 'SAP-SOL-P01', sid: 'SM1', type: 'DR_DRILL', scheduledTime: '2026-03-11T10:00:00Z', status: 'SCHEDULED', riskLevel: 'HIGH', requestedBy: 'roberto.perez@empresa.com', description: 'DR Drill trimestral', sched: 'Trimestral', next: '2026-03-11T10:00:00Z', last: '✓ 2025-12-11' },
  { id: 'OP-004', systemId: 'SAP-ERP-Q01', sid: 'EQ1', type: 'MAINTENANCE', scheduledTime: '2026-03-09T20:00:00Z', status: 'FAILED', riskLevel: 'MEDIUM', requestedBy: 'system', completedAt: '2026-03-09T20:35:00Z', error: 'Timeout en aplicación de parche', description: 'Actualización de kernel', sched: 'Manual', next: null, last: '✗ Timeout' },
  { id: 'OP-005', systemId: 'SAP-GRC-P01', sid: 'GR1', type: 'BACKUP', scheduledTime: '2026-03-11T02:00:00Z', status: 'SCHEDULED', riskLevel: 'LOW', requestedBy: 'system', description: 'Backup semanal GRC', sched: 'Semanal Dom 02:00', next: '2026-03-11T02:00:00Z', last: '✓ 2026-03-04' },
  { id: 'OP-006', systemId: 'SAP-CRM-P01', sid: 'CR1', type: 'MAINTENANCE', scheduledTime: '2026-03-12T04:00:00Z', status: 'SCHEDULED', riskLevel: 'MEDIUM', requestedBy: 'carlos.mendoza@empresa.com', description: 'Aplicación de parche de seguridad SAP', sched: 'Manual', next: '2026-03-12T04:00:00Z', last: null },
  { id: 'OP-007', systemId: 'SAP-ERP-P01', sid: 'EP1', type: 'RESTART', scheduledTime: '2026-03-09T04:00:00Z', status: 'COMPLETED', riskLevel: 'LOW', requestedBy: 'ana.garcia@empresa.com', completedAt: '2026-03-09T04:08:00Z', description: 'Reinicio programado semanal', sched: 'Semanal Dom 04:00', next: null, last: '✓ 2026-03-09' },
  { id: 'OP-008', systemId: 'SAP-PO-P01', sid: 'PO1', type: 'RESTART', scheduledTime: '2026-03-10T06:00:00Z', status: 'COMPLETED', riskLevel: 'MEDIUM', requestedBy: 'roberto.perez@empresa.com', completedAt: '2026-03-10T06:15:00Z', description: 'Reinicio de adaptadores PI/PO', sched: 'Manual', next: null, last: '✓ 2026-03-10' },
  { id: 'OP-009', systemId: 'SAP-BW-P01', sid: 'BP1', type: 'BACKUP', scheduledTime: '2026-03-10T07:30:00Z', status: 'COMPLETED', riskLevel: 'LOW', requestedBy: 'system', completedAt: '2026-03-10T07:48:00Z', description: 'Backup diario ASE', sched: 'Diario 07:30', next: null, last: '✓ 2026-03-10' },
  { id: 'OP-010', systemId: 'SAP-CRM-P01', sid: 'CR1', type: 'BACKUP', scheduledTime: '2026-03-10T06:30:00Z', status: 'COMPLETED', riskLevel: 'LOW', requestedBy: 'system', completedAt: '2026-03-10T07:25:00Z', description: 'Backup diario Oracle RMAN', sched: 'Diario 06:30', next: null, last: '✓ 2026-03-10' },
  { id: 'OP-011', systemId: 'SAP-GRC-P01', sid: 'GR1', type: 'BACKUP', scheduledTime: '2026-03-10T08:30:00Z', status: 'COMPLETED', riskLevel: 'LOW', requestedBy: 'system', completedAt: '2026-03-10T08:52:00Z', description: 'Backup diario MSSQL', sched: 'Diario 08:30', next: null, last: '✓ 2026-03-10' },
  { id: 'OP-012', systemId: 'SAP-PO-P01', sid: 'PO1', type: 'BACKUP', scheduledTime: '2026-03-10T09:00:00Z', status: 'COMPLETED', riskLevel: 'LOW', requestedBy: 'system', completedAt: '2026-03-10T09:28:00Z', description: 'Backup diario DB2', sched: 'Diario 09:00', next: null, last: '✓ 2026-03-10' },
  { id: 'OP-013', systemId: 'SAP-ERP-P01', sid: 'EP1', type: 'HOUSEKEEPING', scheduledTime: '2026-03-15T04:00:00Z', status: 'SCHEDULED', riskLevel: 'LOW', requestedBy: 'system', description: 'Housekeeping semanal spool + logs', sched: 'Semanal Dom 04:00', next: '2026-03-15T04:00:00Z', last: '✓ 2026-03-08' },
];

// ── Audit Log ──
export const mockAuditLog = [
  { id: 'AUD-001', timestamp: '2026-03-10T09:15:00Z', user: 'carlos.mendoza@empresa.com', action: 'system.register', resource: 'SAP-EWM-P01', details: 'Nuevo sistema registrado', severity: 'info' },
  { id: 'AUD-002', timestamp: '2026-03-10T08:45:00Z', user: 'ana.garcia@empresa.com', action: 'approval.approve', resource: 'APR-003', details: 'Aprobación de backup de emergencia', severity: 'info' },
  { id: 'AUD-003', timestamp: '2026-03-10T08:00:00Z', user: 'system', action: 'breach.detected', resource: 'SAP-SOL-P01', details: 'CPU usage 95% - Critical', severity: 'warning' },
  { id: 'AUD-004', timestamp: '2026-03-09T22:00:00Z', user: 'roberto.perez@empresa.com', action: 'runbook.execute', resource: 'RB-HANA-001', details: 'Ejecución manual de runbook', severity: 'info' },
  { id: 'AUD-005', timestamp: '2026-03-09T16:30:00Z', user: 'carlos.mendoza@empresa.com', action: 'user.invite', resource: 'diego.ramirez@empresa.com', details: 'Invitación enviada (rol: operator)', severity: 'info' },
  { id: 'AUD-006', timestamp: '2026-03-09T14:00:00Z', user: 'system', action: 'ha.failover', resource: 'SAP-ERP-P01', details: 'Failover automático HANA SR completado', severity: 'critical' },
  { id: 'AUD-007', timestamp: '2026-03-09T10:00:00Z', user: 'carlos.mendoza@empresa.com', action: 'settings.update', resource: 'organization', details: 'Actualización de configuración de notificaciones', severity: 'info' },
  { id: 'AUD-008', timestamp: '2026-03-08T18:00:00Z', user: 'system', action: 'compliance.report', resource: 'weekly-report', details: 'Reporte semanal SOX/ISO generado', severity: 'info' },
];

// ── Breaches (Alertas) ──
export const mockBreaches = [
  { id: 'B-001', systemId: 'SAP-SOL-P01', sid: 'SM1', metric: 'cpu_usage', value: 95, threshold: 90, severity: 'CRITICAL', timestamp: '2026-03-10T08:00:00Z', resolved: false },
  { id: 'B-002', systemId: 'SAP-ERP-Q01', sid: 'EQ1', metric: 'disk_usage', value: 88, threshold: 85, severity: 'HIGH', timestamp: '2026-03-10T06:30:00Z', resolved: true },
  { id: 'B-003', systemId: 'SAP-SOL-P01', sid: 'SM1', metric: 'memory_usage', value: 82, threshold: 80, severity: 'MEDIUM', timestamp: '2026-03-09T22:15:00Z', resolved: true },
  { id: 'B-004', systemId: 'SAP-ERP-D01', sid: 'ED1', metric: 'response_time', value: 5200, threshold: 3000, severity: 'HIGH', timestamp: '2026-03-09T14:00:00Z', resolved: false },
  { id: 'B-005', systemId: 'SAP-SOL-P01', sid: 'SM1', metric: 'failed_jobs', value: 15, threshold: 5, severity: 'CRITICAL', timestamp: '2026-03-09T11:00:00Z', resolved: false },
  { id: 'B-006', systemId: 'SAP-PO-P01', sid: 'PO1', metric: 'disk_usage', value: 91, threshold: 85, severity: 'HIGH', timestamp: '2026-03-08T18:00:00Z', resolved: false },
  { id: 'B-007', systemId: 'SAP-ERP-D01', sid: 'ED1', metric: 'cpu_usage', value: 93, threshold: 90, severity: 'CRITICAL', timestamp: '2026-03-08T09:00:00Z', resolved: true },
  { id: 'B-008', systemId: 'SAP-SOL-P01', sid: 'SM1', metric: 'swap_usage', value: 78, threshold: 60, severity: 'HIGH', timestamp: '2026-03-07T20:00:00Z', resolved: false },
  { id: 'B-009', systemId: 'SAP-PO-P01', sid: 'PO1', metric: 'queue_depth', value: 450, threshold: 200, severity: 'MEDIUM', timestamp: '2026-03-07T15:00:00Z', resolved: true },
  { id: 'B-010', systemId: 'SAP-ERP-D01', sid: 'ED1', metric: 'memory_usage', value: 87, threshold: 80, severity: 'HIGH', timestamp: '2026-03-07T10:00:00Z', resolved: false },
  { id: 'B-011', systemId: 'SAP-EWM-P01', sid: 'EW1', metric: 'response_time', value: 4100, threshold: 3000, severity: 'MEDIUM', timestamp: '2026-03-06T16:00:00Z', resolved: true },
];

// ── Alertas con workflow completo (ack, resolve, escalation) ──
export const mockAlerts = [
  { id: 1, systemId: 'SAP-ERP-P01', sid: 'EP1', level: 'critical', title: 'CPU sostenida >70%', message: 'SAPDISP consumiendo 72% CPU por 35 min. Umbral HIGH: 70%.', time: '14:32', escalation: 'L1', acknowledged: false, ackBy: null, ackAt: null, status: 'active', runbookId: 'RB-ABAP-001', resolvedBy: null, resolvedAt: null, resolutionNote: null, resolutionCategory: null },
  { id: 2, systemId: 'SAP-ERP-Q01', sid: 'EQ1', level: 'critical', title: 'Disco HANA 85%', message: 'Partición /hana/data al 85%. Umbral CRITICAL: 85%. Crecimiento: 2%/día.', time: '14:15', escalation: 'L1', acknowledged: false, ackBy: null, ackAt: null, status: 'active', runbookId: 'RB-HANA-002', resolvedBy: null, resolvedAt: null, resolutionNote: null, resolutionCategory: null },
  { id: 3, systemId: 'SAP-ERP-D01', sid: 'ED1', level: 'critical', title: 'Short dumps elevados', message: '87 short dumps en 24h. Umbral HIGH: 50. Programa SAPMSSY1.', time: '12:45', escalation: 'L2', acknowledged: false, ackBy: null, ackAt: null, status: 'active', runbookId: 'RB-ABAP-001', resolvedBy: null, resolvedAt: null, resolutionNote: null, resolutionCategory: null },
  { id: 4, systemId: 'SAP-ERP-Q01', sid: 'EQ1', level: 'warning', title: 'Memoria HANA 78%', message: 'Uso de memoria HANA al 78%. Umbral WARNING: 75%.', time: '13:52', escalation: 'L1', acknowledged: true, ackBy: 'ana.garcia@empresa.com', ackAt: '2026-03-10T13:55:00Z', status: 'active', runbookId: 'RB-HANA-001', resolvedBy: null, resolvedAt: null, resolutionNote: null, resolutionCategory: null },
  { id: 5, systemId: 'SAP-ERP-P01', sid: 'EP1', level: 'warning', title: 'Job RSUSR002 lento', message: 'Job tomó 45 min (normal: 15 min). Verificar bloqueos.', time: '10:20', escalation: 'L1', acknowledged: false, ackBy: null, ackAt: null, status: 'active', runbookId: 'RB-JOB-001', resolvedBy: null, resolvedAt: null, resolutionNote: null, resolutionCategory: null },
  { id: 6, systemId: 'SAP-SOL-P01', sid: 'SM1', level: 'warning', title: 'Transport queue llena', message: '15 transportes pendientes en cola STMS.', time: '09:30', escalation: 'L1', acknowledged: false, ackBy: null, ackAt: null, status: 'resolved', runbookId: null, resolvedBy: 'carlos.mendoza@empresa.com', resolvedAt: '2026-03-10T10:00:00Z', resolutionNote: 'Transportes procesados manualmente', resolutionCategory: 'fixed' },
  { id: 7, systemId: 'SAP-ERP-D01', sid: 'ED1', level: 'info', title: 'Backup completado', message: 'Backup HANA finalizado exitosamente. Duración: 45 min.', time: '03:00', escalation: '-', acknowledged: true, ackBy: 'sistema', ackAt: '2026-03-10T03:45:00Z', status: 'resolved', runbookId: null, resolvedBy: 'sistema', resolvedAt: '2026-03-10T03:45:00Z', resolutionNote: 'Backup completado automáticamente', resolutionCategory: 'fixed' },
  { id: 8, systemId: 'SAP-ERP-P01', sid: 'EP1', level: 'warning', title: 'Enqueue locks antiguos', message: '12 locks con más de 2 horas en SM12.', time: '15:10', escalation: 'L1', acknowledged: false, ackBy: null, ackAt: null, status: 'active', runbookId: 'RB-LOCK-001', resolvedBy: null, resolvedAt: null, resolutionNote: null, resolutionCategory: null },
  { id: 9, systemId: 'SAP-ERP-P01', sid: 'EP1', level: 'info', title: 'Certificado ICM por vencer', message: 'Certificado SSL vence en 15 días. Renovar antes del 25-Mar.', time: '08:00', escalation: '-', acknowledged: false, ackBy: null, ackAt: null, status: 'active', runbookId: 'RB-CERT-001', resolvedBy: null, resolvedAt: null, resolutionNote: null, resolutionCategory: null },
  { id: 10, systemId: 'SAP-BW-P01', sid: 'BP1', level: 'warning', title: 'ASE Transaction Log 45%', message: 'Transaction log al 45%. Crecimiento rápido detectado. Umbral WARNING: 40%.', time: '14:50', escalation: 'L1', acknowledged: false, ackBy: null, ackAt: null, status: 'active', runbookId: 'RB-ASE-001', resolvedBy: null, resolvedAt: null, resolutionNote: null, resolutionCategory: null },
  { id: 11, systemId: 'SAP-CRM-P01', sid: 'CR1', level: 'warning', title: 'Oracle Tablespace 55%', message: 'Tablespace SAPDATA al 55%. Monitorear crecimiento semanal.', time: '13:30', escalation: 'L1', acknowledged: true, ackBy: 'ana.garcia@empresa.com', ackAt: '2026-03-10T13:35:00Z', status: 'active', runbookId: null, resolvedBy: null, resolvedAt: null, resolutionNote: null, resolutionCategory: null },
  { id: 12, systemId: 'SAP-GRC-P01', sid: 'GR1', level: 'info', title: 'Backup MSSQL completado', message: 'Backup SQL Server finalizado exitosamente. Duración: 22 min.', time: '02:00', escalation: '-', acknowledged: true, ackBy: 'sistema', ackAt: '2026-03-10T02:22:00Z', status: 'resolved', runbookId: null, resolvedBy: 'sistema', resolvedAt: '2026-03-10T02:22:00Z', resolutionNote: 'Backup exitoso sin errores', resolutionCategory: 'fixed' },
  { id: 13, systemId: 'SAP-PO-P01', sid: 'PO1', level: 'warning', title: 'DB2 Log usage 35%', message: 'DB2 log usage al 35%. Tendencia ascendente detectada.', time: '11:15', escalation: 'L1', acknowledged: false, ackBy: null, ackAt: null, status: 'active', runbookId: null, resolvedBy: null, resolvedAt: null, resolutionNote: null, resolutionCategory: null },
  { id: 14, systemId: 'SAP-GRC-P01', sid: 'GR1', level: 'warning', title: 'MSSQL Data File 42%', message: 'Data file crecimiento detectado. Espacio usado: 42%. Proyección: 60% en 30 días.', time: '09:45', escalation: 'L1', acknowledged: false, ackBy: null, ackAt: null, status: 'active', runbookId: null, resolvedBy: null, resolvedAt: null, resolutionNote: null, resolutionCategory: null },
  { id: 15, systemId: 'SAP-EWM-P01', sid: 'EW1', level: 'warning', title: 'Response time elevado', message: 'Tiempo de respuesta 4.1s promedio. Umbral WARNING: 3s.', time: '16:00', escalation: 'L1', acknowledged: false, ackBy: null, ackAt: null, status: 'active', runbookId: null, resolvedBy: null, resolvedAt: null, resolutionNote: null, resolutionCategory: null },
];

// ── Runbooks completo (18 runbooks) ──
export const mockRunbooks = [
  { id: 'RB-ASE-001', name: 'Dump tran log + kill old tx', costSafe: true, auto: true, dbType: 'ASE', description: 'Trunca el transaction log y elimina transacciones antiguas bloqueadas', totalRuns: 112, successRate: 97.3, avgDuration: '18s' },
  { id: 'RB-ASE-002', name: 'Expand EBS log volume', costSafe: false, auto: false, dbType: 'ASE', description: 'Expande el volumen EBS del log. Requiere aprobación por costo de infra', totalRuns: 24, successRate: 95.8, avgDuration: '3m 20s' },
  { id: 'RB-ASE-003', name: 'Combined log truncate + disk', costSafe: false, auto: false, dbType: 'ASE', description: 'Trunca log + expansión de disco combinado', totalRuns: 8, successRate: 100, avgDuration: '4m 10s' },
  { id: 'RB-HANA-001', name: 'Reclaim HANA memory', costSafe: true, auto: true, dbType: 'HANA', description: 'Ejecuta garbage collection y limpia SQL cache de HANA', totalRuns: 156, successRate: 98.1, avgDuration: '8s', prereqs: ['hdbsql accessible', 'HANA online', 'Memory > 60%'], txCode: 'DBACOCKPIT' },
  { id: 'RB-HANA-002', name: 'Expand HANA disk', costSafe: false, auto: false, dbType: 'HANA', description: 'Expande disco HANA. Requiere aprobación', totalRuns: 32, successRate: 96.9, avgDuration: '2m 15s', prereqs: ['AWS permissions verified', 'EBS volume modifiable', 'No active snapshot'], txCode: 'DB02' },
  { id: 'RB-HA-001', name: 'Resume replication lag', costSafe: true, auto: true, dbType: 'HANA', description: 'Reanuda replicación HANA System Replication', totalRuns: 18, successRate: 94.4, avgDuration: '12s', prereqs: ['HSR configured', 'Secondary reachable', 'No takeover in progress'], txCode: 'DBACOCKPIT' },
  { id: 'RB-JVM-001', name: 'Force GC', costSafe: true, auto: true, dbType: 'ALL', description: 'Fuerza garbage collection en JVM heap', totalRuns: 87, successRate: 93.1, avgDuration: '5s' },
  { id: 'RB-JVM-002', name: 'Force OldGen GC', costSafe: true, auto: true, dbType: 'ALL', description: 'Fuerza GC de OldGen para liberar memoria', totalRuns: 45, successRate: 95.6, avgDuration: '7s' },
  { id: 'RB-PO-001', name: 'Restart adapter framework', costSafe: true, auto: true, dbType: 'PO', description: 'Reinicia framework de adaptadores SAP PO', totalRuns: 42, successRate: 90.5, avgDuration: '35s' },
  { id: 'RB-ABAP-001', name: 'Clean sessions + restart WPs', costSafe: true, auto: true, dbType: 'ABAP', description: 'Limpia sesiones y reinicia work processes', totalRuns: 134, successRate: 96.3, avgDuration: '12s', prereqs: ['sapcontrol accessible', 'No active batch jobs on WPs', 'Free dialog WPs > 2'], txCode: 'SM50' },
  { id: 'RB-BACKUP-001', name: 'Verify backup status', costSafe: true, auto: true, dbType: 'ALL', description: 'Verifica estado de backups de BD', totalRuns: 198, successRate: 99.5, avgDuration: '4s' },
  { id: 'RB-CERT-001', name: 'Check certificate expiry', costSafe: true, auto: true, dbType: 'ALL', description: 'Valida certificados ICM/PSE', totalRuns: 64, successRate: 100, avgDuration: '3s' },
  { id: 'RB-WP-001', name: 'Clean PRIV/Hold WPs', costSafe: true, auto: true, dbType: 'ABAP', description: 'Limpia work processes en PRIV mode o Hold', totalRuns: 98, successRate: 96.9, avgDuration: '10s' },
  { id: 'RB-RFC-001', name: 'Diagnose RFC queues', costSafe: true, auto: true, dbType: 'ABAP', description: 'Diagnostica colas tRFC/qRFC/bgRFC', totalRuns: 56, successRate: 98.2, avgDuration: '6s' },
  { id: 'RB-JOB-001', name: 'Check failed/long jobs', costSafe: true, auto: true, dbType: 'ABAP', description: 'Revisa jobs fallidos o de larga duración (SM37)', totalRuns: 87, successRate: 93.1, avgDuration: '5s' },
  { id: 'RB-HOUSE-001', name: 'Housekeeping', costSafe: true, auto: true, dbType: 'ABAP', description: 'Limpieza de spool, logs, TEMSE y datos temporales', totalRuns: 72, successRate: 97.2, avgDuration: '45s' },
  { id: 'RB-LOCK-001', name: 'Lock management SM12', costSafe: true, auto: true, dbType: 'ABAP', description: 'Diagnostica y limpia enqueue locks antiguos', totalRuns: 34, successRate: 100, avgDuration: '8s' },
  { id: 'RB-TRANS-001', name: 'Transport monitoring STMS', costSafe: true, auto: true, dbType: 'ABAP', description: 'Monitorea cola de transportes y detecta bloqueados', totalRuns: 44, successRate: 97.7, avgDuration: '7s' },
];

// ── Ejecuciones de Runbooks ──
export const mockRunbookExecutions = [
  { ts: '14:33', systemId: 'SAP-ERP-P01', sid: 'EP1', runbookId: 'RB-ABAP-001', result: 'SUCCESS', duration: '12s', gate: 'SAFE', detail: 'Limpiados 3 WPs en PRIV mode. CPU bajó a 65%.' },
  { ts: '14:16', systemId: 'SAP-ERP-Q01', sid: 'EQ1', runbookId: 'RB-HANA-002', result: 'PENDING', duration: '-', gate: 'REQUIRES_HUMAN', detail: 'Esperando aprobación APR-001 para expandir disco.' },
  { ts: '13:53', systemId: 'SAP-ERP-Q01', sid: 'EQ1', runbookId: 'RB-HANA-001', result: 'SUCCESS', duration: '8s', gate: 'SAFE', detail: 'GC ejecutado. Memoria HANA bajó de 82% a 78%.' },
  { ts: '12:46', systemId: 'SAP-ERP-Q01', sid: 'EQ1', runbookId: 'RB-ABAP-001', result: 'SUCCESS', duration: '15s', gate: 'SAFE', detail: '6 sesiones limpiadas. Short dumps reducidos.' },
  { ts: '12:31', systemId: 'SAP-ERP-P01', sid: 'EP1', runbookId: 'RB-ASE-002', result: 'PENDING', duration: '-', gate: 'REQUIRES_HUMAN', detail: 'Esperando aprobación APR-002.' },
  { ts: '10:21', systemId: 'SAP-ERP-P01', sid: 'EP1', runbookId: 'RB-JOB-001', result: 'SUCCESS', duration: '5s', gate: 'SAFE', detail: 'Job RSUSR002 identificado como lento. Background WP liberado.' },
  { ts: '09:31', systemId: 'SAP-SOL-P01', sid: 'SM1', runbookId: 'RB-TRANS-001', result: 'SUCCESS', duration: '7s', gate: 'SAFE', detail: '3 transportes bloqueados detectados. Cola limpiada.' },
  { ts: '08:01', systemId: 'SAP-ERP-P01', sid: 'EP1', runbookId: 'RB-CERT-001', result: 'SUCCESS', duration: '3s', gate: 'SAFE', detail: 'Certificado ICM vence 25-Mar-2026. Alerta generada.' },
  { ts: '03:01', systemId: 'SAP-ERP-D01', sid: 'ED1', runbookId: 'RB-BACKUP-001', result: 'SUCCESS', duration: '4s', gate: 'SAFE', detail: 'Backup HANA verificado: completo, 12.4 GB.' },
  { ts: '02:15', systemId: 'SAP-ERP-P01', sid: 'EP1', runbookId: 'RB-HOUSE-001', result: 'SUCCESS', duration: '45s', gate: 'SAFE', detail: 'Spool: 234 eliminados. TEMSE: 89 objetos. Logs: 1.2GB liberados.' },
  { ts: '14:51', systemId: 'SAP-BW-P01', sid: 'BP1', runbookId: 'RB-ASE-001', result: 'SUCCESS', duration: '18s', gate: 'SAFE', detail: 'Transaction log truncado. Uso bajó de 45% a 22%.' },
  { ts: '02:01', systemId: 'SAP-CRM-P01', sid: 'CR1', runbookId: 'RB-BACKUP-001', result: 'SUCCESS', duration: '6s', gate: 'SAFE', detail: 'Backup Oracle RMAN verificado: completo, 8.7 GB.' },
  { ts: '03:31', systemId: 'SAP-GRC-P01', sid: 'GR1', runbookId: 'RB-BACKUP-001', result: 'SUCCESS', duration: '4s', gate: 'SAFE', detail: 'Backup MSSQL verificado: completo, 3.2 GB.' },
];

// ── Eventos (generados) ──
// P2.4: Components separated by source (SAP vs Platform)
const sapComponents = ['SAPDISP', 'SAPGW', 'HANADB', 'MaxDB', 'ASE', 'Oracle', 'MSSQL', 'DB2', 'J2EE', 'ICM', 'Backup', 'Transport', 'Job', 'RFC', 'ABAP', 'Basis'];
const platformComponents = ['SSM', 'EventBridge', 'Lambda', 'CloudWatch', 'SNS', 'DynamoDB'];
const eventComponents = [...sapComponents, ...platformComponents];
const eventTemplates = {
  critical: ['Error conexión BD', 'Proceso SAP terminado', 'Memoria crítica: swap activo', 'RFC destino no alcanzable', 'Short dump SAPMSSY1', 'Tabla SM21 crítica'],
  warning: ['CPU >70%', 'Disco >80%', 'Memoria >75%', 'Job lento', 'Transport pendiente 24h', 'RFC lenta >5s', 'Buffer casi lleno', 'Enqueue locks >2h', 'OldGen heap >75%'],
  info: ['Job completado', 'Backup finalizado', 'Transport importado', 'Sesión iniciada', 'Health check OK', 'Métricas recopiladas', 'Log rotado', 'Cache limpiado', 'Parámetro actualizado'],
  success: ['Runbook ejecutado OK', 'Alerta resuelta', 'Sistema reiniciado OK', 'Conexión SSM restaurada', 'Backup verificado'],
};

export const mockEvents = (() => {
  const events = [];
  const now = Date.now();
  const levels = ['info', 'info', 'info', 'info', 'warning', 'warning', 'success', 'critical'];
  for (let i = 0; i < 300; i++) {
    const lv = levels[Math.floor(seeded(i * 3) * levels.length)];
    const msgs = eventTemplates[lv];
    const sys = mockSystems[Math.floor(seeded(i * 7) * mockSystems.length)];
    const comp = eventComponents[Math.floor(seeded(i * 11) * eventComponents.length)];
    const t = new Date(now - i * 300000 - seeded(i * 13) * 240000);
    events.push({
      id: `EVT-${String(i + 1).padStart(4, '0')}`,
      timestamp: t.toISOString(),
      level: lv,
      systemId: sys.id,
      sid: sys.sid,
      component: comp,
      source: sapComponents.includes(comp) ? 'SAP' : 'Platform', // P2.4
      message: msgs[Math.floor(seeded(i * 17) * msgs.length)],
    });
  }
  return events;
})();

// ── Landscape Discovery ──
export const mockDiscovery = [
  { instanceId: 'i-0a1b2c3d4e5f00001', hostname: 'sap-ep1-pas', sid: 'EP1', role: 'PAS', product: 'SAP S/4HANA 2023', kernel: '777.36', dbType: 'HANA 2.0 SPS07', os: 'SUSE Linux 15 SP5', haEnabled: false, haType: null, env: 'PRD', scanStatus: 'success', confidence: 'high', lastScan: '2026-03-09T10:15:00Z' },
  { instanceId: 'i-0a1b2c3d4e5f00002', hostname: 'sap-ep1-hana-pri', sid: 'EP1', role: 'HANA Primary', product: 'SAP S/4HANA 2023', kernel: '777.36', dbType: 'HANA 2.0 SPS07', os: 'SUSE Linux 15 SP5', haEnabled: true, haType: 'Pacemaker', haPeer: 'i-0a1b2c3d4e5f00003', env: 'PRD', scanStatus: 'success', confidence: 'high', lastScan: '2026-03-09T10:15:00Z' },
  { instanceId: 'i-0a1b2c3d4e5f00003', hostname: 'sap-ep1-hana-sec', sid: 'EP1', role: 'HANA Secondary', product: 'SAP S/4HANA 2023', kernel: '777.36', dbType: 'HANA 2.0 SPS07', os: 'SUSE Linux 15 SP5', haEnabled: true, haType: 'Pacemaker', haPeer: 'i-0a1b2c3d4e5f00002', env: 'PRD', scanStatus: 'success', confidence: 'high', lastScan: '2026-03-09T10:15:00Z' },
  { instanceId: 'i-0a1b2c3d4e5f00004', hostname: 'sap-eq1-pas', sid: 'EQ1', role: 'PAS', product: 'SAP S/4HANA 2023', kernel: '777.36', dbType: 'HANA 2.0 SPS07', os: 'SUSE Linux 15 SP5', haEnabled: false, haType: null, env: 'QAS', scanStatus: 'success', confidence: 'high', lastScan: '2026-03-09T10:16:00Z' },
  { instanceId: 'i-0a1b2c3d4e5f00005', hostname: 'sap-ed1-pas', sid: 'ED1', role: 'PAS', product: 'SAP S/4HANA 2023', kernel: '777.36', dbType: 'HANA 2.0 SPS07', os: 'SUSE Linux 15 SP5', haEnabled: false, haType: null, env: 'DEV', scanStatus: 'success', confidence: 'high', lastScan: '2026-03-09T10:17:00Z' },
  { instanceId: 'i-0a1b2c3d4e5f00010', hostname: 'sap-bp1-pas', sid: 'BP1', role: 'PAS', product: 'SAP BW/4HANA 2.0', kernel: '777.36', dbType: 'ASE 16.0', os: 'SUSE Linux 15 SP5', haEnabled: false, haType: null, env: 'PRD', scanStatus: 'success', confidence: 'high', lastScan: '2026-03-09T10:20:00Z' },
  { instanceId: 'i-0a1b2c3d4e5f00006', hostname: 'sap-sm1-pas', sid: 'SM1', role: 'PAS', product: 'SAP SolMan 7.2 SP17', kernel: '753.22', dbType: 'MaxDB', os: 'Windows Server 2019', haEnabled: false, haType: null, env: 'PRD', scanStatus: 'success', confidence: 'high', lastScan: '2026-03-09T10:18:00Z' },
  { instanceId: 'i-0a1b2c3d4e5f00011', hostname: 'sap-cr1-pas', sid: 'CR1', role: 'PAS', product: 'SAP CRM 7.0 EHP4', kernel: '753.22', dbType: 'Oracle 19c', os: 'RHEL 8.7', haEnabled: false, haType: null, env: 'PRD', scanStatus: 'success', confidence: 'high', lastScan: '2026-03-09T10:21:00Z' },
  { instanceId: 'i-0a1b2c3d4e5f00014', hostname: 'sap-cr1-ascs', sid: 'CR1', role: 'ASCS', product: 'SAP CRM 7.0 EHP4', kernel: '753.22', dbType: 'Oracle 19c', os: 'RHEL 8.7', haEnabled: true, haType: 'Pacemaker', haPeer: 'i-0a1b2c3d4e5f00015', env: 'PRD', scanStatus: 'success', confidence: 'high', lastScan: '2026-03-09T10:21:00Z' },
  { instanceId: 'i-0a1b2c3d4e5f00015', hostname: 'sap-cr1-ers', sid: 'CR1', role: 'ERS', product: 'SAP CRM 7.0 EHP4', kernel: '753.22', dbType: 'Oracle 19c', os: 'RHEL 8.7', haEnabled: true, haType: 'Pacemaker', haPeer: 'i-0a1b2c3d4e5f00014', env: 'PRD', scanStatus: 'success', confidence: 'high', lastScan: '2026-03-09T10:21:00Z' },
  { instanceId: 'i-0a1b2c3d4e5f00012', hostname: 'sap-gr1-pas', sid: 'GR1', role: 'PAS', product: 'SAP GRC 12.0', kernel: '777.36', dbType: 'MSSQL 2019', os: 'Windows Server 2022', haEnabled: false, haType: null, env: 'QAS', scanStatus: 'success', confidence: 'high', lastScan: '2026-03-09T10:22:00Z' },
  { instanceId: 'i-0a1b2c3d4e5f00013', hostname: 'sap-po1-pas', sid: 'PO1', role: 'PAS', product: 'SAP PO 7.5 SP25', kernel: '753.22', dbType: 'DB2 11.5', os: 'RHEL 9', haEnabled: false, haType: null, env: 'PRD', scanStatus: 'success', confidence: 'high', lastScan: '2026-03-09T10:23:00Z' },
  { instanceId: 'i-0a1b2c3d4e5f00016', hostname: 'sap-po1-offline', sid: 'PO1', role: 'AAS', product: 'SAP PO 7.5 SP25', kernel: '753.22', dbType: 'DB2 11.5', os: 'RHEL 9', haEnabled: false, haType: null, env: 'PRD', scanStatus: 'fail', confidence: 'low', lastScan: '2026-03-09T10:23:00Z' },
  { instanceId: 'i-0a1b2c3d4e5f00017', hostname: 'sap-ew1-pas', sid: 'EW1', role: 'PAS', product: 'SAP S/4HANA EWM', kernel: '777.36', dbType: 'HANA 2.0 SPS07', os: 'SUSE Linux 15 SP5', haEnabled: false, haType: null, env: 'PRD', scanStatus: 'success', confidence: 'high', lastScan: '2026-03-09T10:24:00Z' },
];

// ── AI Responses (7 use cases) ──
export const mockAIResponses = {
  incidente: '**Análisis UC1 — Incidente CPU EP1**\n\nDiagnóstico: El proceso SAPDISP está consumiendo 72% CPU sostenido por 35+ minutos.\n\n**Causa probable:** Work processes en PRIV mode ejecutando reports ABAP pesados. Detecté 3 WPs en estado PRIV desde las 14:00.\n\n**Métricas contexto:**\n- CPU: 72% (umbral HIGH: 70%)\n- Free Dialog WP: 2/20\n- SM21 critical 1h: 4 entradas\n- Short dumps 24h: 12\n\n**Acción recomendada:** Ejecutar RB-ABAP-001 (Clean sessions + restart WPs). Safety Gate: SAFE. Impacto: bajo — solo libera WPs en PRIV sin afectar sesiones activas.\n\n**Prioridad:** ALTA — ejecutar en los próximos 15 minutos.',
  disco: '**Predicción UC2 — Crecimiento Disco EQ1**\n\nBasado en regresión lineal de 7 días de datos:\n\n- Uso actual: 85%\n- Tasa crecimiento: 1.8%/día\n- **Predicción 7 días:** 97.6% (CRÍTICO)\n- **Predicción 30 días:** 139% (REQUIERE EXPANSIÓN)\n- Confianza: 87%\n\n**Componentes del crecimiento:**\n- /hana/data: +1.2%/día (datos transaccionales)\n- /hana/log: +0.4%/día (logs de backup)\n- /hana/shared: +0.2%/día (trace files)\n\n**Recomendación:** Ejecutar RB-HANA-002 (Expand disk) ANTES de 4 días. Requiere aprobación (costSafe=false). También ejecutar housekeeping para liberar ~8% inmediato.',
  safety: '**Evaluación UC3 — Safety Gate RB-HANA-002 en EQ1**\n\nResultado: **REQUIRES_HUMAN**\n\n**Reglas duras aplicadas:**\n1. RB-HANA-002 está en lista de runbooks que requieren aprobación (costSafe=false)\n2. Expansión de disco implica costo de infraestructura AWS\n\n**Evaluación Bedrock:**\n- Estado del sistema: ESTABLE (no hay failover activo)\n- Replicación HANA: OK (lag < 5s)\n- Riesgo de expansión: BAJO\n- Tiempo estimado: 3-5 minutos\n- Impacto: Sin downtime (expansión EBS online)\n\n**Veredicto:** Operación segura pero requiere aprobación humana por política costSafe. Aprobación pendiente: APR-001.',
  digest: '**Digest Ejecutivo UC4 — 10 Marzo 2026**\n\n**Resumen del día:**\n- 9/9 sistemas operativos\n- 247 eventos procesados (23 críticos, 48 warnings)\n- 15 alertas generadas, 3 resueltas automáticamente\n- 13 runbooks ejecutados (100% exitosos)\n- 2 aprobaciones pendientes\n\n**Sistemas críticos:**\n- EP1: CPU elevada, 3 WPs en PRIV — runbook ejecutado\n- EQ1: Disco 85%, predicción crítica en 4 días\n- SM1: Health Score bajo (45), múltiples breaches\n\n**Costos AWS estimados hoy:** $4.85\n**Health Score promedio:** 80/100\n\n**Acciones recomendadas para mañana:**\n1. Aprobar expansión disco EQ1 (APR-001)\n2. Investigar health score SM1\n3. Renovar certificado ICM de EP1 (vence 25-Mar)',
  adapta: '**Adaptación UC5 — RB-ABAP-001 para SM1 (MaxDB)**\n\nRunbook original ajustado para SM1:\n\n**Diferencias detectadas:**\n- DB: MaxDB (no HANA) — omitir comandos HDB\n- OS: Windows — usar sapcontrol.exe en lugar de sapcontrol\n- Instance: 00/01 (dual instance)\n\n**Comandos adaptados:**\n```\nsapcontrol.exe -nr 00 -function GetProcessList\nsapcontrol.exe -nr 00 -function RestartService\ndbmcli -d SM1 -u DBADMIN,*** db_online\n```\n\n**Validaciones adicionales:**\n- Verificar MaxDB online antes de restart\n- Esperar 30s entre stop/start por Windows services',
  estado: '**Estado General de Sistemas SAP**\n\n| Sistema | Estado | Health | CPU | MEM | Disco |\n|---------|--------|--------|-----|-----|-------|\n| EP1 (PRD) | Healthy | 94 | 42% | 65% | 58% |\n| EQ1 (QAS) | Warning | 87 | 45% | 78% | 85% |\n| ED1 (DEV) | Degraded | 72 | 32% | 52% | 41% |\n| BP1 (PRD) | Healthy | 91 | 55% | 71% | 63% |\n| SM1 (PRD) | Critical | 45 | 28% | 45% | 37% |\n| CR1 (PRD) | Healthy | 88 | 48% | 62% | 55% |\n| GR1 (QAS) | Healthy | 96 | 35% | 48% | 42% |\n| PO1 (PRD) | Degraded | 63 | 42% | 58% | 51% |\n| EW1 (PRD) | Warning | 82 | 38% | 60% | 48% |\n\n**Alertas activas:** 3 críticas, 8 warnings\n**Runbooks pendientes:** 2 esperando aprobación\n**Predicciones:** Disco EQ1 crítico en 4 días',
  riesgo: '**Evaluación Riesgo UC7 — Restart ED1**\n\nNivel de riesgo: **MEDIUM**\n\n**Factores evaluados:**\n- Hora actual: 15:00 COT (horario laboral 8:00-18:00) — RIESGO +1\n- Ambiente: DEV — RIESGO -1 (bajo impacto)\n- Usuarios activos: 3 — RIESGO bajo\n- Jobs ejecutando: 0 — OK\n- Último restart: hace 30 días — OK\n- Estado actual: estable (HS: 72) — OK\n\n**Recomendación:** Proceder con restart pero notificar a los 3 usuarios activos. Tiempo estimado de downtime: 5-8 minutos. Preferible ejecutar después de las 18:00 COT para reducir riesgo a LOW.',
};

export const mockAIUseCases = [
  { id: 'UC1', name: 'Análisis Incidentes', description: 'Diagnóstico en tiempo real de breaches', color: 'danger', query: 'Analiza el incidente de CPU alta en EP1' },
  { id: 'UC2', name: 'Predicción Disco', description: 'Forecast crecimiento con regresión lineal', color: 'warning', query: 'Predice el crecimiento de disco en EQ1 para los próximos 30 días' },
  { id: 'UC3', name: 'Safety Gate', description: 'Evaluación de seguridad pre-ejecución', color: 'primary', query: 'Evalúa si es seguro ejecutar RB-HANA-002 en EQ1 ahora' },
  { id: 'UC4', name: 'Digest Ejecutivo', description: 'Resumen diario automático (22:00 UTC)', color: 'accent', query: 'Genera el digest ejecutivo de hoy' },
  { id: 'UC5', name: 'Adaptación Runbooks', description: 'Ajustes específicos por sistema', color: 'success', query: 'Adapta el runbook RB-ABAP-001 para el sistema SM1 con MaxDB' },
  { id: 'UC6', name: 'Chatbot', description: 'Interfaz conversacional autoservicio', color: 'accent', query: 'Estado general de todos los sistemas' },
  { id: 'UC7', name: 'Evaluación Riesgo', description: 'Riesgo de operaciones programadas', color: 'warning', query: 'Evalúa el riesgo de reiniciar ED1 ahora en horario laboral' },
];

// ── Conectores SAP (SaaS) ──
export const mockConnectors = [
  { id: 'conn-001', systemId: 'SAP-ERP-P01', sid: 'EP1', systemName: 'SAP ERP Productivo', systemType: 'S/4HANA', environment: 'PRD', connectionMethod: 'SAP Cloud Connector', status: 'connected', lastHeartbeat: '2026-03-11T08:14:52Z', latencyMs: 45, messagesCollected24h: 12840, agentVersion: null, sccLocationId: 'LOC_DC1', tunnelSubaccount: 'maveram-prod' },
  { id: 'conn-002', systemId: 'SAP-ERP-Q01', sid: 'EQ1', systemName: 'SAP ERP Calidad', systemType: 'S/4HANA', environment: 'QAS', connectionMethod: 'SAP Cloud Connector', status: 'degraded', lastHeartbeat: '2026-03-11T07:58:10Z', latencyMs: 320, messagesCollected24h: 4210, agentVersion: null, sccLocationId: 'LOC_DC1', tunnelSubaccount: 'maveram-prod' },
  { id: 'conn-003', systemId: 'SAP-ERP-D01', sid: 'ED1', systemName: 'SAP ERP Desarrollo', systemType: 'S/4HANA', environment: 'DEV', connectionMethod: 'Spektra Agent', status: 'connected', lastHeartbeat: '2026-03-11T08:14:48Z', latencyMs: 28, messagesCollected24h: 3520, agentVersion: 'v1.4.2', sccLocationId: null, tunnelSubaccount: null },
  { id: 'conn-004', systemId: 'SAP-BW-P01', sid: 'BP1', systemName: 'BW Productivo', systemType: 'BW/4HANA', environment: 'PRD', connectionMethod: 'Spektra Agent', status: 'connected', lastHeartbeat: '2026-03-11T08:14:55Z', latencyMs: 32, messagesCollected24h: 8930, agentVersion: 'v1.4.2', sccLocationId: null, tunnelSubaccount: null },
  { id: 'conn-005', systemId: 'SAP-SOL-P01', sid: 'SM1', systemName: 'Solution Manager', systemType: 'SolMan 7.2', environment: 'PRD', connectionMethod: 'RFC/BAPI', status: 'connected', lastHeartbeat: '2026-03-11T08:13:40Z', latencyMs: 88, messagesCollected24h: 6740, agentVersion: null, sccLocationId: null, tunnelSubaccount: null },
  { id: 'conn-006', systemId: 'SAP-CRM-P01', sid: 'CR1', systemName: 'CRM Productivo', systemType: 'CRM 7.0', environment: 'PRD', connectionMethod: 'SAP Cloud Connector', status: 'connected', lastHeartbeat: '2026-03-11T08:14:50Z', latencyMs: 52, messagesCollected24h: 5120, agentVersion: null, sccLocationId: 'LOC_DC2', tunnelSubaccount: 'maveram-prod' },
  { id: 'conn-007', systemId: 'SAP-GRC-P01', sid: 'GR1', systemName: 'GRC Compliance', systemType: 'GRC 12.0', environment: 'QAS', connectionMethod: 'API Gateway', status: 'connected', lastHeartbeat: '2026-03-11T08:14:44Z', latencyMs: 110, messagesCollected24h: 2890, agentVersion: null, sccLocationId: null, tunnelSubaccount: null },
  { id: 'conn-008', systemId: 'SAP-PO-P01', sid: 'PO1', systemName: 'Process Orchestration', systemType: 'PI/PO 7.5', environment: 'PRD', connectionMethod: 'Spektra Agent', status: 'disconnected', lastHeartbeat: '2026-03-11T06:42:15Z', latencyMs: null, messagesCollected24h: 1240, agentVersion: 'v1.3.8', sccLocationId: null, tunnelSubaccount: null },
  { id: 'conn-009', systemId: 'SAP-EWM-P01', sid: 'EW1', systemName: 'Extended Warehouse Mgmt', systemType: 'S/4HANA', environment: 'PRD', connectionMethod: 'SAP Cloud Connector', status: 'connected', lastHeartbeat: '2026-03-11T08:14:51Z', latencyMs: 48, messagesCollected24h: 7650, agentVersion: null, sccLocationId: 'LOC_DC1', tunnelSubaccount: 'maveram-prod' },
];

// ── HA Control Center ──
// ── Estrategias HA soportadas ──
// HOT_STANDBY:    Secundario encendido, réplica síncrona, failover inmediato (~2-5 min)
// WARM_STANDBY:   Secundario encendido, réplica asíncrona, requiere catch-up (~5-15 min)
// PILOT_LIGHT:    Secundario apagado, solo infra provisionada, requiere encender + restore (~30-60 min)
// BACKUP_RESTORE: Sin secundario, reconstruir desde backup en infra nueva (~2-4 horas)
// CROSS_REGION_DR: DR entre regiones cloud, secundario en otra región (~15-45 min)

export const HA_STRATEGY_META = {
  HOT_STANDBY:     { label: 'Hot Standby',       rto: '2-5 min',    rpo: '~0',        color: 'success', icon: 'flame' },
  WARM_STANDBY:    { label: 'Warm Standby',       rto: '5-15 min',   rpo: '<1 min',     color: 'primary', icon: 'thermometer' },
  PILOT_LIGHT:     { label: 'Pilot Light',        rto: '30-60 min',  rpo: 'Last backup', color: 'warning', icon: 'lightbulb' },
  BACKUP_RESTORE:  { label: 'Backup & Restore',   rto: '2-4 horas',  rpo: 'Last backup', color: 'danger',  icon: 'archive' },
  CROSS_REGION_DR: { label: 'Cross-Region DR',    rto: '15-45 min',  rpo: '<5 min',     color: 'accent',  icon: 'globe' },
};

export const mockHASystems = [
  // 1. Hot Standby — HANA SR SYNC con Pacemaker (on-premise / misma AZ)
  {
    systemId: 'SAP-ERP-P01', sid: 'EP1', haEnabled: true, haStatus: 'HEALTHY',
    haType: 'HANA_SR', haStrategy: 'HOT_STANDBY',
    networkStrategy: 'PACEMAKER_VIP', dbType: 'HANA', replicationMode: 'SYNC', replicationStatus: 'SOK',
    replicationLag: 0.8,
    primary: { id: 'i-0abc123primary', host: 'sap-ep1-hana-pri', ip: '10.0.1.10', zone: 'us-east-1a', instanceNr: '10', state: 'running' },
    secondary: { id: 'i-0abc123secondary', host: 'sap-ep1-hana-sec', ip: '10.0.2.10', zone: 'us-east-1b', instanceNr: '10', state: 'running' },
    vip: '10.0.0.100', lastCheck: '2026-03-10T08:15:00Z', lastOp: null,
    tier: 'production', region: 'us-east-1', provider: 'AWS',
  },
  // 2. Warm Standby — Secundario más pequeño, réplica async, requiere scale-up + catch-up
  {
    systemId: 'SAP-ERP-Q01', sid: 'EQ1', haEnabled: true, haStatus: 'DEGRADED',
    haType: 'HANA_SR', haStrategy: 'WARM_STANDBY',
    networkStrategy: 'EIP', dbType: 'HANA', replicationMode: 'ASYNC', replicationStatus: 'SFAIL',
    replicationLag: 45.2,
    primary: {
      id: 'i-0def456primary', host: 'sap-eq1-hana-pri', ip: '10.0.3.10', zone: 'us-east-1a',
      instanceNr: '10', state: 'running',
      instanceType: 'r6i.8xlarge', vcpu: 32, memoryGb: 256,
    },
    secondary: {
      id: 'i-0def456secondary', host: 'sap-eq1-hana-sec', ip: '10.0.4.10', zone: 'us-east-1b',
      instanceNr: '10', state: 'running',
      instanceType: 'r6i.2xlarge', vcpu: 8, memoryGb: 64,
      targetInstanceType: 'r6i.8xlarge', targetVcpu: 32, targetMemoryGb: 256,
    },
    vip: null, lastCheck: '2026-03-10T07:45:00Z',
    lastOp: { type: 'FAILOVER', status: 'FAILED', at: '2026-03-09T14:30:00Z' },
    tier: 'quality', region: 'us-east-1', provider: 'AWS',
    warmStandbyDetails: {
      costSavingsPercent: 75,
      scaleUpRequired: true,
      estimatedScaleUpTime: '5-8 min',
      estimatedCatchUpTime: '3-5 min',
      preloadHint: false,
    },
  },
  // 3. Pilot Light — Infra provisionada pero apagada (DR para producción)
  {
    systemId: 'SAP-ERP-DR01', sid: 'EP1', haEnabled: true, haStatus: 'STANDBY',
    haType: 'HANA_SR', haStrategy: 'PILOT_LIGHT',
    networkStrategy: 'ROUTE53', dbType: 'HANA', replicationMode: 'ASYNC', replicationStatus: null,
    replicationLag: null,
    primary: { id: 'i-0abc123primary', host: 'sap-ep1-hana-pri', ip: '10.0.1.10', zone: 'us-east-1a', instanceNr: '10', state: 'running', isPrimaryRef: true },
    secondary: { id: 'i-0xyz789dr', host: 'sap-ep1-dr-hana', ip: '10.1.2.10', zone: 'us-west-2a', instanceNr: '10', state: 'stopped' },
    vip: null, dnsEndpoint: 'ep1-db.sap.empresa.com',
    lastCheck: '2026-03-10T08:00:00Z',
    lastOp: { type: 'DR_TEST', status: 'COMPLETED', at: '2026-02-01T10:00:00Z' },
    tier: 'dr', region: 'us-west-2', provider: 'AWS',
    pilotLightDetails: {
      secondaryInstanceType: 'r6i.4xlarge',
      estimatedBootTime: '8-12 min',
      lastBackupSync: '2026-03-10T06:00:00Z',
      backupType: 'HANA_LOG_SHIPPING',
      storageSnapshots: true,
      autoScaleOnActivation: true,
    },
  },
  // 4. No configurado (Dev)
  {
    systemId: 'SAP-ERP-D01', sid: 'ED1', haEnabled: false, haStatus: 'NOT_CONFIGURED',
    haType: null, haStrategy: null,
    networkStrategy: null, dbType: 'HANA', replicationMode: null, replicationStatus: null,
    replicationLag: null,
    primary: { id: 'i-0ghi789dev', host: 'sap-ed1-pas', ip: '10.0.5.10', zone: 'us-east-1a', instanceNr: '10', state: 'running' },
    secondary: null, vip: null, lastCheck: null, lastOp: null,
    tier: 'development', region: 'us-east-1', provider: 'AWS',
  },
  // 5. ASCS/ERS Clustering — Hot Standby para la capa de aplicación
  {
    systemId: 'SAP-CRM-P01', sid: 'CR1', haEnabled: true, haStatus: 'HEALTHY',
    haType: 'ASCS_ERS', haStrategy: 'HOT_STANDBY',
    networkStrategy: 'PACEMAKER_VIP', dbType: 'Oracle', replicationMode: 'ENSA2', replicationStatus: 'SOK',
    replicationLag: null,
    primary: { id: 'i-0a1b2c3d4e5f00014', host: 'sap-cr1-ascs', ip: '10.0.1.41', zone: 'us-east-1a', instanceNr: '01', role: 'ASCS', state: 'running' },
    secondary: { id: 'i-0a1b2c3d4e5f00015', host: 'sap-cr1-ers', ip: '10.0.1.42', zone: 'us-east-1b', instanceNr: '10', role: 'ERS', state: 'running' },
    vip: '10.0.0.200', lastCheck: '2026-03-10T08:20:00Z',
    lastOp: { type: 'FAILOVER', status: 'COMPLETED', at: '2026-02-15T03:15:00Z' },
    enqueueStats: { locks: 35, replicated: 35, replicationActive: true },
    tier: 'production', region: 'us-east-1', provider: 'on-premise',
  },
  // 6. Cross-Region DR — Oracle Data Guard entre regiones Azure
  {
    systemId: 'SAP-FIN-P01', sid: 'FP1', haEnabled: true, haStatus: 'HEALTHY',
    haType: 'ORACLE_DG', haStrategy: 'CROSS_REGION_DR',
    networkStrategy: 'AZURE_LB', dbType: 'Oracle', replicationMode: 'ASYNC', replicationStatus: 'SOK',
    replicationLag: 3.2,
    primary: { id: 'vm-fp1-pri', host: 'sap-fp1-ora-pri', ip: '10.10.1.20', zone: 'eastus-az1', instanceNr: '00', state: 'running' },
    secondary: { id: 'vm-fp1-sec', host: 'sap-fp1-ora-sec', ip: '10.20.1.20', zone: 'westus-az1', instanceNr: '00', state: 'running' },
    vip: null, dnsEndpoint: 'fp1-db.sap.empresa.com',
    lastCheck: '2026-03-10T08:10:00Z',
    lastOp: { type: 'DR_TEST', status: 'COMPLETED', at: '2026-01-20T02:00:00Z' },
    tier: 'production', region: 'eastus / westus', provider: 'Azure',
  },
  // 7. Backup & Restore — Solo backups, sin secundario (sandbox)
  {
    systemId: 'SAP-SBX-S01', sid: 'SB1', haEnabled: true, haStatus: 'PROTECTED',
    haType: 'BACKUP_ONLY', haStrategy: 'BACKUP_RESTORE',
    networkStrategy: null, dbType: 'HANA', replicationMode: null, replicationStatus: null,
    replicationLag: null,
    primary: { id: 'i-0sbx001', host: 'sap-sb1-hana', ip: '10.0.8.10', zone: 'us-east-1a', instanceNr: '10', state: 'running' },
    secondary: null, vip: null, lastCheck: '2026-03-10T08:05:00Z',
    lastOp: null,
    tier: 'sandbox', region: 'us-east-1', provider: 'AWS',
    backupDetails: {
      lastFull: '2026-03-10T02:00:00Z',
      lastLog: '2026-03-10T08:00:00Z',
      backupTarget: 'S3',
      retentionDays: 14,
      estimatedRestoreTime: '2-3 horas',
    },
  },
];

// Prerequisites agrupados por estrategia HA
export const mockHAPrereqs = {
  HOT_STANDBY: [
    { name: 'Replication Health', status: 'PASS', required: true, details: 'HANA SR activo, modo SYNC, estado SOK' },
    { name: 'Cluster Health', status: 'PASS', required: true, details: 'Pacemaker cluster: 2 nodos online' },
    { name: 'Network Connectivity', status: 'PASS', required: true, details: 'Ping entre nodos: 0.8ms' },
    { name: 'Disk Space', status: 'PASS', required: true, details: 'Source: 65% libre, Target: 72% libre' },
    { name: 'SAP Status', status: 'PASS', required: true, details: 'SAP EP1 corriendo, todos procesos GREEN' },
    { name: 'Backup Recent', status: 'WARN', required: true, details: 'Último backup: hace 18 horas' },
    { name: 'Maintenance Window', status: 'PASS', required: true, details: 'Dentro de ventana: Sáb 00:00 - Dom 06:00' },
    { name: 'No Active Operations', status: 'PASS', required: true, details: 'Sin operaciones HA en curso' },
    { name: 'Drivers Available', status: 'PASS', required: true, details: 'NETWORK: pacemaker_vip, DB: hana-sr, SAP: sap-services' },
  ],
  WARM_STANDBY: [
    { name: 'Replication Health', status: 'PASS', required: true, details: 'HANA SR activo, modo ASYNC', category: 'sap' },
    { name: 'Replication Lag', status: 'WARN', required: true, details: 'Lag actual: 45.2s — se requiere catch-up antes de activar', category: 'sap' },
    { name: 'Secondary Node Online', status: 'PASS', required: true, details: 'Nodo secundario encendido y accesible (r6i.2xlarge)', category: 'infra' },
    { name: 'Scale-Up Capacity', status: 'PASS', required: true, details: 'Tipo objetivo r6i.8xlarge disponible en us-east-1b', category: 'infra' },
    { name: 'Network Connectivity', status: 'PASS', required: true, details: 'Ping entre nodos: 2.1ms (cross-AZ)', category: 'infra' },
    { name: 'Disk Space', status: 'PASS', required: true, details: 'Source: 65% libre, Target: 58% libre — IOPS suficientes post-resize', category: 'infra' },
    { name: 'Backup Recent', status: 'PASS', required: true, details: 'Último backup: hace 6 horas', category: 'sap' },
    { name: 'Cloud: ec2:ModifyInstanceAttribute', status: 'PASS', required: true, details: 'Permiso para cambiar tipo de instancia (scale-up) — validado via IAM', category: 'cloud' },
    { name: 'Cloud: ec2:StartInstances', status: 'PASS', required: true, details: 'Permiso para iniciar instancia después de resize', category: 'cloud' },
    { name: 'Cloud: ec2:StopInstances', status: 'PASS', required: true, details: 'Permiso para detener instancia antes de resize', category: 'cloud' },
    { name: 'Cloud: ec2:AssociateAddress', status: 'PASS', required: true, details: 'Permiso para mover Elastic IP al nuevo primario', category: 'cloud' },
    { name: 'No Active Operations', status: 'PASS', required: true, details: 'Sin operaciones HA en curso', category: 'system' },
  ],
  PILOT_LIGHT: [
    { name: 'Infrastructure Provisioned', status: 'PASS', required: true, details: 'EC2 instance i-0xyz789dr provisionada (stopped)', category: 'infra' },
    { name: 'Storage Snapshots', status: 'PASS', required: true, details: 'Último snapshot EBS: hace 2 horas', category: 'infra' },
    { name: 'Backup Sync', status: 'PASS', required: true, details: 'Log shipping al día — último sync: hace 2h', category: 'sap' },
    { name: 'AMI/Image Ready', status: 'PASS', required: true, details: 'AMI base con HANA + SAP pre-instalados', category: 'infra' },
    { name: 'DNS Configuration', status: 'PASS', required: true, details: 'Route53 health check activo, TTL: 60s', category: 'infra' },
    { name: 'Automation Scripts', status: 'PASS', required: true, details: 'SSM Automation Documents validados', category: 'infra' },
    { name: 'Network/VPN Ready', status: 'PASS', required: true, details: 'VPN cross-region activa, routing tables OK', category: 'infra' },
    { name: 'Cloud: ec2:StartInstances', status: 'PASS', required: true, details: 'Permiso para encender instancia DR', category: 'cloud' },
    { name: 'Cloud: ec2:StopInstances', status: 'PASS', required: true, details: 'Permiso para apagar instancia después de test DR', category: 'cloud' },
    { name: 'Cloud: ec2:AttachVolume', status: 'PASS', required: true, details: 'Permiso para montar volúmenes con datos', category: 'cloud' },
    { name: 'Cloud: route53:ChangeResourceRecordSets', status: 'PASS', required: true, details: 'Permiso para actualizar DNS en failover', category: 'cloud' },
    { name: 'Last DR Test', status: 'WARN', required: false, details: 'Último test DR: hace 38 días (recomendado: cada 30)', category: 'system' },
  ],
  CROSS_REGION_DR: [
    { name: 'Replication Active', status: 'PASS', required: true, details: 'Data Guard ASYNC activo entre regiones', category: 'sap' },
    { name: 'Replication Lag', status: 'PASS', required: true, details: 'Lag: 3.2s — dentro de RPO objetivo', category: 'sap' },
    { name: 'Secondary Node Online', status: 'PASS', required: true, details: 'VM secundaria corriendo en región westus', category: 'infra' },
    { name: 'DNS/Load Balancer', status: 'PASS', required: true, details: 'Azure Traffic Manager configurado', category: 'infra' },
    { name: 'Network Peering', status: 'PASS', required: true, details: 'VNet peering cross-region activo', category: 'infra' },
    { name: 'Cloud: Microsoft.Network/trafficManagerProfiles/write', status: 'PASS', required: true, details: 'Permiso para actualizar Traffic Manager en failover', category: 'cloud' },
    { name: 'Cloud: Microsoft.Compute/virtualMachines/start', status: 'PASS', required: true, details: 'Permiso para iniciar VMs en región DR', category: 'cloud' },
    { name: 'Last DR Test', status: 'PASS', required: false, details: 'Último test DR: hace 20 días', category: 'system' },
  ],
  BACKUP_RESTORE: [
    { name: 'Last Full Backup', status: 'PASS', required: true, details: 'Backup completo: hace 6 horas en S3', category: 'sap' },
    { name: 'Last Log Backup', status: 'PASS', required: true, details: 'Log backup: hace 30 minutos', category: 'sap' },
    { name: 'Backup Integrity', status: 'PASS', required: true, details: 'Checksum validado OK', category: 'sap' },
    { name: 'Target Infra Template', status: 'PASS', required: true, details: 'CloudFormation template listo para deploy', category: 'infra' },
    { name: 'Cloud: cloudformation:CreateStack', status: 'PASS', required: true, details: 'Permiso para crear infraestructura desde template', category: 'cloud' },
    { name: 'Cloud: s3:GetObject', status: 'PASS', required: true, details: 'Permiso para descargar backups desde S3', category: 'cloud' },
    { name: 'Cloud: route53:ChangeResourceRecordSets', status: 'PASS', required: true, details: 'Permiso para actualizar DNS post-restore', category: 'cloud' },
    { name: 'Restore Tested', status: 'WARN', required: false, details: 'Último test de restore: hace 45 días', category: 'system' },
  ],
};

export const mockHAOpsHistory = [
  { id: 'ha-op-001', systemId: 'SAP-ERP-P01', type: 'TAKEOVER', strategy: 'HOT_STANDBY', status: 'COMPLETED', triggeredBy: 'carlos.mendoza@empresa.com', reason: 'Mantenimiento planificado de SO', startedAt: '2026-02-28T02:00:00Z', completedAt: '2026-02-28T02:04:32Z', duration: '4m 32s', steps: 14, stepsOk: 14 },
  { id: 'ha-op-002', systemId: 'SAP-ERP-Q01', type: 'FAILOVER', strategy: 'WARM_STANDBY', status: 'FAILED', triggeredBy: 'SYSTEM', reason: 'Replicación HANA desincronizada — lag >60s', startedAt: '2026-03-09T14:28:00Z', completedAt: '2026-03-09T14:30:45Z', duration: '2m 45s', steps: 8, stepsOk: 3 },
  { id: 'ha-op-003', systemId: 'SAP-ERP-P01', type: 'FAILBACK', strategy: 'HOT_STANDBY', status: 'COMPLETED', triggeredBy: 'carlos.mendoza@empresa.com', reason: 'Retorno post-mantenimiento', startedAt: '2026-02-28T06:00:00Z', completedAt: '2026-02-28T06:05:10Z', duration: '5m 10s', steps: 14, stepsOk: 14 },
  { id: 'ha-op-004', systemId: 'SAP-ERP-DR01', type: 'DR_TEST', strategy: 'PILOT_LIGHT', status: 'COMPLETED', triggeredBy: 'diana.lopez@empresa.com', reason: 'Test DR trimestral', startedAt: '2026-02-01T10:00:00Z', completedAt: '2026-02-01T10:42:00Z', duration: '42m 00s', steps: 10, stepsOk: 10 },
  { id: 'ha-op-005', systemId: 'SAP-FIN-P01', type: 'DR_TEST', strategy: 'CROSS_REGION_DR', status: 'COMPLETED', triggeredBy: 'carlos.mendoza@empresa.com', reason: 'Test DR cross-region mensual', startedAt: '2026-01-20T02:00:00Z', completedAt: '2026-01-20T02:28:00Z', duration: '28m 00s', steps: 10, stepsOk: 10 },
];

export const mockHADrivers = [
  { type: 'NETWORK', name: 'AWS EIP', version: '1.0.0', status: 'ok', strategies: ['HOT_STANDBY', 'WARM_STANDBY'] },
  { type: 'NETWORK', name: 'AWS Route53', version: '1.0.0', status: 'ok', strategies: ['PILOT_LIGHT', 'BACKUP_RESTORE'] },
  { type: 'NETWORK', name: 'Azure Traffic Manager', version: '1.0.0', status: 'ok', strategies: ['CROSS_REGION_DR'] },
  { type: 'NETWORK', name: 'Pacemaker VIP', version: '1.0.0', status: 'ok', strategies: ['HOT_STANDBY'] },
  { type: 'DB', name: 'HANA SR', version: '1.0.0', status: 'ok', strategies: ['HOT_STANDBY', 'WARM_STANDBY'] },
  { type: 'DB', name: 'Oracle Data Guard', version: '1.0.0', status: 'ok', strategies: ['CROSS_REGION_DR'] },
  { type: 'DB', name: 'HANA Backup/Restore', version: '1.0.0', status: 'ok', strategies: ['PILOT_LIGHT', 'BACKUP_RESTORE'] },
  { type: 'INFRA', name: 'AWS EC2 Lifecycle', version: '1.0.0', status: 'ok', strategies: ['PILOT_LIGHT'] },
  { type: 'INFRA', name: 'AWS CloudFormation', version: '1.0.0', status: 'ok', strategies: ['BACKUP_RESTORE'] },
  { type: 'SAP', name: 'SAP Services', version: '1.0.0', status: 'ok', strategies: ['HOT_STANDBY', 'WARM_STANDBY', 'PILOT_LIGHT', 'CROSS_REGION_DR', 'BACKUP_RESTORE'] },
];


// ── Métricas ──
export const mockMetrics = () => {
  const now = Date.now();
  const points = [];
  for (let i = 24; i >= 0; i--) {
    points.push({
      timestamp: new Date(now - i * 3600000).toISOString(),
      cpu: Math.round(30 + seeded(i * 7) * 40 + (i < 8 ? 20 : 0)),
      memory: Math.round(55 + seeded(i * 13) * 25),
      disk: Math.round(60 + seeded(i * 19) * 15 + i * 0.3),
      iops: Math.round(1000 + seeded(i * 31) * 3000),
    });
  }
  return points;
};

// ── Analytics ──
export const mockAnalytics = {
  totalExecutions: 847,
  successRate: 94.2,
  failedCount: 49,
  avgPerDay: 12.1,
  topRunbooks: [
    { id: 'RB-BACKUP-001', name: 'Verify backup status', executions: 198, successRate: 99.5 },
    { id: 'RB-HANA-001', name: 'Reclaim HANA memory', executions: 156, successRate: 98.1 },
    { id: 'RB-ABAP-001', name: 'Clean sessions + restart WPs', executions: 134, successRate: 96.3 },
    { id: 'RB-ASE-001', name: 'Dump tran log + kill old tx', executions: 112, successRate: 97.3 },
    { id: 'RB-WP-001', name: 'Clean PRIV/Hold WPs', executions: 98, successRate: 96.9 },
  ],
  dailyTrend: Array.from({ length: 14 }, (_, i) => ({
    date: new Date(Date.now() - (13 - i) * 86400000).toISOString().split('T')[0],
    success: Math.round(8 + seeded(i * 7) * 8),
    failed: Math.round(seeded(i * 11) * 3),
  })),
  alertStats: {
    total: 47, critical: 12, warnings: 28, autoResolved: 31, avgResolutionMin: 23,
  },
  slaMetrics: {
    runbooksToday: 13, successRate: 100, avgDuration: '12.4s', mostExecuted: 'RB-ABAP-001 (3x)', pendingApproval: 2,
  },
};

// ── Categorías de resolución de alertas ──
export const alertResolutionCategories = [
  { value: 'false_positive', label: 'Falso positivo' },
  { value: 'mitigated', label: 'Mitigada' },
  { value: 'accepted_risk', label: 'Riesgo aceptado' },
  { value: 'fixed', label: 'Corregida' },
  { value: 'workaround_applied', label: 'Workaround aplicado' },
];

// ── SERVER_METRICS — Grafana-style per-server SAP metrics ──
export const mockServerMetrics = {
  'SAP-ERP-P01': { avail: 99.8, monSt: 'green', monPerf: 'green', users: 42, dialogWP: { total: 20, active: 8, free: 10, hold: 2 }, lastMinLoad: 1847, avgDbTime: 12.4, freeMemPct: 35, respDist: { Dialog: 420, Update: 180, Background: 95, RFC: 305 }, shortDumps: 12, failedJobs: 0, ping: true, dbInfo: { type: 'HANA', version: 'HANA 2.0 SPS07', backupHrs: 6.2, alerts: { errors: 0, high: 0, medium: 2 }, hsrSt: 'SOK', hsrMode: 'sync', hsrLag: 0.8, cpuDb: 38, ramPct: 65, diskData: 58, diskLog: 42, diskTrace: 28, connections: 156 } },
  'SAP-ERP-Q01': { avail: 99.2, monSt: 'yellow', monPerf: 'yellow', users: 28, dialogWP: { total: 30, active: 12, free: 15, hold: 3 }, lastMinLoad: 2450, avgDbTime: 8.2, freeMemPct: 22, respDist: { Dialog: 380, Update: 160, Background: 120, RFC: 340 }, shortDumps: 87, failedJobs: 3, ping: true, dbInfo: { type: 'HANA', version: 'HANA 2.0 SPS07', backupHrs: 8.5, alerts: { errors: 0, high: 2, medium: 5 }, hsrSt: 'SOK', hsrMode: 'sync', hsrLag: 45.2, cpuDb: 42, ramPct: 78, diskData: 85, diskLog: 62, diskTrace: 38, connections: 156 } },
  'SAP-ERP-D01': { avail: 99.9, monSt: 'green', monPerf: 'green', users: 8, dialogWP: { total: 20, active: 3, free: 16, hold: 1 }, lastMinLoad: 520, avgDbTime: 5.1, freeMemPct: 48, respDist: { Dialog: 180, Update: 60, Background: 45, RFC: 115 }, shortDumps: 2, failedJobs: 0, ping: true, dbInfo: { type: 'HANA', version: 'HANA 2.0 SPS07', backupHrs: 4.2, alerts: { errors: 0, high: 0, medium: 1 }, hsrSt: null, hsrMode: null, cpuDb: 28, ramPct: 52, diskData: 41, diskLog: 30, diskTrace: 22, connections: 45 } },
  'SAP-BW-P01': { avail: 99.5, monSt: 'green', monPerf: 'yellow', users: 15, dialogWP: { total: 20, active: 6, free: 12, hold: 2 }, lastMinLoad: 1580, avgDbTime: 14.6, freeMemPct: 29, respDist: { Dialog: 350, Update: 140, Background: 200, RFC: 180 }, shortDumps: 8, failedJobs: 0, ping: true, dbInfo: { type: 'ASE', version: '16.0 SP04 PL08', backupHrs: 5.5, state: 'ONLINE', cacheHitPct: 96.8, blockingChains: 0, txLogPct: 45, physDataPct: 63, physLogPct: 38 } },
  'SAP-SOL-P01': { avail: 99.95, monSt: 'green', monPerf: 'green', users: 5, dialogWP: { total: 10, active: 2, free: 7, hold: 1 }, lastMinLoad: 310, avgDbTime: 15.8, freeMemPct: 55, respDist: { Dialog: 220, Update: 90, Background: 150, RFC: 40 }, shortDumps: 0, failedJobs: 0, ping: true, dbInfo: { type: 'MaxDB', version: '7.9.10', backupHrs: 3.1, dataVolPct: 45, logVolPct: 28, cacheHitPct: 99.1, lockWaitPct: 0.1, sessions: 12, state: 'ONLINE' } },
  'SAP-CRM-P01': { avail: 99.7, monSt: 'green', monPerf: 'green', users: 22, dialogWP: { total: 24, active: 7, free: 15, hold: 2 }, lastMinLoad: 1920, avgDbTime: 9.8, freeMemPct: 38, respDist: { Dialog: 290, Update: 120, Background: 80, RFC: 260 }, shortDumps: 5, failedJobs: 0, ping: true, dbInfo: { type: 'Oracle', version: '19.18.0.0', backupHrs: 7.2, state: 'ONLINE', tablespacePct: 55, blockedSessions: 0 } },
  'SAP-GRC-P01': { avail: 99.8, monSt: 'green', monPerf: 'green', users: 12, dialogWP: { total: 16, active: 4, free: 11, hold: 1 }, lastMinLoad: 820, avgDbTime: 6.5, freeMemPct: 52, respDist: { Dialog: 210, Update: 80, Background: 60, RFC: 150 }, shortDumps: 1, failedJobs: 0, ping: true, dbInfo: { type: 'MSSQL', version: 'SQL Server 2019 CU25', backupHrs: 4.8, state: 'ONLINE', logPct: 32, dataPct: 42 } },
  'SAP-PO-P01': { avail: 99.6, monSt: 'green', monPerf: 'green', users: 10, stack: 'java', jvm: { heapUsed: 4.2, heapMax: 8.0, gcPausePct: 1.8, threads: 342, threadsMax: 500 }, icm: { connections: 85, connectionsMax: 200, avgResponseMs: 120 }, msgQueue: { pending: 12, failed: 3, processed24h: 18500 }, channels: { active: 24, inactive: 2, error: 1 }, avgDbTime: 11.2, freeMemPct: 42, failedJobs: 0, ping: true, dbInfo: { type: 'DB2', version: '11.5.8.0', backupHrs: 6.0, state: 'ONLINE', tablespacePct: 51, logPct: 35 } },
  'SAP-EWM-P01': { avail: 99.6, monSt: 'green', monPerf: 'green', users: 18, dialogWP: { total: 20, active: 5, free: 13, hold: 2 }, lastMinLoad: 1200, avgDbTime: 7.8, freeMemPct: 40, respDist: { Dialog: 260, Update: 100, Background: 90, RFC: 200 }, shortDumps: 4, failedJobs: 0, ping: true, dbInfo: { type: 'HANA', version: 'HANA 2.0 SPS07', backupHrs: 5.0, alerts: { errors: 0, high: 1, medium: 2 }, hsrSt: null, hsrMode: null, cpuDb: 35, ramPct: 60, diskData: 48, diskLog: 35, diskTrace: 25, connections: 88 } },
};

// ── SERVER_DEPS — Per-server dependency status ──
export const mockServerDeps = {
  'SAP-ERP-P01': [
    { name: 'SSM Agent', status: 'ok', detail: 'Online, last ping 30s ago' },
    { name: 'sapcontrol', status: 'ok', detail: 'v7.77, accesible como ep1adm' },
    { name: 'saposcol', status: 'ok', detail: 'Running, PID 12345' },
    { name: 'CloudWatch Agent', status: 'ok', detail: 'mem + disk metrics activos' },
    { name: 'hdbsql', status: 'ok', detail: 'HANA client 2.0 SPS07, MONITORING role OK' },
    { name: 'RFC Connectivity', status: 'ok', detail: 'RFC_PING exitoso en 8ms' },
    { name: 'HSR Tools', status: 'ok', detail: 'hdbnsutil + systemReplicationStatus.py disponibles' },
  ],
  'SAP-ERP-Q01': [
    { name: 'SSM Agent', status: 'ok', detail: 'Online' },
    { name: 'sapcontrol', status: 'ok', detail: 'v7.77' },
    { name: 'saposcol', status: 'ok', detail: 'Running' },
    { name: 'CloudWatch Agent', status: 'ok', detail: 'mem + disk metrics activos' },
    { name: 'hdbsql', status: 'ok', detail: 'HANA client 2.0 SPS07, MONITORING role OK' },
    { name: 'RFC Connectivity', status: 'ok', detail: 'RFC_PING exitoso en 8ms' },
  ],
  'SAP-ERP-D01': [
    { name: 'SSM Agent', status: 'ok', detail: 'Online' },
    { name: 'sapcontrol', status: 'ok', detail: 'v7.77' },
    { name: 'saposcol', status: 'ok', detail: 'Running' },
    { name: 'CloudWatch Agent', status: 'err', detail: 'No instalado' },
    { name: 'hdbsql', status: 'ok', detail: 'HANA client 2.0 SPS07' },
    { name: 'RFC Connectivity', status: 'ok', detail: 'RFC_PING OK' },
  ],
  'SAP-BW-P01': [
    { name: 'SSM Agent', status: 'ok', detail: 'Online, last ping 25s ago' },
    { name: 'sapcontrol', status: 'ok', detail: 'v7.77, accesible como bp1adm' },
    { name: 'saposcol', status: 'ok', detail: 'Running, PID 34567' },
    { name: 'CloudWatch Agent', status: 'ok', detail: 'mem + disk metrics activos' },
    { name: 'isql (ASE)', status: 'ok', detail: 'ASE 16.0 SP04, conectado a BP1' },
    { name: 'RFC Connectivity', status: 'ok', detail: 'RFC_PING exitoso en 15ms' },
  ],
  'SAP-SOL-P01': [
    { name: 'SSM Agent', status: 'ok', detail: 'Online' },
    { name: 'sapcontrol', status: 'ok', detail: 'v7.53' },
    { name: 'saposcol', status: 'warn', detail: 'Stopped. Ejecutar: startsap saposcol' },
    { name: 'CloudWatch Agent', status: 'ok', detail: 'Activo' },
    { name: 'dbmcli (MaxDB)', status: 'ok', detail: 'v7.9.10' },
    { name: 'RFC Connectivity', status: 'ok', detail: 'RFC_PING OK' },
  ],
  'SAP-CRM-P01': [
    { name: 'SSM Agent', status: 'ok', detail: 'Online' },
    { name: 'sapcontrol', status: 'ok', detail: 'v7.53' },
    { name: 'saposcol', status: 'ok', detail: 'Running' },
    { name: 'CloudWatch Agent', status: 'ok', detail: 'mem + disk metrics activos' },
    { name: 'sqlplus (Oracle)', status: 'ok', detail: 'Oracle 19c client, MONITORING role OK' },
    { name: 'RFC Connectivity', status: 'ok', detail: 'RFC_PING exitoso en 10ms' },
    { name: 'RMAN', status: 'ok', detail: 'Recovery Manager disponible' },
  ],
  'SAP-GRC-P01': [
    { name: 'SSM Agent', status: 'ok', detail: 'Online' },
    { name: 'sapcontrol', status: 'ok', detail: 'v7.77' },
    { name: 'saposcol', status: 'warn', detail: 'Stopped. Ejecutar: saposcol -start' },
    { name: 'CloudWatch Agent', status: 'ok', detail: 'Activo' },
    { name: 'sqlcmd (MSSQL)', status: 'ok', detail: 'SQL Server 2019, conectado a GR1' },
    { name: 'RFC Connectivity', status: 'ok', detail: 'RFC_PING OK' },
  ],
  'SAP-PO-P01': [
    { name: 'SSM Agent', status: 'ok', detail: 'Online' },
    { name: 'sapcontrol', status: 'ok', detail: 'v7.53' },
    { name: 'saposcol', status: 'ok', detail: 'Running' },
    { name: 'CloudWatch Agent', status: 'warn', detail: 'Instalado sin custom metrics. Configurar mem_used_percent' },
    { name: 'db2 CLI (DB2)', status: 'ok', detail: 'DB2 11.5 client, conectado a PO1' },
    { name: 'RFC Connectivity', status: 'ok', detail: 'RFC_PING exitoso en 18ms' },
  ],
  'SAP-EWM-P01': [
    { name: 'SSM Agent', status: 'ok', detail: 'Online' },
    { name: 'sapcontrol', status: 'ok', detail: 'v7.77' },
    { name: 'saposcol', status: 'ok', detail: 'Running' },
    { name: 'CloudWatch Agent', status: 'ok', detail: 'mem + disk metrics activos' },
    { name: 'hdbsql', status: 'ok', detail: 'HANA client 2.0 SPS07' },
    { name: 'RFC Connectivity', status: 'ok', detail: 'RFC_PING exitoso en 12ms' },
  ],
};

// ── DEP_REMEDIATION — Pasos de remediación por tipo de dependencia ──
export const mockDepRemediation = {
  'SSM Agent': 'Verificar en AWS Console > Systems Manager > Fleet Manager. Si offline: 1) Verificar Security Group (puerto 443 outbound), 2) Verificar IAM Instance Profile con AmazonSSMManagedInstanceCore, 3) sudo systemctl restart amazon-ssm-agent',
  'sapcontrol': 'Verificar que el usuario <sid>adm existe y tiene permisos. Ejecutar: su - <sid>adm -c "sapcontrol -nr <inst> -function GetProcessList". Si falla: verificar que SAP está iniciado con startsap.',
  'saposcol': 'El OS Collector no está corriendo. Ejecutar como <sid>adm: saposcol -start. Para inicio automático: agregar a /usr/sap/<SID>/SYS/profile/DEFAULT.PFL: SAPOSCOL_START = true',
  'CloudWatch Agent': 'Instalar: sudo yum install -y amazon-cloudwatch-agent. Configurar: sudo /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-config-wizard. Asegurar métricas: mem_used_percent, disk_used_percent. Iniciar: sudo systemctl start amazon-cloudwatch-agent',
  'hdbsql': 'Verificar HANA client: which hdbsql. Verificar usuario monitoreo: hdbsql -U MONITORING_KEY "SELECT 1 FROM DUMMY". Si falla: CREATE USER MONITORING PASSWORD ... NO FORCE_FIRST_PASSWORD_CHANGE; GRANT MONITORING TO MONITORING;',
  'dbmcli (MaxDB)': 'Verificar MaxDB tools: which dbmcli. Verificar conexión: dbmcli -d <SID> -u CONTROL,<pwd> db_state. Si no existe: instalar MaxDB Software desde SAP Downloads.',
  'RFC Connectivity': 'Ejecutar RFC_PING desde sapcontrol o PyRFC. Si falla: 1) Verificar gateway (SMGW), 2) Verificar puerto 33<inst> abierto, 3) Verificar usuario RFC con autorización S_RFC.',
  'HSR Tools': 'Verificar como <sid>adm: which hdbnsutil && which HDBSettings.sh. Para systemReplicationStatus.py: python /usr/sap/<SID>/HDB<inst>/exe/python_support/systemReplicationStatus.py',
  'isql (ASE)': 'Verificar ASE client: which isql. Verificar conexión: isql -S<SID> -USAP_MONITOR -P*** -w200 "SELECT 1". Si falla: instalar ASE client tools desde SAP Downloads.',
  'sqlplus (Oracle)': 'Verificar Oracle client: which sqlplus. Verificar conexión: sqlplus MONITORING/***@<SID> "SELECT 1 FROM DUAL". Si falla: configurar ORACLE_HOME y TNS_ADMIN.',
  'sqlcmd (MSSQL)': 'Verificar SQL Server client: which sqlcmd. Verificar conexión: sqlcmd -S <SID> -U SAP_MONITOR -P*** -Q "SELECT 1". Si falla: instalar mssql-tools18.',
  'db2 CLI (DB2)': 'Verificar DB2 client: which db2. Verificar conexión: db2 "CONNECT TO <SID> USER SAP_MONITOR USING ***". Si falla: configurar DB2_HOME y catalogar la BD.',
  'RMAN': 'Verificar Recovery Manager: which rman. Verificar catálogo: rman target / "LIST BACKUP SUMMARY". Si falla: verificar ORACLE_HOME y permisos del usuario ora<sid>.',
};

// ── BACKUP_RUNBOOKS — Comando de backup por tipo de BD ──
export const mockBackupRunbooks = {
  'HANA': { rb: 'RB-BACKUP-001', cmd: 'hdbsql -U BACKUP_KEY "BACKUP DATA USING FILE (\'complete_data_backup\')"' },
  'MaxDB': { rb: 'RB-BACKUP-001', cmd: 'dbmcli -d SID backup_start DATA EXTERNAL' },
  'ASE': { rb: 'RB-BACKUP-001', cmd: 'isql -SSID "dump database SID to ..."' },
  'Oracle': { rb: 'RB-BACKUP-001', cmd: 'rman target / "BACKUP DATABASE PLUS ARCHIVELOG"' },
  'MSSQL': { rb: 'RB-BACKUP-001', cmd: 'sqlcmd -Q "BACKUP DATABASE SID TO DISK=..."' },
  'DB2': { rb: 'RB-BACKUP-001', cmd: 'db2 "BACKUP DATABASE SID ONLINE TO ..."' },
};

// ── Settings data ──
export const mockThresholds = [
  { metric: 'CPU (%)', warning: 70, critical: 90 },
  { metric: 'Memoria (%)', warning: 75, critical: 90 },
  { metric: 'Disco (%)', warning: 80, critical: 95 },
  { metric: 'HANA Mem (%)', warning: 80, critical: 90 },
  { metric: 'HANA Disco (%)', warning: 85, critical: 95 },
  { metric: 'HANA Rep Lag (s)', warning: 300, critical: 600 },
  { metric: 'JVM Heap (%)', warning: 82, critical: 92 },
  { metric: 'JVM OldGen (%)', warning: 75, critical: 85 },
  { metric: 'GC Overhead (%)', warning: 10, critical: 25 },
  { metric: 'ICM Connections (%)', warning: 80, critical: 95 },
  { metric: 'ASE LogFull (%)', warning: 80, critical: 90 },
  { metric: 'Short Dumps 24h', warning: 50, critical: 200 },
  { metric: 'Failed Jobs 24h', warning: 5, critical: 20 },
  { metric: 'PO Failed Msgs', warning: 10, critical: 50 },
  { metric: 'Cert Expiry (días)', warning: 30, critical: 7 },
];

export const mockEscalationPolicy = [
  { level: 'L1', timeout: '30 min', recipients: 'ana.garcia@empresa.com', autoExecute: false },
  { level: 'L2', timeout: '60 min', recipients: 'roberto.perez@empresa.com', autoExecute: false },
  { level: 'Admin', timeout: '120 min', recipients: 'carlos.mendoza@empresa.com', autoExecute: true },
];

export const mockMaintenanceWindows = [
  { system: 'SAP-ERP-P01', day: 'Domingo', time: '02:00 - 06:00', duration: '4h', status: 'active' },
  { system: 'SAP-ERP-Q01', day: 'Sábado', time: '03:00 - 07:00', duration: '4h', status: 'active' },
  { system: 'Todos', day: 'Manual', time: '-', duration: '-', status: 'inactive' },
];

export const mockApiKeys = [
  { name: 'Grafana', key: 'sk-mock-a3f8c1d2...', created: '15 Feb 2026', status: 'active' },
  { name: 'PagerDuty', key: 'sk-mock-b7d2e4f5...', created: '20 Feb 2026', status: 'active' },
];

// ══════════════════════════════════════════════════════════════
// P1.1: System → Instance[] Model
// Maps each System ID to its SAP instances (ASCS, PAS, AAS, DB)
// Real SAP systems have multiple instances running on separate hosts
// ══════════════════════════════════════════════════════════════
export const mockSystemInstances = {
  // EP1 — S/4HANA PRD, healthScore 94, 5 instances across 5 hosts
  'SAP-ERP-P01': [
    {
      nr: '01', role: 'ASCS', hostname: 'sap-ep1-ascs', ip: '10.0.1.11', status: 'running', pid: 8820, startedAt: '2026-02-26T04:00:00Z',
      os: 'SUSE Linux 15 SP5', ec2Id: 'i-0a1b2c3d4e5f00101', ec2Type: 'm5.large', zone: 'us-east-1a',
      cpu: 12, mem: 28, disk: 34, availability: 99.98, connections: 3, monStatus: 'green',
    },
    {
      nr: '00', role: 'PAS', hostname: 'sap-ep1-pas', ip: '10.0.1.10', status: 'running', pid: 9245, startedAt: '2026-02-26T04:02:00Z',
      os: 'SUSE Linux 15 SP5', ec2Id: 'i-0a1b2c3d4e5f00100', ec2Type: 'r5.2xlarge', zone: 'us-east-1a',
      cpu: 68, mem: 74, disk: 58, availability: 99.85, connections: 142, monStatus: 'yellow',
      dialogWP: { total: 20, active: 14, free: 5, hold: 1 },
      batchWP:  { total: 6,  active: 3,  free: 3 },
    },
    {
      nr: '02', role: 'AAS', hostname: 'sap-ep1-aas', ip: '10.0.1.12', status: 'running', pid: 7410, startedAt: '2026-02-26T04:03:00Z',
      os: 'SUSE Linux 15 SP5', ec2Id: 'i-0a1b2c3d4e5f00102', ec2Type: 'r5.xlarge', zone: 'us-east-1b',
      cpu: 44, mem: 61, disk: 52, availability: 99.90, connections: 88, monStatus: 'green',
      dialogWP: { total: 12, active: 7, free: 5, hold: 0 },
      batchWP:  { total: 4,  active: 2, free: 2 },
    },
    {
      nr: '10', role: 'HANA Primary', hostname: 'sap-ep1-hana-pri', ip: '10.0.1.20', status: 'running', pid: 12500, startedAt: '2026-02-26T03:55:00Z',
      os: 'SUSE Linux 15 SP5', ec2Id: 'i-0a1b2c3d4e5f00103', ec2Type: 'r5.4xlarge', zone: 'us-east-1a',
      cpu: 48, mem: 80, disk: 62, availability: 99.95, connections: 64, monStatus: 'green',
      dbCpu: 46, dbMem: 78, dbDiskData: 62, dbDiskLog: 38,
    },
    {
      nr: '10', role: 'HANA Secondary', hostname: 'sap-ep1-hana-sec', ip: '10.0.2.20', status: 'running', pid: 12500, startedAt: '2026-02-26T03:55:00Z',
      os: 'SUSE Linux 15 SP5', ec2Id: 'i-0a1b2c3d4e5f00104', ec2Type: 'r5.4xlarge', zone: 'us-east-1b',
      cpu: 22, mem: 65, disk: 60, availability: 99.98, connections: 8, monStatus: 'green',
      dbCpu: 20, dbMem: 63, dbDiskData: 60, dbDiskLog: 35,
    },
  ],

  // EQ1 — S/4HANA QAS, healthScore 87, 2 instances
  'SAP-ERP-Q01': [
    {
      nr: '00', role: 'PAS', hostname: 'sap-eq1-pas', ip: '10.0.2.10', status: 'running', pid: 8815, startedAt: '2026-03-02T06:00:00Z',
      os: 'SUSE Linux 15 SP5', ec2Id: 'i-0a1b2c3d4e5f00200', ec2Type: 'r5.xlarge', zone: 'us-east-1a',
      cpu: 45, mem: 72, disk: 81, availability: 99.20, connections: 56, monStatus: 'yellow',
      dialogWP: { total: 12, active: 8, free: 4, hold: 0 },
      batchWP:  { total: 4,  active: 2, free: 2 },
    },
    {
      nr: '10', role: 'HANA', hostname: 'sap-eq1-hana', ip: '10.0.2.20', status: 'running', pid: 11200, startedAt: '2026-03-02T05:55:00Z',
      os: 'SUSE Linux 15 SP5', ec2Id: 'i-0a1b2c3d4e5f00201', ec2Type: 'r5.2xlarge', zone: 'us-east-1a',
      cpu: 38, mem: 75, disk: 85, availability: 99.35, connections: 28, monStatus: 'yellow',
      dbCpu: 36, dbMem: 74, dbDiskData: 85, dbDiskLog: 44,
    },
  ],

  // ED1 — S/4HANA DEV, healthScore 72, degraded, 2 instances
  'SAP-ERP-D01': [
    {
      nr: '00', role: 'PAS', hostname: 'sap-ed1-pas', ip: '10.0.3.10', status: 'running', pid: 6520, startedAt: '2026-02-08T10:00:00Z',
      os: 'SUSE Linux 15 SP5', ec2Id: 'i-0a1b2c3d4e5f00300', ec2Type: 'r5.large', zone: 'us-east-1c',
      cpu: 38, mem: 55, disk: 43, availability: 99.88, connections: 22, monStatus: 'yellow',
      dialogWP: { total: 8, active: 4, free: 4, hold: 0 },
      batchWP:  { total: 3, active: 1, free: 2 },
    },
    {
      nr: '10', role: 'HANA', hostname: 'sap-ed1-hana', ip: '10.0.3.20', status: 'running', pid: 10300, startedAt: '2026-02-08T09:55:00Z',
      os: 'SUSE Linux 15 SP5', ec2Id: 'i-0a1b2c3d4e5f00301', ec2Type: 'r5.large', zone: 'us-east-1c',
      cpu: 32, mem: 52, disk: 41, availability: 99.90, connections: 12, monStatus: 'green',
      dbCpu: 30, dbMem: 50, dbDiskData: 41, dbDiskLog: 22,
    },
  ],

  // BP1 — BW/4HANA PRD, healthScore 91, 2 instances
  'SAP-BW-P01': [
    {
      nr: '00', role: 'PAS', hostname: 'sap-bp1-pas', ip: '10.0.1.20', status: 'running', pid: 9100, startedAt: '2026-02-16T08:00:00Z',
      os: 'SUSE Linux 15 SP5', ec2Id: 'i-0a1b2c3d4e5f00400', ec2Type: 'r5.2xlarge', zone: 'us-east-1a',
      cpu: 58, mem: 70, disk: 63, availability: 99.50, connections: 74, monStatus: 'green',
      dialogWP: { total: 16, active: 10, free: 6, hold: 0 },
      batchWP:  { total: 8,  active: 5,  free: 3 },
    },
    {
      nr: '01', role: 'AAS', hostname: 'sap-bp1-aas', ip: '10.0.1.21', status: 'running', pid: 7800, startedAt: '2026-02-16T08:02:00Z',
      os: 'SUSE Linux 15 SP5', ec2Id: 'i-0a1b2c3d4e5f00401', ec2Type: 'r5.xlarge', zone: 'us-east-1b',
      cpu: 42, mem: 58, disk: 55, availability: 99.60, connections: 38, monStatus: 'green',
      dialogWP: { total: 10, active: 5, free: 5, hold: 0 },
      batchWP:  { total: 6,  active: 3, free: 3 },
    },
  ],

  // SM1 — SolMan PRD, healthScore 45, critical — high CPU on both PAS nodes
  'SAP-SOL-P01': [
    {
      nr: '00', role: 'PAS', hostname: 'sap-sm1-pas', ip: '10.0.1.30', status: 'running', pid: 4520, startedAt: '2026-01-24T02:00:00Z',
      os: 'Windows Server 2019', ec2Id: 'i-0a1b2c3d4e5f00500', ec2Type: 'r5.large', zone: 'us-east-1a',
      cpu: 95, mem: 82, disk: 37, availability: 99.70, connections: 48, monStatus: 'red',
      dialogWP: { total: 10, active: 10, free: 0, hold: 2 },
      batchWP:  { total: 4,  active: 4,  free: 0 },
    },
    {
      nr: '01', role: 'PAS', hostname: 'sap-sm1-pas2', ip: '10.0.1.31', status: 'running', pid: 4600, startedAt: '2026-01-24T02:02:00Z',
      os: 'Windows Server 2019', ec2Id: 'i-0a1b2c3d4e5f00501', ec2Type: 'r5.large', zone: 'us-east-1b',
      cpu: 88, mem: 79, disk: 35, availability: 99.65, connections: 32, monStatus: 'red',
      dialogWP: { total: 10, active: 9, free: 1, hold: 1 },
      batchWP:  { total: 4,  active: 4, free: 0 },
    },
  ],

  // CR1 — CRM PRD, healthScore 88, 4 instances (ASCS + ERS + PAS + AAS)
  'SAP-CRM-P01': [
    {
      nr: '01', role: 'ASCS', hostname: 'sap-cr1-ascs', ip: '10.0.1.41', status: 'running', pid: 5200, startedAt: '2026-02-20T04:00:00Z',
      os: 'RHEL 8.9', ec2Id: 'i-0a1b2c3d4e5f00601', ec2Type: 'm5.large', zone: 'us-east-1a',
      cpu: 14, mem: 30, disk: 42, availability: 99.95, connections: 4, monStatus: 'green',
    },
    {
      nr: '10', role: 'ERS', hostname: 'sap-cr1-ers', ip: '10.0.1.42', status: 'running', pid: 5300, startedAt: '2026-02-20T04:01:00Z',
      os: 'RHEL 8.9', ec2Id: 'i-0a1b2c3d4e5f00602', ec2Type: 'm5.large', zone: 'us-east-1b',
      cpu: 8, mem: 22, disk: 38, availability: 99.97, connections: 2, monStatus: 'green',
    },
    {
      nr: '00', role: 'PAS', hostname: 'sap-cr1-pas', ip: '10.0.1.40', status: 'running', pid: 8900, startedAt: '2026-02-20T04:03:00Z',
      os: 'RHEL 8.9', ec2Id: 'i-0a1b2c3d4e5f00600', ec2Type: 'r5.xlarge', zone: 'us-east-1a',
      cpu: 52, mem: 65, disk: 55, availability: 99.75, connections: 96, monStatus: 'green',
      dialogWP: { total: 14, active: 9, free: 5, hold: 0 },
      batchWP:  { total: 5,  active: 2, free: 3 },
    },
    {
      nr: '02', role: 'AAS', hostname: 'sap-cr1-aas', ip: '10.0.1.43', status: 'running', pid: 7200, startedAt: '2026-02-20T04:04:00Z',
      os: 'RHEL 8.9', ec2Id: 'i-0a1b2c3d4e5f00603', ec2Type: 'r5.large', zone: 'us-east-1b',
      cpu: 35, mem: 48, disk: 50, availability: 99.80, connections: 44, monStatus: 'green',
      dialogWP: { total: 8,  active: 4, free: 4, hold: 0 },
      batchWP:  { total: 3,  active: 1, free: 2 },
    },
  ],

  // GR1 — GRC QAS, healthScore 96, healthy single instance
  'SAP-GRC-P01': [
    {
      nr: '00', role: 'PAS', hostname: 'sap-gr1-pas', ip: '10.0.1.50', status: 'running', pid: 6800, startedAt: '2026-02-23T06:00:00Z',
      os: 'Windows Server 2022', ec2Id: 'i-0a1b2c3d4e5f00700', ec2Type: 'r5.large', zone: 'us-east-1a',
      cpu: 28, mem: 44, disk: 42, availability: 99.80, connections: 18, monStatus: 'green',
      dialogWP: { total: 8, active: 3, free: 5, hold: 0 },
      batchWP:  { total: 3, active: 1, free: 2 },
    },
  ],

  // PO1 — PI/PO PRD, healthScore 63, degraded — high disk, AAS stopped
  'SAP-PO-P01': [
    {
      nr: '00', role: 'PAS', hostname: 'sap-po1-pas', ip: '10.0.1.60', status: 'running', pid: 5400, startedAt: '2026-02-13T03:00:00Z',
      os: 'RHEL 9.2', ec2Id: 'i-0a1b2c3d4e5f00800', ec2Type: 'r5.large', zone: 'us-east-1a',
      cpu: 46, mem: 62, disk: 91, availability: 99.60, connections: 34, monStatus: 'yellow',
      dialogWP: { total: 10, active: 6, free: 4, hold: 0 },
      batchWP:  { total: 4,  active: 2, free: 2 },
    },
    {
      nr: '01', role: 'AAS', hostname: 'sap-po1-aas', ip: '10.0.1.61', status: 'stopped', pid: null, startedAt: null,
      os: 'RHEL 9.2', ec2Id: 'i-0a1b2c3d4e5f00801', ec2Type: 'r5.large', zone: 'us-east-1b',
      cpu: 0, mem: 0, disk: 0, availability: 0, connections: 0, monStatus: 'red',
      dialogWP: { total: 10, active: 0, free: 0, hold: 0 },
      batchWP:  { total: 4,  active: 0, free: 0 },
    },
  ],

  // EW1 — S/4HANA EWM PRD, healthScore 82, warning, single instance
  'SAP-EWM-P01': [
    {
      nr: '00', role: 'PAS', hostname: 'sap-ew1-pas', ip: '10.0.1.70', status: 'running', pid: 8100, startedAt: '2026-02-18T04:00:00Z',
      os: 'SUSE Linux 15 SP5', ec2Id: 'i-0a1b2c3d4e5f00900', ec2Type: 'r5.xlarge', zone: 'us-east-1a',
      cpu: 42, mem: 63, disk: 49, availability: 99.60, connections: 52, monStatus: 'green',
      dialogWP: { total: 12, active: 7, free: 5, hold: 0 },
      batchWP:  { total: 5,  active: 3, free: 2 },
    },
  ],
};

// ── Per-host metric history (72 points = 6h at 5min intervals) ──
export const mockMetricHistory = (() => {
  const hist = {};
  Object.values(mockSystemInstances).forEach((instances) => {
    instances.forEach((inst) => {
      if (hist[inst.hostname]) return;
      const h = [];
      let cpu = inst.cpu, mem = inst.mem, disk = inst.disk;
      const seed = inst.hostname.length * 17;
      for (let i = 71; i >= 0; i--) {
        cpu = Math.max(10, Math.min(98, cpu + Math.floor(seeded(i * 7 + seed + cpu) * 13) - 6));
        mem = Math.max(20, Math.min(98, mem + Math.floor(seeded(i * 11 + seed + mem) * 9) - 4));
        disk = Math.min(99, Math.max(20, Math.round(disk + (seeded(i * 13 + seed) > 0.85 ? 1 : 0))));
        h.push({ cpu, mem, disk });
      }
      hist[inst.hostname] = h;
    });
  });
  return hist;
})();

// Helper: aggregate instance metrics to system level
export function getSystemHosts(systemId) {
  const instances = mockSystemInstances[systemId] || [];
  const hostMap = {};
  instances.forEach(inst => {
    if (!hostMap[inst.hostname]) {
      hostMap[inst.hostname] = {
        hostname: inst.hostname,
        ip: inst.ip,
        os: inst.os,
        ec2Id: inst.ec2Id,
        ec2Type: inst.ec2Type,
        zone: inst.zone,
        cpu: inst.cpu,
        mem: inst.mem,
        disk: inst.disk,
        availability: inst.availability,
        instances: []
      };
    }
    hostMap[inst.hostname].instances.push(inst);
  });
  return Object.values(hostMap);
}

// ══════════════════════════════════════════════════════════════
// P1.4 + P2.3: System Metadata
// SAP client (mandante), release info, kernel, SID line grouping
// ══════════════════════════════════════════════════════════════
export const mockSystemMeta = {
  'SAP-ERP-P01': { client: '100', sapRelease: 'S/4HANA 2023 FPS02', kernelRelease: '777.36', sidLine: 'ERP', sapNotes: 142 },
  'SAP-ERP-Q01': { client: '200', sapRelease: 'S/4HANA 2023 FPS02', kernelRelease: '777.36', sidLine: 'ERP', sapNotes: 142 },
  'SAP-ERP-D01': { client: '300', sapRelease: 'S/4HANA 2023 FPS02', kernelRelease: '777.36', sidLine: 'ERP', sapNotes: 142 },
  'SAP-BW-P01': { client: '100', sapRelease: 'BW/4HANA 2.0 SP01', kernelRelease: '777.36', sidLine: 'BW', sapNotes: 98 },
  'SAP-SOL-P01': { client: '100', sapRelease: 'SolMan 7.2 SP17', kernelRelease: '753.22', sidLine: 'SOL', sapNotes: 64 },
  'SAP-CRM-P01': { client: '100', sapRelease: 'CRM 7.0 EHP4', kernelRelease: '753.22', sidLine: 'CRM', sapNotes: 78 },
  'SAP-GRC-P01': { client: '200', sapRelease: 'GRC 12.0 SP02', kernelRelease: '777.36', sidLine: 'GRC', sapNotes: 45 },
  'SAP-PO-P01': { client: '100', sapRelease: 'PO 7.5 SP25', kernelRelease: '753.22', sidLine: 'PO', sapNotes: 56 },
  'SAP-EWM-P01': { client: '100', sapRelease: 'S/4HANA EWM 2023', kernelRelease: '777.36', sidLine: 'EWM', sapNotes: 112 },
};

// ── P3: SID Lines (for landscape comparison DEV/QAS/PRD) ──
export const mockSIDLines = [
  { line: 'ERP', description: 'S/4HANA ERP', systems: ['SAP-ERP-D01', 'SAP-ERP-Q01', 'SAP-ERP-P01'] },
  { line: 'BW', description: 'BW/4HANA Analytics', systems: ['SAP-BW-P01'] },
  { line: 'SOL', description: 'Solution Manager', systems: ['SAP-SOL-P01'] },
  { line: 'CRM', description: 'Customer Relationship', systems: ['SAP-CRM-P01'] },
  { line: 'GRC', description: 'Governance Risk Compliance', systems: ['SAP-GRC-P01'] },
  { line: 'PO', description: 'Process Orchestration', systems: ['SAP-PO-P01'] },
  { line: 'EWM', description: 'Extended Warehouse', systems: ['SAP-EWM-P01'] },
];

// ══════════════════════════════════════════════════════════════
// P2.5: SM12/SM13/SM37 Monitoring Equivalents
// Real SAP Basis monitors: enqueue locks, update records, background jobs
// ══════════════════════════════════════════════════════════════
export const mockSAPMonitoring = {
  'SAP-ERP-P01': {
    // SM12 — Enqueue Lock Monitor
    sm12: { totalLocks: 45, oldLocks: 12, maxAge: '4.2h', topUsers: ['EP1ADM', 'BATCH', 'RFC_USER'], topTables: ['VBAK', 'EKKO', 'MARA'] },
    // SM13 — Update Request Monitor
    sm13: { pending: 3, failed: 0, active: 2, avgDelay: '2.1s', lastFailed: null },
    // SM37 — Background Job Monitor
    sm37: { running: 5, scheduled: 18, finished: 142, failed: 2, canceled: 0, longRunning: [{ name: 'RSUSR002', runtime: '45min', status: 'running' }] },
    // SM21 — System Log (count last 24h)
    sm21: { total: 247, errors: 4, warnings: 23, security: 2 },
    // ST22 — Short Dumps (already in serverMetrics, cross-reference)
    st22TopPrograms: ['SAPMSSY1', 'SAPLSUNI', 'CL_SQL_STATEMENT'],
  },
  'SAP-ERP-Q01': {
    sm12: { totalLocks: 28, oldLocks: 5, maxAge: '1.8h', topUsers: ['EQ1ADM', 'TEST_USER'], topTables: ['VBAK', 'BSEG'] },
    sm13: { pending: 1, failed: 2, active: 1, avgDelay: '3.4s', lastFailed: '2026-03-10T06:15:00Z' },
    sm37: { running: 3, scheduled: 12, finished: 98, failed: 5, canceled: 1, longRunning: [] },
    sm21: { total: 156, errors: 8, warnings: 18, security: 0 },
    st22TopPrograms: ['SAPMSSY1', 'GP_ADMIN', 'RSBTCDEL2'],
  },
  'SAP-ERP-D01': {
    sm12: { totalLocks: 8, oldLocks: 0, maxAge: '0.3h', topUsers: ['ED1ADM'], topTables: ['TADIR'] },
    sm13: { pending: 0, failed: 0, active: 0, avgDelay: '0.8s', lastFailed: null },
    sm37: { running: 1, scheduled: 5, finished: 34, failed: 0, canceled: 0, longRunning: [] },
    sm21: { total: 42, errors: 0, warnings: 2, security: 0 },
    st22TopPrograms: [],
  },
  'SAP-BW-P01': {
    sm12: { totalLocks: 22, oldLocks: 3, maxAge: '2.1h', topUsers: ['BP1ADM', 'BW_BATCH'], topTables: ['RSREQDONE', 'RSICCONT'] },
    sm13: { pending: 2, failed: 0, active: 1, avgDelay: '1.5s', lastFailed: null },
    sm37: { running: 8, scheduled: 25, finished: 178, failed: 3, canceled: 0, longRunning: [{ name: 'BI_PROCESS_TRIGGER', runtime: '2h 15min', status: 'running' }] },
    sm21: { total: 198, errors: 3, warnings: 15, security: 1 },
    st22TopPrograms: ['CL_RSDR_AGGREGATE', 'CL_RSBM_DTP'],
  },
  'SAP-SOL-P01': {
    sm12: { totalLocks: 5, oldLocks: 0, maxAge: '0.5h', topUsers: ['SM1ADM'], topTables: ['SMSY_LMDB'] },
    sm13: { pending: 0, failed: 0, active: 0, avgDelay: '1.2s', lastFailed: null },
    sm37: { running: 2, scheduled: 8, finished: 45, failed: 1, canceled: 0, longRunning: [] },
    sm21: { total: 85, errors: 1, warnings: 5, security: 0 },
    st22TopPrograms: ['LSMDB_OBJECTU01'],
  },
  'SAP-CRM-P01': {
    sm12: { totalLocks: 35, oldLocks: 8, maxAge: '3.1h', topUsers: ['CR1ADM', 'CRM_BATCH', 'DIALOG_USER'], topTables: ['CRMD_ORDERADM_H', 'BUT000'] },
    sm13: { pending: 1, failed: 0, active: 2, avgDelay: '1.8s', lastFailed: null },
    sm37: { running: 4, scheduled: 14, finished: 112, failed: 1, canceled: 0, longRunning: [] },
    sm21: { total: 167, errors: 2, warnings: 12, security: 1 },
    st22TopPrograms: ['CL_CRM_BOL_ENTITY', 'SAPLCRM_ORDER'],
  },
  'SAP-GRC-P01': {
    sm12: { totalLocks: 12, oldLocks: 1, maxAge: '0.8h', topUsers: ['GR1ADM', 'GRC_ADMIN'], topTables: ['GRACRUL', 'GRACRULSET'] },
    sm13: { pending: 0, failed: 0, active: 0, avgDelay: '0.5s', lastFailed: null },
    sm37: { running: 1, scheduled: 6, finished: 52, failed: 0, canceled: 0, longRunning: [] },
    sm21: { total: 38, errors: 0, warnings: 1, security: 3 },
    st22TopPrograms: [],
  },
  'SAP-PO-P01': {
    // Java stack PO — no ABAP transactions (SM12/SM13/SM37/SM21/ST22)
    // Instead: NWA-style monitoring for PI/PO Java stack
    javaStack: true,
    // Message Monitor (NWA → Message Monitor / SXMB_MONI equivalent)
    messageMonitor: {
      total24h: 18500, success: 17842, error: 48, waiting: 85, inProcess: 25, scheduled: 500,
      errorRate: 0.26,
      topInterfaces: [
        { name: 'SI_SalesOrder_Out', namespace: 'urn:sap-com:document:sap:po:sales', messages24h: 4200, errors: 12 },
        { name: 'SI_Invoice_Async', namespace: 'urn:sap-com:document:sap:po:billing', messages24h: 3800, errors: 8 },
        { name: 'SI_MaterialMaster_Sync', namespace: 'urn:sap-com:document:sap:po:material', messages24h: 2950, errors: 3 },
        { name: 'SI_DeliveryNotification', namespace: 'urn:sap-com:document:sap:po:logistics', messages24h: 2100, errors: 15 },
      ],
      topErrors: [
        { interface: 'SI_SalesOrder_Out', error: 'MAPPING_EXCEPTION: Field VBELN is mandatory', count: 8, lastOccurred: '2026-03-11T09:45:00Z' },
        { interface: 'SI_DeliveryNotification', error: 'HTTP 503: Target system unavailable', count: 15, lastOccurred: '2026-03-11T10:12:00Z' },
        { interface: 'SI_Invoice_Async', error: 'XI_ADAPTER_TIMEOUT: Connection timed out', count: 5, lastOccurred: '2026-03-10T22:30:00Z' },
      ],
    },
    // Communication Channel Monitor
    channelMonitor: {
      total: 27, active: 24, inactive: 2, error: 1,
      channels: [
        { name: 'CC_RFC_ERP_Sender', adapter: 'RFC', direction: 'Sender', status: 'active', party: 'EP1CLNT100' },
        { name: 'CC_SOAP_Billing_Receiver', adapter: 'SOAP', direction: 'Receiver', status: 'active', party: 'EXT_BILLING' },
        { name: 'CC_IDOC_MaterialMaster', adapter: 'IDoc_AAE', direction: 'Sender', status: 'active', party: 'EP1CLNT100' },
        { name: 'CC_FILE_Invoices_Out', adapter: 'FILE', direction: 'Receiver', status: 'active', party: 'FILE_SERVER' },
        { name: 'CC_JDBC_Warehouse', adapter: 'JDBC', direction: 'Receiver', status: 'error', party: 'EXT_WMS', errorMsg: 'Connection refused: JDBC pool exhausted' },
        { name: 'CC_REST_DeliveryAPI', adapter: 'REST', direction: 'Receiver', status: 'inactive', party: 'EXT_LOGISTICS' },
      ],
    },
    // NWA Alert Inbox
    alertInbox: {
      total: 18, critical: 2, warning: 8, info: 8,
      alerts: [
        { category: 'Messaging', severity: 'critical', text: 'Message queue backlog exceeds threshold (85 pending)', time: '2026-03-11T10:05:00Z' },
        { category: 'Connectivity', severity: 'critical', text: 'JDBC channel CC_JDBC_Warehouse in error state', time: '2026-03-11T09:58:00Z' },
        { category: 'Performance', severity: 'warning', text: 'JVM GC pause time 1.8% — approaching threshold (2%)', time: '2026-03-11T09:30:00Z' },
        { category: 'Messaging', severity: 'warning', text: 'Error rate 0.26% on interface SI_DeliveryNotification', time: '2026-03-11T09:15:00Z' },
        { category: 'Performance', severity: 'warning', text: 'ICM average response time 120ms (threshold: 150ms)', time: '2026-03-11T08:45:00Z' },
      ],
    },
    // Cache Statistics
    cacheStats: {
      icmCache: { hitRate: 94.2, size: '1.2 GB', maxSize: '2.0 GB' },
      metadataCache: { hitRate: 98.5, entries: 4520, staleEntries: 12 },
      mappingCache: { hitRate: 96.8, compiledMappings: 187, cacheSize: '340 MB' },
    },
  },
  'SAP-EWM-P01': {
    sm12: { totalLocks: 18, oldLocks: 2, maxAge: '1.2h', topUsers: ['EW1ADM', 'WM_BATCH'], topTables: ['/SCWM/ORDIM_O', '/SCWM/AQUA'] },
    sm13: { pending: 1, failed: 0, active: 1, avgDelay: '1.0s', lastFailed: null },
    sm37: { running: 4, scheduled: 15, finished: 125, failed: 1, canceled: 0, longRunning: [] },
    sm21: { total: 112, errors: 1, warnings: 8, security: 0 },
    st22TopPrograms: ['/SCWM/CL_DLV_MANAGEMENT'],
  },
};

// ══════════════════════════════════════════════════════════════
// P1.2: Real SAP HA Takeover/Failover Steps
// Accurate sequences for HANA System Replication operations
// ══════════════════════════════════════════════════════════════
// ── Steps por tipo de operación y estrategia ──

export const HANA_TAKEOVER_STEPS = [
  { id: 1, label: 'Pre-check: Validar prerequisites HA', command: 'python systemReplicationStatus.py' },
  { id: 2, label: 'Pre-check: Verificar HANA SR status = SOK', command: 'hdbnsutil -sr_state' },
  { id: 3, label: 'Pre-check: Verificar backup reciente (<24h)', command: 'hdbsql "SELECT * FROM M_BACKUP_CATALOG"' },
  { id: 4, label: 'Detener SAP application server (PAS/AAS)', command: 'sapcontrol -nr 00 -function Stop' },
  { id: 5, label: 'Detener SAP ASCS (si aplica)', command: 'sapcontrol -nr 01 -function Stop' },
  { id: 6, label: 'Ejecutar sr_takeover en nodo secundario', command: 'hdbnsutil -sr_takeover' },
  { id: 7, label: 'Mover recursos de red (VIP/EIP/Route53)', command: 'crm_attribute_default / aws ec2 associate-address' },
  { id: 8, label: 'Verificar HANA accesible en nuevo primario', command: 'hdbsql -U MONITORING "SELECT 1 FROM DUMMY"' },
  { id: 9, label: 'Iniciar SAP ASCS en nuevo nodo', command: 'sapcontrol -nr 01 -function Start' },
  { id: 10, label: 'Iniciar SAP application server (PAS)', command: 'sapcontrol -nr 00 -function Start' },
  { id: 11, label: 'Verificar work processes activos', command: 'sapcontrol -nr 00 -function GetProcessList' },
  { id: 12, label: 'Registrar antiguo primario como secundario', command: 'hdbnsutil -sr_register --name=... --remoteHost=...' },
  { id: 13, label: 'Verificar replicación activa en nuevo par', command: 'python systemReplicationStatus.py' },
  { id: 14, label: 'Validación final: SAP + HANA + Red + Replicación', command: 'sapcontrol + hdbnsutil + ping -c1 VIP' },
];

export const HANA_FAILOVER_STEPS = [
  { id: 1, label: 'Detectar falla en nodo primario', command: 'crm_mon -1 / pacemaker detect' },
  { id: 2, label: 'Pacemaker inicia failover automático', command: 'crm resource migrate rsc_SAPHana_...' },
  { id: 3, label: 'Ejecutar sr_takeover (modo emergencia)', command: 'hdbnsutil -sr_takeover --force' },
  { id: 4, label: 'Mover IP virtual al nodo superviviente', command: 'crm_attribute_default / aws ec2 ...' },
  { id: 5, label: 'Verificar HANA operativa en nuevo primario', command: 'hdbsql "SELECT 1 FROM DUMMY"' },
  { id: 6, label: 'Reiniciar SAP application server', command: 'sapcontrol -nr 00 -function StartSystem' },
  { id: 7, label: 'Verificar usuarios pueden conectar', command: 'RFC_PING + sapcontrol GetProcessList' },
  { id: 8, label: 'Generar alerta y evidence de failover', command: 'SNS publish + DynamoDB put' },
];

// Warm Standby: scale-up del secundario + catch-up de réplica + activar
export const WARM_STANDBY_FAILOVER_STEPS = [
  { id: 1, label: 'Validar estado de réplica ASYNC en secundario', command: 'hdbnsutil -sr_state' },
  { id: 2, label: 'Detener HANA en nodo secundario (para resize)', command: 'sapcontrol -nr 10 -function Stop' },
  { id: 3, label: 'Escalar instancia: r6i.2xlarge → r6i.8xlarge', command: 'aws ec2 modify-instance-attribute --instance-type r6i.8xlarge' },
  { id: 4, label: 'Iniciar instancia escalada', command: 'aws ec2 start-instances + wait instance-status-ok' },
  { id: 5, label: 'Iniciar HANA en nodo escalado', command: 'sapcontrol -nr 10 -function Start' },
  { id: 6, label: 'Esperar catch-up de réplica (aplicar logs pendientes)', command: 'hdbnsutil -sr_state → wait SYNC' },
  { id: 7, label: 'Ejecutar sr_takeover en nodo escalado', command: 'hdbnsutil -sr_takeover' },
  { id: 8, label: 'Mover Elastic IP al nuevo primario', command: 'aws ec2 associate-address --instance-id ...' },
  { id: 9, label: 'Verificar HANA accesible como primario', command: 'hdbsql -U MONITORING "SELECT 1 FROM DUMMY"' },
  { id: 10, label: 'Iniciar SAP application server', command: 'sapcontrol -nr 00 -function Start' },
  { id: 11, label: 'Verificar work processes y conectividad', command: 'sapcontrol GetProcessList + RFC_PING' },
  { id: 12, label: 'Generar evidence de failover', command: 'SNS publish + evidence export' },
];

export const ASCS_FAILOVER_STEPS = [
  { id: 1, label: 'Detectar falla ASCS en nodo primario', command: 'crm_mon -1 -f' },
  { id: 2, label: 'Pacemaker mueve recurso ASCS a ERS node', command: 'crm resource migrate rsc_SAP_ASCS...' },
  { id: 3, label: 'Iniciar ASCS en nodo ERS', command: 'sapcontrol -nr 01 -function Start' },
  { id: 4, label: 'Verificar Enqueue Server activo', command: 'sapcontrol -nr 01 -function EnqGetStatistic' },
  { id: 5, label: 'Restaurar Enqueue Replication en nodo original', command: 'sapcontrol -nr 10 -function Start (ERS)' },
  { id: 6, label: 'Verificar lock table replicada', command: 'sapcontrol -function EnqGetStatistic' },
  { id: 7, label: 'Validar SAP application servers reconectan', command: 'sapcontrol GetProcessList en PAS/AAS' },
];

// Pilot Light: encender infra + restore + activar
export const PILOT_LIGHT_ACTIVATION_STEPS = [
  { id: 1, label: 'Validar prerequisites de activación', command: 'check snapshots + AMI + networking' },
  { id: 2, label: 'Encender instancia DR (EC2 start)', command: 'aws ec2 start-instances --instance-ids i-0xyz789dr' },
  { id: 3, label: 'Esperar instancia accesible (boot + health)', command: 'aws ec2 wait instance-status-ok' },
  { id: 4, label: 'Restaurar datos desde snapshot/backup', command: 'aws ec2 attach-volume + hdbnsutil -sr_takeover' },
  { id: 5, label: 'Aplicar log replay (catch-up)', command: 'hdbsql RECOVER DATABASE UNTIL TIMESTAMP ...' },
  { id: 6, label: 'Verificar integridad de datos HANA', command: 'hdbsql "SELECT COUNT(*) FROM M_DATABASE"' },
  { id: 7, label: 'Iniciar SAP application server en DR', command: 'sapcontrol -nr 00 -function Start' },
  { id: 8, label: 'Actualizar DNS (Route53 failover)', command: 'aws route53 change-resource-record-sets' },
  { id: 9, label: 'Verificar conectividad end-to-end', command: 'sapcontrol GetProcessList + RFC_PING' },
  { id: 10, label: 'Notificar activación DR completada', command: 'SNS publish DR-ACTIVATED' },
];

// Cross-Region DR: switchover entre regiones
export const CROSS_REGION_DR_STEPS = [
  { id: 1, label: 'Validar estado de replicación cross-region', command: 'dgmgrl show configuration' },
  { id: 2, label: 'Verificar lag de replicación dentro de RPO', command: 'SELECT * FROM V$DATAGUARD_STATS' },
  { id: 3, label: 'Detener SAP en región primaria', command: 'sapcontrol -nr 00 -function Stop' },
  { id: 4, label: 'Ejecutar switchover/failover de base de datos', command: 'dgmgrl switchover to dr_site' },
  { id: 5, label: 'Verificar BD accesible en región DR', command: 'sqlplus / as sysdba SELECT 1 FROM DUAL' },
  { id: 6, label: 'Actualizar conexión SAP a nueva BD', command: 'sapcontrol SetProfileParameter dbs/...' },
  { id: 7, label: 'Iniciar SAP en región DR', command: 'sapcontrol -nr 00 -function Start' },
  { id: 8, label: 'Actualizar DNS/Traffic Manager', command: 'az network traffic-manager endpoint update' },
  { id: 9, label: 'Verificar acceso usuarios finales', command: 'curl https://sap.empresa.com/sap/bc/ping' },
  { id: 10, label: 'Generar evidence y notificar', command: 'az monitor alert + evidence export' },
];

// Backup & Restore: deploy nuevo + restore
export const BACKUP_RESTORE_STEPS = [
  { id: 1, label: 'Validar último backup disponible', command: 'aws s3 ls s3://sap-backups/SB1/' },
  { id: 2, label: 'Deploy infraestructura desde template', command: 'aws cloudformation create-stack ...' },
  { id: 3, label: 'Esperar infraestructura lista', command: 'aws cloudformation wait stack-create-complete' },
  { id: 4, label: 'Restaurar backup completo de HANA', command: 'hdbsql RECOVER DATA ALL USING FILE ...' },
  { id: 5, label: 'Aplicar log backups (point-in-time recovery)', command: 'hdbsql RECOVER DATABASE UNTIL TIMESTAMP ...' },
  { id: 6, label: 'Verificar integridad de datos', command: 'hdbsql "SELECT * FROM M_DATABASE"' },
  { id: 7, label: 'Configurar e iniciar SAP', command: 'sapcontrol -nr 00 -function Start' },
  { id: 8, label: 'Configurar red y DNS', command: 'aws route53 change-resource-record-sets' },
  { id: 9, label: 'Verificar acceso end-to-end', command: 'RFC_PING + sapcontrol GetProcessList' },
];

// ══════════════════════════════════════════════════════════════
// NF5: Background Job Monitor (SM37 detail)
// ══════════════════════════════════════════════════════════════
export const mockBackgroundJobs = [
  { id: 'JOB-001', name: 'RSUSR002', systemId: 'SAP-ERP-P01', sid: 'EP1', status: 'running', type: 'A', class: 'A', startedAt: '2026-03-10T09:35:00Z', runtime: '45min', scheduledBy: 'BATCH', client: '100', stepCount: 3, currentStep: 2 },
  { id: 'JOB-002', name: 'RSBTCDEL2', systemId: 'SAP-ERP-P01', sid: 'EP1', status: 'finished', type: 'A', class: 'B', startedAt: '2026-03-10T02:00:00Z', runtime: '12min', scheduledBy: 'BATCH', client: '100', stepCount: 1, currentStep: 1 },
  { id: 'JOB-003', name: 'BI_PROCESS_TRIGGER', systemId: 'SAP-BW-P01', sid: 'BP1', status: 'running', type: 'A', class: 'A', startedAt: '2026-03-10T07:45:00Z', runtime: '2h 15min', scheduledBy: 'BW_BATCH', client: '100', stepCount: 5, currentStep: 4 },
  { id: 'JOB-004', name: 'RSXMB_REORG', systemId: 'SAP-PO-P01', sid: 'PO1', status: 'running', type: 'A', class: 'B', startedAt: '2026-03-10T09:25:00Z', runtime: '35min', scheduledBy: 'XI_BATCH', client: '100', stepCount: 2, currentStep: 1 },
  { id: 'JOB-005', name: 'RSCOLL00', systemId: 'SAP-ERP-P01', sid: 'EP1', status: 'scheduled', type: 'P', class: 'C', startedAt: null, runtime: null, scheduledBy: 'SYSTEM', client: '100', stepCount: 1, currentStep: 0, nextRun: '2026-03-10T11:00:00Z' },
  { id: 'JOB-006', name: 'RSLOG_ARCHIVE', systemId: 'SAP-ERP-P01', sid: 'EP1', status: 'finished', type: 'A', class: 'C', startedAt: '2026-03-10T01:00:00Z', runtime: '8min', scheduledBy: 'BATCH', client: '100', stepCount: 1, currentStep: 1 },
  { id: 'JOB-007', name: 'CLEANUP_SPOOL', systemId: 'SAP-ERP-P01', sid: 'EP1', status: 'finished', type: 'A', class: 'C', startedAt: '2026-03-10T04:00:00Z', runtime: '3min', scheduledBy: 'BATCH', client: '100', stepCount: 1, currentStep: 1 },
  { id: 'JOB-008', name: 'GRACRUL_EVAL', systemId: 'SAP-GRC-P01', sid: 'GR1', status: 'finished', type: 'A', class: 'B', startedAt: '2026-03-10T06:00:00Z', runtime: '22min', scheduledBy: 'GRC_ADMIN', client: '200', stepCount: 2, currentStep: 2 },
  { id: 'JOB-009', name: 'CRM_BILLING_RUN', systemId: 'SAP-CRM-P01', sid: 'CR1', status: 'failed', type: 'A', class: 'A', startedAt: '2026-03-10T05:00:00Z', runtime: '18min', scheduledBy: 'CRM_BATCH', client: '100', stepCount: 4, currentStep: 3, error: 'ABAP short dump: DBIF_RSQL_SQL_ERROR' },
  { id: 'JOB-010', name: '/SCWM/RFTRANSC', systemId: 'SAP-EWM-P01', sid: 'EW1', status: 'running', type: 'A', class: 'A', startedAt: '2026-03-10T09:50:00Z', runtime: '10min', scheduledBy: 'WM_BATCH', client: '100', stepCount: 1, currentStep: 1 },
];

// ══════════════════════════════════════════════════════════════
// NF2: Transport Management Monitor (STMS)
// ══════════════════════════════════════════════════════════════
export const mockTransports = [
  { id: 'EP1K900001', description: 'Customizing: nuevas condiciones de precio', systemId: 'SAP-ERP-P01', owner: 'DEVELOPER1', status: 'released', targetSystem: 'EQ1', createdAt: '2026-03-08T10:00:00Z', releasedAt: '2026-03-09T14:00:00Z', importedAt: null, rc: null },
  { id: 'EP1K900002', description: 'Workbench: cambio en programa Z_VENTAS', systemId: 'SAP-ERP-P01', owner: 'DEVELOPER2', status: 'imported', targetSystem: 'EQ1', createdAt: '2026-03-07T08:00:00Z', releasedAt: '2026-03-07T16:00:00Z', importedAt: '2026-03-08T02:00:00Z', rc: 0 },
  { id: 'EP1K900003', description: 'Customizing: configuración MRP', systemId: 'SAP-ERP-P01', owner: 'DEVELOPER1', status: 'error', targetSystem: 'EQ1', createdAt: '2026-03-06T11:00:00Z', releasedAt: '2026-03-06T15:00:00Z', importedAt: '2026-03-07T02:00:00Z', rc: 8, error: 'Objeto TADIR bloqueado por otro transporte' },
  { id: 'EQ1K200001', description: 'Workbench: fix en exit de usuario', systemId: 'SAP-ERP-Q01', owner: 'DEVELOPER2', status: 'released', targetSystem: 'EP1', createdAt: '2026-03-09T09:00:00Z', releasedAt: '2026-03-10T08:00:00Z', importedAt: null, rc: null },
  { id: 'BP1K100001', description: 'BW: nuevo InfoObject ZPLANT2', systemId: 'SAP-BW-P01', owner: 'BW_DEV', status: 'imported', targetSystem: 'BP1', createdAt: '2026-03-05T14:00:00Z', releasedAt: '2026-03-05T16:00:00Z', importedAt: '2026-03-06T02:00:00Z', rc: 0 },
  { id: 'CR1K100001', description: 'CRM: nueva acción en order type', systemId: 'SAP-CRM-P01', owner: 'CRM_DEV', status: 'released', targetSystem: 'CR1', createdAt: '2026-03-09T11:00:00Z', releasedAt: '2026-03-10T07:00:00Z', importedAt: null, rc: null },
];

// ══════════════════════════════════════════════════════════════
// NF6: Certificate & License Expiry Tracker
// ══════════════════════════════════════════════════════════════
export const mockCertificates = [
  { id: 'CERT-001', systemId: 'SAP-ERP-P01', sid: 'EP1', type: 'ICM SSL', cn: '*.empresa.com', issuer: 'DigiCert', issuedAt: '2025-03-25T00:00:00Z', expiresAt: '2026-03-25T00:00:00Z', daysLeft: 15, status: 'warning' },
  { id: 'CERT-002', systemId: 'SAP-ERP-P01', sid: 'EP1', type: 'PSE SAPSSLS', cn: 'sap-ep1-pas.empresa.com', issuer: 'SAP CA', issuedAt: '2025-06-01T00:00:00Z', expiresAt: '2026-06-01T00:00:00Z', daysLeft: 83, status: 'ok' },
  { id: 'CERT-003', systemId: 'SAP-CRM-P01', sid: 'CR1', type: 'ICM SSL', cn: 'crm.empresa.com', issuer: 'DigiCert', issuedAt: '2025-09-15T00:00:00Z', expiresAt: '2026-09-15T00:00:00Z', daysLeft: 189, status: 'ok' },
  { id: 'CERT-004', systemId: 'SAP-PO-P01', sid: 'PO1', type: 'PI Channel SSL', cn: 'po-channels.empresa.com', issuer: "Let's Encrypt", issuedAt: '2025-12-10T00:00:00Z', expiresAt: '2026-03-10T00:00:00Z', daysLeft: 0, status: 'critical' },
  { id: 'CERT-005', systemId: 'SAP-GRC-P01', sid: 'GR1', type: 'SNC PSE', cn: 'grc-snc.empresa.com', issuer: 'SAP CA', issuedAt: '2025-01-15T00:00:00Z', expiresAt: '2027-01-15T00:00:00Z', daysLeft: 311, status: 'ok' },
];

export const mockLicenses = [
  { id: 'LIC-001', systemId: 'SAP-ERP-P01', sid: 'EP1', type: 'SAP System License', hardwareKey: 'H1234567890', validFrom: '2025-04-01', validUntil: '2026-04-01', daysLeft: 22, status: 'warning' },
  { id: 'LIC-002', systemId: 'SAP-BW-P01', sid: 'BP1', type: 'SAP System License', hardwareKey: 'H0987654321', validFrom: '2025-06-01', validUntil: '2026-06-01', daysLeft: 83, status: 'ok' },
  { id: 'LIC-003', systemId: 'SAP-SOL-P01', sid: 'SM1', type: 'SAP System License', hardwareKey: 'H1122334455', validFrom: '2025-01-01', validUntil: '2026-12-31', daysLeft: 296, status: 'ok' },
];

// ══════════════════════════════════════════════════════════════
// NF7: Landscape Consistency Validator
// Compares kernel, SAP Notes, DB versions across SID line
// ══════════════════════════════════════════════════════════════
export const mockLandscapeValidation = {
  ERP: {
    checks: [
      { name: 'Kernel Version', devValue: '777.36', qasValue: '777.36', prdValue: '777.36', status: 'ok' },
      { name: 'SAP Release', devValue: '2023 FPS02', qasValue: '2023 FPS02', prdValue: '2023 FPS02', status: 'ok' },
      { name: 'HANA Version', devValue: 'SPS07 Rev74', qasValue: 'SPS07 Rev74', prdValue: 'SPS07 Rev74', status: 'ok' },
      { name: 'SAP Notes Applied', devValue: 142, qasValue: 142, prdValue: 140, status: 'warning', detail: 'PRD missing notes: 3456789, 3456790' },
      { name: 'Custom Code Count', devValue: 245, qasValue: 245, prdValue: 238, status: 'warning', detail: '7 objects pending transport to PRD' },
      { name: 'Transport Queue', devValue: '0 pending', qasValue: '2 pending', prdValue: '0 pending', status: 'info' },
    ],
    overallStatus: 'warning',
    lastValidated: '2026-03-10T08:00:00Z',
  },
};

// ══════════════════════════════════════════════════════════════
// NF3: Pre-Maintenance Readiness Check
// ══════════════════════════════════════════════════════════════
export const mockMaintenanceReadiness = {
  'SAP-ERP-P01': {
    overall: 'READY',
    checks: [
      { name: 'Active Users', value: '0', threshold: '<5', status: 'pass', detail: 'Dentro de ventana de mantenimiento, 0 usuarios activos' },
      { name: 'Running Jobs', value: '0', threshold: '0', status: 'pass', detail: 'Sin jobs en ejecución' },
      { name: 'Pending Updates (SM13)', value: '0', threshold: '0', status: 'pass', detail: 'Cola de updates vacía' },
      { name: 'Open Enqueue Locks', value: '2', threshold: '<10', status: 'pass', detail: '2 locks del sistema (normales)' },
      { name: 'Backup Age', value: '4h', threshold: '<12h', status: 'pass', detail: 'Último backup hace 4 horas' },
      { name: 'HSR Replication', value: 'SOK', threshold: 'SOK', status: 'pass', detail: 'Replicación sincronizada, lag 0.8s' },
      { name: 'Pending Transports', value: '0', threshold: '0', status: 'pass', detail: 'Cola STMS vacía' },
      { name: 'Maintenance Window', value: 'Activa', threshold: 'Activa', status: 'pass', detail: 'Dom 02:00-06:00 COT' },
    ],
  },
};
