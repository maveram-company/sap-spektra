// ============================================================================
//  Avvale SAP AlwaysOps v1.0 — Mock Data para pruebas locales sin AWS
//  Uso: MOCK=true node server.js
// ============================================================================

'use strict';

// ── Instancias EC2 simuladas (basadas en entorno real) ──
const EC2_INSTANCES = [
  {
    instanceId: 'i-0a1b2c3d4e5f00001',
    name: 'OMP',
    instanceType: 'r5.xlarge',
    state: 'running',
    platform: 'Windows',
    platformName: 'Windows Server 2019',
    privateIp: '10.0.1.10',
    publicIp: '',
    vpcId: 'vpc-0abc123def456',
    subnetId: 'subnet-0aaa111bbb',
    isOnline: true,
    ssmStatus: 'Online'
  },
  {
    instanceId: 'i-0a1b2c3d4e5f00002',
    name: 'OCP',
    instanceType: 'r5.xlarge',
    state: 'running',
    platform: 'Linux',
    platformName: 'SUSE Linux Enterprise Server 15',
    privateIp: '10.0.1.20',
    publicIp: '',
    vpcId: 'vpc-0abc123def456',
    subnetId: 'subnet-0aaa111bbb',
    isOnline: true,
    ssmStatus: 'Online'
  },
  {
    instanceId: 'i-0a1b2c3d4e5f00003',
    name: 'OAP',
    instanceType: 'r5.large',
    state: 'running',
    platform: 'Linux',
    platformName: 'SUSE Linux Enterprise Server 15',
    privateIp: '10.0.1.30',
    publicIp: '',
    vpcId: 'vpc-0abc123def456',
    subnetId: 'subnet-0bbb222ccc',
    isOnline: true,
    ssmStatus: 'Online'
  },
  {
    instanceId: 'i-0a1b2c3d4e5f00004',
    name: 'SolutionManager',
    instanceType: 'r5.large',
    state: 'running',
    platform: 'Windows',
    platformName: 'Windows Server 2019',
    privateIp: '10.0.1.40',
    publicIp: '',
    vpcId: 'vpc-0abc123def456',
    subnetId: 'subnet-0bbb222ccc',
    isOnline: true,
    ssmStatus: 'Online'
  },
  {
    instanceId: 'i-0a1b2c3d4e5f00005',
    name: 'OMR',
    instanceType: 'r5.large',
    state: 'running',
    platform: 'Linux',
    platformName: 'Red Hat Enterprise Linux 8',
    privateIp: '10.0.2.10',
    publicIp: '',
    vpcId: 'vpc-0abc123def456',
    subnetId: 'subnet-0ccc333ddd',
    isOnline: false,
    ssmStatus: 'ConnectionLost'
  },
  {
    instanceId: 'i-0a1b2c3d4e5f00010',
    name: 'BWP',
    instanceType: 'r5.2xlarge',
    state: 'running',
    platform: 'Linux',
    platformName: 'SUSE Linux Enterprise Server 15',
    privateIp: '10.0.3.10',
    publicIp: '',
    vpcId: 'vpc-0abc123def456',
    subnetId: 'subnet-0ddd444eee',
    isOnline: true,
    ssmStatus: 'Online'
  },
  {
    instanceId: 'i-0a1b2c3d4e5f00011',
    name: 'CRP',
    instanceType: 'r5.xlarge',
    state: 'running',
    platform: 'Linux',
    platformName: 'Red Hat Enterprise Linux 8',
    privateIp: '10.0.3.20',
    publicIp: '',
    vpcId: 'vpc-0abc123def456',
    subnetId: 'subnet-0ddd444eee',
    isOnline: true,
    ssmStatus: 'Online'
  },
  {
    instanceId: 'i-0a1b2c3d4e5f00012',
    name: 'GRC',
    instanceType: 'r5.large',
    state: 'running',
    platform: 'Windows',
    platformName: 'Windows Server 2022',
    privateIp: '10.0.3.30',
    publicIp: '',
    vpcId: 'vpc-0abc123def456',
    subnetId: 'subnet-0eee555fff',
    isOnline: true,
    ssmStatus: 'Online'
  },
  {
    instanceId: 'i-0a1b2c3d4e5f00013',
    name: 'POP',
    instanceType: 'r5.large',
    state: 'running',
    platform: 'Linux',
    platformName: 'Red Hat Enterprise Linux 9',
    privateIp: '10.0.3.40',
    publicIp: '',
    vpcId: 'vpc-0abc123def456',
    subnetId: 'subnet-0eee555fff',
    isOnline: true,
    ssmStatus: 'Online'
  }
];

