import { Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import * as bcrypt from 'bcryptjs';

const logger = new Logger('Seed');

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool as any);
const prisma = new PrismaClient({ adapter });

// Helper: past date
const ago = (hours: number) => new Date(Date.now() - hours * 3600000);
const daysAgo = (days: number) => new Date(Date.now() - days * 86400000);
const daysFromNow = (days: number) => new Date(Date.now() + days * 86400000);

async function main() {
  logger.log('🌱 Seeding SAP Spektra database (mixed-landscape-demo)...\n');

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
      {
        tier: 'starter',
        name: 'Starter',
        price: 0,
        features: JSON.stringify(['monitoring', 'alerts', 'dashboard']),
        limits: JSON.stringify({ maxSystems: 3, maxUsers: 5 }),
      },
      {
        tier: 'professional',
        name: 'Professional',
        price: 29900,
        features: JSON.stringify([
          'monitoring',
          'alerts',
          'dashboard',
          'runbooks',
          'approvals',
          'analytics',
          'api',
        ]),
        limits: JSON.stringify({ maxSystems: 25, maxUsers: 50 }),
      },
      {
        tier: 'enterprise',
        name: 'Enterprise',
        price: 99900,
        features: JSON.stringify([
          'monitoring',
          'alerts',
          'dashboard',
          'runbooks',
          'approvals',
          'analytics',
          'api',
          'sso',
          'audit',
          'ha-dr',
          'custom-connectors',
        ]),
        limits: JSON.stringify({ maxSystems: -1, maxUsers: -1 }),
      },
    ],
  });
  logger.log('  ✓ 3 plans');

  // ══════════════════════════════════════════════
  // ORGANIZATION
  // ══════════════════════════════════════════════
  const org = await prisma.organization.create({
    data: {
      name: 'ACME Corp',
      slug: 'acme-corp',
      plan: 'professional',
      timezone: 'America/Bogota',
      language: 'es',
    },
  });
  logger.log(`  ✓ Organization: ${org.name}`);

  // ══════════════════════════════════════════════
  // USERS
  // ══════════════════════════════════════════════
  const hash = await bcrypt.hash('admin123', 12);

  const [admin, escalation, operator, viewer] = await Promise.all([
    prisma.user.create({
      data: {
        email: 'admin@acme-corp.com',
        name: 'Carlos Admin',
        passwordHash: hash,
        status: 'active',
      },
    }),
    prisma.user.create({
      data: {
        email: 'escalation@acme-corp.com',
        name: 'Ana Escalation',
        passwordHash: hash,
        status: 'active',
      },
    }),
    prisma.user.create({
      data: {
        email: 'operator@acme-corp.com',
        name: 'Maria Operator',
        passwordHash: hash,
        status: 'active',
      },
    }),
    prisma.user.create({
      data: {
        email: 'viewer@acme-corp.com',
        name: 'Juan Viewer',
        passwordHash: hash,
        status: 'active',
      },
    }),
  ]);

  await prisma.membership.createMany({
    data: [
      { userId: admin.id, organizationId: org.id, role: 'admin' },
      { userId: escalation.id, organizationId: org.id, role: 'escalation' },
      { userId: operator.id, organizationId: org.id, role: 'operator' },
      { userId: viewer.id, organizationId: org.id, role: 'viewer' },
    ],
  });
  logger.log('  ✓ 4 users (admin/escalation/operator/viewer)');

  // ══════════════════════════════════════════════
  // SAP SYSTEMS (7 systems — mixed landscape)
  // ══════════════════════════════════════════════
  const ep1 = await prisma.system.create({
    data: {
      organizationId: org.id,
      sid: 'EP1',
      description: 'ERP Production — S/4HANA',
      sapProduct: 'S/4HANA 2023',
      productFamily: 'ABAP_BUSINESS_SUITE',
      sapStackType: 'ABAP',
      dbType: 'SAP HANA 2.0',
      environment: 'PRD',
      mode: 'PRODUCTION',
      deploymentModel: 'ON_PREMISE',
      connectionMode: 'AGENT_FULL',
      monitoringCapabilityProfile: 'FULL_STACK_AGENT',
      healthScore: 92,
      status: 'healthy',
    },
  });

  const eq1 = await prisma.system.create({
    data: {
      organizationId: org.id,
      sid: 'EQ1',
      description: 'ERP Quality — S/4HANA',
      sapProduct: 'S/4HANA 2023',
      productFamily: 'ABAP_BUSINESS_SUITE',
      sapStackType: 'ABAP',
      dbType: 'SAP HANA 2.0',
      environment: 'QAS',
      mode: 'PRODUCTION',
      deploymentModel: 'ON_PREMISE',
      connectionMode: 'AGENT_FULL',
      monitoringCapabilityProfile: 'FULL_STACK_AGENT',
      healthScore: 78,
      status: 'warning',
    },
  });

  const ed1 = await prisma.system.create({
    data: {
      organizationId: org.id,
      sid: 'ED1',
      description: 'ERP Development — S/4HANA',
      sapProduct: 'S/4HANA 2023',
      productFamily: 'ABAP_BUSINESS_SUITE',
      sapStackType: 'ABAP',
      dbType: 'SAP HANA 2.0',
      environment: 'DEV',
      mode: 'PRODUCTION',
      deploymentModel: 'ON_PREMISE',
      connectionMode: 'AGENT_FULL',
      monitoringCapabilityProfile: 'FULL_STACK_AGENT',
      healthScore: 85,
      status: 'healthy',
    },
  });

  const bw1 = await prisma.system.create({
    data: {
      organizationId: org.id,
      sid: 'BW1',
      description: 'BW/4HANA Analytics Production',
      sapProduct: 'BW/4HANA',
      productFamily: 'ABAP_BUSINESS_SUITE',
      sapStackType: 'ABAP',
      dbType: 'SAP HANA 2.0',
      environment: 'PRD',
      mode: 'PRODUCTION',
      deploymentModel: 'ON_PREMISE',
      connectionMode: 'AGENT_FULL',
      monitoringCapabilityProfile: 'FULL_STACK_AGENT',
      healthScore: 88,
      status: 'healthy',
    },
  });

  const sm1 = await prisma.system.create({
    data: {
      organizationId: org.id,
      sid: 'SM1',
      description: 'Solution Manager 7.2',
      sapProduct: 'SolMan 7.2',
      productFamily: 'ABAP_BUSINESS_SUITE',
      sapStackType: 'DUAL_STACK',
      dbType: 'SAP HANA 2.0',
      environment: 'PRD',
      mode: 'PRODUCTION',
      deploymentModel: 'ON_PREMISE',
      connectionMode: 'AGENT_FULL',
      monitoringCapabilityProfile: 'FULL_STACK_AGENT',
      healthScore: 95,
      status: 'healthy',
    },
  });

  const pi1 = await prisma.system.create({
    data: {
      organizationId: org.id,
      sid: 'PI1',
      description: 'Process Orchestration 7.5',
      sapProduct: 'SAP PO 7.5',
      productFamily: 'JAVA_STACK',
      sapStackType: 'JAVA',
      dbType: 'Oracle 19c',
      environment: 'PRD',
      mode: 'PRODUCTION',
      deploymentModel: 'ON_PREMISE',
      connectionMode: 'AGENT_FULL',
      monitoringCapabilityProfile: 'SAP_APP_ONLY',
      healthScore: 45,
      status: 'critical',
    },
  });

  const rs1 = await prisma.system.create({
    data: {
      organizationId: org.id,
      sid: 'RS1',
      description: 'RISE with SAP S/4HANA Cloud',
      sapProduct: 'S/4HANA Cloud',
      productFamily: 'ABAP_BUSINESS_SUITE',
      sapStackType: 'ABAP',
      dbType: 'SAP HANA Cloud',
      environment: 'PRD',
      mode: 'PRODUCTION',
      deploymentModel: 'RISE_MANAGED',
      connectionMode: 'MANAGED_RESTRICTED',
      monitoringCapabilityProfile: 'RISE_RESTRICTED',
      supportsHostMetrics: false,
      supportsOsMetrics: false,
      supportsTopologyDiscovery: false,
      supportsRunbookExecution: false,
      integrationTrustLevel: 'restricted',
      healthScore: 90,
      status: 'healthy',
    },
  });

  // Sistemas adicionales para cubrir todas las BD/OS
  const gr1 = await prisma.system.create({
    data: {
      organizationId: org.id,
      sid: 'GR1',
      description: 'GRC 12.0 — Governance Risk Compliance',
      sapProduct: 'SAP GRC 12.0',
      productFamily: 'ABAP_BUSINESS_SUITE',
      sapStackType: 'ABAP',
      dbType: 'Microsoft SQL Server',
      environment: 'PRD',
      mode: 'PRODUCTION',
      deploymentModel: 'ON_PREMISE',
      connectionMode: 'AGENT_FULL',
      monitoringCapabilityProfile: 'FULL_STACK_AGENT',
      healthScore: 87,
      status: 'healthy',
    },
  });

  const cr1 = await prisma.system.create({
    data: {
      organizationId: org.id,
      sid: 'CR1',
      description: 'CRM 7.0 EHP4 — Customer Relationship',
      sapProduct: 'SAP CRM 7.0',
      productFamily: 'ABAP_BUSINESS_SUITE',
      sapStackType: 'ABAP',
      dbType: 'Oracle 19c',
      environment: 'PRD',
      mode: 'PRODUCTION',
      deploymentModel: 'ON_PREMISE',
      connectionMode: 'AGENT_FULL',
      monitoringCapabilityProfile: 'FULL_STACK_AGENT',
      healthScore: 82,
      status: 'healthy',
    },
  });

  const ew1 = await prisma.system.create({
    data: {
      organizationId: org.id,
      sid: 'EW1',
      description: 'EWM 9.5 — Extended Warehouse Management',
      sapProduct: 'SAP EWM 9.5',
      productFamily: 'ABAP_BUSINESS_SUITE',
      sapStackType: 'ABAP',
      dbType: 'IBM DB2 11.5',
      environment: 'PRD',
      mode: 'PRODUCTION',
      deploymentModel: 'ON_PREMISE',
      connectionMode: 'AGENT_FULL',
      monitoringCapabilityProfile: 'FULL_STACK_AGENT',
      healthScore: 79,
      status: 'warning',
    },
  });

  const mx1 = await prisma.system.create({
    data: {
      organizationId: org.id,
      sid: 'MX1',
      description: 'ECC 6.0 EHP8 — MaxDB Legacy',
      sapProduct: 'SAP ECC 6.0',
      productFamily: 'ABAP_BUSINESS_SUITE',
      sapStackType: 'ABAP',
      dbType: 'SAP MaxDB 7.9',
      environment: 'PRD',
      mode: 'PRODUCTION',
      deploymentModel: 'ON_PREMISE',
      connectionMode: 'AGENT_FULL',
      monitoringCapabilityProfile: 'FULL_STACK_AGENT',
      healthScore: 75,
      status: 'warning',
    },
  });

  const so1 = await prisma.system.create({
    data: {
      organizationId: org.id,
      sid: 'SO1',
      description: 'ECC 6.0 — Solaris Oracle Legacy',
      sapProduct: 'SAP ECC 6.0',
      productFamily: 'ABAP_BUSINESS_SUITE',
      sapStackType: 'ABAP',
      dbType: 'Oracle 19c',
      environment: 'PRD',
      mode: 'PRODUCTION',
      deploymentModel: 'ON_PREMISE',
      connectionMode: 'AGENT_FULL',
      monitoringCapabilityProfile: 'FULL_STACK_AGENT',
      healthScore: 80,
      status: 'healthy',
    },
  });

  const systems = [ep1, eq1, ed1, bw1, sm1, pi1, rs1, gr1, cr1, ew1, mx1, so1];
  logger.log(
    `  ✓ ${systems.length} SAP systems (EP1, EQ1, ED1, BW1, SM1, PI1, RS1, GR1, CR1, EW1, MX1, SO1)`,
  );

  // ══════════════════════════════════════════════
  // SYSTEM META
  // ══════════════════════════════════════════════
  await prisma.systemMeta.createMany({
    data: [
      {
        systemId: ep1.id,
        sapRelease: '2023',
        kernelVersion: '793',
        kernelPatch: '100',
        abapPatch: 'SAPKH62008',
        client: '100',
        osVersion: 'SLES 15 SP5',
        dbVersion: 'HANA 2.0 SPS07 Rev76',
      },
      {
        systemId: eq1.id,
        sapRelease: '2023',
        kernelVersion: '793',
        kernelPatch: '100',
        abapPatch: 'SAPKH62008',
        client: '200',
        osVersion: 'SLES 15 SP5',
        dbVersion: 'HANA 2.0 SPS07 Rev76',
      },
      {
        systemId: ed1.id,
        sapRelease: '2023',
        kernelVersion: '793',
        kernelPatch: '98',
        abapPatch: 'SAPKH62006',
        client: '300',
        osVersion: 'SLES 15 SP5',
        dbVersion: 'HANA 2.0 SPS07 Rev74',
      },
      {
        systemId: bw1.id,
        sapRelease: '2021',
        kernelVersion: '789',
        kernelPatch: '200',
        client: '100',
        osVersion: 'SLES 15 SP4',
        dbVersion: 'HANA 2.0 SPS06 Rev68',
      },
      {
        systemId: sm1.id,
        sapRelease: '7.2 SP17',
        kernelVersion: '785',
        kernelPatch: '500',
        client: '100',
        osVersion: 'SLES 15 SP5',
        dbVersion: 'HANA 2.0 SPS07 Rev76',
      },
      {
        systemId: pi1.id,
        sapRelease: '7.5 SP25',
        kernelVersion: '753',
        kernelPatch: '900',
        client: '100',
        osVersion: 'RHEL 8.9',
        dbVersion: 'Oracle 19.22.0',
      },
      {
        systemId: gr1.id,
        sapRelease: '7.50 SP20',
        kernelVersion: '753',
        kernelPatch: '800',
        client: '100',
        osVersion: 'Windows Server 2022',
        dbVersion: 'SQL Server 2019 SP3',
      },
      {
        systemId: cr1.id,
        sapRelease: '7.0 EHP4',
        kernelVersion: '753',
        kernelPatch: '700',
        client: '100',
        osVersion: 'RHEL 8.8',
        dbVersion: 'Oracle 19.20.0',
      },
      {
        systemId: ew1.id,
        sapRelease: '9.5',
        kernelVersion: '753',
        kernelPatch: '600',
        client: '100',
        osVersion: 'AIX 7.3',
        dbVersion: 'DB2 11.5.8',
      },
      {
        systemId: mx1.id,
        sapRelease: '6.0 EHP8',
        kernelVersion: '753',
        kernelPatch: '500',
        client: '100',
        osVersion: 'SLES 15 SP3',
        dbVersion: 'MaxDB 7.9.10',
      },
      {
        systemId: so1.id,
        sapRelease: '6.0 EHP7',
        kernelVersion: '753',
        kernelPatch: '400',
        client: '100',
        osVersion: 'Solaris 11.4',
        dbVersion: 'Oracle 19.18.0',
      },
    ],
  });
  logger.log('  ✓ 11 system meta records');

  // ══════════════════════════════════════════════
  // HOSTS
  // ══════════════════════════════════════════════
  const hostEp1App = await prisma.host.create({
    data: {
      systemId: ep1.id,
      hostname: 'sap-ep1-app01',
      ip: '10.0.1.10',
      os: 'SLES',
      osVersion: '15 SP5',
      region: 'us-east-1',
      zone: 'us-east-1a',
      cpu: 32,
      memory: 128,
      disk: 500,
      status: 'active',
    },
  });
  const hostEp1Db = await prisma.host.create({
    data: {
      systemId: ep1.id,
      hostname: 'sap-ep1-hana01',
      ip: '10.0.1.11',
      os: 'SLES',
      osVersion: '15 SP5',
      region: 'us-east-1',
      zone: 'us-east-1a',
      cpu: 64,
      memory: 512,
      disk: 2000,
      status: 'active',
    },
  });
  const hostEq1App = await prisma.host.create({
    data: {
      systemId: eq1.id,
      hostname: 'sap-eq1-app01',
      ip: '10.0.1.20',
      os: 'SLES',
      osVersion: '15 SP5',
      region: 'us-east-1',
      zone: 'us-east-1a',
      cpu: 16,
      memory: 64,
      disk: 250,
      status: 'active',
    },
  });
  const hostBw1App = await prisma.host.create({
    data: {
      systemId: bw1.id,
      hostname: 'sap-bw1-app01',
      ip: '10.0.1.30',
      os: 'SLES',
      osVersion: '15 SP4',
      region: 'us-east-1',
      zone: 'us-east-1b',
      cpu: 32,
      memory: 256,
      disk: 1000,
      status: 'active',
    },
  });
  const hostPi1App = await prisma.host.create({
    data: {
      systemId: pi1.id,
      hostname: 'sap-pi1-app01',
      ip: '10.0.2.10',
      os: 'RHEL',
      osVersion: '8.9',
      region: 'us-east-1',
      zone: 'us-east-1b',
      cpu: 16,
      memory: 64,
      disk: 250,
      status: 'active',
    },
  });
  const hostSm1App = await prisma.host.create({
    data: {
      systemId: sm1.id,
      hostname: 'sap-sm1-app01',
      ip: '10.0.1.40',
      os: 'SLES',
      osVersion: '15 SP5',
      region: 'us-east-1',
      zone: 'us-east-1a',
      cpu: 16,
      memory: 64,
      disk: 300,
      status: 'active',
    },
  });
  const hostEd1App = await prisma.host.create({
    data: {
      systemId: ed1.id,
      hostname: 'sap-ed1-app01',
      ip: '10.0.1.50',
      os: 'SLES',
      osVersion: '15 SP5',
      region: 'us-east-1',
      zone: 'us-east-1a',
      cpu: 8,
      memory: 32,
      disk: 200,
      status: 'active',
    },
  });
  const hostGr1App = await prisma.host.create({
    data: {
      systemId: gr1.id,
      hostname: 'sap-gr1-app01',
      ip: '10.0.3.10',
      os: 'Windows',
      osVersion: 'Server 2022',
      region: 'us-east-1',
      zone: 'us-east-1a',
      cpu: 16,
      memory: 64,
      disk: 500,
      status: 'active',
    },
  });
  const hostCr1App = await prisma.host.create({
    data: {
      systemId: cr1.id,
      hostname: 'sap-cr1-app01',
      ip: '10.0.3.20',
      os: 'RHEL',
      osVersion: '8.8',
      region: 'us-east-1',
      zone: 'us-east-1b',
      cpu: 16,
      memory: 64,
      disk: 400,
      status: 'active',
    },
  });
  const hostEw1App = await prisma.host.create({
    data: {
      systemId: ew1.id,
      hostname: 'sap-ew1-app01',
      ip: '10.0.4.10',
      os: 'AIX',
      osVersion: '7.3',
      region: 'us-east-1',
      zone: 'us-east-1a',
      cpu: 24,
      memory: 128,
      disk: 600,
      status: 'active',
    },
  });
  const hostMx1App = await prisma.host.create({
    data: {
      systemId: mx1.id,
      hostname: 'sap-mx1-app01',
      ip: '10.0.4.20',
      os: 'SLES',
      osVersion: '15 SP3',
      region: 'us-east-1',
      zone: 'us-east-1b',
      cpu: 8,
      memory: 32,
      disk: 300,
      status: 'active',
    },
  });
  const hostSo1App = await prisma.host.create({
    data: {
      systemId: so1.id,
      hostname: 'sap-so1-app01',
      ip: '10.0.5.10',
      os: 'Solaris',
      osVersion: '11.4',
      region: 'us-west-2',
      zone: 'us-west-2a',
      cpu: 16,
      memory: 64,
      disk: 400,
      status: 'active',
    },
  });
  logger.log('  ✓ 12 hosts');

  // ══════════════════════════════════════════════
  // COMPONENTS
  // ══════════════════════════════════════════════
  const compEp1Abap = await prisma.component.create({
    data: {
      systemId: ep1.id,
      name: 'ABAP Application Server',
      type: 'ABAP',
      version: 'S/4HANA 2023',
      status: 'active',
    },
  });
  const compEp1Db = await prisma.component.create({
    data: {
      systemId: ep1.id,
      name: 'HANA Database',
      type: 'DB',
      version: 'HANA 2.0 SPS07',
      status: 'active',
    },
  });
  const compEp1Wd = await prisma.component.create({
    data: {
      systemId: ep1.id,
      name: 'Web Dispatcher',
      type: 'WEBDISP',
      version: '7.93',
      status: 'active',
    },
  });
  const compEq1Abap = await prisma.component.create({
    data: {
      systemId: eq1.id,
      name: 'ABAP Application Server',
      type: 'ABAP',
      version: 'S/4HANA 2023',
      status: 'active',
    },
  });
  const compBw1Abap = await prisma.component.create({
    data: {
      systemId: bw1.id,
      name: 'ABAP Application Server',
      type: 'ABAP',
      version: 'BW/4HANA 2021',
      status: 'active',
    },
  });
  const compPi1Java = await prisma.component.create({
    data: {
      systemId: pi1.id,
      name: 'Java Application Server',
      type: 'JAVA',
      version: 'PO 7.5 SP25',
      status: 'warning',
    },
  });
  const compEd1Abap = await prisma.component.create({
    data: {
      systemId: ed1.id,
      name: 'ABAP Application Server',
      type: 'ABAP',
      version: 'S/4HANA 2023',
      status: 'active',
    },
  });
  const compSm1Abap = await prisma.component.create({
    data: {
      systemId: sm1.id,
      name: 'ABAP Application Server',
      type: 'ABAP',
      version: 'SolMan 7.2 SP17',
      status: 'active',
    },
  });
  const compSm1Java = await prisma.component.create({
    data: {
      systemId: sm1.id,
      name: 'Java Application Server',
      type: 'JAVA',
      version: 'SolMan 7.2 SP17',
      status: 'active',
    },
  });
  logger.log('  ✓ 9 components');

  // ══════════════════════════════════════════════
  // INSTANCES
  // ══════════════════════════════════════════════
  await prisma.instance.createMany({
    data: [
      {
        systemId: ep1.id,
        componentId: compEp1Abap.id,
        hostId: hostEp1App.id,
        instanceNr: '00',
        type: 'ASCS',
        role: 'Central Services',
        status: 'active',
      },
      {
        systemId: ep1.id,
        componentId: compEp1Abap.id,
        hostId: hostEp1App.id,
        instanceNr: '01',
        type: 'PAS',
        role: 'Dialog',
        status: 'active',
      },
      {
        systemId: ep1.id,
        componentId: compEp1Abap.id,
        hostId: hostEp1App.id,
        instanceNr: '02',
        type: 'AAS',
        role: 'Batch',
        status: 'active',
      },
      {
        systemId: ep1.id,
        componentId: compEp1Db.id,
        hostId: hostEp1Db.id,
        instanceNr: '03',
        type: 'HANA',
        role: 'Database',
        status: 'active',
      },
      {
        systemId: ep1.id,
        componentId: compEp1Wd.id,
        hostId: hostEp1App.id,
        instanceNr: '90',
        type: 'WEBDISP',
        role: 'Web Dispatcher',
        status: 'active',
      },
      {
        systemId: eq1.id,
        componentId: compEq1Abap.id,
        hostId: hostEq1App.id,
        instanceNr: '00',
        type: 'PAS',
        role: 'Dialog',
        status: 'active',
      },
      {
        systemId: bw1.id,
        componentId: compBw1Abap.id,
        hostId: hostBw1App.id,
        instanceNr: '00',
        type: 'PAS',
        role: 'Dialog',
        status: 'active',
      },
      {
        systemId: pi1.id,
        componentId: compPi1Java.id,
        hostId: hostPi1App.id,
        instanceNr: '00',
        type: 'J2EE',
        role: 'Java Server',
        status: 'warning',
      },
      {
        systemId: ed1.id,
        componentId: compEd1Abap.id,
        hostId: hostEd1App.id,
        instanceNr: '00',
        type: 'PAS',
        role: 'Dialog',
        status: 'active',
      },
      {
        systemId: sm1.id,
        componentId: compSm1Abap.id,
        hostId: hostSm1App.id,
        instanceNr: '00',
        type: 'ASCS',
        role: 'Central Services',
        status: 'active',
      },
      {
        systemId: sm1.id,
        componentId: compSm1Abap.id,
        hostId: hostSm1App.id,
        instanceNr: '01',
        type: 'PAS',
        role: 'Dialog',
        status: 'active',
      },
      {
        systemId: sm1.id,
        componentId: compSm1Java.id,
        hostId: hostSm1App.id,
        instanceNr: '10',
        type: 'J2EE',
        role: 'Java Server',
        status: 'active',
      },
    ],
  });
  logger.log('  ✓ 12 instances');

  // ══════════════════════════════════════════════
  // HOST METRICS (time-series for EP1 app + db)
  // ══════════════════════════════════════════════
  const metricData = [];
  for (let i = 24; i >= 0; i--) {
    metricData.push(
      {
        hostId: hostEp1App.id,
        timestamp: ago(i),
        cpu: 45 + Math.random() * 40,
        memory: 60 + Math.random() * 25,
        disk: 42 + Math.random() * 3,
        iops: 1200 + Math.random() * 800,
        networkIn: 50 + Math.random() * 30,
        networkOut: 30 + Math.random() * 20,
      },
      {
        hostId: hostEp1Db.id,
        timestamp: ago(i),
        cpu: 30 + Math.random() * 35,
        memory: 70 + Math.random() * 20,
        disk: 55 + Math.random() * 5,
        iops: 5000 + Math.random() * 3000,
        networkIn: 100 + Math.random() * 50,
        networkOut: 80 + Math.random() * 40,
      },
    );
  }
  const otherHosts = [
    { host: hostEq1App, cpuBase: 40, memBase: 55 },
    { host: hostBw1App, cpuBase: 50, memBase: 65 },
    { host: hostPi1App, cpuBase: 60, memBase: 70 },
    { host: hostSm1App, cpuBase: 25, memBase: 40 },
    { host: hostEd1App, cpuBase: 30, memBase: 45 },
    { host: hostGr1App, cpuBase: 35, memBase: 50 },
    { host: hostCr1App, cpuBase: 45, memBase: 60 },
    { host: hostEw1App, cpuBase: 55, memBase: 65 },
    { host: hostMx1App, cpuBase: 40, memBase: 55 },
    { host: hostSo1App, cpuBase: 35, memBase: 50 },
  ];
  for (const { host, cpuBase, memBase } of otherHosts) {
    for (let i = 24; i >= 0; i--) {
      metricData.push({
        hostId: host.id,
        timestamp: ago(i),
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
  logger.log(`  ✓ ${metricData.length} host metrics (24h of hourly data)`);

  // ══════════════════════════════════════════════
  // DEPENDENCIES
  // ══════════════════════════════════════════════
  await prisma.dependency.createMany({
    data: [
      {
        systemId: ep1.id,
        name: 'EP1 → HANA DB',
        type: 'DB',
        target: 'sap-ep1-hana01:30015',
        status: 'ok',
        latencyMs: 2,
      },
      {
        systemId: ep1.id,
        name: 'EP1 → PI1 (RFC)',
        type: 'RFC',
        target: 'PI1',
        status: 'error',
        latencyMs: null,
        details: JSON.stringify({
          error: 'Connection refused',
          lastSuccess: ago(4).toISOString(),
        }),
      },
      {
        systemId: ep1.id,
        name: 'EP1 → BW1 (RFC)',
        type: 'RFC',
        target: 'BW1',
        status: 'ok',
        latencyMs: 8,
      },
      {
        systemId: ep1.id,
        name: 'EP1 → SM1 (RFC)',
        type: 'RFC',
        target: 'SM1',
        status: 'ok',
        latencyMs: 5,
      },
      {
        systemId: bw1.id,
        name: 'BW1 → EP1 (RFC)',
        type: 'RFC',
        target: 'EP1',
        status: 'ok',
        latencyMs: 7,
      },
      {
        systemId: pi1.id,
        name: 'PI1 → External ERP (HTTP)',
        type: 'HTTP',
        target: 'https://erp-partner.example.com/api',
        status: 'warning',
        latencyMs: 450,
        details: JSON.stringify({ note: 'High latency' }),
      },
      {
        systemId: pi1.id,
        name: 'PI1 → EP1 (IDoc)',
        type: 'IDoc',
        target: 'EP1',
        status: 'error',
        latencyMs: null,
      },
      {
        systemId: eq1.id,
        name: 'EQ1 → HANA DB',
        type: 'DB',
        target: 'sap-eq1-hana',
        status: 'ok',
        latencyMs: 3,
      },
      {
        systemId: eq1.id,
        name: 'EQ1 → EP1 (RFC)',
        type: 'RFC',
        target: 'EP1',
        status: 'ok',
        latencyMs: 6,
      },
      {
        systemId: bw1.id,
        name: 'BW1 → HANA DB',
        type: 'DB',
        target: 'sap-bw1-hana',
        status: 'ok',
        latencyMs: 2,
      },
      {
        systemId: sm1.id,
        name: 'SM1 → EP1 (RFC)',
        type: 'RFC',
        target: 'EP1',
        status: 'ok',
        latencyMs: 4,
      },
      {
        systemId: sm1.id,
        name: 'SM1 → HANA DB',
        type: 'DB',
        target: 'sap-sm1-hana',
        status: 'ok',
        latencyMs: 1,
      },
      {
        systemId: ed1.id,
        name: 'ED1 → HANA DB',
        type: 'DB',
        target: 'sap-ed1-hana',
        status: 'ok',
        latencyMs: 2,
      },
      {
        systemId: ed1.id,
        name: 'ED1 → EQ1 (RFC)',
        type: 'RFC',
        target: 'EQ1',
        status: 'ok',
        latencyMs: 5,
      },
    ],
  });
  logger.log('  ✓ 14 dependencies');

  // ══════════════════════════════════════════════
  // BREACHES
  // ══════════════════════════════════════════════
  await prisma.breach.createMany({
    data: [
      {
        systemId: ep1.id,
        metric: 'cpu_usage',
        value: 87.3,
        threshold: 85,
        severity: 'HIGH',
        timestamp: ago(2),
        resolved: false,
      },
      {
        systemId: pi1.id,
        metric: 'memory_usage',
        value: 96.1,
        threshold: 90,
        severity: 'CRITICAL',
        timestamp: ago(1),
        resolved: false,
      },
      {
        systemId: eq1.id,
        metric: 'disk_usage',
        value: 88.4,
        threshold: 85,
        severity: 'MEDIUM',
        timestamp: ago(6),
        resolved: false,
      },
      {
        systemId: ep1.id,
        metric: 'response_time',
        value: 3200,
        threshold: 2000,
        severity: 'HIGH',
        timestamp: daysAgo(1),
        resolved: true,
        resolvedAt: ago(20),
      },
    ],
  });
  logger.log('  ✓ 4 breaches');

  // ══════════════════════════════════════════════
  // HEALTH SNAPSHOTS
  // ══════════════════════════════════════════════
  const snapshots = [];
  for (const sys of [
    ep1,
    eq1,
    ed1,
    bw1,
    sm1,
    pi1,
    rs1,
    gr1,
    cr1,
    ew1,
    mx1,
    so1,
  ]) {
    for (let i = 12; i >= 0; i--) {
      const base = sys.healthScore;
      snapshots.push({
        systemId: sys.id,
        score: Math.max(
          0,
          Math.min(100, base + Math.floor((Math.random() - 0.5) * 20)),
        ),
        status: sys.status,
        cpu: 30 + Math.random() * 50,
        memory: 50 + Math.random() * 40,
        disk: 40 + Math.random() * 30,
        timestamp: ago(i * 2),
      });
    }
  }
  await prisma.healthSnapshot.createMany({ data: snapshots });
  logger.log(`  ✓ ${snapshots.length} health snapshots`);

  // ══════════════════════════════════════════════
  // HA CONFIG
  // ══════════════════════════════════════════════
  await prisma.hAConfig.createMany({
    data: [
      {
        systemId: ep1.id,
        haEnabled: true,
        haStrategy: 'HOT_STANDBY',
        primaryNode: 'sap-ep1-hana01',
        secondaryNode: 'sap-ep1-hana02',
        rpoMinutes: 0,
        rtoMinutes: 15,
        status: 'standby',
      },
      {
        systemId: bw1.id,
        haEnabled: true,
        haStrategy: 'WARM_STANDBY',
        primaryNode: 'sap-bw1-app01',
        secondaryNode: 'sap-bw1-app02',
        rpoMinutes: 15,
        rtoMinutes: 60,
        status: 'standby',
      },
    ],
  });
  logger.log('  ✓ 2 HA configurations');

  // ══════════════════════════════════════════════
  // ALERTS
  // ══════════════════════════════════════════════
  await prisma.alert.createMany({
    data: [
      {
        organizationId: org.id,
        systemId: ep1.id,
        title: 'High CPU on EP1 application server',
        message:
          'CPU usage exceeded 85% threshold for 10+ minutes on instance 01 (Dialog)',
        level: 'warning',
        status: 'active',
        escalation: 'L1',
      },
      {
        organizationId: org.id,
        systemId: pi1.id,
        title: 'PI1 Integration Engine unresponsive',
        message:
          'Java stack health check failed — ICM process not responding. All IDoc and HTTP channels affected.',
        level: 'critical',
        status: 'active',
        escalation: 'L2',
      },
      {
        organizationId: org.id,
        systemId: eq1.id,
        title: 'EQ1 disk space below 15%',
        message:
          '/usr/sap filesystem at 87% capacity — transport imports may fail',
        level: 'warning',
        status: 'acknowledged',
        acknowledged: true,
        ackBy: 'operator@acme-corp.com',
        ackAt: ago(2),
      },
      {
        organizationId: org.id,
        systemId: ep1.id,
        title: 'HANA backup completed with warnings',
        message: 'Data backup completed but log backup area utilization >80%',
        level: 'info',
        status: 'active',
        escalation: '-',
      },
      {
        organizationId: org.id,
        systemId: bw1.id,
        title: 'BW1 process chain ZCHAIN_DAILY delayed',
        message:
          'Process chain scheduled for 02:00 started at 02:45 due to lock contention',
        level: 'warning',
        status: 'resolved',
        resolved: true,
        resolvedBy: 'operator@acme-corp.com',
        resolvedAt: ago(8),
        resolutionCategory: 'self_resolved',
        resolutionNote:
          'Lock released automatically after batch job completion',
      },
      {
        organizationId: org.id,
        systemId: pi1.id,
        title: 'PI1 certificate expiring in 30 days',
        message: 'SSL certificate for HTTPS sender channel expires 2026-04-10',
        level: 'warning',
        status: 'active',
        escalation: '-',
      },
    ],
  });
  logger.log('  ✓ 6 alerts');

  // ══════════════════════════════════════════════
  // EVENTS
  // ══════════════════════════════════════════════
  await prisma.event.createMany({
    data: [
      {
        organizationId: org.id,
        systemId: ep1.id,
        level: 'success',
        source: 'SAP',
        component: 'Backup',
        message: 'Full data backup completed successfully',
        timestamp: ago(3),
      },
      {
        organizationId: org.id,
        systemId: ep1.id,
        level: 'warning',
        source: 'SAP',
        component: 'Performance',
        message: 'Response time exceeded 2s threshold',
        timestamp: ago(2),
      },
      {
        organizationId: org.id,
        systemId: pi1.id,
        level: 'critical',
        source: 'SAP',
        component: 'ICM',
        message: 'ICM process crashed and was restarted',
        timestamp: ago(1),
      },
      {
        organizationId: org.id,
        systemId: eq1.id,
        level: 'info',
        source: 'Platform',
        component: 'Transport',
        message: 'Transport EP1K900042 imported successfully',
        timestamp: ago(4),
      },
      {
        organizationId: org.id,
        systemId: null,
        level: 'info',
        source: 'Security',
        component: 'Auth',
        message: 'User admin@acme-corp.com logged in',
        timestamp: ago(0.5),
      },
      {
        organizationId: org.id,
        systemId: ep1.id,
        level: 'warning',
        source: 'SAP',
        component: 'Memory',
        message: 'Extended memory utilization at 82%',
        timestamp: ago(5),
      },
      {
        organizationId: org.id,
        systemId: bw1.id,
        level: 'success',
        source: 'SAP',
        component: 'Process Chain',
        message: 'ZCHAIN_DAILY completed all steps',
        timestamp: ago(6),
      },
      {
        organizationId: org.id,
        systemId: sm1.id,
        level: 'info',
        source: 'SAP',
        component: 'LMDB',
        message: 'System landscape sync completed',
        timestamp: ago(12),
      },
      {
        organizationId: org.id,
        systemId: pi1.id,
        level: 'critical',
        source: 'SAP',
        component: 'Channel',
        message: 'IDoc receiver channel EP1_IDOC_RCV entered error state',
        timestamp: ago(1.5),
      },
      {
        organizationId: org.id,
        systemId: ep1.id,
        level: 'info',
        source: 'Platform',
        component: 'Monitoring',
        message: 'Health check completed — score 92',
        timestamp: ago(0.25),
      },
    ],
  });
  logger.log('  ✓ 10 events');

  // ══════════════════════════════════════════════
  // CONNECTORS
  // ══════════════════════════════════════════════
  await prisma.connector.createMany({
    data: [
      {
        organizationId: org.id,
        systemId: ep1.id,
        method: 'Spektra Agent',
        status: 'connected',
        latencyMs: 12,
        version: '1.2.0',
        lastHeartbeat: new Date(),
      },
      {
        organizationId: org.id,
        systemId: eq1.id,
        method: 'Spektra Agent',
        status: 'connected',
        latencyMs: 15,
        version: '1.2.0',
        lastHeartbeat: new Date(),
      },
      {
        organizationId: org.id,
        systemId: bw1.id,
        method: 'Spektra Agent',
        status: 'connected',
        latencyMs: 18,
        version: '1.1.0',
        lastHeartbeat: ago(0.1),
      },
      {
        organizationId: org.id,
        systemId: sm1.id,
        method: 'Spektra Agent',
        status: 'connected',
        latencyMs: 10,
        version: '1.2.0',
        lastHeartbeat: new Date(),
      },
      {
        organizationId: org.id,
        systemId: pi1.id,
        method: 'Spektra Agent',
        status: 'disconnected',
        latencyMs: null,
        version: '1.1.0',
        lastHeartbeat: ago(2),
      },
      {
        organizationId: org.id,
        systemId: rs1.id,
        method: 'SAP Cloud Connector',
        status: 'connected',
        latencyMs: 85,
        version: '2.16.1',
        lastHeartbeat: ago(0.05),
      },
      {
        organizationId: org.id,
        systemId: ed1.id,
        method: 'Spektra Agent',
        status: 'degraded',
        latencyMs: 250,
        version: '1.0.5',
        lastHeartbeat: ago(0.5),
      },
      {
        organizationId: org.id,
        systemId: gr1.id,
        method: 'Spektra Agent',
        status: 'connected',
        latencyMs: 20,
        version: '1.2.0',
        lastHeartbeat: new Date(),
      },
      {
        organizationId: org.id,
        systemId: cr1.id,
        method: 'Spektra Agent',
        status: 'connected',
        latencyMs: 22,
        version: '1.1.0',
        lastHeartbeat: ago(0.1),
      },
      {
        organizationId: org.id,
        systemId: ew1.id,
        method: 'Spektra Agent',
        status: 'connected',
        latencyMs: 35,
        version: '1.1.0',
        lastHeartbeat: ago(0.2),
      },
      {
        organizationId: org.id,
        systemId: mx1.id,
        method: 'Spektra Agent',
        status: 'connected',
        latencyMs: 18,
        version: '1.0.5',
        lastHeartbeat: ago(0.3),
      },
      {
        organizationId: org.id,
        systemId: so1.id,
        method: 'Spektra Agent',
        status: 'connected',
        latencyMs: 40,
        version: '1.0.5',
        lastHeartbeat: ago(0.4),
      },
    ],
  });
  logger.log('  ✓ 12 connectors');

  // ══════════════════════════════════════════════
  // RUNBOOKS
  // ══════════════════════════════════════════════
  const rb1 = await prisma.runbook.create({
    data: {
      organizationId: org.id,
      category: 'SAP_HANA',
      name: 'HANA Log Backup Area Cleanup',
      description:
        'Reclaim space in HANA log backup area by removing old backups beyond retention',
      costSafe: true,
      autoExecute: false,
      dbType: 'SAP HANA 2.0',
      txCode: 'DB13',
      steps: JSON.stringify([
        {
          order: 1,
          action: 'Check current log area usage via SQL',
          command: 'SELECT * FROM M_BACKUP_CATALOG',
        },
        {
          order: 2,
          action: 'Delete backups older than retention period',
          command: 'BACKUP CATALOG DELETE ALL BEFORE TIMESTAMP ...',
        },
        {
          order: 3,
          action: 'Verify space reclaimed',
          command: 'SELECT * FROM M_DISKS',
        },
      ]),
    },
  });

  const rb2 = await prisma.runbook.create({
    data: {
      organizationId: org.id,
      category: 'SAP_ABAP',
      name: 'Restart ICM Process',
      description:
        'Restart the Internet Communication Manager on Java/ABAP stack',
      costSafe: true,
      autoExecute: false,
      txCode: 'SMICM',
      steps: JSON.stringify([
        { order: 1, action: 'Check ICM status', command: 'icmon pf=...' },
        { order: 2, action: 'Soft restart ICM', command: 'icmon -restart' },
        {
          order: 3,
          action: 'Verify HTTP/HTTPS listeners active',
          command: 'icmon -show services',
        },
      ]),
    },
  });

  const rb3 = await prisma.runbook.create({
    data: {
      organizationId: org.id,
      category: 'SAP_ABAP',
      name: 'Clear Old Spool Requests',
      description: 'Housekeeping — remove spool requests older than 14 days',
      costSafe: true,
      autoExecute: true,
      txCode: 'SP01',
      steps: JSON.stringify([
        {
          order: 1,
          action: 'Run RSPO0041 to delete old spools',
          command: 'SA38 → RSPO0041',
        },
        {
          order: 2,
          action: 'Verify spool table size reduced',
          command: 'SE16 → TSP01',
        },
      ]),
    },
  });

  const rb4 = await prisma.runbook.create({
    data: {
      organizationId: org.id,
      category: 'CROSS_PLATFORM',
      name: 'Extend /usr/sap Filesystem',
      description: 'Extend filesystem when disk usage exceeds 85%',
      costSafe: false,
      autoExecute: false,
      prereqs: JSON.stringify([
        'OS admin access',
        'LVM configured',
        'Free disk in volume group',
      ]),
      steps: JSON.stringify([
        {
          order: 1,
          action: 'Check current filesystem size',
          command: 'df -h /usr/sap',
        },
        {
          order: 2,
          action: 'Extend LV by 20G',
          command: 'lvextend -L +20G /dev/vg_sap/lv_usrsap',
        },
        {
          order: 3,
          action: 'Resize filesystem',
          command: 'resize2fs /dev/vg_sap/lv_usrsap',
        },
        { order: 4, action: 'Verify new size', command: 'df -h /usr/sap' },
      ]),
    },
  });

  // ASE runbooks
  const rb5 = await prisma.runbook.create({
    data: {
      organizationId: org.id,
      category: 'SAP_ASE',
      name: 'Dump tran log + kill old tx',
      description:
        'Trunca el transaction log y elimina transacciones antiguas bloqueadas',
      costSafe: true,
      autoExecute: true,
      dbType: 'ASE',
      steps: JSON.stringify([
        {
          order: 1,
          action: 'Check transaction log usage',
          command: 'sp_helpdb',
        },
        {
          order: 2,
          action: 'Dump transaction log',
          command: 'DUMP TRAN dbname WITH TRUNCATE_ONLY',
        },
        {
          order: 3,
          action: 'Kill old blocking transactions',
          command: 'sp_who / kill <spid>',
        },
      ]),
    },
  });

  const _rb6 = await prisma.runbook.create({
    data: {
      organizationId: org.id,
      category: 'SAP_ASE',
      name: 'Expand EBS log volume',
      description:
        'Expande el volumen EBS del log. Requiere aprobación por costo de infra',
      costSafe: false,
      autoExecute: false,
      dbType: 'ASE',
      steps: JSON.stringify([
        {
          order: 1,
          action: 'Check current volume size',
          command: 'lsblk / df -h',
        },
        {
          order: 2,
          action: 'Modify EBS volume via AWS CLI',
          command: 'aws ec2 modify-volume --size <new>',
        },
        {
          order: 3,
          action: 'Extend partition and filesystem',
          command: 'growpart + resize2fs',
        },
      ]),
    },
  });

  const _rb7 = await prisma.runbook.create({
    data: {
      organizationId: org.id,
      category: 'SAP_ASE',
      name: 'Combined log truncate + disk expand',
      description: 'Trunca log + expansión de disco combinado',
      costSafe: false,
      autoExecute: false,
      dbType: 'ASE',
      steps: JSON.stringify([
        {
          order: 1,
          action: 'Dump transaction log',
          command: 'DUMP TRAN dbname WITH TRUNCATE_ONLY',
        },
        {
          order: 2,
          action: 'Expand EBS volume',
          command: 'aws ec2 modify-volume',
        },
        {
          order: 3,
          action: 'Verify space reclaimed',
          command: 'sp_helpdb / df -h',
        },
      ]),
    },
  });

  // HANA HA runbook
  const _rb8 = await prisma.runbook.create({
    data: {
      organizationId: org.id,
      category: 'HANA_HA',
      name: 'Resume HANA System Replication',
      description: 'Reanuda replicación HANA System Replication cuando hay lag',
      costSafe: true,
      autoExecute: true,
      dbType: 'SAP HANA 2.0',
      txCode: 'DBACOCKPIT',
      prereqs: JSON.stringify([
        'HSR configured',
        'Secondary reachable',
        'No takeover in progress',
      ]),
      steps: JSON.stringify([
        {
          order: 1,
          action: 'Check HSR status',
          command: 'hdbnsutil -sr_state',
        },
        {
          order: 2,
          action: 'Resume replication',
          command: 'hdbnsutil -sr_enable',
        },
        {
          order: 3,
          action: 'Verify sync mode active',
          command: 'hdbnsutil -sr_state',
        },
      ]),
    },
  });

  // JVM runbooks
  const _rb9 = await prisma.runbook.create({
    data: {
      organizationId: org.id,
      category: 'SAP_JAVA',
      name: 'Force JVM Garbage Collection',
      description: 'Fuerza garbage collection en JVM heap',
      costSafe: true,
      autoExecute: true,
      dbType: 'ALL',
      steps: JSON.stringify([
        { order: 1, action: 'Check heap usage', command: 'jstat -gc <pid>' },
        { order: 2, action: 'Trigger full GC', command: 'jcmd <pid> GC.run' },
        { order: 3, action: 'Verify heap freed', command: 'jstat -gc <pid>' },
      ]),
    },
  });

  const _rb10 = await prisma.runbook.create({
    data: {
      organizationId: org.id,
      category: 'SAP_JAVA',
      name: 'Force OldGen GC',
      description: 'Fuerza GC de OldGen para liberar memoria',
      costSafe: true,
      autoExecute: true,
      dbType: 'ALL',
      steps: JSON.stringify([
        {
          order: 1,
          action: 'Check OldGen occupancy',
          command: 'jstat -gcold <pid>',
        },
        {
          order: 2,
          action: 'Trigger OldGen collection',
          command: 'jcmd <pid> GC.run',
        },
        {
          order: 3,
          action: 'Verify OldGen freed',
          command: 'jstat -gcold <pid>',
        },
      ]),
    },
  });

  // PO adapter restart
  const _rb11 = await prisma.runbook.create({
    data: {
      organizationId: org.id,
      category: 'SAP_JAVA',
      name: 'Restart PI/PO Adapter Framework',
      description: 'Reinicia framework de adaptadores SAP PO',
      costSafe: true,
      autoExecute: true,
      dbType: 'PO',
      steps: JSON.stringify([
        {
          order: 1,
          action: 'Check adapter status in NWA',
          command: 'NWA → Operations → Channels',
        },
        {
          order: 2,
          action: 'Stop adapter framework',
          command: 'adapterframework stop',
        },
        {
          order: 3,
          action: 'Start adapter framework',
          command: 'adapterframework start',
        },
        {
          order: 4,
          action: 'Verify all channels active',
          command: 'NWA → Channel Monitor',
        },
      ]),
    },
  });

  // ABAP work process cleanup
  const rb12 = await prisma.runbook.create({
    data: {
      organizationId: org.id,
      category: 'SAP_ABAP',
      name: 'Clean sessions + restart WPs',
      description: 'Limpia sesiones y reinicia work processes',
      costSafe: true,
      autoExecute: true,
      dbType: 'ABAP',
      txCode: 'SM50',
      prereqs: JSON.stringify([
        'sapcontrol accessible',
        'No active batch jobs on WPs',
        'Free dialog WPs > 2',
      ]),
      steps: JSON.stringify([
        {
          order: 1,
          action: 'List PRIV mode work processes',
          command: 'sapcontrol -function ABAPGetWPTable',
        },
        {
          order: 2,
          action: 'Kill idle sessions > 30 min',
          command: 'sapcontrol -function ABAPCleanSessions',
        },
        {
          order: 3,
          action: 'Restart affected WPs',
          command: 'sapcontrol -function RestartWork',
        },
      ]),
    },
  });

  // Backup verification
  const rb13 = await prisma.runbook.create({
    data: {
      organizationId: org.id,
      category: 'CROSS_PLATFORM',
      name: 'Verify backup status',
      description: 'Verifica estado de backups de BD',
      costSafe: true,
      autoExecute: true,
      dbType: 'ALL',
      steps: JSON.stringify([
        {
          order: 1,
          action: 'Check last successful backup',
          command: 'DB-specific catalog query',
        },
        {
          order: 2,
          action: 'Verify backup file integrity',
          command: 'Check backup logs',
        },
        {
          order: 3,
          action: 'Report backup age',
          command: 'Calculate hours since last backup',
        },
      ]),
    },
  });

  // Certificate check
  const rb14 = await prisma.runbook.create({
    data: {
      organizationId: org.id,
      category: 'CROSS_PLATFORM',
      name: 'Check certificate expiry (ICM/PSE)',
      description: 'Valida certificados ICM/PSE y alerta si vencen pronto',
      costSafe: true,
      autoExecute: true,
      dbType: 'ALL',
      txCode: 'STRUST',
      steps: JSON.stringify([
        {
          order: 1,
          action: 'List ICM certificates',
          command: 'icmon -show certificates',
        },
        {
          order: 2,
          action: 'Check expiry dates',
          command: 'openssl x509 -enddate',
        },
        {
          order: 3,
          action: 'Alert if < 30 days remaining',
          command: 'Generate alert',
        },
      ]),
    },
  });

  // WP cleanup (PRIV/Hold)
  const _rb15 = await prisma.runbook.create({
    data: {
      organizationId: org.id,
      category: 'SAP_ABAP',
      name: 'Clean PRIV/Hold Work Processes',
      description: 'Limpia work processes en PRIV mode o Hold',
      costSafe: true,
      autoExecute: true,
      dbType: 'ABAP',
      txCode: 'SM50',
      steps: JSON.stringify([
        { order: 1, action: 'Identify PRIV/Hold WPs', command: 'SM50 filter' },
        {
          order: 2,
          action: 'Terminate long-running PRIV sessions',
          command: 'sapcontrol -function ABAPSoftKill',
        },
        { order: 3, action: 'Verify WPs released', command: 'SM50 refresh' },
      ]),
    },
  });

  // RFC queue diagnosis
  const _rb16 = await prisma.runbook.create({
    data: {
      organizationId: org.id,
      category: 'SAP_ABAP',
      name: 'Diagnose RFC queues',
      description: 'Diagnostica colas tRFC/qRFC/bgRFC',
      costSafe: true,
      autoExecute: true,
      dbType: 'ABAP',
      txCode: 'SM58',
      steps: JSON.stringify([
        {
          order: 1,
          action: 'Check tRFC stuck entries',
          command: 'SM58 → Filter errors',
        },
        {
          order: 2,
          action: 'Check qRFC queues',
          command: 'SMQ1/SMQ2 → Monitor',
        },
        {
          order: 3,
          action: 'Retry or delete stuck entries',
          command: 'SM58 → Execute LUW',
        },
      ]),
    },
  });

  // Job monitoring
  const rb17 = await prisma.runbook.create({
    data: {
      organizationId: org.id,
      category: 'SAP_ABAP',
      name: 'Check failed/long-running jobs',
      description: 'Revisa jobs fallidos o de larga duración (SM37)',
      costSafe: true,
      autoExecute: true,
      dbType: 'ABAP',
      txCode: 'SM37',
      steps: JSON.stringify([
        {
          order: 1,
          action: 'List failed jobs last 24h',
          command: 'SM37 → Status: Aborted',
        },
        {
          order: 2,
          action: 'Identify long-running jobs',
          command: 'SM37 → Duration > threshold',
        },
        {
          order: 3,
          action: 'Reschedule or notify',
          command: 'SM37 → Reschedule / Alert',
        },
      ]),
    },
  });

  // Transport monitoring
  const rb18 = await prisma.runbook.create({
    data: {
      organizationId: org.id,
      category: 'SAP_ABAP',
      name: 'Transport queue monitoring (STMS)',
      description: 'Monitorea cola de transportes y detecta bloqueados',
      costSafe: true,
      autoExecute: true,
      dbType: 'ABAP',
      txCode: 'STMS',
      steps: JSON.stringify([
        {
          order: 1,
          action: 'Check import queue status',
          command: 'STMS → Import Overview',
        },
        {
          order: 2,
          action: 'Identify stuck transports',
          command: 'STMS → Filter RC != 0',
        },
        {
          order: 3,
          action: 'Release or skip blocked entries',
          command: 'STMS → Import / Skip',
        },
      ]),
    },
  });

  logger.log('  ✓ 18 base runbooks');

  // ── Runbooks adicionales: BD + OS + SAP avanzados ──
  // Usamos createMany para agregar todos de golpe (no necesitan variable individual)
  const extraRunbooks = [
    // ═══ HANA Avanzados ═══
    {
      organizationId: org.id,
      category: 'SAP_HANA',
      name: 'HANA Delta Merge forzado',
      description:
        'Fuerza merge de delta store a main store para liberar memoria y mejorar queries',
      costSafe: true,
      autoExecute: true,
      dbType: 'SAP HANA 2.0',
      txCode: 'DBACOCKPIT',
      prereqs: JSON.stringify(['HANA online', 'No merge activo']),
      parameters: JSON.stringify({ osType: 'LINUX' }),
      steps: JSON.stringify([
        {
          order: 1,
          action: 'Identificar tablas con delta store grande',
          command: 'SELECT * FROM M_DELTA_MERGE_STATISTICS',
        },
        {
          order: 2,
          action: 'Ejecutar merge forzado',
          command: 'ALTER TABLE <schema>.<table> MERGE DELTA INDEX',
        },
        {
          order: 3,
          action: 'Verificar memoria liberada',
          command: 'SELECT * FROM M_HEAP_MEMORY',
        },
      ]),
    },
    {
      organizationId: org.id,
      category: 'SAP_HANA',
      name: 'HANA Table Unload por memoria',
      description:
        'Descarga tablas poco usadas del column store para liberar RAM',
      costSafe: true,
      autoExecute: false,
      dbType: 'SAP HANA 2.0',
      prereqs: JSON.stringify(['HANA online', 'Memoria > 80%']),
      steps: JSON.stringify([
        {
          order: 1,
          action: 'Identificar tablas con bajo uso',
          command: 'SELECT * FROM M_CS_TABLES ORDER BY LAST_ACCESS_TIME',
        },
        {
          order: 2,
          action: 'Descargar tablas seleccionadas',
          command: 'UNLOAD <table> ALLOW MERGE',
        },
        {
          order: 3,
          action: 'Verificar memoria liberada',
          command: 'SELECT * FROM M_HOST_RESOURCE_UTILIZATION',
        },
      ]),
    },
    {
      organizationId: org.id,
      category: 'SAP_HANA',
      name: 'HANA Expensive SQL Analysis',
      description: 'Detecta las top 10 queries más costosas en CPU y memoria',
      costSafe: true,
      autoExecute: true,
      dbType: 'SAP HANA 2.0',
      txCode: 'DBACOCKPIT',
      steps: JSON.stringify([
        {
          order: 1,
          action: 'Consultar SQL plan cache',
          command:
            'SELECT TOP 10 * FROM M_SQL_PLAN_CACHE ORDER BY TOTAL_EXECUTION_TIME DESC',
        },
        {
          order: 2,
          action: 'Analizar planes de ejecución',
          command: 'EXPLAIN PLAN FOR <statement>',
        },
        {
          order: 3,
          action: 'Generar reporte con recomendaciones',
          command: 'Export to alert system',
        },
      ]),
    },
    {
      organizationId: org.id,
      category: 'SAP_HANA',
      name: 'HANA Trace File Cleanup',
      description:
        'Limpia archivos de trace de indexserver/nameserver mayores a 7 días',
      costSafe: true,
      autoExecute: true,
      dbType: 'SAP HANA 2.0',
      parameters: JSON.stringify({ osType: 'LINUX' }),
      steps: JSON.stringify([
        {
          order: 1,
          action: 'Listar trace files',
          command: 'ALTER SYSTEM REMOVE TRACES',
        },
        {
          order: 2,
          action: 'Limpiar traces > 7 días',
          command:
            'find /usr/sap/<SID>/HDB*/trace -name "*.trc" -mtime +7 -delete',
        },
        {
          order: 3,
          action: 'Verificar espacio liberado',
          command: 'df -h /usr/sap',
        },
      ]),
    },
    {
      organizationId: org.id,
      category: 'SAP_HANA',
      name: 'HANA Alert Check (M_SYSTEM_ALERTS)',
      description: 'Lee alertas internas de HANA y genera eventos en Spektra',
      costSafe: true,
      autoExecute: true,
      dbType: 'SAP HANA 2.0',
      steps: JSON.stringify([
        {
          order: 1,
          action: 'Consultar alertas activas',
          command: 'SELECT * FROM _SYS_STATISTICS.STATISTICS_CURRENT_ALERTS',
        },
        {
          order: 2,
          action: 'Clasificar por severidad',
          command: 'Filter ALERT_RATING >= 3',
        },
        {
          order: 3,
          action: 'Sincronizar con Spektra alerts',
          command: 'POST /api/alerts',
        },
      ]),
    },
    {
      organizationId: org.id,
      category: 'SAP_HANA',
      name: 'HANA Row→Column Store Migration Check',
      description:
        'Detecta tablas grandes en row store que deberían migrarse a columnar',
      costSafe: true,
      autoExecute: true,
      dbType: 'SAP HANA 2.0',
      steps: JSON.stringify([
        {
          order: 1,
          action: 'Buscar tablas row store > 1GB',
          command: 'SELECT * FROM M_RS_TABLES WHERE TABLE_SIZE > 1073741824',
        },
        {
          order: 2,
          action: 'Evaluar candidatas a migración',
          command: 'Check access patterns and column count',
        },
        {
          order: 3,
          action: 'Generar reporte de migración',
          command: 'Export recommendations',
        },
      ]),
    },
    {
      organizationId: org.id,
      category: 'SAP_HANA',
      name: 'HANA Log Segment Cleanup',
      description:
        'Limpia log segments ya respaldados para liberar espacio en disco',
      costSafe: true,
      autoExecute: true,
      dbType: 'SAP HANA 2.0',
      prereqs: JSON.stringify(['Backup log reciente exitoso']),
      steps: JSON.stringify([
        {
          order: 1,
          action: 'Verificar último backup log exitoso',
          command:
            "SELECT * FROM M_BACKUP_CATALOG WHERE ENTRY_TYPE_NAME = 'log backup'",
        },
        {
          order: 2,
          action: 'Limpiar segments anteriores al backup',
          command: 'BACKUP CATALOG DELETE ALL BEFORE TIMESTAMP ...',
        },
        {
          order: 3,
          action: 'Verificar espacio en log volume',
          command: "SELECT * FROM M_DISK_USAGE WHERE USAGE_TYPE = 'LOG'",
        },
      ]),
    },
    {
      organizationId: org.id,
      category: 'SAP_HANA',
      name: 'HANA Consistency Check',
      description: 'Ejecuta verificación de consistencia de páginas de datos',
      costSafe: true,
      autoExecute: false,
      dbType: 'SAP HANA 2.0',
      prereqs: JSON.stringify(['Ventana de mantenimiento', 'HANA online']),
      steps: JSON.stringify([
        {
          order: 1,
          action: 'Ejecutar check de consistencia',
          command: 'hdbcons "check data"',
        },
        {
          order: 2,
          action: 'Verificar resultado',
          command: 'Check trace file for errors',
        },
        {
          order: 3,
          action: 'Reportar resultado',
          command: 'Generate health report',
        },
      ]),
    },
    {
      organizationId: org.id,
      category: 'SAP_HANA',
      name: 'HANA Memory Profiler Snapshot',
      description: 'Captura snapshot de uso de memoria por servicio y tabla',
      costSafe: true,
      autoExecute: true,
      dbType: 'SAP HANA 2.0',
      steps: JSON.stringify([
        {
          order: 1,
          action: 'Capturar uso por servicio',
          command: 'SELECT * FROM M_SERVICE_MEMORY',
        },
        {
          order: 2,
          action: 'Top tablas por memoria',
          command:
            'SELECT * FROM M_CS_TABLES ORDER BY MEMORY_SIZE_IN_TOTAL DESC',
        },
        {
          order: 3,
          action: 'Guardar snapshot para trending',
          command: 'Insert into monitoring history',
        },
      ]),
    },
    {
      organizationId: org.id,
      category: 'SAP_HANA',
      name: 'HANA Connection Cleanup',
      description: 'Cierra conexiones idle > 2 horas para liberar recursos',
      costSafe: true,
      autoExecute: true,
      dbType: 'SAP HANA 2.0',
      steps: JSON.stringify([
        {
          order: 1,
          action: 'Listar conexiones idle',
          command: 'SELECT * FROM M_CONNECTIONS WHERE IDLE_TIME > 7200',
        },
        {
          order: 2,
          action: 'Cerrar conexiones seleccionadas',
          command: 'ALTER SYSTEM DISCONNECT SESSION <id>',
        },
        {
          order: 3,
          action: 'Verificar recursos liberados',
          command: 'SELECT * FROM M_SERVICE_STATISTICS',
        },
      ]),
    },

    // ═══ Oracle ═══
    {
      organizationId: org.id,
      category: 'ORACLE',
      name: 'Oracle Tablespace Utilization Check',
      description:
        'Revisa porcentaje de uso de cada tablespace y alerta si > 85%',
      costSafe: true,
      autoExecute: true,
      dbType: 'Oracle 19c',
      txCode: 'DB02',
      steps: JSON.stringify([
        {
          order: 1,
          action: 'Consultar uso de tablespaces',
          command:
            'SELECT tablespace_name, ROUND(used_percent,2) FROM DBA_TABLESPACE_USAGE_METRICS',
        },
        {
          order: 2,
          action: 'Identificar tablespaces > 85%',
          command: 'Filter WHERE used_percent > 85',
        },
        {
          order: 3,
          action: 'Generar alerta si necesario',
          command: 'Create alert for critical tablespaces',
        },
      ]),
    },
    {
      organizationId: org.id,
      category: 'ORACLE',
      name: 'Oracle Tablespace Auto-Extend',
      description:
        'Agrega datafile o habilita auto-extend cuando tablespace está lleno',
      costSafe: false,
      autoExecute: false,
      dbType: 'Oracle 19c',
      prereqs: JSON.stringify([
        'Oracle DB online',
        'DBA permissions',
        'Free disk space available',
      ]),
      steps: JSON.stringify([
        {
          order: 1,
          action: 'Verificar espacio en disco',
          command: 'df -h /oracle/data',
        },
        {
          order: 2,
          action: 'Agregar datafile al tablespace',
          command:
            'ALTER TABLESPACE SAPDATA ADD DATAFILE SIZE 10G AUTOEXTEND ON',
        },
        {
          order: 3,
          action: 'Verificar nuevo espacio',
          command: 'SELECT * FROM DBA_TABLESPACE_USAGE_METRICS',
        },
      ]),
    },
    {
      organizationId: org.id,
      category: 'ORACLE',
      name: 'Oracle RMAN Backup Verification',
      description: 'Valida integridad del último backup RMAN',
      costSafe: true,
      autoExecute: true,
      dbType: 'Oracle 19c',
      steps: JSON.stringify([
        {
          order: 1,
          action: 'Consultar último backup exitoso',
          command: 'RMAN> LIST BACKUP SUMMARY',
        },
        {
          order: 2,
          action: 'Validar integridad',
          command: 'RMAN> VALIDATE BACKUPSET <id>',
        },
        { order: 3, action: 'Reportar estado', command: 'Check V$RMAN_STATUS' },
      ]),
    },
    {
      organizationId: org.id,
      category: 'ORACLE',
      name: 'Oracle Archive Log Cleanup',
      description:
        'Limpia archive logs ya respaldados que consumen espacio en disco',
      costSafe: true,
      autoExecute: true,
      dbType: 'Oracle 19c',
      prereqs: JSON.stringify(['RMAN backup exitoso reciente']),
      steps: JSON.stringify([
        {
          order: 1,
          action: 'Verificar último backup de archivelogs',
          command: 'RMAN> LIST ARCHIVELOG ALL',
        },
        {
          order: 2,
          action: 'Eliminar archivelogs respaldados',
          command: 'RMAN> DELETE ARCHIVELOG ALL COMPLETED BEFORE SYSDATE-2',
        },
        {
          order: 3,
          action: 'Verificar espacio liberado',
          command: 'df -h /oracle/arch',
        },
      ]),
    },
    {
      organizationId: org.id,
      category: 'ORACLE',
      name: 'Oracle AWR Report Generation',
      description:
        'Genera reporte AWR de las últimas 2 horas para diagnóstico de performance',
      costSafe: true,
      autoExecute: true,
      dbType: 'Oracle 19c',
      steps: JSON.stringify([
        {
          order: 1,
          action: 'Identificar snapshots AWR',
          command:
            'SELECT * FROM DBA_HIST_SNAPSHOT ORDER BY END_INTERVAL_TIME DESC',
        },
        {
          order: 2,
          action: 'Generar reporte AWR',
          command: '@?/rdbms/admin/awrrpt.sql',
        },
        {
          order: 3,
          action: 'Analizar top SQL y wait events',
          command: 'Parse AWR output',
        },
      ]),
    },
    {
      organizationId: org.id,
      category: 'ORACLE',
      name: 'Oracle Invalid Objects Recompile',
      description: 'Recompila objetos inválidos en schema SAP (SAPSR3)',
      costSafe: true,
      autoExecute: true,
      dbType: 'Oracle 19c',
      txCode: 'DB02',
      steps: JSON.stringify([
        {
          order: 1,
          action: 'Listar objetos inválidos',
          command:
            "SELECT * FROM DBA_OBJECTS WHERE STATUS = 'INVALID' AND OWNER = 'SAPSR3'",
        },
        {
          order: 2,
          action: 'Recompilar objetos',
          command: "EXEC DBMS_UTILITY.COMPILE_SCHEMA('SAPSR3')",
        },
        {
          order: 3,
          action: 'Verificar resultado',
          command: "SELECT COUNT(*) FROM DBA_OBJECTS WHERE STATUS = 'INVALID'",
        },
      ]),
    },
    {
      organizationId: org.id,
      category: 'ORACLE',
      name: 'Oracle Blocking Session Kill',
      description:
        'Detecta y mata sesiones que bloquean a otras por más de 30 minutos',
      costSafe: true,
      autoExecute: false,
      dbType: 'Oracle 19c',
      prereqs: JSON.stringify(['Oracle DB online']),
      steps: JSON.stringify([
        {
          order: 1,
          action: 'Identificar sesiones bloqueantes',
          command: 'SELECT * FROM V$LOCK WHERE BLOCK = 1',
        },
        {
          order: 2,
          action: 'Matar sesiones bloqueantes',
          command: "ALTER SYSTEM KILL SESSION '<sid>,<serial#>'",
        },
        {
          order: 3,
          action: 'Verificar bloqueos resueltos',
          command: 'SELECT * FROM V$LOCK WHERE BLOCK = 1',
        },
      ]),
    },
    {
      organizationId: org.id,
      category: 'ORACLE',
      name: 'Oracle Temp Tablespace Cleanup',
      description:
        'Libera espacio en temp tablespace cuando sorts grandes lo llenan',
      costSafe: true,
      autoExecute: true,
      dbType: 'Oracle 19c',
      steps: JSON.stringify([
        {
          order: 1,
          action: 'Verificar uso de temp',
          command: 'SELECT * FROM V$TEMP_SPACE_HEADER',
        },
        {
          order: 2,
          action: 'Identificar sesiones usando temp',
          command: 'SELECT * FROM V$TEMPSEG_USAGE',
        },
        {
          order: 3,
          action: 'Limpiar temp si necesario',
          command: 'ALTER TABLESPACE TEMP SHRINK SPACE',
        },
      ]),
    },
    {
      organizationId: org.id,
      category: 'ORACLE',
      name: 'Oracle Statistics Gathering',
      description:
        'Recalcula estadísticas de tablas SAP para el optimizador SQL',
      costSafe: true,
      autoExecute: true,
      dbType: 'Oracle 19c',
      txCode: 'DB02',
      steps: JSON.stringify([
        {
          order: 1,
          action: 'Identificar tablas con estadísticas obsoletas',
          command: "SELECT * FROM DBA_TAB_STATISTICS WHERE STALE_STATS = 'YES'",
        },
        {
          order: 2,
          action: 'Recolectar estadísticas',
          command: "EXEC DBMS_STATS.GATHER_SCHEMA_STATS('SAPSR3')",
        },
        {
          order: 3,
          action: 'Verificar resultado',
          command:
            'SELECT * FROM DBA_TAB_STATISTICS WHERE LAST_ANALYZED > SYSDATE - 1',
        },
      ]),
    },
    {
      organizationId: org.id,
      category: 'ORACLE',
      name: 'Oracle Redo Log Switch Analysis',
      description:
        'Analiza frecuencia de redo log switches para detectar problemas de sizing',
      costSafe: true,
      autoExecute: true,
      dbType: 'Oracle 19c',
      steps: JSON.stringify([
        {
          order: 1,
          action: 'Contar switches por hora',
          command:
            "SELECT TRUNC(FIRST_TIME,'HH24'), COUNT(*) FROM V$LOG_HISTORY GROUP BY TRUNC(FIRST_TIME,'HH24')",
        },
        {
          order: 2,
          action: 'Alertar si > 6 switches/hora',
          command: 'Filter high frequency switches',
        },
        {
          order: 3,
          action: 'Recomendar sizing de redo logs',
          command: 'Calculate optimal redo log size',
        },
      ]),
    },

    // ═══ Microsoft SQL Server ═══
    {
      organizationId: org.id,
      category: 'MSSQL',
      name: 'MSSQL Transaction Log Shrink',
      description: 'Reduce el transaction log cuando crece excesivamente',
      costSafe: true,
      autoExecute: false,
      dbType: 'Microsoft SQL Server',
      prereqs: JSON.stringify([
        'SQL Server online',
        'Transaction log backup reciente',
      ]),
      steps: JSON.stringify([
        {
          order: 1,
          action: 'Verificar tamaño de log',
          command: 'DBCC SQLPERF(LOGSPACE)',
        },
        {
          order: 2,
          action: 'Shrink transaction log',
          command: 'DBCC SHRINKFILE(logfile, target_size)',
        },
        {
          order: 3,
          action: 'Verificar resultado',
          command: 'DBCC SQLPERF(LOGSPACE)',
        },
      ]),
    },
    {
      organizationId: org.id,
      category: 'MSSQL',
      name: 'MSSQL Index Rebuild/Reorganize',
      description: 'Reconstruye índices con fragmentación > 30%',
      costSafe: true,
      autoExecute: true,
      dbType: 'Microsoft SQL Server',
      steps: JSON.stringify([
        {
          order: 1,
          action: 'Detectar índices fragmentados',
          command:
            'SELECT * FROM sys.dm_db_index_physical_stats WHERE avg_fragmentation_in_percent > 30',
        },
        {
          order: 2,
          action: 'Rebuild índices críticos',
          command: 'ALTER INDEX ALL ON <table> REBUILD',
        },
        {
          order: 3,
          action: 'Actualizar estadísticas',
          command: 'UPDATE STATISTICS <table>',
        },
      ]),
    },
    {
      organizationId: org.id,
      category: 'MSSQL',
      name: 'MSSQL TempDB Monitor',
      description: 'Verifica uso de TempDB y limpia objetos temporales',
      costSafe: true,
      autoExecute: true,
      dbType: 'Microsoft SQL Server',
      steps: JSON.stringify([
        {
          order: 1,
          action: 'Verificar uso de TempDB',
          command: 'SELECT * FROM sys.dm_db_file_space_usage',
        },
        {
          order: 2,
          action: 'Identificar consumidores top',
          command:
            'SELECT * FROM sys.dm_db_session_space_usage ORDER BY internal_objects_alloc_page_count DESC',
        },
        {
          order: 3,
          action: 'Limpiar si necesario',
          command: 'DBCC FREEPROCCACHE / DBCC DROPCLEANBUFFERS',
        },
      ]),
    },
    {
      organizationId: org.id,
      category: 'MSSQL',
      name: 'MSSQL Backup Verification (VERIFYONLY)',
      description: 'Valida que el último backup SQL Server sea restaurable',
      costSafe: true,
      autoExecute: true,
      dbType: 'Microsoft SQL Server',
      steps: JSON.stringify([
        {
          order: 1,
          action: 'Identificar último backup',
          command:
            'SELECT TOP 1 * FROM msdb.dbo.backupset ORDER BY backup_finish_date DESC',
        },
        {
          order: 2,
          action: 'Verificar integridad',
          command: "RESTORE VERIFYONLY FROM DISK = '<backup_path>'",
        },
        {
          order: 3,
          action: 'Reportar resultado',
          command: 'Log verification result',
        },
      ]),
    },
    {
      organizationId: org.id,
      category: 'MSSQL',
      name: 'MSSQL Blocked Process Analysis',
      description: 'Detecta cadenas de bloqueo y reporta SPIDs involucrados',
      costSafe: true,
      autoExecute: true,
      dbType: 'Microsoft SQL Server',
      steps: JSON.stringify([
        {
          order: 1,
          action: 'Detectar bloqueos activos',
          command:
            'SELECT * FROM sys.dm_exec_requests WHERE blocking_session_id <> 0',
        },
        {
          order: 2,
          action: 'Analizar cadena de bloqueo',
          command: 'sp_who2 / Activity Monitor',
        },
        {
          order: 3,
          action: 'Notificar o kill si > 30 min',
          command: 'KILL <session_id>',
        },
      ]),
    },
    {
      organizationId: org.id,
      category: 'MSSQL',
      name: 'MSSQL DBCC CHECKDB',
      description: 'Ejecuta verificación de integridad de la base de datos',
      costSafe: true,
      autoExecute: false,
      dbType: 'Microsoft SQL Server',
      prereqs: JSON.stringify([
        'Ventana de mantenimiento',
        'SQL Server online',
      ]),
      steps: JSON.stringify([
        {
          order: 1,
          action: 'Ejecutar CHECKDB',
          command: 'DBCC CHECKDB (database_name) WITH NO_INFOMSGS',
        },
        {
          order: 2,
          action: 'Verificar resultado',
          command: 'Check DBCC output for errors',
        },
        {
          order: 3,
          action: 'Reportar estado de integridad',
          command: 'Log results',
        },
      ]),
    },
    {
      organizationId: org.id,
      category: 'MSSQL',
      name: 'MSSQL Auto-Grow Event Check',
      description:
        'Detecta eventos de auto-grow frecuentes que indican sizing incorrecto',
      costSafe: true,
      autoExecute: true,
      dbType: 'Microsoft SQL Server',
      steps: JSON.stringify([
        {
          order: 1,
          action: 'Consultar eventos de auto-grow',
          command:
            "SELECT * FROM sys.fn_xe_file_target_read_file('system_health*.xel',NULL,NULL,NULL) WHERE event_data LIKE '%database_file_size_change%'",
        },
        {
          order: 2,
          action: 'Contar eventos últimas 24h',
          command: 'Filter by timestamp',
        },
        {
          order: 3,
          action: 'Recomendar pre-sizing',
          command: 'Calculate optimal file sizes',
        },
      ]),
    },
    {
      organizationId: org.id,
      category: 'MSSQL',
      name: 'MSSQL Agent Job Failure Check',
      description: 'Revisa SQL Agent jobs fallidos en las últimas 24 horas',
      costSafe: true,
      autoExecute: true,
      dbType: 'Microsoft SQL Server',
      steps: JSON.stringify([
        {
          order: 1,
          action: 'Listar jobs fallidos',
          command:
            'SELECT * FROM msdb.dbo.sysjobhistory WHERE run_status = 0 AND run_date >= CONVERT(int,GETDATE()-1)',
        },
        {
          order: 2,
          action: 'Obtener detalle del error',
          command: 'Check step-level failure messages',
        },
        { order: 3, action: 'Notificar operador', command: 'Generate alert' },
      ]),
    },
    {
      organizationId: org.id,
      category: 'MSSQL',
      name: 'MSSQL Data File Growth Projection',
      description:
        'Proyecta cuándo se llenará el disco al ritmo de crecimiento actual',
      costSafe: true,
      autoExecute: true,
      dbType: 'Microsoft SQL Server',
      steps: JSON.stringify([
        {
          order: 1,
          action: 'Obtener tamaño actual y histórico',
          command: 'SELECT * FROM sys.dm_db_file_space_usage',
        },
        {
          order: 2,
          action: 'Calcular tasa de crecimiento',
          command: 'Compare with previous snapshots',
        },
        {
          order: 3,
          action: 'Proyectar fecha de llenado',
          command: 'Linear projection to capacity',
        },
      ]),
    },
    {
      organizationId: org.id,
      category: 'MSSQL',
      name: 'MSSQL Always On Health Check',
      description:
        'Verifica estado de réplicas Always On y lag de sincronización',
      costSafe: true,
      autoExecute: true,
      dbType: 'Microsoft SQL Server',
      prereqs: JSON.stringify(['Always On Availability Group configurado']),
      steps: JSON.stringify([
        {
          order: 1,
          action: 'Verificar estado de réplicas',
          command: 'SELECT * FROM sys.dm_hadr_availability_replica_states',
        },
        {
          order: 2,
          action: 'Verificar lag de sincronización',
          command: 'SELECT * FROM sys.dm_hadr_database_replica_states',
        },
        {
          order: 3,
          action: 'Alertar si lag > umbral',
          command: 'Check redo_queue_size and log_send_queue_size',
        },
      ]),
    },

    // ═══ IBM DB2 ═══
    {
      organizationId: org.id,
      category: 'IBM_DB2',
      name: 'DB2 Log Utilization Check',
      description: 'Monitorea uso de active logs y archive logs',
      costSafe: true,
      autoExecute: true,
      dbType: 'IBM DB2 11.5',
      steps: JSON.stringify([
        {
          order: 1,
          action: 'Verificar uso de logs',
          command: 'db2 GET SNAPSHOT FOR DATABASE ON <dbname>',
        },
        {
          order: 2,
          action: 'Verificar archive logs',
          command: 'db2 "SELECT * FROM SYSIBMADM.LOG_UTILIZATION"',
        },
        {
          order: 3,
          action: 'Alertar si > 80%',
          command: 'Generate alert if threshold exceeded',
        },
      ]),
    },
    {
      organizationId: org.id,
      category: 'IBM_DB2',
      name: 'DB2 RUNSTATS Refresh',
      description: 'Actualiza estadísticas de tablas para el optimizador DB2',
      costSafe: true,
      autoExecute: true,
      dbType: 'IBM DB2 11.5',
      txCode: 'DB02',
      steps: JSON.stringify([
        {
          order: 1,
          action: 'Identificar tablas con estadísticas obsoletas',
          command:
            'SELECT * FROM SYSSTAT.TABLES WHERE STATS_TIME < CURRENT TIMESTAMP - 7 DAYS',
        },
        {
          order: 2,
          action: 'Ejecutar RUNSTATS',
          command:
            'RUNSTATS ON TABLE <schema>.<table> WITH DISTRIBUTION AND DETAILED INDEXES ALL',
        },
        {
          order: 3,
          action: 'Verificar actualización',
          command: 'Check STATS_TIME updated',
        },
      ]),
    },
    {
      organizationId: org.id,
      category: 'IBM_DB2',
      name: 'DB2 REORG Check (REORGCHK)',
      description: 'Detecta tablas que necesitan reorganización',
      costSafe: true,
      autoExecute: true,
      dbType: 'IBM DB2 11.5',
      steps: JSON.stringify([
        {
          order: 1,
          action: 'Ejecutar REORGCHK',
          command: 'REORGCHK UPDATE STATISTICS ON TABLE ALL',
        },
        {
          order: 2,
          action: 'Identificar tablas marcadas *',
          command: 'Filter tables with asterisk flags (F1-F3)',
        },
        {
          order: 3,
          action: 'Generar lista de candidatas',
          command: 'Export reorg candidates list',
        },
      ]),
    },
    {
      organizationId: org.id,
      category: 'IBM_DB2',
      name: 'DB2 REORG Execute',
      description: 'Ejecuta reorganización de tablas marcadas por REORGCHK',
      costSafe: true,
      autoExecute: false,
      dbType: 'IBM DB2 11.5',
      prereqs: JSON.stringify([
        'REORGCHK ejecutado',
        'Ventana de mantenimiento',
        'Tablespace temporal disponible',
      ]),
      steps: JSON.stringify([
        {
          order: 1,
          action: 'Verificar tablespace temporal',
          command: 'db2 LIST TABLESPACES SHOW DETAIL',
        },
        {
          order: 2,
          action: 'Ejecutar REORG',
          command: 'REORG TABLE <schema>.<table> USE <tempspace>',
        },
        {
          order: 3,
          action: 'Ejecutar RUNSTATS post-reorg',
          command: 'RUNSTATS ON TABLE <schema>.<table>',
        },
      ]),
    },
    {
      organizationId: org.id,
      category: 'IBM_DB2',
      name: 'DB2 Tablespace Container Add',
      description: 'Agrega contenedor cuando un tablespace está lleno',
      costSafe: false,
      autoExecute: false,
      dbType: 'IBM DB2 11.5',
      prereqs: JSON.stringify([
        'DBA permissions',
        'Free disk space',
        'Tablespace near full',
      ]),
      steps: JSON.stringify([
        {
          order: 1,
          action: 'Verificar uso del tablespace',
          command: 'db2 LIST TABLESPACES SHOW DETAIL',
        },
        {
          order: 2,
          action: 'Agregar contenedor',
          command: "ALTER TABLESPACE <ts> ADD (FILE '/db2/data/cont_new' 10G)",
        },
        {
          order: 3,
          action: 'Verificar nuevo espacio',
          command: 'db2 LIST TABLESPACE CONTAINERS FOR <ts_id>',
        },
      ]),
    },
    {
      organizationId: org.id,
      category: 'IBM_DB2',
      name: 'DB2 Deadlock Analysis',
      description: 'Analiza deadlocks recientes del diaglog',
      costSafe: true,
      autoExecute: true,
      dbType: 'IBM DB2 11.5',
      steps: JSON.stringify([
        {
          order: 1,
          action: 'Verificar diaglog por deadlocks',
          command: 'db2diag -g "deadlock" | tail -50',
        },
        {
          order: 2,
          action: 'Analizar aplicaciones involucradas',
          command: 'Check DEADLOCKS monitor element',
        },
        {
          order: 3,
          action: 'Generar reporte',
          command: 'Export deadlock analysis',
        },
      ]),
    },
    {
      organizationId: org.id,
      category: 'IBM_DB2',
      name: 'DB2 HADR Status Check',
      description: 'Verifica estado de High Availability Disaster Recovery',
      costSafe: true,
      autoExecute: true,
      dbType: 'IBM DB2 11.5',
      prereqs: JSON.stringify(['HADR configurado']),
      steps: JSON.stringify([
        {
          order: 1,
          action: 'Verificar estado HADR',
          command: 'db2pd -hadr -db <dbname>',
        },
        {
          order: 2,
          action: 'Verificar lag de replicación',
          command: 'Check HADR_LOG_GAP',
        },
        {
          order: 3,
          action: 'Alertar si standby desconectado',
          command: 'Check HADR_STATE',
        },
      ]),
    },
    {
      organizationId: org.id,
      category: 'IBM_DB2',
      name: 'DB2 Archive Log Prune',
      description: 'Limpia archive logs ya no necesarios para recovery',
      costSafe: true,
      autoExecute: true,
      dbType: 'IBM DB2 11.5',
      prereqs: JSON.stringify(['Backup reciente exitoso']),
      steps: JSON.stringify([
        {
          order: 1,
          action: 'Verificar logs prunables',
          command: 'db2 PRUNE HISTORY <timestamp> WITH FORCE OPTION AND DELETE',
        },
        {
          order: 2,
          action: 'Ejecutar prune',
          command: 'PRUNE LOGFILE PRIOR TO <lsn>',
        },
        {
          order: 3,
          action: 'Verificar espacio liberado',
          command: 'df -h /db2/logs',
        },
      ]),
    },
    {
      organizationId: org.id,
      category: 'IBM_DB2',
      name: 'DB2 Connection Monitor',
      description: 'Monitorea conexiones activas vs máximo configurado',
      costSafe: true,
      autoExecute: true,
      dbType: 'IBM DB2 11.5',
      steps: JSON.stringify([
        {
          order: 1,
          action: 'Contar conexiones activas',
          command: 'db2 LIST APPLICATIONS SHOW DETAIL',
        },
        {
          order: 2,
          action: 'Comparar con MAX_CONNECTIONS',
          command: 'db2 GET DB CFG | grep MAXAPPLS',
        },
        {
          order: 3,
          action: 'Alertar si > 80% del máximo',
          command: 'Generate capacity alert',
        },
      ]),
    },
    {
      organizationId: org.id,
      category: 'IBM_DB2',
      name: 'DB2 Backup History Verification',
      description:
        'Verifica cadena de backups completa para point-in-time recovery',
      costSafe: true,
      autoExecute: true,
      dbType: 'IBM DB2 11.5',
      steps: JSON.stringify([
        {
          order: 1,
          action: 'Listar historial de backups',
          command: 'db2 LIST HISTORY BACKUP ALL FOR <dbname>',
        },
        {
          order: 2,
          action: 'Verificar cadena completa',
          command: 'Check for gaps in backup chain',
        },
        {
          order: 3,
          action: 'Alertar si hay gaps',
          command: 'Generate backup chain alert',
        },
      ]),
    },

    // ═══ ASE (nuevos) ═══
    {
      organizationId: org.id,
      category: 'SAP_ASE',
      name: 'ASE Tempdb Usage Monitor',
      description: 'Monitorea uso de tempdb y limpia objetos huérfanos',
      costSafe: true,
      autoExecute: true,
      dbType: 'ASE',
      steps: JSON.stringify([
        {
          order: 1,
          action: 'Verificar uso de tempdb',
          command: 'sp_helpdb tempdb',
        },
        {
          order: 2,
          action: 'Identificar objetos huérfanos',
          command: "SELECT * FROM tempdb..sysobjects WHERE type = 'U'",
        },
        {
          order: 3,
          action: 'Limpiar objetos temporales viejos',
          command: 'DROP TABLE tempdb..<orphan_table>',
        },
      ]),
    },
    {
      organizationId: org.id,
      category: 'SAP_ASE',
      name: 'ASE Lock Contention Analysis',
      description: 'Detecta bloqueos largos entre procesos en ASE',
      costSafe: true,
      autoExecute: true,
      dbType: 'ASE',
      steps: JSON.stringify([
        { order: 1, action: 'Verificar bloqueos activos', command: 'sp_lock' },
        {
          order: 2,
          action: 'Identificar cadenas de bloqueo',
          command: 'sp_who / sp_showplan',
        },
        {
          order: 3,
          action: 'Reportar o kill si > 30 min',
          command: 'KILL <spid>',
        },
      ]),
    },
    {
      organizationId: org.id,
      category: 'SAP_ASE',
      name: 'ASE DBCC Consistency Check',
      description:
        'Ejecuta verificación de consistencia de la base de datos ASE',
      costSafe: true,
      autoExecute: false,
      dbType: 'ASE',
      prereqs: JSON.stringify(['Ventana de mantenimiento', 'ASE online']),
      steps: JSON.stringify([
        {
          order: 1,
          action: 'Ejecutar DBCC CHECKDB',
          command: 'DBCC CHECKDB (dbname)',
        },
        {
          order: 2,
          action: 'Verificar resultado',
          command: 'Check error log for DBCC output',
        },
        {
          order: 3,
          action: 'Reportar estado',
          command: 'Log consistency check result',
        },
      ]),
    },
    {
      organizationId: org.id,
      category: 'SAP_ASE',
      name: 'ASE Cache Hit Ratio Analysis',
      description: 'Analiza eficiencia de data cache y procedure cache',
      costSafe: true,
      autoExecute: true,
      dbType: 'ASE',
      steps: JSON.stringify([
        {
          order: 1,
          action: 'Verificar hit ratio de data cache',
          command: 'sp_sysmon "00:05:00"',
        },
        {
          order: 2,
          action: 'Verificar procedure cache',
          command: 'sp_cacheconfig',
        },
        {
          order: 3,
          action: 'Recomendar ajustes si hit ratio < 95%',
          command: 'Generate cache tuning recommendations',
        },
      ]),
    },

    // ═══ MaxDB ═══
    {
      organizationId: org.id,
      category: 'SAP_MAXDB',
      name: 'MaxDB Data Area Utilization',
      description: 'Monitorea uso de data volumes y alerta si excede umbral',
      costSafe: true,
      autoExecute: true,
      dbType: 'SAP MaxDB 7.9',
      steps: JSON.stringify([
        {
          order: 1,
          action: 'Verificar uso de data area',
          command: 'dbmcli -d <db> -u <user> db_state',
        },
        {
          order: 2,
          action: 'Obtener detalle de volumes',
          command: 'dbmcli db_volumes',
        },
        {
          order: 3,
          action: 'Alertar si > 85% utilizado',
          command: 'Generate capacity alert',
        },
      ]),
    },
    {
      organizationId: org.id,
      category: 'SAP_MAXDB',
      name: 'MaxDB Log Area Monitor',
      description: 'Monitorea uso de log area y ejecuta backup si es necesario',
      costSafe: true,
      autoExecute: true,
      dbType: 'SAP MaxDB 7.9',
      steps: JSON.stringify([
        {
          order: 1,
          action: 'Verificar uso de log area',
          command: 'dbmcli info logarea',
        },
        {
          order: 2,
          action: 'Verificar autosave log status',
          command: 'dbmcli autosave_show',
        },
        {
          order: 3,
          action: 'Ejecutar log backup si > 70%',
          command: 'dbmcli backup_start log',
        },
      ]),
    },
    {
      organizationId: org.id,
      category: 'SAP_MAXDB',
      name: 'MaxDB Update Statistics',
      description: 'Actualiza estadísticas del optimizer MaxDB',
      costSafe: true,
      autoExecute: true,
      dbType: 'SAP MaxDB 7.9',
      txCode: 'DB02',
      steps: JSON.stringify([
        {
          order: 1,
          action: 'Verificar última actualización',
          command: 'dbmcli info state',
        },
        {
          order: 2,
          action: 'Ejecutar UPDATE STATISTICS',
          command: 'SQL: UPDATE STATISTICS *',
        },
        {
          order: 3,
          action: 'Verificar resultado',
          command: 'dbmcli info caches',
        },
      ]),
    },
    {
      organizationId: org.id,
      category: 'SAP_MAXDB',
      name: 'MaxDB Session Cleanup',
      description: 'Cierra sesiones inactivas que consumen recursos en MaxDB',
      costSafe: true,
      autoExecute: true,
      dbType: 'SAP MaxDB 7.9',
      steps: JSON.stringify([
        {
          order: 1,
          action: 'Listar sesiones activas',
          command: 'dbmcli show active_sessions',
        },
        {
          order: 2,
          action: 'Identificar sesiones idle > 2h',
          command: 'Filter by idle time',
        },
        {
          order: 3,
          action: 'Cancelar sesiones seleccionadas',
          command: 'dbmcli session_cancel <id>',
        },
      ]),
    },
    {
      organizationId: org.id,
      category: 'SAP_MAXDB',
      name: 'MaxDB Backup History Check',
      description: 'Verifica que la cadena de backups esté completa',
      costSafe: true,
      autoExecute: true,
      dbType: 'SAP MaxDB 7.9',
      steps: JSON.stringify([
        {
          order: 1,
          action: 'Listar backups recientes',
          command: 'dbmcli backup_history_list',
        },
        {
          order: 2,
          action: 'Verificar continuidad',
          command: 'Check for gaps in backup chain',
        },
        {
          order: 3,
          action: 'Alertar si último backup > 24h',
          command: 'Generate backup age alert',
        },
      ]),
    },
    {
      organizationId: org.id,
      category: 'SAP_MAXDB',
      name: 'MaxDB Bad Index Analysis',
      description:
        'Detecta índices con mala selectividad que degradan performance',
      costSafe: true,
      autoExecute: true,
      dbType: 'SAP MaxDB 7.9',
      steps: JSON.stringify([
        {
          order: 1,
          action: 'Analizar índices',
          command: 'SELECT * FROM DOMAIN.INDEXES WHERE SELECTIVITY < 0.1',
        },
        {
          order: 2,
          action: 'Evaluar candidatos a eliminación',
          command: 'Check index usage statistics',
        },
        {
          order: 3,
          action: 'Generar reporte',
          command: 'Export index analysis',
        },
      ]),
    },
    {
      organizationId: org.id,
      category: 'SAP_MAXDB',
      name: 'MaxDB Cache Hit Analysis',
      description: 'Analiza eficiencia del data cache y catalog cache',
      costSafe: true,
      autoExecute: true,
      dbType: 'SAP MaxDB 7.9',
      steps: JSON.stringify([
        {
          order: 1,
          action: 'Verificar cache hit ratios',
          command: 'dbmcli info caches',
        },
        {
          order: 2,
          action: 'Analizar data vs catalog cache',
          command: 'Check DATA_CACHE_HIT_RATE and CATALOG_CACHE_HIT_RATE',
        },
        {
          order: 3,
          action: 'Recomendar ajustes si < 98%',
          command: 'Generate cache tuning recommendations',
        },
      ]),
    },

    // ═══ Linux (SLES / RHEL) ═══
    {
      organizationId: org.id,
      category: 'LINUX_OS',
      name: 'Linux Filesystem Usage Check',
      description:
        'Revisa todos los mount points y alerta si alguno supera 85%',
      costSafe: true,
      autoExecute: true,
      dbType: 'ALL',
      parameters: JSON.stringify({ osType: 'LINUX' }),
      steps: JSON.stringify([
        {
          order: 1,
          action: 'Verificar todos los filesystems',
          command: 'df -hP | grep -v tmpfs',
        },
        {
          order: 2,
          action: 'Filtrar > 85% de uso',
          command: "awk '$5+0 > 85 {print}'",
        },
        {
          order: 3,
          action: 'Generar alertas por filesystem',
          command: 'Create alert per critical mount',
        },
      ]),
    },
    {
      organizationId: org.id,
      category: 'LINUX_OS',
      name: 'Linux Old Log Cleanup',
      description: 'Rota y limpia logs del sistema y SAP mayores a 30 días',
      costSafe: true,
      autoExecute: true,
      dbType: 'ALL',
      parameters: JSON.stringify({ osType: 'LINUX' }),
      steps: JSON.stringify([
        {
          order: 1,
          action: 'Buscar logs > 30 días',
          command: 'find /var/log -name "*.gz" -mtime +30',
        },
        {
          order: 2,
          action: 'Limpiar SAP traces antiguos',
          command: 'find /usr/sap/*/work -name "*.old" -mtime +30 -delete',
        },
        {
          order: 3,
          action: 'Rotar logs activos',
          command: 'logrotate -f /etc/logrotate.conf',
        },
        {
          order: 4,
          action: 'Verificar espacio liberado',
          command: 'df -h /var/log /usr/sap',
        },
      ]),
    },
    {
      organizationId: org.id,
      category: 'LINUX_OS',
      name: 'Linux Swap Usage Analysis',
      description:
        'Detecta si el sistema está usando swap, señal de falta de RAM',
      costSafe: true,
      autoExecute: true,
      dbType: 'ALL',
      parameters: JSON.stringify({ osType: 'LINUX' }),
      steps: JSON.stringify([
        {
          order: 1,
          action: 'Verificar uso de swap',
          command: 'free -h | grep Swap',
        },
        {
          order: 2,
          action: 'Identificar procesos usando swap',
          command:
            "for f in /proc/*/status; do awk '/VmSwap/{print FILENAME,$2}' $f; done | sort -k2 -nr | head",
        },
        {
          order: 3,
          action: 'Alertar si swap > 10%',
          command: 'Generate memory pressure alert',
        },
      ]),
    },
    {
      organizationId: org.id,
      category: 'LINUX_OS',
      name: 'Linux Zombie Process Cleanup',
      description: 'Detecta y limpia procesos zombie/defunct del sistema',
      costSafe: true,
      autoExecute: true,
      dbType: 'ALL',
      parameters: JSON.stringify({ osType: 'LINUX' }),
      steps: JSON.stringify([
        {
          order: 1,
          action: 'Buscar procesos zombie',
          command: 'ps aux | grep -w Z',
        },
        {
          order: 2,
          action: 'Identificar procesos padre',
          command: 'Check parent PID',
        },
        {
          order: 3,
          action: 'Limpiar zombies',
          command: 'kill -SIGCHLD <parent_pid>',
        },
      ]),
    },
    {
      organizationId: org.id,
      category: 'LINUX_OS',
      name: 'Linux NTP/Chrony Sync Check',
      description:
        'Verifica sincronización de reloj — crítico para clusters y HANA HSR',
      costSafe: true,
      autoExecute: true,
      dbType: 'ALL',
      parameters: JSON.stringify({ osType: 'LINUX' }),
      steps: JSON.stringify([
        {
          order: 1,
          action: 'Verificar estado NTP',
          command: 'chronyc tracking || ntpq -p',
        },
        {
          order: 2,
          action: 'Verificar offset',
          command: 'Check offset < 100ms',
        },
        {
          order: 3,
          action: 'Alertar si desincronizado',
          command: 'Generate NTP drift alert',
        },
      ]),
    },
    {
      organizationId: org.id,
      category: 'LINUX_OS',
      name: 'Linux Kernel Parameter Audit',
      description:
        'Compara parámetros del kernel vs recomendaciones SAP (SAP Notes)',
      costSafe: true,
      autoExecute: true,
      dbType: 'ALL',
      parameters: JSON.stringify({ osType: 'LINUX' }),
      steps: JSON.stringify([
        {
          order: 1,
          action: 'Leer parámetros actuales',
          command: 'sysctl -a | grep -E "vm.swappiness|net.core|kernel.sem"',
        },
        {
          order: 2,
          action: 'Comparar con SAP Note 2382421',
          command: 'Diff actual vs recommended',
        },
        {
          order: 3,
          action: 'Reportar desvíos',
          command: 'Generate compliance report',
        },
      ]),
    },
    {
      organizationId: org.id,
      category: 'LINUX_OS',
      name: 'Linux Core Dump Cleanup',
      description: 'Limpia core dumps antiguos que ocupan espacio en disco',
      costSafe: true,
      autoExecute: true,
      dbType: 'ALL',
      parameters: JSON.stringify({ osType: 'LINUX' }),
      steps: JSON.stringify([
        {
          order: 1,
          action: 'Buscar core dumps',
          command: 'find / -name "core.*" -o -name "*.core" | head -20',
        },
        {
          order: 2,
          action: 'Limpiar cores > 7 días',
          command: 'find /var/crash -name "core*" -mtime +7 -delete',
        },
        { order: 3, action: 'Verificar espacio liberado', command: 'df -h' },
      ]),
    },
    {
      organizationId: org.id,
      category: 'LINUX_OS',
      name: 'Linux Network Interface Health',
      description: 'Verifica errores en interfaces de red y dropped packets',
      costSafe: true,
      autoExecute: true,
      dbType: 'ALL',
      parameters: JSON.stringify({ osType: 'LINUX' }),
      steps: JSON.stringify([
        {
          order: 1,
          action: 'Verificar errores de red',
          command: 'ip -s link show',
        },
        {
          order: 2,
          action: 'Detectar dropped packets',
          command: "netstat -i | awk '$6 > 0 || $10 > 0'",
        },
        {
          order: 3,
          action: 'Alertar si errores > umbral',
          command: 'Generate network error alert',
        },
      ]),
    },
    {
      organizationId: org.id,
      category: 'LINUX_OS',
      name: 'Linux Pacemaker/Corosync Cluster Check',
      description: 'Verifica estado del cluster HA — nodos, recursos, fencing',
      costSafe: true,
      autoExecute: true,
      dbType: 'ALL',
      parameters: JSON.stringify({ osType: 'LINUX' }),
      prereqs: JSON.stringify(['Cluster Pacemaker/Corosync configurado']),
      steps: JSON.stringify([
        {
          order: 1,
          action: 'Verificar estado del cluster',
          command: 'crm_mon -1',
        },
        {
          order: 2,
          action: 'Verificar fencing configurado',
          command: 'stonith_admin -L',
        },
        {
          order: 3,
          action: 'Verificar recursos activos',
          command: 'crm resource status',
        },
      ]),
    },
    {
      organizationId: org.id,
      category: 'LINUX_OS',
      name: 'Linux I/O Latency Check',
      description:
        'Detecta latencia alta en discos (> 20ms) que afecta performance de BD',
      costSafe: true,
      autoExecute: true,
      dbType: 'ALL',
      parameters: JSON.stringify({ osType: 'LINUX' }),
      steps: JSON.stringify([
        { order: 1, action: 'Medir latencia de I/O', command: 'iostat -x 1 5' },
        {
          order: 2,
          action: 'Identificar discos con await > 20ms',
          command: "awk '$10 > 20'",
        },
        {
          order: 3,
          action: 'Alertar si latencia crítica',
          command: 'Generate I/O latency alert',
        },
      ]),
    },
    {
      organizationId: org.id,
      category: 'LINUX_OS',
      name: 'Linux Huge Pages Verification',
      description:
        'Verifica configuración de transparent huge pages según SAP Notes',
      costSafe: true,
      autoExecute: true,
      dbType: 'ALL',
      parameters: JSON.stringify({ osType: 'LINUX' }),
      steps: JSON.stringify([
        {
          order: 1,
          action: 'Verificar THP status',
          command: 'cat /sys/kernel/mm/transparent_hugepage/enabled',
        },
        {
          order: 2,
          action: 'Verificar si SAP recomienda disabled',
          command: 'Compare with SAP Note 2131662',
        },
        {
          order: 3,
          action: 'Reportar si configuración incorrecta',
          command: 'Generate compliance alert',
        },
      ]),
    },
    {
      organizationId: org.id,
      category: 'LINUX_OS',
      name: 'Linux OS Patch Level Check',
      description: 'Compara kernel y paquetes vs niveles recomendados por SAP',
      costSafe: true,
      autoExecute: true,
      dbType: 'ALL',
      parameters: JSON.stringify({ osType: 'LINUX' }),
      steps: JSON.stringify([
        { order: 1, action: 'Verificar kernel actual', command: 'uname -r' },
        {
          order: 2,
          action: 'Verificar patches pendientes',
          command: 'zypper list-patches || yum check-update',
        },
        {
          order: 3,
          action: 'Comparar con SAP PAM',
          command: 'Check against SAP Product Availability Matrix',
        },
      ]),
    },
    {
      organizationId: org.id,
      category: 'SAP_KERNEL_PATCHING',
      name: 'Linux Kernel Patch — Verify',
      description:
        'Verifica estado de parchado del kernel y si requiere reboot',
      costSafe: true,
      autoExecute: true,
      dbType: 'ALL',
      parameters: JSON.stringify({ osType: 'LINUX' }),
      steps: JSON.stringify([
        {
          order: 1,
          action: 'Verificar kernel corriendo vs instalado',
          command: 'rpm -q kernel | tail -1 && uname -r',
        },
        {
          order: 2,
          action: 'Verificar si hay reboot pendiente',
          command:
            'test -f /var/run/reboot-required && echo REBOOT_NEEDED || needs-restarting -r',
        },
        {
          order: 3,
          action: 'Reportar estado de parchado',
          command: 'Generate patch status report',
        },
      ]),
    },
    {
      organizationId: org.id,
      category: 'SAP_KERNEL_PATCHING',
      name: 'Linux Kernel Patch — Prepare',
      description:
        'Descarga patches de kernel y prepara snapshot para rollback',
      costSafe: true,
      autoExecute: false,
      dbType: 'ALL',
      parameters: JSON.stringify({ osType: 'LINUX' }),
      prereqs: JSON.stringify([
        'Ventana de mantenimiento planificada',
        'Espacio en disco suficiente',
        'LVM o ZFS configurado para snapshots',
      ]),
      steps: JSON.stringify([
        {
          order: 1,
          action: 'Descargar patches sin instalar',
          command: 'zypper download-only kernel || yum download kernel',
        },
        {
          order: 2,
          action: 'Crear snapshot LVM pre-parche',
          command: 'lvcreate -s -n pre_patch_snap -L 10G /dev/vg_sap/lv_root',
        },
        {
          order: 3,
          action: 'Verificar espacio y snapshot OK',
          command: 'lvs && df -h',
        },
      ]),
    },
    {
      organizationId: org.id,
      category: 'SAP_KERNEL_PATCHING',
      name: 'Linux Kernel Patch — Apply',
      description:
        'Aplica parche de kernel con parada controlada de SAP y reboot',
      costSafe: false,
      autoExecute: false,
      dbType: 'ALL',
      parameters: JSON.stringify({ osType: 'LINUX' }),
      prereqs: JSON.stringify([
        'Ventana de mantenimiento activa',
        'Snapshot pre-parche creado',
        'No hay jobs SAP batch activos',
        'FULL_STACK_AGENT monitoreo activo',
      ]),
      steps: JSON.stringify([
        {
          order: 1,
          action: 'Parar servicios SAP',
          command: 'sapcontrol -nr <nr> -function StopSystem ALL',
        },
        {
          order: 2,
          action: 'Parar base de datos',
          command: 'HDB stop || sqlplus / as sysdba shutdown immediate',
        },
        {
          order: 3,
          action: 'Aplicar parche de kernel',
          command: 'zypper up kernel || yum update kernel',
        },
        { order: 4, action: 'Reboot del servidor', command: 'shutdown -r now' },
        { order: 5, action: 'Verificar kernel nuevo', command: 'uname -r' },
        {
          order: 6,
          action: 'Arrancar base de datos',
          command: 'HDB start || sqlplus / as sysdba startup',
        },
        {
          order: 7,
          action: 'Arrancar servicios SAP',
          command: 'sapcontrol -nr <nr> -function StartSystem ALL',
        },
        {
          order: 8,
          action: 'Smoke test — verificar SAP responde',
          command: 'sapcontrol -nr <nr> -function GetProcessList',
        },
      ]),
    },
    {
      organizationId: org.id,
      category: 'SAP_KERNEL_PATCHING',
      name: 'Linux Kernel Patch — Rollback',
      description: 'Rollback a kernel anterior si el parche causó problemas',
      costSafe: false,
      autoExecute: false,
      dbType: 'ALL',
      parameters: JSON.stringify({ osType: 'LINUX' }),
      prereqs: JSON.stringify([
        'Parche de kernel aplicado',
        'Snapshot pre-parche disponible',
        'Problema detectado post-parche',
      ]),
      steps: JSON.stringify([
        {
          order: 1,
          action: 'Verificar kernel disponibles',
          command: 'grubby --info=ALL || grep menuentry /boot/grub2/grub.cfg',
        },
        {
          order: 2,
          action: 'Setear kernel anterior como default',
          command: 'grubby --set-default=<old_kernel>',
        },
        {
          order: 3,
          action: 'Parar servicios SAP y BD',
          command: 'sapcontrol StopSystem && HDB stop',
        },
        {
          order: 4,
          action: 'Reboot con kernel anterior',
          command: 'shutdown -r now',
        },
        { order: 5, action: 'Verificar kernel correcto', command: 'uname -r' },
        {
          order: 6,
          action: 'Restaurar snapshot si necesario',
          command: 'lvconvert --merge /dev/vg_sap/pre_patch_snap',
        },
        {
          order: 7,
          action: 'Arrancar BD y SAP',
          command: 'HDB start && sapcontrol StartSystem ALL',
        },
      ]),
    },

    // ═══ Windows Server ═══
    {
      organizationId: org.id,
      category: 'WINDOWS_OS',
      name: 'Windows Disk Space Check',
      description: 'Revisa espacio libre en todos los drives y alerta si < 15%',
      costSafe: true,
      autoExecute: true,
      dbType: 'ALL',
      parameters: JSON.stringify({ osType: 'WINDOWS' }),
      steps: JSON.stringify([
        {
          order: 1,
          action: 'Verificar todos los drives',
          command: 'Get-PSDrive -PSProvider FileSystem | Select Name,Used,Free',
        },
        {
          order: 2,
          action: 'Filtrar drives con poco espacio',
          command: 'Where-Object {$_.Free / ($_.Used + $_.Free) -lt 0.15}',
        },
        {
          order: 3,
          action: 'Generar alerta',
          command: 'Create disk space alert',
        },
      ]),
    },
    {
      organizationId: org.id,
      category: 'WINDOWS_OS',
      name: 'Windows Event Log Analysis',
      description: 'Busca errores críticos en Application y System event logs',
      costSafe: true,
      autoExecute: true,
      dbType: 'ALL',
      parameters: JSON.stringify({ osType: 'WINDOWS' }),
      steps: JSON.stringify([
        {
          order: 1,
          action: 'Buscar errores en Application log',
          command:
            'Get-EventLog -LogName Application -EntryType Error -After (Get-Date).AddHours(-24)',
        },
        {
          order: 2,
          action: 'Buscar errores en System log',
          command:
            'Get-EventLog -LogName System -EntryType Error -After (Get-Date).AddHours(-24)',
        },
        {
          order: 3,
          action: 'Clasificar y reportar',
          command: 'Group-Object Source | Sort Count -Descending',
        },
      ]),
    },
    {
      organizationId: org.id,
      category: 'WINDOWS_OS',
      name: 'Windows Service Status Check',
      description: 'Verifica que servicios SAP y SQL Server estén corriendo',
      costSafe: true,
      autoExecute: true,
      dbType: 'ALL',
      parameters: JSON.stringify({ osType: 'WINDOWS' }),
      steps: JSON.stringify([
        {
          order: 1,
          action: 'Verificar servicios SAP',
          command: 'Get-Service SAP* | Where Status -ne Running',
        },
        {
          order: 2,
          action: 'Verificar servicio SQL Server',
          command: 'Get-Service MSSQL* | Where Status -ne Running',
        },
        {
          order: 3,
          action: 'Reiniciar servicios caídos',
          command: 'Start-Service <service_name>',
        },
      ]),
    },
    {
      organizationId: org.id,
      category: 'WINDOWS_OS',
      name: 'Windows Update Pending Check',
      description:
        'Detecta Windows updates pendientes que pueden requerir reboot',
      costSafe: true,
      autoExecute: true,
      dbType: 'ALL',
      parameters: JSON.stringify({ osType: 'WINDOWS' }),
      steps: JSON.stringify([
        {
          order: 1,
          action: 'Verificar updates pendientes',
          command: 'Get-WindowsUpdate -IsInstalled:$false',
        },
        {
          order: 2,
          action: 'Verificar si reboot es necesario',
          command:
            'Test-Path HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\WindowsUpdate\\Auto Update\\RebootRequired',
        },
        {
          order: 3,
          action: 'Reportar estado',
          command: 'Generate Windows Update report',
        },
      ]),
    },
    {
      organizationId: org.id,
      category: 'WINDOWS_OS',
      name: 'Windows Page File Monitor',
      description: 'Monitorea uso de page file (memoria virtual)',
      costSafe: true,
      autoExecute: true,
      dbType: 'ALL',
      parameters: JSON.stringify({ osType: 'WINDOWS' }),
      steps: JSON.stringify([
        {
          order: 1,
          action: 'Verificar uso de page file',
          command: 'Get-CimInstance Win32_PageFileUsage',
        },
        {
          order: 2,
          action: 'Comparar con tamaño total',
          command: 'Check CurrentUsage vs AllocatedBaseSize',
        },
        {
          order: 3,
          action: 'Alertar si > 80%',
          command: 'Generate memory pressure alert',
        },
      ]),
    },
    {
      organizationId: org.id,
      category: 'WINDOWS_OS',
      name: 'Windows WSFC Cluster Health',
      description: 'Verifica estado de Windows Server Failover Cluster',
      costSafe: true,
      autoExecute: true,
      dbType: 'ALL',
      parameters: JSON.stringify({ osType: 'WINDOWS' }),
      prereqs: JSON.stringify(['Cluster WSFC configurado']),
      steps: JSON.stringify([
        {
          order: 1,
          action: 'Verificar estado del cluster',
          command: 'Get-ClusterNode | Select Name,State',
        },
        {
          order: 2,
          action: 'Verificar recursos',
          command: 'Get-ClusterResource | Where State -ne Online',
        },
        { order: 3, action: 'Verificar quorum', command: 'Get-ClusterQuorum' },
      ]),
    },
    {
      organizationId: org.id,
      category: 'WINDOWS_OS',
      name: 'Windows Certificate Store Expiry',
      description: 'Revisa certificados en Windows certificate store',
      costSafe: true,
      autoExecute: true,
      dbType: 'ALL',
      parameters: JSON.stringify({ osType: 'WINDOWS' }),
      steps: JSON.stringify([
        {
          order: 1,
          action: 'Listar certificados por vencer',
          command:
            'Get-ChildItem Cert:\\LocalMachine\\My | Where NotAfter -lt (Get-Date).AddDays(30)',
        },
        {
          order: 2,
          action: 'Verificar certificados SAP',
          command: 'Filter by subject containing SAP',
        },
        {
          order: 3,
          action: 'Alertar por vencimientos',
          command: 'Generate certificate expiry alert',
        },
      ]),
    },
    {
      organizationId: org.id,
      category: 'WINDOWS_OS',
      name: 'Windows Temp Folder Cleanup',
      description: 'Limpia archivos temporales del sistema y SAP temp dirs',
      costSafe: true,
      autoExecute: true,
      dbType: 'ALL',
      parameters: JSON.stringify({ osType: 'WINDOWS' }),
      steps: JSON.stringify([
        {
          order: 1,
          action: 'Limpiar Windows temp',
          command:
            'Remove-Item $env:TEMP\\* -Recurse -Force -ErrorAction SilentlyContinue',
        },
        {
          order: 2,
          action: 'Limpiar SAP temp',
          command: 'Remove-Item C:\\usr\\sap\\tmp\\*.old -Force',
        },
        {
          order: 3,
          action: 'Verificar espacio liberado',
          command: 'Get-PSDrive C | Select Free',
        },
      ]),
    },
    {
      organizationId: org.id,
      category: 'WINDOWS_OS',
      name: 'Windows Firewall Rule Audit',
      description:
        'Verifica que puertos SAP estén abiertos según configuración',
      costSafe: true,
      autoExecute: true,
      dbType: 'ALL',
      parameters: JSON.stringify({ osType: 'WINDOWS' }),
      steps: JSON.stringify([
        {
          order: 1,
          action: 'Listar reglas SAP',
          command:
            'Get-NetFirewallRule -DisplayName *SAP* | Select DisplayName,Enabled,Direction',
        },
        {
          order: 2,
          action: 'Verificar puertos 32xx, 33xx, 36xx',
          command: 'Test-NetConnection localhost -Port 3200',
        },
        {
          order: 3,
          action: 'Reportar puertos bloqueados',
          command: 'Generate firewall audit report',
        },
      ]),
    },
    {
      organizationId: org.id,
      category: 'SAP_KERNEL_PATCHING',
      name: 'Windows Kernel Patch — Verify',
      description:
        'Verifica estado de Windows Updates de seguridad y parches KB',
      costSafe: true,
      autoExecute: true,
      dbType: 'ALL',
      parameters: JSON.stringify({ osType: 'WINDOWS' }),
      steps: JSON.stringify([
        {
          order: 1,
          action: 'Listar hotfixes instalados',
          command:
            'Get-HotFix | Sort InstalledOn -Descending | Select -First 10',
        },
        {
          order: 2,
          action: 'Verificar último patch de seguridad',
          command: 'Check most recent security update date',
        },
        {
          order: 3,
          action: 'Verificar si reboot pendiente',
          command:
            'Get-ItemProperty HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\WindowsUpdate\\Auto Update\\RebootRequired',
        },
      ]),
    },
    {
      organizationId: org.id,
      category: 'SAP_KERNEL_PATCHING',
      name: 'Windows Kernel Patch — Apply',
      description: 'Aplica Windows Updates con parada controlada de SAP',
      costSafe: false,
      autoExecute: false,
      dbType: 'ALL',
      parameters: JSON.stringify({ osType: 'WINDOWS' }),
      prereqs: JSON.stringify([
        'Ventana de mantenimiento activa',
        'Snapshot/restore point creado',
        'No hay jobs SAP activos',
        'FULL_STACK_AGENT activo',
      ]),
      steps: JSON.stringify([
        {
          order: 1,
          action: 'Parar servicios SAP',
          command: 'Stop-Service SAP* -Force',
        },
        {
          order: 2,
          action: 'Parar SQL Server si aplica',
          command: 'Stop-Service MSSQL*',
        },
        {
          order: 3,
          action: 'Crear restore point',
          command: 'Checkpoint-Computer -Description "Pre-SAP-Patch"',
        },
        {
          order: 4,
          action: 'Instalar Windows Updates',
          command: 'Install-WindowsUpdate -AcceptAll -AutoReboot',
        },
        {
          order: 5,
          action: 'Verificar post-reboot',
          command:
            'Get-HotFix | Sort InstalledOn -Descending | Select -First 5',
        },
        {
          order: 6,
          action: 'Arrancar SQL Server y SAP',
          command: 'Start-Service MSSQL*; Start-Service SAP*',
        },
        {
          order: 7,
          action: 'Smoke test SAP',
          command: 'sapcontrol -nr <nr> -function GetProcessList',
        },
      ]),
    },

    // ═══ AIX ═══
    {
      organizationId: org.id,
      category: 'AIX_OS',
      name: 'AIX Filesystem Check (JFS2)',
      description: 'Revisa uso de filesystems JFS2 y proyecta crecimiento',
      costSafe: true,
      autoExecute: true,
      dbType: 'ALL',
      parameters: JSON.stringify({ osType: 'AIX' }),
      steps: JSON.stringify([
        {
          order: 1,
          action: 'Verificar filesystems',
          command: 'df -g | grep jfs2',
        },
        {
          order: 2,
          action: 'Identificar > 85% de uso',
          command: 'Filter critical filesystems',
        },
        {
          order: 3,
          action: 'Generar alerta',
          command: 'Create capacity alert',
        },
      ]),
    },
    {
      organizationId: org.id,
      category: 'AIX_OS',
      name: 'AIX Paging Space Analysis',
      description: 'Verifica uso de paging space y alerta si > 70%',
      costSafe: true,
      autoExecute: true,
      dbType: 'ALL',
      parameters: JSON.stringify({ osType: 'AIX' }),
      steps: JSON.stringify([
        { order: 1, action: 'Verificar paging space', command: 'lsps -a' },
        { order: 2, action: 'Verificar uso actual', command: 'lsps -s' },
        {
          order: 3,
          action: 'Alertar si > 70%',
          command: 'Generate paging alert',
        },
      ]),
    },
    {
      organizationId: org.id,
      category: 'AIX_OS',
      name: 'AIX Error Report (errpt)',
      description: 'Analiza errpt por errores de hardware/software recientes',
      costSafe: true,
      autoExecute: true,
      dbType: 'ALL',
      parameters: JSON.stringify({ osType: 'AIX' }),
      steps: JSON.stringify([
        {
          order: 1,
          action: 'Revisar errores últimas 24h',
          command: 'errpt -a -s $(date -d yesterday +%m%d%H%M%y)',
        },
        {
          order: 2,
          action: 'Clasificar por tipo',
          command: 'errpt -d H (hardware) / errpt -d S (software)',
        },
        {
          order: 3,
          action: 'Reportar errores críticos',
          command: 'Filter PERM and TEMP errors',
        },
      ]),
    },
    {
      organizationId: org.id,
      category: 'AIX_OS',
      name: 'AIX LVM Health Check',
      description: 'Verifica volume groups, logical volumes y mirrors',
      costSafe: true,
      autoExecute: true,
      dbType: 'ALL',
      parameters: JSON.stringify({ osType: 'AIX' }),
      steps: JSON.stringify([
        {
          order: 1,
          action: 'Verificar volume groups',
          command: 'lsvg -o | lsvg -il',
        },
        {
          order: 2,
          action: 'Verificar mirrors',
          command: 'lsvg -l <vg> | grep -v open',
        },
        {
          order: 3,
          action: 'Alertar si stale PPs',
          command: 'Check for STALE partitions',
        },
      ]),
    },
    {
      organizationId: org.id,
      category: 'AIX_OS',
      name: 'AIX LPAR Resource Utilization',
      description: 'Revisa uso de CPU entitlements y memoria en LPAR',
      costSafe: true,
      autoExecute: true,
      dbType: 'ALL',
      parameters: JSON.stringify({ osType: 'AIX' }),
      steps: JSON.stringify([
        { order: 1, action: 'Verificar entitlements', command: 'lparstat 1 5' },
        { order: 2, action: 'Verificar memoria', command: 'svmon -G' },
        {
          order: 3,
          action: 'Alertar si sobre-committed',
          command: 'Check entitlement usage vs allocated',
        },
      ]),
    },
    {
      organizationId: org.id,
      category: 'AIX_OS',
      name: 'AIX Network Health',
      description: 'Verifica errores en adapters Ethernet y link status',
      costSafe: true,
      autoExecute: true,
      dbType: 'ALL',
      parameters: JSON.stringify({ osType: 'AIX' }),
      steps: JSON.stringify([
        {
          order: 1,
          action: 'Verificar estado de adapters',
          command: 'entstat -d en0',
        },
        {
          order: 2,
          action: 'Verificar errores de red',
          command: 'netstat -in',
        },
        {
          order: 3,
          action: 'Alertar si errores elevados',
          command: 'Generate network alert',
        },
      ]),
    },
    {
      organizationId: org.id,
      category: 'AIX_OS',
      name: 'AIX PowerHA Cluster Status',
      description: 'Verifica estado del cluster PowerHA/HACMP',
      costSafe: true,
      autoExecute: true,
      dbType: 'ALL',
      parameters: JSON.stringify({ osType: 'AIX' }),
      prereqs: JSON.stringify(['PowerHA/HACMP configurado']),
      steps: JSON.stringify([
        {
          order: 1,
          action: 'Verificar estado del cluster',
          command: 'clRGinfo -s',
        },
        { order: 2, action: 'Verificar nodos', command: 'lscluster -m' },
        { order: 3, action: 'Verificar resource groups', command: 'clRGinfo' },
      ]),
    },
    {
      organizationId: org.id,
      category: 'AIX_OS',
      name: 'AIX Core Dump Cleanup',
      description: 'Limpia core dumps y snap data viejos en /var/adm',
      costSafe: true,
      autoExecute: true,
      dbType: 'ALL',
      parameters: JSON.stringify({ osType: 'AIX' }),
      steps: JSON.stringify([
        {
          order: 1,
          action: 'Buscar core dumps',
          command: 'find /var/adm -name "core*" -mtime +7',
        },
        {
          order: 2,
          action: 'Limpiar snap data',
          command: 'find /tmp/ibmsupt -mtime +30 -delete',
        },
        {
          order: 3,
          action: 'Verificar espacio liberado',
          command: 'df -g /var /tmp',
        },
      ]),
    },

    // ═══ Solaris ═══
    {
      organizationId: org.id,
      category: 'SOLARIS_OS',
      name: 'Solaris ZFS Pool Health',
      description: 'Verifica estado de zpools — degraded, faulted, online',
      costSafe: true,
      autoExecute: true,
      dbType: 'ALL',
      parameters: JSON.stringify({ osType: 'SOLARIS' }),
      steps: JSON.stringify([
        {
          order: 1,
          action: 'Verificar estado de zpools',
          command: 'zpool status -x',
        },
        { order: 2, action: 'Verificar capacidad', command: 'zpool list' },
        {
          order: 3,
          action: 'Alertar si degraded o faulted',
          command: 'Generate zpool health alert',
        },
      ]),
    },
    {
      organizationId: org.id,
      category: 'SOLARIS_OS',
      name: 'Solaris ZFS Snapshot Cleanup',
      description: 'Limpia snapshots ZFS viejos que consumen espacio',
      costSafe: true,
      autoExecute: true,
      dbType: 'ALL',
      parameters: JSON.stringify({ osType: 'SOLARIS' }),
      steps: JSON.stringify([
        {
          order: 1,
          action: 'Listar snapshots',
          command: 'zfs list -t snapshot -o name,used,creation',
        },
        {
          order: 2,
          action: 'Identificar > 30 días',
          command: 'Filter old snapshots',
        },
        {
          order: 3,
          action: 'Eliminar snapshots viejos',
          command: 'zfs destroy <snapshot>',
        },
      ]),
    },
    {
      organizationId: org.id,
      category: 'SOLARIS_OS',
      name: 'Solaris SMF Service Check',
      description: 'Verifica que servicios SAP en SMF estén online',
      costSafe: true,
      autoExecute: true,
      dbType: 'ALL',
      parameters: JSON.stringify({ osType: 'SOLARIS' }),
      steps: JSON.stringify([
        {
          order: 1,
          action: 'Verificar servicios SAP',
          command: 'svcs -a | grep sap',
        },
        {
          order: 2,
          action: 'Identificar servicios en maintenance',
          command: 'svcs -x',
        },
        {
          order: 3,
          action: 'Reiniciar servicios caídos',
          command: 'svcadm restart <fmri>',
        },
      ]),
    },
    {
      organizationId: org.id,
      category: 'SOLARIS_OS',
      name: 'Solaris FMA Fault Check',
      description:
        'Revisa Fault Management Architecture por errores de hardware',
      costSafe: true,
      autoExecute: true,
      dbType: 'ALL',
      parameters: JSON.stringify({ osType: 'SOLARIS' }),
      steps: JSON.stringify([
        {
          order: 1,
          action: 'Verificar faults activos',
          command: 'fmadm faulty',
        },
        {
          order: 2,
          action: 'Obtener detalle de faults',
          command: 'fmdump -eV',
        },
        {
          order: 3,
          action: 'Reportar errores de hardware',
          command: 'Generate hardware fault alert',
        },
      ]),
    },
    {
      organizationId: org.id,
      category: 'SOLARIS_OS',
      name: 'Solaris Zone Resource Monitor',
      description: 'Monitorea recursos de zonas Solaris donde corre SAP',
      costSafe: true,
      autoExecute: true,
      dbType: 'ALL',
      parameters: JSON.stringify({ osType: 'SOLARIS' }),
      steps: JSON.stringify([
        {
          order: 1,
          action: 'Listar zonas activas',
          command: 'zoneadm list -cv',
        },
        {
          order: 2,
          action: 'Verificar recursos por zona',
          command: 'prstat -Z',
        },
        {
          order: 3,
          action: 'Alertar si recurso saturado',
          command: 'Check CPU/memory caps',
        },
      ]),
    },
    {
      organizationId: org.id,
      category: 'SOLARIS_OS',
      name: 'Solaris Network Datalink Health',
      description: 'Verifica errores en datalinks y VNICs',
      costSafe: true,
      autoExecute: true,
      dbType: 'ALL',
      parameters: JSON.stringify({ osType: 'SOLARIS' }),
      steps: JSON.stringify([
        { order: 1, action: 'Verificar datalinks', command: 'dladm show-link' },
        {
          order: 2,
          action: 'Verificar estadísticas',
          command: 'dladm show-linkprop',
        },
        {
          order: 3,
          action: 'Alertar si errores',
          command: 'kstat -p link:0:*:ierrors',
        },
      ]),
    },
    {
      organizationId: org.id,
      category: 'SOLARIS_OS',
      name: 'Solaris Core Dump Cleanup',
      description: 'Limpia core files viejos de /var/cores',
      costSafe: true,
      autoExecute: true,
      dbType: 'ALL',
      parameters: JSON.stringify({ osType: 'SOLARIS' }),
      steps: JSON.stringify([
        {
          order: 1,
          action: 'Buscar core dumps',
          command: 'find /var/cores -name "core*" -mtime +7',
        },
        {
          order: 2,
          action: 'Limpiar cores viejos',
          command: 'find /var/cores -name "core*" -mtime +7 -delete',
        },
        { order: 3, action: 'Verificar espacio', command: 'df -h /var' },
      ]),
    },
    {
      organizationId: org.id,
      category: 'SAP_KERNEL_PATCHING',
      name: 'Solaris Kernel Patch Verify',
      description: 'Verifica nivel de parchado del kernel Solaris',
      costSafe: true,
      autoExecute: true,
      dbType: 'ALL',
      parameters: JSON.stringify({ osType: 'SOLARIS' }),
      steps: JSON.stringify([
        {
          order: 1,
          action: 'Verificar versión de kernel',
          command: 'uname -v',
        },
        {
          order: 2,
          action: 'Listar SRUs instalados',
          command: 'pkg info entire',
        },
        {
          order: 3,
          action: 'Verificar updates disponibles',
          command: 'pkg update --be-name pre-patch -nv',
        },
      ]),
    },

    // ═══ ABAP Avanzados ═══
    {
      organizationId: org.id,
      category: 'SAP_ABAP',
      name: 'ABAP Dump Analysis (ST22)',
      description:
        'Analiza short dumps de las últimas 24h y detecta patrones recurrentes',
      costSafe: true,
      autoExecute: true,
      dbType: 'ABAP',
      txCode: 'ST22',
      steps: JSON.stringify([
        {
          order: 1,
          action: 'Listar dumps últimas 24h',
          command: 'ST22 → Last 24 Hours',
        },
        {
          order: 2,
          action: 'Agrupar por programa y error',
          command: 'Group by ABAP program and exception',
        },
        {
          order: 3,
          action: 'Detectar dumps recurrentes',
          command: 'Flag programs with > 5 dumps',
        },
      ]),
    },
    {
      organizationId: org.id,
      category: 'SAP_ABAP',
      name: 'ABAP Update Request Monitor (SM13)',
      description:
        'Detecta update requests fallidos que bloquean transacciones',
      costSafe: true,
      autoExecute: true,
      dbType: 'ABAP',
      txCode: 'SM13',
      steps: JSON.stringify([
        {
          order: 1,
          action: 'Verificar updates fallidos',
          command: 'SM13 → Select Error status',
        },
        {
          order: 2,
          action: 'Identificar updates críticos',
          command: 'Filter by priority and age',
        },
        {
          order: 3,
          action: 'Reintentar o notificar',
          command: 'SM13 → Repeat or alert',
        },
      ]),
    },
    {
      organizationId: org.id,
      category: 'SAP_ABAP',
      name: 'ABAP Gateway Monitor (SMGW)',
      description: 'Revisa conexiones RFC registradas y limpia sesiones zombie',
      costSafe: true,
      autoExecute: true,
      dbType: 'ABAP',
      txCode: 'SMGW',
      steps: JSON.stringify([
        {
          order: 1,
          action: 'Verificar conexiones activas',
          command: 'SMGW → Goto → Logged On Clients',
        },
        {
          order: 2,
          action: 'Identificar conexiones zombie',
          command: 'Filter connections idle > 2h',
        },
        {
          order: 3,
          action: 'Cerrar conexiones zombie',
          command: 'SMGW → Delete connection',
        },
      ]),
    },
    {
      organizationId: org.id,
      category: 'SAP_ABAP',
      name: 'ABAP User Session Cleanup (SM04)',
      description:
        'Cierra sesiones de usuario inactivas que consumen work processes',
      costSafe: true,
      autoExecute: false,
      dbType: 'ABAP',
      txCode: 'SM04',
      prereqs: JSON.stringify(['No hay usuarios en transacciones críticas']),
      steps: JSON.stringify([
        {
          order: 1,
          action: 'Listar sesiones activas',
          command: 'SM04 → User overview',
        },
        {
          order: 2,
          action: 'Identificar sesiones idle > 4h',
          command: 'Filter by idle time',
        },
        {
          order: 3,
          action: 'Cerrar sesiones seleccionadas',
          command: 'SM04 → End session with logoff',
        },
      ]),
    },
    {
      organizationId: org.id,
      category: 'SAP_ABAP',
      name: 'ABAP IDoc Reprocessing',
      description: 'Detecta IDocs en error y los reprocesa automáticamente',
      costSafe: true,
      autoExecute: false,
      dbType: 'ABAP',
      txCode: 'BD87',
      prereqs: JSON.stringify([
        'Stack ABAP activo',
        'IDoc interfaces configuradas',
      ]),
      steps: JSON.stringify([
        {
          order: 1,
          action: 'Buscar IDocs en error',
          command: 'BD87 → Select status 51-73 (error range)',
        },
        {
          order: 2,
          action: 'Analizar errores por tipo',
          command: 'Group by IDoc type and error code',
        },
        {
          order: 3,
          action: 'Reprocesar IDocs seleccionados',
          command: 'BD87 → Reprocess selected',
        },
      ]),
    },
    {
      organizationId: org.id,
      category: 'SAP_ABAP',
      name: 'ABAP RFC Destination Health Check',
      description:
        'Prueba conectividad de todas las conexiones RFC registradas',
      costSafe: true,
      autoExecute: true,
      dbType: 'ABAP',
      txCode: 'SM59',
      steps: JSON.stringify([
        {
          order: 1,
          action: 'Listar destinos RFC',
          command: 'SM59 → Display RFC destinations',
        },
        {
          order: 2,
          action: 'Test connection para cada destino',
          command: 'SM59 → Connection Test',
        },
        {
          order: 3,
          action: 'Reportar destinos fallidos',
          command: 'Generate connectivity report',
        },
      ]),
    },
    {
      organizationId: org.id,
      category: 'SAP_ABAP',
      name: 'ABAP Failed Login Monitor (SM20)',
      description:
        'Detecta intentos de login fallidos — posible ataque de fuerza bruta',
      costSafe: true,
      autoExecute: true,
      dbType: 'ABAP',
      txCode: 'SM20',
      steps: JSON.stringify([
        {
          order: 1,
          action: 'Leer Security Audit Log',
          command: 'SM20 → Select Failed Logons',
        },
        {
          order: 2,
          action: 'Detectar patrones de ataque',
          command: 'Group by IP and username',
        },
        {
          order: 3,
          action: 'Alertar si > 10 intentos fallidos',
          command: 'Generate security alert',
        },
      ]),
    },
    {
      organizationId: org.id,
      category: 'SAP_ABAP',
      name: 'ABAP Critical Auth Audit',
      description: 'Revisa usuarios con SAP_ALL o SAP_NEW asignados',
      costSafe: true,
      autoExecute: true,
      dbType: 'ABAP',
      txCode: 'SUIM',
      prereqs: JSON.stringify(['Stack ABAP activo']),
      steps: JSON.stringify([
        {
          order: 1,
          action: 'Buscar usuarios con SAP_ALL',
          command: 'SUIM → Users by Profile → SAP_ALL',
        },
        {
          order: 2,
          action: 'Buscar usuarios con SAP_NEW',
          command: 'SUIM → Users by Profile → SAP_NEW',
        },
        {
          order: 3,
          action: 'Reportar hallazgos',
          command: 'Generate authorization audit report',
        },
      ]),
    },

    // ═══ BW Specific ═══
    {
      organizationId: org.id,
      category: 'SAP_APPS',
      name: 'BW Process Chain Monitor',
      description: 'Detecta cadenas de procesos fallidas o retrasadas en BW',
      costSafe: true,
      autoExecute: true,
      dbType: 'ABAP',
      txCode: 'RSPC',
      steps: JSON.stringify([
        {
          order: 1,
          action: 'Verificar cadenas de hoy',
          command: 'RSPC → Display Log View',
        },
        {
          order: 2,
          action: 'Identificar cadenas fallidas',
          command: 'Filter status = Red / Aborted',
        },
        {
          order: 3,
          action: 'Notificar equipo de BW',
          command: 'Generate process chain alert',
        },
      ]),
    },
    {
      organizationId: org.id,
      category: 'SAP_APPS',
      name: 'BW InfoCube Compression',
      description:
        'Comprime fact tables de InfoCubes para mejorar rendimiento de queries',
      costSafe: true,
      autoExecute: false,
      dbType: 'ABAP',
      txCode: 'RSDRI_INFOCUBE_COMPRESS',
      prereqs: JSON.stringify([
        'No hay cargas activas al InfoCube',
        'Stack BW activo',
      ]),
      steps: JSON.stringify([
        {
          order: 1,
          action: 'Identificar InfoCubes sin comprimir',
          command: 'Check request tab for uncompressed requests',
        },
        {
          order: 2,
          action: 'Ejecutar compresión',
          command: 'RSDRI_INFOCUBE_COMPRESS → Execute',
        },
        {
          order: 3,
          action: 'Verificar resultado',
          command: 'Check F-table row count reduced',
        },
      ]),
    },

    // ═══ Integración SAP PO ═══
    {
      organizationId: org.id,
      category: 'SAP_APPS',
      name: 'PO SOAP/REST Channel Monitor',
      description: 'Verifica canales de comunicación activos en SAP PO',
      costSafe: true,
      autoExecute: true,
      dbType: 'PO',
      steps: JSON.stringify([
        {
          order: 1,
          action: 'Verificar estado de canales',
          command: 'NWA → SOA → Service Explorer',
        },
        {
          order: 2,
          action: 'Identificar canales en error',
          command: 'Filter channels with status ERROR',
        },
        {
          order: 3,
          action: 'Reiniciar canales fallidos',
          command: 'NWA → Restart channel',
        },
      ]),
    },
  ];

  await prisma.runbook.createMany({ data: extraRunbooks });
  const totalRunbooks = 18 + extraRunbooks.length;
  logger.log(
    `  ✓ ${totalRunbooks} runbooks total (18 base + ${extraRunbooks.length} extra)`,
  );

  // ── Runbook Executions ──
  await prisma.runbookExecution.createMany({
    data: [
      {
        runbookId: rb1.id,
        systemId: ep1.id,
        gate: 'SAFE',
        result: 'SUCCESS',
        duration: '2m 15s',
        executedBy: 'operator@acme-corp.com',
        startedAt: daysAgo(2),
        completedAt: daysAgo(2),
      },
      {
        runbookId: rb3.id,
        systemId: ep1.id,
        gate: 'SAFE',
        result: 'SUCCESS',
        duration: '45s',
        executedBy: 'system',
        startedAt: daysAgo(1),
        completedAt: daysAgo(1),
      },
      {
        runbookId: rb2.id,
        systemId: pi1.id,
        gate: 'HUMAN',
        result: 'FAILED',
        duration: '1m 30s',
        detail: 'ICM process did not restart — manual intervention required',
        executedBy: 'operator@acme-corp.com',
        startedAt: ago(3),
        completedAt: ago(3),
      },
      {
        runbookId: rb12.id,
        systemId: ep1.id,
        gate: 'SAFE',
        result: 'SUCCESS',
        duration: '12s',
        detail: 'Limpiados 3 WPs en PRIV mode. CPU bajó a 65%.',
        executedBy: 'system',
        startedAt: ago(5),
        completedAt: ago(5),
      },
      {
        runbookId: rb1.id,
        systemId: eq1.id,
        gate: 'SAFE',
        result: 'SUCCESS',
        duration: '8s',
        detail: 'GC ejecutado. Memoria HANA bajó de 82% a 78%.',
        executedBy: 'system',
        startedAt: ago(4),
        completedAt: ago(4),
      },
      {
        runbookId: rb12.id,
        systemId: eq1.id,
        gate: 'SAFE',
        result: 'SUCCESS',
        duration: '15s',
        detail: '6 sesiones limpiadas. Short dumps reducidos.',
        executedBy: 'system',
        startedAt: ago(6),
        completedAt: ago(6),
      },
      {
        runbookId: rb17.id,
        systemId: ep1.id,
        gate: 'SAFE',
        result: 'SUCCESS',
        duration: '5s',
        detail: 'Job RSUSR002 identificado como lento. Background WP liberado.',
        executedBy: 'system',
        startedAt: ago(8),
        completedAt: ago(8),
      },
      {
        runbookId: rb18.id,
        systemId: sm1.id,
        gate: 'SAFE',
        result: 'SUCCESS',
        duration: '7s',
        detail: '3 transportes bloqueados detectados. Cola limpiada.',
        executedBy: 'system',
        startedAt: ago(9),
        completedAt: ago(9),
      },
      {
        runbookId: rb14.id,
        systemId: ep1.id,
        gate: 'SAFE',
        result: 'SUCCESS',
        duration: '3s',
        detail: 'Certificado ICM vence 25-Mar-2026. Alerta generada.',
        executedBy: 'system',
        startedAt: ago(10),
        completedAt: ago(10),
      },
      {
        runbookId: rb13.id,
        systemId: ed1.id,
        gate: 'SAFE',
        result: 'SUCCESS',
        duration: '4s',
        detail: 'Backup HANA verificado: completo, 12.4 GB.',
        executedBy: 'system',
        startedAt: daysAgo(1),
        completedAt: daysAgo(1),
      },
      {
        runbookId: rb3.id,
        systemId: ep1.id,
        gate: 'SAFE',
        result: 'SUCCESS',
        duration: '45s',
        detail:
          'Spool: 234 eliminados. TEMSE: 89 objetos. Logs: 1.2GB liberados.',
        executedBy: 'system',
        startedAt: daysAgo(1),
        completedAt: daysAgo(1),
      },
      {
        runbookId: rb5.id,
        systemId: bw1.id,
        gate: 'SAFE',
        result: 'SUCCESS',
        duration: '18s',
        detail: 'Transaction log truncado. Uso bajó de 45% a 22%.',
        executedBy: 'system',
        startedAt: ago(3),
        completedAt: ago(3),
      },
      {
        runbookId: rb13.id,
        systemId: bw1.id,
        gate: 'SAFE',
        result: 'SUCCESS',
        duration: '6s',
        detail: 'Backup Oracle RMAN verificado: completo, 8.7 GB.',
        executedBy: 'system',
        startedAt: daysAgo(1),
        completedAt: daysAgo(1),
      },
    ],
  });
  logger.log('  ✓ 13 runbook executions');

  // ══════════════════════════════════════════════
  // APPROVAL REQUESTS
  // ══════════════════════════════════════════════
  await prisma.approvalRequest.createMany({
    data: [
      {
        organizationId: org.id,
        systemId: ep1.id,
        runbookId: rb4.id,
        metric: 'disk_usage',
        value: 88.4,
        severity: 'HIGH',
        status: 'PENDING',
        description: 'Extend /usr/sap on EP1 — disk at 88%',
        requestedBy: 'operator@acme-corp.com',
      },
      {
        organizationId: org.id,
        systemId: pi1.id,
        runbookId: rb2.id,
        severity: 'CRITICAL',
        status: 'APPROVED',
        description: 'Restart ICM on PI1 — integration engine down',
        requestedBy: 'operator@acme-corp.com',
        processedBy: 'admin@acme-corp.com',
        processedAt: ago(2),
      },
      {
        organizationId: org.id,
        systemId: eq1.id,
        severity: 'MEDIUM',
        status: 'REJECTED',
        description: 'Clear transport buffer on EQ1',
        requestedBy: 'viewer@acme-corp.com',
        processedBy: 'admin@acme-corp.com',
        processedAt: daysAgo(3),
        evidence: JSON.stringify({
          reason: 'Transports pending import — not safe to clear',
        }),
      },
    ],
  });
  logger.log('  ✓ 3 approval requests');

  // ══════════════════════════════════════════════
  // OPERATIONS
  // ══════════════════════════════════════════════
  await prisma.operationRecord.createMany({
    data: [
      {
        organizationId: org.id,
        systemId: ep1.id,
        type: 'BACKUP',
        status: 'COMPLETED',
        riskLevel: 'LOW',
        scheduledTime: ago(4),
        completedAt: ago(3.5),
        requestedBy: 'system',
        description: 'Daily full HANA data backup',
        schedule: '0 2 * * *',
      },
      {
        organizationId: org.id,
        systemId: ep1.id,
        type: 'HOUSEKEEPING',
        status: 'SCHEDULED',
        riskLevel: 'LOW',
        scheduledTime: daysFromNow(1),
        requestedBy: 'operator@acme-corp.com',
        description: 'Weekly spool cleanup',
        schedule: '0 6 * * 0',
      },
      {
        organizationId: org.id,
        systemId: pi1.id,
        type: 'RESTART',
        status: 'FAILED',
        riskLevel: 'MEDIUM',
        scheduledTime: ago(3),
        completedAt: ago(2.5),
        requestedBy: 'operator@acme-corp.com',
        description: 'Restart PI1 Java stack',
        error: 'ICM restart timed out after 90 seconds',
      },
      {
        organizationId: org.id,
        systemId: ep1.id,
        type: 'MAINTENANCE',
        status: 'SCHEDULED',
        riskLevel: 'HIGH',
        scheduledTime: daysFromNow(7),
        requestedBy: 'admin@acme-corp.com',
        description: 'Kernel upgrade to patch 102',
      },
      {
        organizationId: org.id,
        systemId: bw1.id,
        type: 'DR_DRILL',
        status: 'COMPLETED',
        riskLevel: 'HIGH',
        scheduledTime: daysAgo(14),
        completedAt: daysAgo(14),
        requestedBy: 'admin@acme-corp.com',
        description: 'Quarterly DR failover drill for BW1',
      },
    ],
  });
  logger.log('  ✓ 5 operations');

  // ══════════════════════════════════════════════
  // JOB RECORDS
  // ══════════════════════════════════════════════
  await prisma.jobRecord.createMany({
    data: [
      {
        systemId: ep1.id,
        jobName: 'SAP_COLLECTOR_FOR_PERFMONITOR',
        jobClass: 'A',
        status: 'running',
        startedAt: ago(0.1),
        client: '100',
        user: 'SAPSYS',
      },
      {
        systemId: ep1.id,
        jobName: 'RDDIMPDP',
        jobClass: 'A',
        status: 'finished',
        startedAt: ago(2),
        duration: '3m 45s',
        client: '100',
        user: 'DDIC',
      },
      {
        systemId: ep1.id,
        jobName: 'ZREP_DAILY_POSTING',
        jobClass: 'B',
        status: 'finished',
        startedAt: ago(4),
        duration: '12m 30s',
        client: '100',
        user: 'BATCH_USER',
      },
      {
        systemId: ep1.id,
        jobName: 'ZREP_MATERIAL_REVAL',
        jobClass: 'B',
        status: 'failed',
        startedAt: ago(6),
        duration: '0m 15s',
        client: '100',
        user: 'BATCH_USER',
        details: JSON.stringify({
          error: 'Short dump DBIF_RSQL_SQL_ERROR',
          abapDump: 'ST22 → 2026-03-11 08:30:00',
        }),
      },
      {
        systemId: bw1.id,
        jobName: 'ZCHAIN_DAILY',
        jobClass: 'A',
        status: 'finished',
        startedAt: ago(8),
        duration: '45m 12s',
        client: '100',
        user: 'BW_BATCH',
      },
      {
        systemId: pi1.id,
        jobName: 'XI_ADAPTER_MONITOR',
        jobClass: 'A',
        status: 'canceled',
        startedAt: ago(3),
        client: '100',
        user: 'PIAPPLUSER',
      },
      {
        systemId: eq1.id,
        jobName: 'RSBTCDEL2',
        jobClass: 'C',
        status: 'scheduled',
        client: '200',
        user: 'SAPSYS',
      },
    ],
  });
  logger.log('  ✓ 7 job records');

  // ══════════════════════════════════════════════
  // TRANSPORT RECORDS
  // ══════════════════════════════════════════════
  await prisma.transportRecord.createMany({
    data: [
      {
        systemId: ep1.id,
        transportId: 'EP1K900042',
        description: 'FI: New G/L account determination',
        owner: 'DEVELOPER1',
        status: 'imported',
        target: 'EQ1',
        rc: 0,
        importedAt: daysAgo(1),
      },
      {
        systemId: ep1.id,
        transportId: 'EP1K900043',
        description: 'MM: Purchase order enhancement',
        owner: 'DEVELOPER2',
        status: 'released',
        target: 'EQ1',
        rc: null,
      },
      {
        systemId: eq1.id,
        transportId: 'EP1K900040',
        description: 'SD: Pricing condition update',
        owner: 'DEVELOPER1',
        status: 'imported',
        target: 'EP1',
        rc: 0,
        importedAt: daysAgo(3),
      },
      {
        systemId: eq1.id,
        transportId: 'EP1K900041',
        description: 'HR: Payroll schema changes',
        owner: 'DEVELOPER3',
        status: 'error',
        target: 'EP1',
        rc: 8,
        importedAt: daysAgo(2),
      },
      {
        systemId: ed1.id,
        transportId: 'ED1K800010',
        description: 'Custom report ZREP_INVENTORY',
        owner: 'DEVELOPER2',
        status: 'modifiable',
      },
    ],
  });
  logger.log('  ✓ 5 transport records');

  // ══════════════════════════════════════════════
  // CERTIFICATE RECORDS
  // ══════════════════════════════════════════════
  await prisma.certificateRecord.createMany({
    data: [
      {
        systemId: ep1.id,
        name: 'EP1 HTTPS Server Cert',
        issuer: 'DigiCert SHA2',
        expiresAt: daysFromNow(180),
        daysLeft: 180,
        status: 'ok',
        type: 'SSL',
      },
      {
        systemId: ep1.id,
        name: 'EP1 SAML IdP Certificate',
        issuer: 'Azure AD',
        expiresAt: daysFromNow(45),
        daysLeft: 45,
        status: 'warning',
        type: 'SAML',
      },
      {
        systemId: pi1.id,
        name: 'PI1 HTTPS Sender Channel',
        issuer: "Let's Encrypt",
        expiresAt: daysFromNow(30),
        daysLeft: 30,
        status: 'warning',
        type: 'SSL',
      },
      {
        systemId: pi1.id,
        name: 'PI1 SNC Certificate',
        issuer: 'SAP Trust Center',
        expiresAt: daysFromNow(365),
        daysLeft: 365,
        status: 'ok',
        type: 'SNC',
      },
      {
        systemId: sm1.id,
        name: 'SM1 HTTPS Server Cert',
        issuer: 'DigiCert SHA2',
        expiresAt: daysFromNow(90),
        daysLeft: 90,
        status: 'ok',
        type: 'SSL',
      },
      {
        systemId: eq1.id,
        name: 'EQ1 HTTPS Server Cert',
        issuer: 'DigiCert SHA2',
        expiresAt: daysFromNow(10),
        daysLeft: 10,
        status: 'critical',
        type: 'SSL',
      },
    ],
  });
  logger.log('  ✓ 6 certificate records');

  // ══════════════════════════════════════════════
  // AUDIT ENTRIES
  // ══════════════════════════════════════════════
  await prisma.auditEntry.createMany({
    data: [
      {
        organizationId: org.id,
        userId: admin.id,
        userEmail: admin.email,
        action: 'system.register',
        resource: `system/${ep1.id}`,
        details: 'Registered SAP system EP1',
        severity: 'info',
        timestamp: daysAgo(30),
      },
      {
        organizationId: org.id,
        userId: admin.id,
        userEmail: admin.email,
        action: 'system.register',
        resource: `system/${pi1.id}`,
        details: 'Registered SAP system PI1',
        severity: 'info',
        timestamp: daysAgo(30),
      },
      {
        organizationId: org.id,
        userId: admin.id,
        userEmail: admin.email,
        action: 'user.create',
        resource: `user/${operator.id}`,
        details: 'Created user operator@acme-corp.com with role operator',
        severity: 'info',
        timestamp: daysAgo(28),
      },
      {
        organizationId: org.id,
        userId: operator.id,
        userEmail: operator.email,
        action: 'alert.acknowledge',
        resource: 'alert/eq1-disk',
        details: 'Acknowledged EQ1 disk space alert',
        severity: 'info',
        timestamp: ago(2),
      },
      {
        organizationId: org.id,
        userId: admin.id,
        userEmail: admin.email,
        action: 'approval.approve',
        resource: 'approval/pi1-restart',
        details: 'Approved ICM restart on PI1',
        severity: 'warning',
        timestamp: ago(2),
      },
      {
        organizationId: org.id,
        userId: operator.id,
        userEmail: operator.email,
        action: 'runbook.execute',
        resource: `runbook/${rb1.id}`,
        details: 'Executed HANA Log Backup Cleanup on EP1',
        severity: 'info',
        timestamp: daysAgo(2),
      },
    ],
  });
  logger.log('  ✓ 6 audit entries');

  // ══════════════════════════════════════════════
  // API KEYS
  // ══════════════════════════════════════════════
  const demoApiKey = process.env.DEMO_API_KEY || 'sk-spektra-demo-key-12345678';
  const keyHash = await bcrypt.hash(demoApiKey, 12);
  await prisma.apiKey.create({
    data: {
      organizationId: org.id,
      name: 'Demo API Key',
      keyHash,
      prefix: 'sk-spekt',
      status: 'active',
    },
  });
  logger.log('  ✓ 1 API key');

  // ══════════════════════════════════════════════
  logger.log('\n✅ Seed completed successfully!\n');
  logger.log('   Login credentials (all passwords: admin123):');
  logger.log('   admin@acme-corp.com     → role: admin');
  logger.log('   escalation@acme-corp.com → role: escalation');
  logger.log('   operator@acme-corp.com  → role: operator');
  logger.log('   viewer@acme-corp.com    → role: viewer');
  logger.log('');
  logger.log(
    '   Systems: EP1, EQ1, ED1, BW1, SM1, PI1, RS1, GR1, CR1, EW1, MX1, SO1',
  );
}

main()
  .catch((e) => {
    logger.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
