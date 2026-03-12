import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import * as bcrypt from 'bcryptjs';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool as any);
const prisma = new PrismaClient({ adapter });

// Helper: past date
const ago = (hours: number) => new Date(Date.now() - hours * 3600000);
const daysAgo = (days: number) => new Date(Date.now() - days * 86400000);
const daysFromNow = (days: number) => new Date(Date.now() + days * 86400000);

async function main() {
  console.log('🌱 Seeding SAP Spektra database (mixed-landscape-demo)...\n');

  // ── Clean ──
  await prisma.$transaction([
    prisma.hostMetric.deleteMany(),
    prisma.breach.deleteMany(),
    prisma.healthSnapshot.deleteMany(),
    prisma.dependency.deleteMany(),
    prisma.instance.deleteMany(),
    prisma.component.deleteMany(),
    prisma.host.deleteMany(),
    prisma.hAConfig.deleteMany(),
    prisma.systemMeta.deleteMany(),
    prisma.connector.deleteMany(),
    prisma.runbookExecution.deleteMany(),
    prisma.runbook.deleteMany(),
    prisma.approvalRequest.deleteMany(),
    prisma.operationRecord.deleteMany(),
    prisma.jobRecord.deleteMany(),
    prisma.transportRecord.deleteMany(),
    prisma.certificateRecord.deleteMany(),
    prisma.alert.deleteMany(),
    prisma.event.deleteMany(),
    prisma.auditEntry.deleteMany(),
    prisma.apiKey.deleteMany(),
    prisma.system.deleteMany(),
    prisma.membership.deleteMany(),
    prisma.user.deleteMany(),
    prisma.organization.deleteMany(),
    prisma.plan.deleteMany(),
  ]);

  // ══════════════════════════════════════════════
  // PLANS
  // ══════════════════════════════════════════════
  await prisma.plan.createMany({
    data: [
      { tier: 'starter', name: 'Starter', price: 0, features: JSON.stringify(['monitoring', 'alerts', 'dashboard']), limits: JSON.stringify({ maxSystems: 3, maxUsers: 5 }) },
      { tier: 'professional', name: 'Professional', price: 29900, features: JSON.stringify(['monitoring', 'alerts', 'dashboard', 'runbooks', 'approvals', 'analytics', 'api']), limits: JSON.stringify({ maxSystems: 25, maxUsers: 50 }) },
      { tier: 'enterprise', name: 'Enterprise', price: 99900, features: JSON.stringify(['monitoring', 'alerts', 'dashboard', 'runbooks', 'approvals', 'analytics', 'api', 'sso', 'audit', 'ha-dr', 'custom-connectors']), limits: JSON.stringify({ maxSystems: -1, maxUsers: -1 }) },
    ],
  });
  console.log('  ✓ 3 plans');

  // ══════════════════════════════════════════════
  // ORGANIZATION
  // ══════════════════════════════════════════════
  const org = await prisma.organization.create({
    data: { name: 'ACME Corp', slug: 'acme-corp', plan: 'professional', timezone: 'America/Bogota', language: 'es' },
  });
  console.log(`  ✓ Organization: ${org.name}`);

  // ══════════════════════════════════════════════
  // USERS
  // ══════════════════════════════════════════════
  const hash = await bcrypt.hash('admin123', 12);

  const [admin, escalation, operator, viewer] = await Promise.all([
    prisma.user.create({ data: { email: 'admin@acme-corp.com', name: 'Carlos Admin', passwordHash: hash, status: 'active' } }),
    prisma.user.create({ data: { email: 'escalation@acme-corp.com', name: 'Ana Escalation', passwordHash: hash, status: 'active' } }),
    prisma.user.create({ data: { email: 'operator@acme-corp.com', name: 'Maria Operator', passwordHash: hash, status: 'active' } }),
    prisma.user.create({ data: { email: 'viewer@acme-corp.com', name: 'Juan Viewer', passwordHash: hash, status: 'active' } }),
  ]);

  await prisma.membership.createMany({
    data: [
      { userId: admin.id, organizationId: org.id, role: 'admin' },
      { userId: escalation.id, organizationId: org.id, role: 'escalation' },
      { userId: operator.id, organizationId: org.id, role: 'operator' },
      { userId: viewer.id, organizationId: org.id, role: 'viewer' },
    ],
  });
  console.log('  ✓ 4 users (admin/escalation/operator/viewer)');

  // ══════════════════════════════════════════════
  // SAP SYSTEMS (7 systems — mixed landscape)
  // ══════════════════════════════════════════════
  const ep1 = await prisma.system.create({
    data: {
      organizationId: org.id, sid: 'EP1', description: 'ERP Production — S/4HANA',
      sapProduct: 'S/4HANA 2023', productFamily: 'ABAP_BUSINESS_SUITE', sapStackType: 'ABAP',
      dbType: 'SAP HANA 2.0', environment: 'PRD', mode: 'PRODUCTION',
      deploymentModel: 'ON_PREMISE', connectionMode: 'AGENT_FULL',
      monitoringCapabilityProfile: 'FULL_STACK_AGENT', healthScore: 92, status: 'healthy',
    },
  });

  const eq1 = await prisma.system.create({
    data: {
      organizationId: org.id, sid: 'EQ1', description: 'ERP Quality — S/4HANA',
      sapProduct: 'S/4HANA 2023', productFamily: 'ABAP_BUSINESS_SUITE', sapStackType: 'ABAP',
      dbType: 'SAP HANA 2.0', environment: 'QAS', mode: 'PRODUCTION',
      deploymentModel: 'ON_PREMISE', connectionMode: 'AGENT_FULL',
      monitoringCapabilityProfile: 'FULL_STACK_AGENT', healthScore: 78, status: 'warning',
    },
  });

  const ed1 = await prisma.system.create({
    data: {
      organizationId: org.id, sid: 'ED1', description: 'ERP Development — S/4HANA',
      sapProduct: 'S/4HANA 2023', productFamily: 'ABAP_BUSINESS_SUITE', sapStackType: 'ABAP',
      dbType: 'SAP HANA 2.0', environment: 'DEV', mode: 'PRODUCTION',
      deploymentModel: 'ON_PREMISE', connectionMode: 'AGENT_FULL',
      monitoringCapabilityProfile: 'FULL_STACK_AGENT', healthScore: 85, status: 'healthy',
    },
  });

  const bw1 = await prisma.system.create({
    data: {
      organizationId: org.id, sid: 'BW1', description: 'BW/4HANA Analytics Production',
      sapProduct: 'BW/4HANA', productFamily: 'ABAP_BUSINESS_SUITE', sapStackType: 'ABAP',
      dbType: 'SAP HANA 2.0', environment: 'PRD', mode: 'PRODUCTION',
      deploymentModel: 'ON_PREMISE', connectionMode: 'AGENT_FULL',
      monitoringCapabilityProfile: 'FULL_STACK_AGENT', healthScore: 88, status: 'healthy',
    },
  });

  const sm1 = await prisma.system.create({
    data: {
      organizationId: org.id, sid: 'SM1', description: 'Solution Manager 7.2',
      sapProduct: 'SolMan 7.2', productFamily: 'ABAP_BUSINESS_SUITE', sapStackType: 'DUAL_STACK',
      dbType: 'SAP HANA 2.0', environment: 'PRD', mode: 'PRODUCTION',
      deploymentModel: 'ON_PREMISE', connectionMode: 'AGENT_FULL',
      monitoringCapabilityProfile: 'FULL_STACK_AGENT', healthScore: 95, status: 'healthy',
    },
  });

  const pi1 = await prisma.system.create({
    data: {
      organizationId: org.id, sid: 'PI1', description: 'Process Orchestration 7.5',
      sapProduct: 'SAP PO 7.5', productFamily: 'JAVA_STACK', sapStackType: 'JAVA',
      dbType: 'Oracle 19c', environment: 'PRD', mode: 'PRODUCTION',
      deploymentModel: 'ON_PREMISE', connectionMode: 'AGENT_FULL',
      monitoringCapabilityProfile: 'SAP_APP_ONLY', healthScore: 45, status: 'critical',
    },
  });

  const rs1 = await prisma.system.create({
    data: {
      organizationId: org.id, sid: 'RS1', description: 'RISE with SAP S/4HANA Cloud',
      sapProduct: 'S/4HANA Cloud', productFamily: 'ABAP_BUSINESS_SUITE', sapStackType: 'ABAP',
      dbType: 'SAP HANA Cloud', environment: 'PRD', mode: 'PRODUCTION',
      deploymentModel: 'RISE_MANAGED', connectionMode: 'MANAGED_RESTRICTED',
      monitoringCapabilityProfile: 'RISE_RESTRICTED',
      supportsHostMetrics: false, supportsOsMetrics: false,
      supportsTopologyDiscovery: false, supportsRunbookExecution: false,
      integrationTrustLevel: 'restricted',
      healthScore: 90, status: 'healthy',
    },
  });

  const systems = [ep1, eq1, ed1, bw1, sm1, pi1, rs1];
  console.log(`  ✓ ${systems.length} SAP systems (EP1, EQ1, ED1, BW1, SM1, PI1, RS1)`);

  // ══════════════════════════════════════════════
  // SYSTEM META
  // ══════════════════════════════════════════════
  await prisma.systemMeta.createMany({
    data: [
      { systemId: ep1.id, sapRelease: '2023', kernelVersion: '793', kernelPatch: '100', abapPatch: 'SAPKH62008', client: '100', osVersion: 'SLES 15 SP5', dbVersion: 'HANA 2.0 SPS07 Rev76' },
      { systemId: eq1.id, sapRelease: '2023', kernelVersion: '793', kernelPatch: '100', abapPatch: 'SAPKH62008', client: '200', osVersion: 'SLES 15 SP5', dbVersion: 'HANA 2.0 SPS07 Rev76' },
      { systemId: ed1.id, sapRelease: '2023', kernelVersion: '793', kernelPatch: '98', abapPatch: 'SAPKH62006', client: '300', osVersion: 'SLES 15 SP5', dbVersion: 'HANA 2.0 SPS07 Rev74' },
      { systemId: bw1.id, sapRelease: '2021', kernelVersion: '789', kernelPatch: '200', client: '100', osVersion: 'SLES 15 SP4', dbVersion: 'HANA 2.0 SPS06 Rev68' },
      { systemId: sm1.id, sapRelease: '7.2 SP17', kernelVersion: '785', kernelPatch: '500', client: '100', osVersion: 'SLES 15 SP5', dbVersion: 'HANA 2.0 SPS07 Rev76' },
      { systemId: pi1.id, sapRelease: '7.5 SP25', kernelVersion: '753', kernelPatch: '900', client: '100', osVersion: 'RHEL 8.9', dbVersion: 'Oracle 19.22.0' },
    ],
  });
  console.log('  ✓ 6 system meta records');

  // ══════════════════════════════════════════════
  // HOSTS
  // ══════════════════════════════════════════════
  const hostEp1App = await prisma.host.create({ data: { systemId: ep1.id, hostname: 'sap-ep1-app01', ip: '10.0.1.10', os: 'SLES', osVersion: '15 SP5', region: 'us-east-1', zone: 'us-east-1a', cpu: 32, memory: 128, disk: 500, status: 'active' } });
  const hostEp1Db = await prisma.host.create({ data: { systemId: ep1.id, hostname: 'sap-ep1-hana01', ip: '10.0.1.11', os: 'SLES', osVersion: '15 SP5', region: 'us-east-1', zone: 'us-east-1a', cpu: 64, memory: 512, disk: 2000, status: 'active' } });
  const hostEq1App = await prisma.host.create({ data: { systemId: eq1.id, hostname: 'sap-eq1-app01', ip: '10.0.1.20', os: 'SLES', osVersion: '15 SP5', region: 'us-east-1', zone: 'us-east-1a', cpu: 16, memory: 64, disk: 250, status: 'active' } });
  const hostBw1App = await prisma.host.create({ data: { systemId: bw1.id, hostname: 'sap-bw1-app01', ip: '10.0.1.30', os: 'SLES', osVersion: '15 SP4', region: 'us-east-1', zone: 'us-east-1b', cpu: 32, memory: 256, disk: 1000, status: 'active' } });
  const hostPi1App = await prisma.host.create({ data: { systemId: pi1.id, hostname: 'sap-pi1-app01', ip: '10.0.2.10', os: 'RHEL', osVersion: '8.9', region: 'us-east-1', zone: 'us-east-1b', cpu: 16, memory: 64, disk: 250, status: 'active' } });
  const hostSm1App = await prisma.host.create({ data: { systemId: sm1.id, hostname: 'sap-sm1-app01', ip: '10.0.1.40', os: 'SLES', osVersion: '15 SP5', region: 'us-east-1', zone: 'us-east-1a', cpu: 16, memory: 64, disk: 300, status: 'active' } });
  const hostEd1App = await prisma.host.create({ data: { systemId: ed1.id, hostname: 'sap-ed1-app01', ip: '10.0.1.50', os: 'SLES', osVersion: '15 SP5', region: 'us-east-1', zone: 'us-east-1a', cpu: 8, memory: 32, disk: 200, status: 'active' } });
  console.log('  ✓ 7 hosts');

  // ══════════════════════════════════════════════
  // COMPONENTS
  // ══════════════════════════════════════════════
  const compEp1Abap = await prisma.component.create({ data: { systemId: ep1.id, name: 'ABAP Application Server', type: 'ABAP', version: 'S/4HANA 2023', status: 'active' } });
  const compEp1Db = await prisma.component.create({ data: { systemId: ep1.id, name: 'HANA Database', type: 'DB', version: 'HANA 2.0 SPS07', status: 'active' } });
  const compEp1Wd = await prisma.component.create({ data: { systemId: ep1.id, name: 'Web Dispatcher', type: 'WEBDISP', version: '7.93', status: 'active' } });
  const compEq1Abap = await prisma.component.create({ data: { systemId: eq1.id, name: 'ABAP Application Server', type: 'ABAP', version: 'S/4HANA 2023', status: 'active' } });
  const compBw1Abap = await prisma.component.create({ data: { systemId: bw1.id, name: 'ABAP Application Server', type: 'ABAP', version: 'BW/4HANA 2021', status: 'active' } });
  const compPi1Java = await prisma.component.create({ data: { systemId: pi1.id, name: 'Java Application Server', type: 'JAVA', version: 'PO 7.5 SP25', status: 'warning' } });
  const compEd1Abap = await prisma.component.create({ data: { systemId: ed1.id, name: 'ABAP Application Server', type: 'ABAP', version: 'S/4HANA 2023', status: 'active' } });
  const compSm1Abap = await prisma.component.create({ data: { systemId: sm1.id, name: 'ABAP Application Server', type: 'ABAP', version: 'SolMan 7.2 SP17', status: 'active' } });
  const compSm1Java = await prisma.component.create({ data: { systemId: sm1.id, name: 'Java Application Server', type: 'JAVA', version: 'SolMan 7.2 SP17', status: 'active' } });
  console.log('  ✓ 9 components');

  // ══════════════════════════════════════════════
  // INSTANCES
  // ══════════════════════════════════════════════
  await prisma.instance.createMany({
    data: [
      { systemId: ep1.id, componentId: compEp1Abap.id, hostId: hostEp1App.id, instanceNr: '00', type: 'ASCS', role: 'Central Services', status: 'active' },
      { systemId: ep1.id, componentId: compEp1Abap.id, hostId: hostEp1App.id, instanceNr: '01', type: 'PAS', role: 'Dialog', status: 'active' },
      { systemId: ep1.id, componentId: compEp1Abap.id, hostId: hostEp1App.id, instanceNr: '02', type: 'AAS', role: 'Batch', status: 'active' },
      { systemId: ep1.id, componentId: compEp1Db.id, hostId: hostEp1Db.id, instanceNr: '03', type: 'HANA', role: 'Database', status: 'active' },
      { systemId: ep1.id, componentId: compEp1Wd.id, hostId: hostEp1App.id, instanceNr: '90', type: 'WEBDISP', role: 'Web Dispatcher', status: 'active' },
      { systemId: eq1.id, componentId: compEq1Abap.id, hostId: hostEq1App.id, instanceNr: '00', type: 'PAS', role: 'Dialog', status: 'active' },
      { systemId: bw1.id, componentId: compBw1Abap.id, hostId: hostBw1App.id, instanceNr: '00', type: 'PAS', role: 'Dialog', status: 'active' },
      { systemId: pi1.id, componentId: compPi1Java.id, hostId: hostPi1App.id, instanceNr: '00', type: 'J2EE', role: 'Java Server', status: 'warning' },
      { systemId: ed1.id, componentId: compEd1Abap.id, hostId: hostEd1App.id, instanceNr: '00', type: 'PAS', role: 'Dialog', status: 'active' },
      { systemId: sm1.id, componentId: compSm1Abap.id, hostId: hostSm1App.id, instanceNr: '00', type: 'ASCS', role: 'Central Services', status: 'active' },
      { systemId: sm1.id, componentId: compSm1Abap.id, hostId: hostSm1App.id, instanceNr: '01', type: 'PAS', role: 'Dialog', status: 'active' },
      { systemId: sm1.id, componentId: compSm1Java.id, hostId: hostSm1App.id, instanceNr: '10', type: 'J2EE', role: 'Java Server', status: 'active' },
    ],
  });
  console.log('  ✓ 12 instances');

  // ══════════════════════════════════════════════
  // HOST METRICS (time-series for EP1 app + db)
  // ══════════════════════════════════════════════
  const metricData = [];
  for (let i = 24; i >= 0; i--) {
    metricData.push(
      { hostId: hostEp1App.id, timestamp: ago(i), cpu: 45 + Math.random() * 40, memory: 60 + Math.random() * 25, disk: 42 + Math.random() * 3, iops: 1200 + Math.random() * 800, networkIn: 50 + Math.random() * 30, networkOut: 30 + Math.random() * 20 },
      { hostId: hostEp1Db.id, timestamp: ago(i), cpu: 30 + Math.random() * 35, memory: 70 + Math.random() * 20, disk: 55 + Math.random() * 5, iops: 5000 + Math.random() * 3000, networkIn: 100 + Math.random() * 50, networkOut: 80 + Math.random() * 40 },
    );
  }
  const otherHosts = [
    { host: hostEq1App, cpuBase: 40, memBase: 55 },
    { host: hostBw1App, cpuBase: 50, memBase: 65 },
    { host: hostPi1App, cpuBase: 60, memBase: 70 },
    { host: hostSm1App, cpuBase: 25, memBase: 40 },
    { host: hostEd1App, cpuBase: 30, memBase: 45 },
  ];
  for (const { host, cpuBase, memBase } of otherHosts) {
    for (let i = 24; i >= 0; i--) {
      metricData.push({
        hostId: host.id, timestamp: ago(i),
        cpu: cpuBase + Math.random() * 25,
        memory: memBase + Math.random() * 20,
        disk: 35 + Math.random() * 15,
        iops: 800 + Math.random() * 1200,
        networkIn: 20 + Math.random() * 40,
        networkOut: 15 + Math.random() * 30,
      });
    }
  }
  await prisma.hostMetric.createMany({ data: metricData });
  console.log(`  ✓ ${metricData.length} host metrics (24h of hourly data)`);

  // ══════════════════════════════════════════════
  // DEPENDENCIES
  // ══════════════════════════════════════════════
  await prisma.dependency.createMany({
    data: [
      { systemId: ep1.id, name: 'EP1 → HANA DB', type: 'DB', target: 'sap-ep1-hana01:30015', status: 'ok', latencyMs: 2 },
      { systemId: ep1.id, name: 'EP1 → PI1 (RFC)', type: 'RFC', target: 'PI1', status: 'error', latencyMs: null, details: JSON.stringify({ error: 'Connection refused', lastSuccess: ago(4).toISOString() }) },
      { systemId: ep1.id, name: 'EP1 → BW1 (RFC)', type: 'RFC', target: 'BW1', status: 'ok', latencyMs: 8 },
      { systemId: ep1.id, name: 'EP1 → SM1 (RFC)', type: 'RFC', target: 'SM1', status: 'ok', latencyMs: 5 },
      { systemId: bw1.id, name: 'BW1 → EP1 (RFC)', type: 'RFC', target: 'EP1', status: 'ok', latencyMs: 7 },
      { systemId: pi1.id, name: 'PI1 → External ERP (HTTP)', type: 'HTTP', target: 'https://erp-partner.example.com/api', status: 'warning', latencyMs: 450, details: JSON.stringify({ note: 'High latency' }) },
      { systemId: pi1.id, name: 'PI1 → EP1 (IDoc)', type: 'IDoc', target: 'EP1', status: 'error', latencyMs: null },
      { systemId: eq1.id, name: 'EQ1 → HANA DB', type: 'DB', target: 'sap-eq1-hana', status: 'ok', latencyMs: 3 },
      { systemId: eq1.id, name: 'EQ1 → EP1 (RFC)', type: 'RFC', target: 'EP1', status: 'ok', latencyMs: 6 },
      { systemId: bw1.id, name: 'BW1 → HANA DB', type: 'DB', target: 'sap-bw1-hana', status: 'ok', latencyMs: 2 },
      { systemId: sm1.id, name: 'SM1 → EP1 (RFC)', type: 'RFC', target: 'EP1', status: 'ok', latencyMs: 4 },
      { systemId: sm1.id, name: 'SM1 → HANA DB', type: 'DB', target: 'sap-sm1-hana', status: 'ok', latencyMs: 1 },
      { systemId: ed1.id, name: 'ED1 → HANA DB', type: 'DB', target: 'sap-ed1-hana', status: 'ok', latencyMs: 2 },
      { systemId: ed1.id, name: 'ED1 → EQ1 (RFC)', type: 'RFC', target: 'EQ1', status: 'ok', latencyMs: 5 },
    ],
  });
  console.log('  ✓ 14 dependencies');

  // ══════════════════════════════════════════════
  // BREACHES
  // ══════════════════════════════════════════════
  await prisma.breach.createMany({
    data: [
      { systemId: ep1.id, metric: 'cpu_usage', value: 87.3, threshold: 85, severity: 'HIGH', timestamp: ago(2), resolved: false },
      { systemId: pi1.id, metric: 'memory_usage', value: 96.1, threshold: 90, severity: 'CRITICAL', timestamp: ago(1), resolved: false },
      { systemId: eq1.id, metric: 'disk_usage', value: 88.4, threshold: 85, severity: 'MEDIUM', timestamp: ago(6), resolved: false },
      { systemId: ep1.id, metric: 'response_time', value: 3200, threshold: 2000, severity: 'HIGH', timestamp: daysAgo(1), resolved: true, resolvedAt: ago(20) },
    ],
  });
  console.log('  ✓ 4 breaches');

  // ══════════════════════════════════════════════
  // HEALTH SNAPSHOTS
  // ══════════════════════════════════════════════
  const snapshots = [];
  for (const sys of [ep1, eq1, ed1, bw1, sm1, pi1, rs1]) {
    for (let i = 12; i >= 0; i--) {
      const base = sys.healthScore;
      snapshots.push({
        systemId: sys.id,
        score: Math.max(0, Math.min(100, base + Math.floor((Math.random() - 0.5) * 20))),
        status: sys.status,
        cpu: 30 + Math.random() * 50,
        memory: 50 + Math.random() * 40,
        disk: 40 + Math.random() * 30,
        timestamp: ago(i * 2),
      });
    }
  }
  await prisma.healthSnapshot.createMany({ data: snapshots });
  console.log(`  ✓ ${snapshots.length} health snapshots`);

  // ══════════════════════════════════════════════
  // HA CONFIG
  // ══════════════════════════════════════════════
  await prisma.hAConfig.createMany({
    data: [
      { systemId: ep1.id, haEnabled: true, haStrategy: 'HOT_STANDBY', primaryNode: 'sap-ep1-hana01', secondaryNode: 'sap-ep1-hana02', rpoMinutes: 0, rtoMinutes: 15, status: 'standby' },
      { systemId: bw1.id, haEnabled: true, haStrategy: 'WARM_STANDBY', primaryNode: 'sap-bw1-app01', secondaryNode: 'sap-bw1-app02', rpoMinutes: 15, rtoMinutes: 60, status: 'standby' },
    ],
  });
  console.log('  ✓ 2 HA configurations');

  // ══════════════════════════════════════════════
  // ALERTS
  // ══════════════════════════════════════════════
  await prisma.alert.createMany({
    data: [
      { organizationId: org.id, systemId: ep1.id, title: 'High CPU on EP1 application server', message: 'CPU usage exceeded 85% threshold for 10+ minutes on instance 01 (Dialog)', level: 'warning', status: 'active', escalation: 'L1' },
      { organizationId: org.id, systemId: pi1.id, title: 'PI1 Integration Engine unresponsive', message: 'Java stack health check failed — ICM process not responding. All IDoc and HTTP channels affected.', level: 'critical', status: 'active', escalation: 'L2' },
      { organizationId: org.id, systemId: eq1.id, title: 'EQ1 disk space below 15%', message: '/usr/sap filesystem at 87% capacity — transport imports may fail', level: 'warning', status: 'acknowledged', acknowledged: true, ackBy: 'operator@acme-corp.com', ackAt: ago(2) },
      { organizationId: org.id, systemId: ep1.id, title: 'HANA backup completed with warnings', message: 'Data backup completed but log backup area utilization >80%', level: 'info', status: 'active', escalation: '-' },
      { organizationId: org.id, systemId: bw1.id, title: 'BW1 process chain ZCHAIN_DAILY delayed', message: 'Process chain scheduled for 02:00 started at 02:45 due to lock contention', level: 'warning', status: 'resolved', resolved: true, resolvedBy: 'operator@acme-corp.com', resolvedAt: ago(8), resolutionCategory: 'self_resolved', resolutionNote: 'Lock released automatically after batch job completion' },
      { organizationId: org.id, systemId: pi1.id, title: 'PI1 certificate expiring in 30 days', message: 'SSL certificate for HTTPS sender channel expires 2026-04-10', level: 'warning', status: 'active', escalation: '-' },
    ],
  });
  console.log('  ✓ 6 alerts');

  // ══════════════════════════════════════════════
  // EVENTS
  // ══════════════════════════════════════════════
  await prisma.event.createMany({
    data: [
      { organizationId: org.id, systemId: ep1.id, level: 'success', source: 'SAP', component: 'Backup', message: 'Full data backup completed successfully', timestamp: ago(3) },
      { organizationId: org.id, systemId: ep1.id, level: 'warning', source: 'SAP', component: 'Performance', message: 'Response time exceeded 2s threshold', timestamp: ago(2) },
      { organizationId: org.id, systemId: pi1.id, level: 'critical', source: 'SAP', component: 'ICM', message: 'ICM process crashed and was restarted', timestamp: ago(1) },
      { organizationId: org.id, systemId: eq1.id, level: 'info', source: 'Platform', component: 'Transport', message: 'Transport EP1K900042 imported successfully', timestamp: ago(4) },
      { organizationId: org.id, systemId: null, level: 'info', source: 'Security', component: 'Auth', message: 'User admin@acme-corp.com logged in', timestamp: ago(0.5) },
      { organizationId: org.id, systemId: ep1.id, level: 'warning', source: 'SAP', component: 'Memory', message: 'Extended memory utilization at 82%', timestamp: ago(5) },
      { organizationId: org.id, systemId: bw1.id, level: 'success', source: 'SAP', component: 'Process Chain', message: 'ZCHAIN_DAILY completed all steps', timestamp: ago(6) },
      { organizationId: org.id, systemId: sm1.id, level: 'info', source: 'SAP', component: 'LMDB', message: 'System landscape sync completed', timestamp: ago(12) },
      { organizationId: org.id, systemId: pi1.id, level: 'critical', source: 'SAP', component: 'Channel', message: 'IDoc receiver channel EP1_IDOC_RCV entered error state', timestamp: ago(1.5) },
      { organizationId: org.id, systemId: ep1.id, level: 'info', source: 'Platform', component: 'Monitoring', message: 'Health check completed — score 92', timestamp: ago(0.25) },
    ],
  });
  console.log('  ✓ 10 events');

  // ══════════════════════════════════════════════
  // CONNECTORS
  // ══════════════════════════════════════════════
  await prisma.connector.createMany({
    data: [
      { organizationId: org.id, systemId: ep1.id, method: 'Spektra Agent', status: 'connected', latencyMs: 12, version: '1.2.0', lastHeartbeat: new Date() },
      { organizationId: org.id, systemId: eq1.id, method: 'Spektra Agent', status: 'connected', latencyMs: 15, version: '1.2.0', lastHeartbeat: new Date() },
      { organizationId: org.id, systemId: bw1.id, method: 'Spektra Agent', status: 'connected', latencyMs: 18, version: '1.1.0', lastHeartbeat: ago(0.1) },
      { organizationId: org.id, systemId: sm1.id, method: 'Spektra Agent', status: 'connected', latencyMs: 10, version: '1.2.0', lastHeartbeat: new Date() },
      { organizationId: org.id, systemId: pi1.id, method: 'Spektra Agent', status: 'disconnected', latencyMs: null, version: '1.1.0', lastHeartbeat: ago(2) },
      { organizationId: org.id, systemId: rs1.id, method: 'SAP Cloud Connector', status: 'connected', latencyMs: 85, version: '2.16.1', lastHeartbeat: ago(0.05) },
      { organizationId: org.id, systemId: ed1.id, method: 'Spektra Agent', status: 'degraded', latencyMs: 250, version: '1.0.5', lastHeartbeat: ago(0.5) },
    ],
  });
  console.log('  ✓ 7 connectors');

  // ══════════════════════════════════════════════
  // RUNBOOKS
  // ══════════════════════════════════════════════
  const rb1 = await prisma.runbook.create({
    data: {
      organizationId: org.id, name: 'HANA Log Backup Area Cleanup',
      description: 'Reclaim space in HANA log backup area by removing old backups beyond retention',
      costSafe: true, autoExecute: false, dbType: 'SAP HANA 2.0', txCode: 'DB13',
      steps: JSON.stringify([
        { order: 1, action: 'Check current log area usage via SQL', command: 'SELECT * FROM M_BACKUP_CATALOG' },
        { order: 2, action: 'Delete backups older than retention period', command: 'BACKUP CATALOG DELETE ALL BEFORE TIMESTAMP ...' },
        { order: 3, action: 'Verify space reclaimed', command: 'SELECT * FROM M_DISKS' },
      ]),
    },
  });

  const rb2 = await prisma.runbook.create({
    data: {
      organizationId: org.id, name: 'Restart ICM Process',
      description: 'Restart the Internet Communication Manager on Java/ABAP stack',
      costSafe: true, autoExecute: false, txCode: 'SMICM',
      steps: JSON.stringify([
        { order: 1, action: 'Check ICM status', command: 'icmon pf=...' },
        { order: 2, action: 'Soft restart ICM', command: 'icmon -restart' },
        { order: 3, action: 'Verify HTTP/HTTPS listeners active', command: 'icmon -show services' },
      ]),
    },
  });

  const rb3 = await prisma.runbook.create({
    data: {
      organizationId: org.id, name: 'Clear Old Spool Requests',
      description: 'Housekeeping — remove spool requests older than 14 days',
      costSafe: true, autoExecute: true, txCode: 'SP01',
      steps: JSON.stringify([
        { order: 1, action: 'Run RSPO0041 to delete old spools', command: 'SA38 → RSPO0041' },
        { order: 2, action: 'Verify spool table size reduced', command: 'SE16 → TSP01' },
      ]),
    },
  });

  const rb4 = await prisma.runbook.create({
    data: {
      organizationId: org.id, name: 'Extend /usr/sap Filesystem',
      description: 'Extend filesystem when disk usage exceeds 85%',
      costSafe: false, autoExecute: false,
      prereqs: JSON.stringify(['OS admin access', 'LVM configured', 'Free disk in volume group']),
      steps: JSON.stringify([
        { order: 1, action: 'Check current filesystem size', command: 'df -h /usr/sap' },
        { order: 2, action: 'Extend LV by 20G', command: 'lvextend -L +20G /dev/vg_sap/lv_usrsap' },
        { order: 3, action: 'Resize filesystem', command: 'resize2fs /dev/vg_sap/lv_usrsap' },
        { order: 4, action: 'Verify new size', command: 'df -h /usr/sap' },
      ]),
    },
  });

  console.log('  ✓ 4 runbooks');

  // ── Runbook Executions ──
  await prisma.runbookExecution.createMany({
    data: [
      { runbookId: rb1.id, systemId: ep1.id, gate: 'SAFE', result: 'SUCCESS', duration: '2m 15s', executedBy: 'operator@acme-corp.com', startedAt: daysAgo(2), completedAt: daysAgo(2) },
      { runbookId: rb3.id, systemId: ep1.id, gate: 'SAFE', result: 'SUCCESS', duration: '45s', executedBy: 'system', startedAt: daysAgo(1), completedAt: daysAgo(1) },
      { runbookId: rb2.id, systemId: pi1.id, gate: 'HUMAN', result: 'FAILED', duration: '1m 30s', detail: 'ICM process did not restart — manual intervention required', executedBy: 'operator@acme-corp.com', startedAt: ago(3), completedAt: ago(3) },
    ],
  });
  console.log('  ✓ 3 runbook executions');

  // ══════════════════════════════════════════════
  // APPROVAL REQUESTS
  // ══════════════════════════════════════════════
  await prisma.approvalRequest.createMany({
    data: [
      { organizationId: org.id, systemId: ep1.id, runbookId: rb4.id, metric: 'disk_usage', value: 88.4, severity: 'HIGH', status: 'PENDING', description: 'Extend /usr/sap on EP1 — disk at 88%', requestedBy: 'operator@acme-corp.com' },
      { organizationId: org.id, systemId: pi1.id, runbookId: rb2.id, severity: 'CRITICAL', status: 'APPROVED', description: 'Restart ICM on PI1 — integration engine down', requestedBy: 'operator@acme-corp.com', processedBy: 'admin@acme-corp.com', processedAt: ago(2) },
      { organizationId: org.id, systemId: eq1.id, severity: 'MEDIUM', status: 'REJECTED', description: 'Clear transport buffer on EQ1', requestedBy: 'viewer@acme-corp.com', processedBy: 'admin@acme-corp.com', processedAt: daysAgo(3), evidence: JSON.stringify({ reason: 'Transports pending import — not safe to clear' }) },
    ],
  });
  console.log('  ✓ 3 approval requests');

  // ══════════════════════════════════════════════
  // OPERATIONS
  // ══════════════════════════════════════════════
  await prisma.operationRecord.createMany({
    data: [
      { organizationId: org.id, systemId: ep1.id, type: 'BACKUP', status: 'COMPLETED', riskLevel: 'LOW', scheduledTime: ago(4), completedAt: ago(3.5), requestedBy: 'system', description: 'Daily full HANA data backup', schedule: '0 2 * * *' },
      { organizationId: org.id, systemId: ep1.id, type: 'HOUSEKEEPING', status: 'SCHEDULED', riskLevel: 'LOW', scheduledTime: daysFromNow(1), requestedBy: 'operator@acme-corp.com', description: 'Weekly spool cleanup', schedule: '0 6 * * 0' },
      { organizationId: org.id, systemId: pi1.id, type: 'RESTART', status: 'FAILED', riskLevel: 'MEDIUM', scheduledTime: ago(3), completedAt: ago(2.5), requestedBy: 'operator@acme-corp.com', description: 'Restart PI1 Java stack', error: 'ICM restart timed out after 90 seconds' },
      { organizationId: org.id, systemId: ep1.id, type: 'MAINTENANCE', status: 'SCHEDULED', riskLevel: 'HIGH', scheduledTime: daysFromNow(7), requestedBy: 'admin@acme-corp.com', description: 'Kernel upgrade to patch 102' },
      { organizationId: org.id, systemId: bw1.id, type: 'DR_DRILL', status: 'COMPLETED', riskLevel: 'HIGH', scheduledTime: daysAgo(14), completedAt: daysAgo(14), requestedBy: 'admin@acme-corp.com', description: 'Quarterly DR failover drill for BW1' },
    ],
  });
  console.log('  ✓ 5 operations');

  // ══════════════════════════════════════════════
  // JOB RECORDS
  // ══════════════════════════════════════════════
  await prisma.jobRecord.createMany({
    data: [
      { systemId: ep1.id, jobName: 'SAP_COLLECTOR_FOR_PERFMONITOR', jobClass: 'A', status: 'running', startedAt: ago(0.1), client: '100', user: 'SAPSYS' },
      { systemId: ep1.id, jobName: 'RDDIMPDP', jobClass: 'A', status: 'finished', startedAt: ago(2), duration: '3m 45s', client: '100', user: 'DDIC' },
      { systemId: ep1.id, jobName: 'ZREP_DAILY_POSTING', jobClass: 'B', status: 'finished', startedAt: ago(4), duration: '12m 30s', client: '100', user: 'BATCH_USER' },
      { systemId: ep1.id, jobName: 'ZREP_MATERIAL_REVAL', jobClass: 'B', status: 'failed', startedAt: ago(6), duration: '0m 15s', client: '100', user: 'BATCH_USER', details: JSON.stringify({ error: 'Short dump DBIF_RSQL_SQL_ERROR', abapDump: 'ST22 → 2026-03-11 08:30:00' }) },
      { systemId: bw1.id, jobName: 'ZCHAIN_DAILY', jobClass: 'A', status: 'finished', startedAt: ago(8), duration: '45m 12s', client: '100', user: 'BW_BATCH' },
      { systemId: pi1.id, jobName: 'XI_ADAPTER_MONITOR', jobClass: 'A', status: 'canceled', startedAt: ago(3), client: '100', user: 'PIAPPLUSER' },
      { systemId: eq1.id, jobName: 'RSBTCDEL2', jobClass: 'C', status: 'scheduled', client: '200', user: 'SAPSYS' },
    ],
  });
  console.log('  ✓ 7 job records');

  // ══════════════════════════════════════════════
  // TRANSPORT RECORDS
  // ══════════════════════════════════════════════
  await prisma.transportRecord.createMany({
    data: [
      { systemId: ep1.id, transportId: 'EP1K900042', description: 'FI: New G/L account determination', owner: 'DEVELOPER1', status: 'imported', target: 'EQ1', rc: 0, importedAt: daysAgo(1) },
      { systemId: ep1.id, transportId: 'EP1K900043', description: 'MM: Purchase order enhancement', owner: 'DEVELOPER2', status: 'released', target: 'EQ1', rc: null },
      { systemId: eq1.id, transportId: 'EP1K900040', description: 'SD: Pricing condition update', owner: 'DEVELOPER1', status: 'imported', target: 'EP1', rc: 0, importedAt: daysAgo(3) },
      { systemId: eq1.id, transportId: 'EP1K900041', description: 'HR: Payroll schema changes', owner: 'DEVELOPER3', status: 'error', target: 'EP1', rc: 8, importedAt: daysAgo(2) },
      { systemId: ed1.id, transportId: 'ED1K800010', description: 'Custom report ZREP_INVENTORY', owner: 'DEVELOPER2', status: 'modifiable' },
    ],
  });
  console.log('  ✓ 5 transport records');

  // ══════════════════════════════════════════════
  // CERTIFICATE RECORDS
  // ══════════════════════════════════════════════
  await prisma.certificateRecord.createMany({
    data: [
      { systemId: ep1.id, name: 'EP1 HTTPS Server Cert', issuer: 'DigiCert SHA2', expiresAt: daysFromNow(180), daysLeft: 180, status: 'ok', type: 'SSL' },
      { systemId: ep1.id, name: 'EP1 SAML IdP Certificate', issuer: 'Azure AD', expiresAt: daysFromNow(45), daysLeft: 45, status: 'warning', type: 'SAML' },
      { systemId: pi1.id, name: 'PI1 HTTPS Sender Channel', issuer: 'Let\'s Encrypt', expiresAt: daysFromNow(30), daysLeft: 30, status: 'warning', type: 'SSL' },
      { systemId: pi1.id, name: 'PI1 SNC Certificate', issuer: 'SAP Trust Center', expiresAt: daysFromNow(365), daysLeft: 365, status: 'ok', type: 'SNC' },
      { systemId: sm1.id, name: 'SM1 HTTPS Server Cert', issuer: 'DigiCert SHA2', expiresAt: daysFromNow(90), daysLeft: 90, status: 'ok', type: 'SSL' },
      { systemId: eq1.id, name: 'EQ1 HTTPS Server Cert', issuer: 'DigiCert SHA2', expiresAt: daysFromNow(10), daysLeft: 10, status: 'critical', type: 'SSL' },
    ],
  });
  console.log('  ✓ 6 certificate records');

  // ══════════════════════════════════════════════
  // AUDIT ENTRIES
  // ══════════════════════════════════════════════
  await prisma.auditEntry.createMany({
    data: [
      { organizationId: org.id, userId: admin.id, userEmail: admin.email, action: 'system.register', resource: `system/${ep1.id}`, details: 'Registered SAP system EP1', severity: 'info', timestamp: daysAgo(30) },
      { organizationId: org.id, userId: admin.id, userEmail: admin.email, action: 'system.register', resource: `system/${pi1.id}`, details: 'Registered SAP system PI1', severity: 'info', timestamp: daysAgo(30) },
      { organizationId: org.id, userId: admin.id, userEmail: admin.email, action: 'user.create', resource: `user/${operator.id}`, details: 'Created user operator@acme-corp.com with role operator', severity: 'info', timestamp: daysAgo(28) },
      { organizationId: org.id, userId: operator.id, userEmail: operator.email, action: 'alert.acknowledge', resource: 'alert/eq1-disk', details: 'Acknowledged EQ1 disk space alert', severity: 'info', timestamp: ago(2) },
      { organizationId: org.id, userId: admin.id, userEmail: admin.email, action: 'approval.approve', resource: 'approval/pi1-restart', details: 'Approved ICM restart on PI1', severity: 'warning', timestamp: ago(2) },
      { organizationId: org.id, userId: operator.id, userEmail: operator.email, action: 'runbook.execute', resource: `runbook/${rb1.id}`, details: 'Executed HANA Log Backup Cleanup on EP1', severity: 'info', timestamp: daysAgo(2) },
    ],
  });
  console.log('  ✓ 6 audit entries');

  // ══════════════════════════════════════════════
  // API KEYS
  // ══════════════════════════════════════════════
  const keyHash = await bcrypt.hash('sk-spektra-demo-key-12345678', 12);
  await prisma.apiKey.create({
    data: {
      organizationId: org.id,
      name: 'Demo API Key',
      keyHash,
      prefix: 'sk-spekt',
      status: 'active',
    },
  });
  console.log('  ✓ 1 API key');

  // ══════════════════════════════════════════════
  console.log('\n✅ Seed completed successfully!\n');
  console.log('   Login credentials (all passwords: admin123):');
  console.log('   admin@acme-corp.com     → role: admin');
  console.log('   escalation@acme-corp.com → role: escalation');
  console.log('   operator@acme-corp.com  → role: operator');
  console.log('   viewer@acme-corp.com    → role: viewer');
  console.log('');
  console.log('   Systems: EP1(PRD), EQ1(QAS), ED1(DEV), BW1(PRD), SM1(PRD), PI1(PRD/critical), RS1(RISE)');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
