import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Clean existing data
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

  // ── Plans ──
  const plans = await Promise.all([
    prisma.plan.create({
      data: {
        tier: 'starter',
        name: 'Starter',
        price: 0,
        features: JSON.stringify(['monitoring', 'alerts', 'dashboard']),
        limits: JSON.stringify({ maxSystems: 3, maxUsers: 5 }),
      },
    }),
    prisma.plan.create({
      data: {
        tier: 'professional',
        name: 'Professional',
        price: 29900,
        features: JSON.stringify(['monitoring', 'alerts', 'dashboard', 'runbooks', 'approvals', 'analytics', 'api']),
        limits: JSON.stringify({ maxSystems: 25, maxUsers: 50 }),
      },
    }),
    prisma.plan.create({
      data: {
        tier: 'enterprise',
        name: 'Enterprise',
        price: 99900,
        features: JSON.stringify(['monitoring', 'alerts', 'dashboard', 'runbooks', 'approvals', 'analytics', 'api', 'sso', 'audit', 'ha-dr', 'custom-connectors']),
        limits: JSON.stringify({ maxSystems: -1, maxUsers: -1 }),
      },
    }),
  ]);

  console.log(`  ✓ ${plans.length} plans created`);

  // ── Organization ──
  const org = await prisma.organization.create({
    data: {
      name: 'ACME Corp',
      slug: 'acme-corp',
      plan: 'professional',
      timezone: 'America/Bogota',
      language: 'es',
    },
  });
  console.log(`  ✓ Organization: ${org.name}`);

  // ── Users ──
  const passwordHash = await bcrypt.hash('admin123', 12);

  const adminUser = await prisma.user.create({
    data: {
      email: 'admin@acme-corp.com',
      name: 'Carlos Admin',
      passwordHash,
      status: 'active',
    },
  });

  const operatorUser = await prisma.user.create({
    data: {
      email: 'operator@acme-corp.com',
      name: 'Maria Operator',
      passwordHash,
      status: 'active',
    },
  });

  const viewerUser = await prisma.user.create({
    data: {
      email: 'viewer@acme-corp.com',
      name: 'Juan Viewer',
      passwordHash,
      status: 'active',
    },
  });

  await prisma.membership.createMany({
    data: [
      { userId: adminUser.id, organizationId: org.id, role: 'admin' },
      { userId: operatorUser.id, organizationId: org.id, role: 'operator' },
      { userId: viewerUser.id, organizationId: org.id, role: 'viewer' },
    ],
  });

  console.log(`  ✓ 3 users created (admin/operator/viewer)`);

  // ── SAP Systems ──
  const ep1 = await prisma.system.create({
    data: {
      organizationId: org.id,
      sid: 'EP1',
      description: 'ERP Production — S/4HANA',
      sapProduct: 'S/4HANA',
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
      sapProduct: 'S/4HANA',
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

  const bw1 = await prisma.system.create({
    data: {
      organizationId: org.id,
      sid: 'BW1',
      description: 'BW/4HANA Analytics',
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
      description: 'Solution Manager',
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
      description: 'Process Integration / Orchestration',
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

  console.log(`  ✓ 5 SAP systems created (EP1, EQ1, BW1, SM1, PI1)`);

  // ── Hosts ──
  const hostEp1 = await prisma.host.create({
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

  await prisma.host.create({
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

  console.log(`  ✓ 3 hosts created`);

  // ── Components ──
  const abapComp = await prisma.component.create({
    data: {
      systemId: ep1.id,
      name: 'ABAP Application Server',
      type: 'ABAP',
      version: 'S/4HANA 2023',
      status: 'active',
    },
  });

  const dbComp = await prisma.component.create({
    data: {
      systemId: ep1.id,
      name: 'HANA Database',
      type: 'DB',
      version: 'HANA 2.0 SPS07',
      status: 'active',
    },
  });

  console.log(`  ✓ 2 components created`);

  // ── Instances ──
  await prisma.instance.createMany({
    data: [
      {
        systemId: ep1.id,
        componentId: abapComp.id,
        hostId: hostEp1.id,
        instanceNr: '00',
        type: 'PAS',
        role: 'Dialog',
        status: 'active',
      },
      {
        systemId: ep1.id,
        componentId: abapComp.id,
        hostId: hostEp1.id,
        instanceNr: '01',
        type: 'AAS',
        role: 'Batch',
        status: 'active',
      },
      {
        systemId: ep1.id,
        componentId: dbComp.id,
        hostId: hostEp1Db.id,
        instanceNr: '02',
        type: 'HANA',
        role: 'Database',
        status: 'active',
      },
    ],
  });

  console.log(`  ✓ 3 instances created`);

  // ── Alerts ──
  await prisma.alert.createMany({
    data: [
      {
        organizationId: org.id,
        systemId: ep1.id,
        title: 'High CPU usage on EP1 app server',
        message: 'CPU usage exceeded 85% threshold for 10 minutes',
        level: 'warning',
        status: 'active',
        escalation: 'L1',
      },
      {
        organizationId: org.id,
        systemId: pi1.id,
        title: 'PI1 Integration Engine not responding',
        message: 'Java stack health check failed — ICM process not responding',
        level: 'critical',
        status: 'active',
        escalation: 'L2',
      },
      {
        organizationId: org.id,
        systemId: eq1.id,
        title: 'EQ1 disk space below 15%',
        message: '/usr/sap filesystem at 87% capacity',
        level: 'warning',
        status: 'acknowledged',
        acknowledged: true,
        ackBy: 'operator@acme-corp.com',
        ackAt: new Date(),
      },
    ],
  });

  console.log(`  ✓ 3 alerts created`);

  // ── Connectors ──
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
        systemId: pi1.id,
        method: 'Spektra Agent',
        status: 'disconnected',
        latencyMs: null,
        version: '1.1.0',
        lastHeartbeat: new Date(Date.now() - 3600000),
      },
    ],
  });

  console.log(`  ✓ 2 connectors created`);

  // ── Audit Entry ──
  await prisma.auditEntry.create({
    data: {
      organizationId: org.id,
      userId: adminUser.id,
      userEmail: adminUser.email,
      action: 'system.register',
      resource: `system/${ep1.id}`,
      details: 'Registered SAP system EP1',
      severity: 'info',
    },
  });

  console.log(`  ✓ 1 audit entry created`);
  console.log('');
  console.log('✅ Seed completed successfully!');
  console.log('');
  console.log('   Login credentials:');
  console.log('   admin@acme-corp.com / admin123');
  console.log('   operator@acme-corp.com / admin123');
  console.log('   viewer@acme-corp.com / admin123');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