// ── Resultados de discovery SAP por instancia ──
const SAP_DISCOVERY = {
  'i-0a1b2c3d4e5f00001': {
    success: true,
    discovery: {
      sids: ['OMP'],
      hana: { found: false },
      maxdb: { found: true, version: '7.9.10' },
      profile: { found: true, path: 'D:\\usr\\sap\\OMP\\SYS\\profile\\DEFAULT.PFL' },
      ports: [3200, 3300, 3600, 8000, 8443, 7210],
      network: { hostname: 'sap-omp-prd', ip: '10.0.1.10' },
      services: [
        { name: 'SAPDBTech-OMP', status: 'running', type: 'MaxDB' },
        { name: 'SAPOMP_00', status: 'running', type: 'SAP Instance' },
        { name: 'SAPOMP_01', status: 'running', type: 'SAP Instance' }
      ],
      suggested: {
        sid: 'OMP',
        dbType: 'MAXDB',
        osType: 'windows',
        dbHost: '10.0.1.10',
        dbPort: '7210',
        dbUser: 'SUPERDBA',
        sapClient: '001',
        sapUser: 'SAP_MONITOR'
      }
    }
  },
  'i-0a1b2c3d4e5f00002': {
    success: true,
    discovery: {
      sids: ['OCP'],
      hana: { found: true, globalIni: '/usr/sap/OCP/SYS/global/hdb/custom/config/global.ini', version: '2.00.070' },
      profile: { found: true, path: '/usr/sap/OCP/SYS/profile/DEFAULT.PFL' },
      ports: [30013, 30015, 30017, 3200, 3300, 8000, 50013, 50014],
      network: { hostname: 'sap-ocp-qas', ip: '10.0.1.20' },
      services: [
        { name: 'HDBOCP', status: 'active', type: 'HANA DB' },
        { name: 'SAPOCP_00', status: 'active', type: 'SAP Instance' },
        { name: 'sapstartsrv', status: 'active', type: 'SAP Start Service' }
      ],
      suggested: {
        sid: 'OCP',
        dbType: 'HANA',
        osType: 'linux',
        dbHost: '10.0.1.20',
        dbPort: '30015',
        dbUser: 'SYSTEM',
        sapClient: '001',
        sapUser: 'SAP_MONITOR'
      }
    }
  },
  'i-0a1b2c3d4e5f00003': {
    success: true,
    discovery: {
      sids: ['OAP'],
      hana: { found: true, globalIni: '/usr/sap/OAP/SYS/global/hdb/custom/config/global.ini', version: '2.00.065' },
      profile: { found: true, path: '/usr/sap/OAP/SYS/profile/DEFAULT.PFL' },
      ports: [30013, 30015, 3200, 8000],
      network: { hostname: 'sap-oap-dev', ip: '10.0.1.30' },
      services: [
        { name: 'HDBOAP', status: 'active', type: 'HANA DB' },
        { name: 'SAPOAP_00', status: 'active', type: 'SAP Instance' }
      ],
      suggested: {
        sid: 'OAP',
        dbType: 'HANA',
        osType: 'linux',
        dbHost: '10.0.1.30',
        dbPort: '30015',
        dbUser: 'SYSTEM',
        sapClient: '001',
        sapUser: 'SAP_MONITOR'
      }
    }
  },
  'i-0a1b2c3d4e5f00004': {
    success: true,
    discovery: {
      sids: ['SOL'],
      hana: { found: false },
      maxdb: { found: true, version: '7.9.09' },
      profile: { found: true, path: 'D:\\usr\\sap\\SOL\\SYS\\profile\\DEFAULT.PFL' },
      ports: [3200, 3600, 8000, 7210],
      network: { hostname: 'sap-solman', ip: '10.0.1.40' },
      services: [
        { name: 'SAPDBTech-SOL', status: 'running', type: 'MaxDB' },
        { name: 'SAPSOL_00', status: 'running', type: 'SAP Instance' }
      ],
      suggested: {
        sid: 'SOL',
        dbType: 'MAXDB',
        osType: 'windows',
        dbHost: '10.0.1.40',
        dbPort: '7210',
        dbUser: 'SUPERDBA',
        sapClient: '001',
        sapUser: 'SAP_MONITOR'
      }
    }
  },
  'i-0a1b2c3d4e5f00005': {
    success: false,
    error: 'SSM agent offline — instancia no responde'
  },
  'i-0a1b2c3d4e5f00010': {
    success: true,
    discovery: {
      sids: ['BWP'],
      hana: { found: false },
      ase: { found: true, version: '16.0 SP04 PL08' },
      profile: { found: true, path: '/usr/sap/BWP/SYS/profile/DEFAULT.PFL' },
      ports: [3200, 3300, 5000, 8000],
      network: { hostname: 'sap-bwp-prd', ip: '10.0.3.10' },
      services: [
        { name: 'SYBWP', status: 'active', type: 'ASE DB' },
        { name: 'SAPBWP_00', status: 'active', type: 'SAP Instance' }
      ],
      suggested: {
        sid: 'BWP',
        dbType: 'ASE',
        osType: 'linux',
        dbHost: '10.0.3.10',
        dbPort: '5000',
        dbUser: 'sapsa',
        sapClient: '001',
        sapUser: 'SAP_MONITOR'
      }
    }
  },
  'i-0a1b2c3d4e5f00011': {
    success: true,
    discovery: {
      sids: ['CRP'],
      hana: { found: false },
      oracle: { found: true, version: '19.18.0.0' },
      profile: { found: true, path: '/usr/sap/CRP/SYS/profile/DEFAULT.PFL' },
      ports: [3200, 3300, 1521, 8000],
      network: { hostname: 'sap-crp-prd', ip: '10.0.3.20' },
      services: [
        { name: 'OracleCRP', status: 'active', type: 'Oracle DB' },
        { name: 'SAPCRP_00', status: 'active', type: 'SAP Instance' }
      ],
      suggested: {
        sid: 'CRP',
        dbType: 'ORACLE',
        osType: 'linux',
        dbHost: '10.0.3.20',
        dbPort: '1521',
        dbUser: 'MONITORING',
        sapClient: '001',
        sapUser: 'SAP_MONITOR'
      }
    }
  },
  'i-0a1b2c3d4e5f00012': {
    success: true,
    discovery: {
      sids: ['GRC'],
      hana: { found: false },
      mssql: { found: true, version: 'SQL Server 2019 CU25' },
      profile: { found: true, path: 'D:\\usr\\sap\\GRC\\SYS\\profile\\DEFAULT.PFL' },
      ports: [3200, 3300, 1433, 8000],
      network: { hostname: 'sap-grc-qas', ip: '10.0.3.30' },
      services: [
        { name: 'MSSQLSERVER', status: 'running', type: 'MSSQL DB' },
        { name: 'SAPGRC_00', status: 'running', type: 'SAP Instance' }
      ],
      suggested: {
        sid: 'GRC',
        dbType: 'MSSQL',
        osType: 'windows',
        dbHost: '10.0.3.30',
        dbPort: '1433',
        dbUser: 'SAP_MONITOR',
        sapClient: '001',
        sapUser: 'SAP_MONITOR'
      }
    }
  },
  'i-0a1b2c3d4e5f00013': {
    success: true,
    discovery: {
      sids: ['POP'],
      hana: { found: false },
      db2: { found: true, version: '11.5.8.0' },
      profile: { found: true, path: '/usr/sap/POP/SYS/profile/DEFAULT.PFL' },
      ports: [3200, 3300, 50000, 8000],
      network: { hostname: 'sap-pop-prd', ip: '10.0.3.40' },
      services: [
        { name: 'db2sysc-POP', status: 'active', type: 'DB2 DB' },
        { name: 'SAPPOP_00', status: 'active', type: 'SAP Instance' }
      ],
      suggested: {
        sid: 'POP',
        dbType: 'DB2',
        osType: 'linux',
        dbHost: '10.0.3.40',
        dbPort: '50000',
        dbUser: 'db2pop',
        sapClient: '001',
        sapUser: 'SAP_MONITOR'
      }
    }
  }
};

// ── Deploy mock: simula los 8 pasos del despliegue ──
let mockDeployState = null;

function startMockDeploy() {
  mockDeployState = {
    status: 'running',
    currentStep: 0,
    totalSteps: 8,
    logs: ['[MOCK] Iniciando despliegue simulado...'],
    startTime: Date.now(),
    result: null
  };

  const stepNames = [
    'Validando configuracion',
    'Creando secretos en Secrets Manager',
    'Desplegando stack CloudFormation',
    'Verificando SES (email)',
    'Construyendo frontend',
    'Subiendo a S3',
    'Creando usuario Cognito',
    'Verificacion final'
  ];

  // Avanzar un paso cada 3 segundos
  let step = 0;
  const advance = () => {
    if (!mockDeployState || mockDeployState.status !== 'running') return;
    step++;
    if (step < 8) {
      mockDeployState.currentStep = step;
      mockDeployState.logs.push('[MOCK] Paso ' + (step + 1) + '/8: ' + stepNames[step] + '...');
      setTimeout(advance, 2000 + Math.random() * 2000);
    } else {
      // Completado
      mockDeployState.status = 'completed';
      mockDeployState.currentStep = 8;
      mockDeployState.logs.push('[MOCK] ✓ Despliegue completado exitosamente');
      mockDeployState.result = {
        dashboardUrl: 'https://d1234567890.cloudfront.net',
        apiUrl: 'https://abc123xyz.lambda-url.us-east-1.on.aws',
        stackId: 'arn:aws:cloudformation:us-east-1:123456789012:stack/sap-alwaysops/mock-' + Date.now(),
        cognitoUser: 'admin@empresa.com',
        region: 'us-east-1'
      };
    }
  };
  setTimeout(advance, 2500);
}

// ── Middleware mock: intercepta todos los endpoints API ──
function mockMiddleware(req, res, next) {
  const url = req.path;
  const method = req.method;

  // Simular latencia de red (200-600ms)
  const delay = 200 + Math.floor(Math.random() * 400);

  // ── Mock status (para que el frontend sepa que estamos en mock) ──
  if (url === '/api/mock/status' && method === 'GET') {
    return res.json({ mock: true });
  }

  // ── Sistema / Prerequisitos ──
  if (url === '/api/system/info' && method === 'GET') {
    return setTimeout(() => res.json({
      os: 'macOS 15.3 (Tahoe)',
      platform: 'darwin',
      arch: 'arm64',
      nodeVersion: process.version,
      hostname: 'MacBook-Pro.local'
    }), delay);
  }

  if (url === '/api/prereqs/check' && method === 'GET') {
    return setTimeout(() => res.json({
      node: true, nodeVersion: process.version,
      git: true, gitVersion: 'git version 2.43.0',
      awscli: true, awscliVersion: 'aws-cli/2.15.0'
    }), delay);
  }

  if (url === '/api/prereqs/install-method' && method === 'GET') {
    return setTimeout(() => res.json({
      autoInstallable: false,
      command: 'brew install awscli',
      instructions: 'brew install awscli'
    }), delay);
  }

  // ── AWS Profiles ──
  if (url === '/api/aws/profiles' && method === 'GET') {
    return setTimeout(() => res.json({
      profiles: ['default', 'sap-alwaysops', 'sap-alwaysops-sso']
    }), delay);
  }

  if (url === '/api/aws/sso/profiles' && method === 'GET') {
    return setTimeout(() => res.json({
      profiles: [{
        name: 'sap-alwaysops-sso',
        ssoStartUrl: 'https://avvale.awsapps.com/start',
        ssoRegion: 'us-east-1',
        ssoAccountId: '123456789012',
        ssoRoleName: 'AdministratorAccess',
        region: 'us-east-1'
      }]
    }), delay);
  }

  // ── Credenciales ──
  if (url === '/api/aws/credentials/validate' && method === 'POST') {
    return setTimeout(() => res.json({
      success: true,
      accountId: '123456789012',
      arn: 'arn:aws:iam::123456789012:user/mock-admin',
      region: req.body.region || 'us-east-1'
    }), delay);
  }

  if (url === '/api/aws/credentials/save' && method === 'POST') {
    return setTimeout(() => res.json({ success: true }), delay);
  }

  if (url === '/api/aws/sso/validate' && method === 'POST') {
    return setTimeout(() => res.json({
      success: true,
      account: '123456789012',
      arn: 'arn:aws:sts::123456789012:assumed-role/AWSReservedSSO_AdministratorAccess/mock-user',
      region: 'us-east-1'
    }), delay);
  }

  // ── AWS Check + Permisos ──
  if (url === '/api/aws/check' && method === 'GET') {
    return setTimeout(() => res.json({
      accountId: '123456789012',
      arn: 'arn:aws:sts::123456789012:assumed-role/AWSReservedSSO_AdministratorAccess/mock-user',
      region: 'us-east-1'
    }), delay);
  }

  if (url === '/api/aws/permissions/check' && method === 'POST') {
    return setTimeout(() => res.json({
      success: true,
      checks: [
        { service: 'CloudFormation', action: 'ListStacks', allowed: true },
        { service: 'EC2', action: 'DescribeRegions', allowed: true },
        { service: 'Cognito', action: 'ListUserPools', allowed: true },
        { service: 'SES', action: 'GetIdentityVerification', allowed: true },
        { service: 'Secrets Manager', action: 'ListSecrets', allowed: true },
        { service: 'SSM', action: 'DescribeInstances', allowed: true },
        { service: 'Bedrock', action: 'ListModels', allowed: true },
        { service: 'S3', action: 'ListBuckets', allowed: true }
      ],
      allowed: 8, total: 8, allOk: true,
      requiredOk: true, missingRequired: [], missingOptional: [],
      summary: '8/8 servicios accesibles'
    }), delay);
  }

  // ── Discovery EC2 ──
  if (url === '/api/aws/discover' && method === 'GET') {
    return setTimeout(() => res.json({
      success: true,
      region: req.query.region || 'us-east-1',
      discovery: {
        ec2Instances: EC2_INSTANCES,
        ssmInstances: EC2_INSTANCES.filter(i => i.isOnline),
        vpcs: [
          { vpcId: 'vpc-0abc123def456', cidr: '10.0.0.0/16', name: 'SAP-VPC' }
        ],
        bedrockAvailable: true
      }
    }), delay + 500); // Discovery tarda un poco mas
  }

  // ── SSM Instances ──
  if (url === '/api/sap/ssm-instances' && method === 'GET') {
    return setTimeout(() => res.json({
      success: true,
      instances: EC2_INSTANCES.filter(i => i.isOnline)
    }), delay);
  }

  // ── SAP Discovery (SSM scan) ──
  if (url === '/api/sap/discover' && method === 'POST') {
    const instanceId = req.body.instanceId;
    const mockResult = SAP_DISCOVERY[instanceId];

    if (mockResult) {
      // Simular delay del SSM (15-30 seg comprimidos a 2-4 seg para testing)
      return setTimeout(() => res.json(mockResult), 2000 + Math.random() * 2000);
    } else {
      return setTimeout(() => res.json({
        success: false,
        error: 'Instancia ' + instanceId + ' no encontrada en mock data'
      }), delay);
    }
  }

  // ── DB Test Connection ──
  if (url === '/api/test/db-connection' && method === 'POST') {
    const host = req.body.host;
    if (host && req.body.password) {
      return setTimeout(() => res.json({ success: true, message: 'Conexion simulada exitosa' }), delay);
    } else {
      return setTimeout(() => res.status(400).json({ error: 'Se requiere host y contrasena' }), delay);
    }
  }

  // ── Regions ──
  if (url === '/api/aws/regions' && method === 'GET') {
    return setTimeout(() => res.json({
      success: true,
      regions: ['us-east-1', 'us-east-2', 'us-west-2', 'eu-west-1', 'eu-central-1', 'sa-east-1']
    }), delay);
  }

  // ── Deploy ──
  if (url === '/api/deploy/start' && method === 'POST') {
    startMockDeploy();
    return setTimeout(() => res.json({ success: true, message: 'Despliegue mock iniciado' }), delay);
  }

  if (url === '/api/deploy/status' && method === 'GET') {
    if (!mockDeployState) {
      return res.json({ status: 'idle' });
    }
    const offset = parseInt(req.query.offset) || 0;
    const newLogs = mockDeployState.logs.slice(offset);
    return res.json({
      status: mockDeployState.status,
      currentStep: mockDeployState.currentStep,
      totalSteps: mockDeployState.totalSteps,
      logs: newLogs,
      result: mockDeployState.result,
      error: mockDeployState.error
    });
  }

  if (url === '/api/deploy/cancel' && method === 'POST') {
    if (mockDeployState) {
      mockDeployState.status = 'cancelled';
      mockDeployState.logs.push('[MOCK] Despliegue cancelado por el usuario');
    }
    return res.json({ success: true });
  }

  if (url === '/api/deploy/retry' && method === 'POST') {
    startMockDeploy();
    return setTimeout(() => res.json({ success: true }), delay);
  }

  // ── Health ──
  if (url === '/api/deploy/health' && method === 'GET') {
    return setTimeout(() => res.json({
      dashboardUrl: 'https://d1234567890.cloudfront.net',
      apiUrl: 'https://abc123xyz.lambda-url.us-east-1.on.aws',
      checks: [
        { name: 'CloudFormation Stack', status: 'healthy', healthy: true, detail: 'CREATE_COMPLETE' },
        { name: 'Lambda Functions (18)', status: 'healthy', healthy: true, detail: 'Todas activas' },
        { name: 'DynamoDB Tables (11)', status: 'healthy', healthy: true, detail: 'ACTIVE' },
        { name: 'S3 Frontend', status: 'healthy', healthy: true, detail: 'Bucket accesible' },
        { name: 'CloudFront CDN', status: 'healthy', healthy: true, detail: 'Deployed' },
        { name: 'Cognito Auth', status: 'healthy', healthy: true, detail: '1 usuario creado' },
        { name: 'KMS Encryption', status: 'healthy', healthy: true, detail: 'Key activa' },
        { name: 'SNS Topics (3)', status: 'healthy', healthy: true, detail: 'Suscritos' },
        { name: 'EventBridge Rules (9)', status: 'healthy', healthy: true, detail: 'ENABLED' },
        { name: 'SSM Connection', status: 'healthy', healthy: true, detail: '4 instancias Online' }
      ]
    }), delay + 500);
  }

  // ── Teardown ──
  if (url === '/api/deploy/teardown' && method === 'POST') {
    return setTimeout(() => res.json({ success: true, message: 'Stack eliminado (mock)' }), 3000);
  }

  // ── Report ──
  if (url === '/api/deploy/report' && method === 'GET') {
    const report = {
      generatedAt: new Date().toISOString(),
      mode: 'MOCK',
      stack: 'sap-alwaysops-mock',
      region: 'us-east-1',
      account: '123456789012',
      dashboardUrl: 'https://d1234567890.cloudfront.net',
      apiUrl: 'https://abc123xyz.lambda-url.us-east-1.on.aws',
      resources: {
        cloudformation: { stackName: 'sap-alwaysops-mock', status: 'CREATE_COMPLETE' },
        lambdas: { count: 18, status: 'Active' },
        dynamodb: { count: 11, status: 'ACTIVE' },
        s3: { bucket: 'sap-alwaysops-mock-frontend', status: 'Accessible' },
        cloudfront: { distributionId: 'E1234567890', status: 'Deployed' },
        cognito: { userPoolId: 'us-east-1_MockPool', users: 1 },
        kms: { keyId: 'mock-key-id', status: 'Enabled' },
        sns: { topics: 3, subscribed: true },
        eventbridge: { rules: 9, status: 'ENABLED' },
        ssm: { instancesOnline: 4 }
      },
      systems: EC2_INSTANCES.filter(i => i.isOnline).map(i => ({
        name: i.name,
        instanceId: i.instanceId,
        platform: i.platform,
        status: i.ssmStatus
      })),
      costEstimate: { base: 6.50, perServer: 1.45, servers: 1, total: 7.95 }
    };
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename=sap-alwaysops-report.json');
    return res.json(report);
  }

  // ── Mock Dashboard (servir archivo HTML completo) ──
  if (url === '/mock/dashboard' && method === 'GET') {
    const path = require('path');
    const fs = require('fs');
    const dashPath = path.join(__dirname, '..', 'public', 'mock-dashboard.html');
    try {
      const html = fs.readFileSync(dashPath, 'utf8');
      res.setHeader('Content-Type', 'text/html');
      return res.send(html);
    } catch(e) {
      return res.status(500).send('Error cargando mock dashboard: ' + e.message);
    }
  }

  // ── Deep Discovery (invoca discovery-engine Lambda mock) ──
  if (url === '/api/sap/discover-deep' && method === 'POST') {
    const instanceIds = req.body.instanceIds || [];
    return setTimeout(() => res.json({
      success: true,
      instancesDiscovered: instanceIds.length,
      landscapesDetected: 1,
      instances: instanceIds.map((id, i) => ({
        instanceId: id,
        hostname: `sap-host-${i + 1}`,
        ip: `10.0.${i + 1}.100`,
        os: 'linux',
        sids: ['PRD'],
        product: i === 0 ? 'SAP HANA' : 'SAP NetWeaver',
        role: i === 0 ? 'HANA Primary' : (i === 1 ? 'ASCS' : 'PAS'),
        ruleId: i === 0 ? 'HANA_PRIMARY' : (i === 1 ? 'ASCS' : 'PAS'),
        confidence: 'high',
        kernelVersion: { release: '753', patchNumber: '1200' },
        haCluster: i < 2 ? { type: 'pacemaker', localRole: i === 0 ? 'master' : 'slave' } : null,
        discoveredAt: new Date().toISOString(),
      })),
      landscapes: {
        PRD: {
          sid: 'PRD',
          instances: instanceIds.map((id, i) => ({
            instanceId: id,
            role: i === 0 ? 'HANA Primary' : (i === 1 ? 'ASCS' : 'PAS'),
            product: i === 0 ? 'SAP HANA' : 'SAP NetWeaver',
          }))
        }
      },
      duration: `${delay + 500}ms`,
    }), delay + 500);
  }

  // ── Client error logging ──
  if (url === '/api/client-error' && method === 'POST') {
    console.log('[MOCK][Client Error]', req.body.msg);
    return res.json({ ok: true });
  }

  // No es una ruta API mock — continuar al siguiente middleware
  next();
}

module.exports = { mockMiddleware, EC2_INSTANCES, SAP_DISCOVERY };
