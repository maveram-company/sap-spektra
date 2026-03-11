#!/usr/bin/env node
// ============================================================================
//  Avvale SAP AlwaysOps v1.0 — Setup Portal v2.0
//  Wizard de despliegue 100% automatizado (10 pasos, 3 fases)
//  Ejecutar: npm run setup (desde la carpeta /setup)
// ============================================================================

'use strict';

const express = require('express');
const path = require('path');
const { execSync } = require('child_process');

// ── Modulos del Setup Portal ──
const { getDeployState, setDeployState, resetDeployState, addLog, createClients,
        getInstallState, getRegionLabel } = require('./lib/utils');
const { getSystemInfo, checkPrereqs, getInstallMethod, installAwsCli } = require('./lib/prereqs');
const { listProfiles, listSsoProfiles, saveCredentials, validateCredentials, activateProfile,
        configureSsoProfile, startSsoLogin, validateSsoProfile, activateSsoProfile,
        startSsoAuth, pollSsoToken, listSsoAccounts, listSsoAccountRoles, cacheSsoToken,
        validateSsoWithToken } = require('./lib/credentials');
const { checkPermissions } = require('./lib/permissions');
const { listRegions, discoverResources } = require('./lib/discovery');
const { runFullDeploy, retryStep, cancelDeploy, setStateAccessor } = require('./lib/deployer');
const { runHealthChecks, teardownStack, generateReport } = require('./lib/health');
const { discoverSapConfig, discoverSapConfigDeep, listSsmInstances } = require('./lib/sap-discovery');
const { ScanManager } = require('./lib/scan-orchestrator');

// Conectar deployer con el estado global
setStateAccessor(getDeployState);

// ── Instancia global del ScanManager (inline scan) ──
const isMock = process.env.MOCK === 'true' || process.argv.includes('--mock');
const scanManager = new ScanManager({ mockMode: isMock, concurrency: 5 });

const app = express();
app.use(express.json());

// ── v2.0 CORS seguro: whitelist de origenes permitidos (no echo-back) ──
const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:3456',
  'http://127.0.0.1:3456',
  'http://127.0.0.1:5173',
];
app.use((req, res, next) => {
  const origin = req.get('Origin');
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.set('Access-Control-Allow-Origin', origin);
  }
  res.set('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Correlation-Id');
  res.set('Vary', 'Origin');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// ── Servir frontend (sin cache para desarrollo) ──
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});
app.use(express.static(path.join(__dirname, 'public')));
app.use('/shared', express.static(path.join(__dirname, '..', 'shared')));
app.use('/docs', express.static(path.join(__dirname, '..', 'docs')));

// ── Modo MOCK: datos simulados para pruebas sin AWS ──
const MOCK_MODE = process.env.MOCK === 'true' || process.argv.includes('--mock');
if (MOCK_MODE) {
  const { mockMiddleware } = require('./lib/mock-data');
  app.use(mockMiddleware);
  console.log('\n  ⚠️  MODO MOCK ACTIVADO — Datos simulados, sin conexion a AWS\n');
}

// ── GET /api/ui-schema — SSOT schema para wizard y dashboard ──
app.get('/api/ui-schema', (req, res) => {
  try {
    const schema = require('../shared/ui-schema.json');
    res.json({ success: true, schema });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// ── POST /api/client-error — Log de errores del frontend ──
app.post('/api/client-error', (req, res) => {
  const { msg, line, col, stack } = req.body;
  console.error('\n[FRONTEND ERROR]', msg);
  if (line) console.error('  Line:', line, 'Col:', col);
  if (stack) console.error('  Stack:', stack);
  console.error('');
  res.json({ received: true });
});

// ════════════════════════════════════════════════════════════
//  FASE A: ENVIRONMENT SETUP (Prerequisitos + AWS CLI + Credenciales)
// ════════════════════════════════════════════════════════════

// ── GET /api/system/info — Informacion del sistema ──
app.get('/api/system/info', (req, res) => {
  res.json({ success: true, ...getSystemInfo() });
});

// ── GET /api/prereqs/check — Verificar prerequisitos ──
app.get('/api/prereqs/check', (req, res) => {
  res.json({ success: true, ...checkPrereqs() });
});

// ── GET /api/prereqs/install-method — Metodo de instalacion para AWS CLI ──
app.get('/api/prereqs/install-method', (req, res) => {
  res.json({ success: true, ...getInstallMethod() });
});

// ── POST /api/prereqs/install-awscli — Instalar AWS CLI ──
app.post('/api/prereqs/install-awscli', async (req, res) => {
  const result = await installAwsCli();
  res.json(result);
});

// ── GET /api/prereqs/install-status — Estado de instalacion ──
app.get('/api/prereqs/install-status', (req, res) => {
  const state = getInstallState();
  res.json({ ...state });
});

// ════════════════════════════════════════════════════════════
//  CREDENCIALES AWS
// ════════════════════════════════════════════════════════════

// ── GET /api/aws/profiles — Listar perfiles existentes ──
app.get('/api/aws/profiles', (req, res) => {
  try {
    const profiles = listProfiles();
    res.json({ success: true, profiles });
  } catch (err) {
    res.json({ success: true, profiles: [] });
  }
});

// ── POST /api/aws/credentials/validate — Validar credenciales (sin guardar) ──
app.post('/api/aws/credentials/validate', async (req, res) => {
  const { accessKeyId, secretAccessKey, region, sessionToken } = req.body;

  if (!accessKeyId || !secretAccessKey || !region) {
    return res.status(400).json({ success: false, error: 'Faltan campos requeridos' });
  }

  const result = await validateCredentials(accessKeyId, secretAccessKey, region, sessionToken);
  res.json(result);
});

// ── POST /api/aws/credentials/save — Guardar credenciales en ~/.aws/ ──
app.post('/api/aws/credentials/save', (req, res) => {
  const { accessKeyId, secretAccessKey, region, profileName, sessionToken } = req.body;

  if (!accessKeyId || !secretAccessKey || !region) {
    return res.status(400).json({ success: false, error: 'Faltan campos requeridos' });
  }

  try {
    const result = saveCredentials(profileName || 'sap-alwaysops', accessKeyId, secretAccessKey, region, sessionToken);
    res.json(result);
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// ── POST /api/aws/credentials/activate — Activar perfil existente ──
app.post('/api/aws/credentials/activate', (req, res) => {
  const { profileName } = req.body;
  if (!profileName) {
    return res.status(400).json({ success: false, error: 'profileName requerido' });
  }
  const result = activateProfile(profileName);
  res.json(result);
});

// ════════════════════════════════════════════════════════════
//  SSO (AWS IAM Identity Center) — OIDC Device Flow
// ════════════════════════════════════════════════════════════

// ── POST /api/aws/sso/start-auth — Iniciar flujo OIDC (registrar cliente + device auth) ──
app.post('/api/aws/sso/start-auth', async (req, res) => {
  const { ssoStartUrl, ssoRegion } = req.body;
  if (!ssoStartUrl) {
    return res.status(400).json({ success: false, error: 'ssoStartUrl requerido' });
  }
  try {
    const result = await startSsoAuth(ssoStartUrl, ssoRegion);
    res.json({ success: true, ...result });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// ── POST /api/aws/sso/poll-token — Verificar si el usuario completo la auth ──
app.post('/api/aws/sso/poll-token', async (req, res) => {
  const { ssoRegion, clientId, clientSecret, deviceCode, ssoStartUrl } = req.body;
  if (!clientId || !clientSecret || !deviceCode) {
    return res.status(400).json({ success: false, error: 'Faltan parametros de OIDC' });
  }
  try {
    const result = await pollSsoToken(ssoRegion, clientId, clientSecret, deviceCode);
    // Si obtuvimos el token, guardarlo en cache para que fromSSO() lo encuentre
    if (result.success && result.accessToken && ssoStartUrl) {
      cacheSsoToken(ssoStartUrl, ssoRegion, result.accessToken, result.expiresIn);
    }
    res.json(result);
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// ── POST /api/aws/sso/list-accounts — Listar cuentas disponibles ──
app.post('/api/aws/sso/list-accounts', async (req, res) => {
  const { ssoRegion, accessToken } = req.body;
  if (!accessToken) {
    return res.status(400).json({ success: false, error: 'accessToken requerido' });
  }
  try {
    const accounts = await listSsoAccounts(ssoRegion, accessToken);
    res.json({ success: true, accounts });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// ── POST /api/aws/sso/list-roles — Listar roles para una cuenta ──
app.post('/api/aws/sso/list-roles', async (req, res) => {
  const { ssoRegion, accessToken, accountId } = req.body;
  if (!accessToken || !accountId) {
    return res.status(400).json({ success: false, error: 'accessToken y accountId requeridos' });
  }
  try {
    const roles = await listSsoAccountRoles(ssoRegion, accessToken, accountId);
    res.json({ success: true, roles });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// ── POST /api/aws/sso/validate-token — Validar con access token directo ──
app.post('/api/aws/sso/validate-token', async (req, res) => {
  const { ssoRegion, accessToken, accountId, roleName, deployRegion } = req.body;
  if (!accessToken || !accountId || !roleName) {
    return res.status(400).json({ success: false, error: 'accessToken, accountId y roleName requeridos' });
  }
  try {
    const result = await validateSsoWithToken(ssoRegion, accessToken, accountId, roleName, deployRegion);
    res.json(result);
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// ════════════════════════════════════════════════════════════
//  SSO — Gestion de perfiles
// ════════════════════════════════════════════════════════════

// ── GET /api/aws/sso/profiles — Listar perfiles SSO existentes ──
app.get('/api/aws/sso/profiles', (req, res) => {
  try {
    const profiles = listSsoProfiles();
    res.json({ success: true, profiles });
  } catch (err) {
    res.json({ success: true, profiles: [] });
  }
});

// ── POST /api/aws/sso/configure — Configurar perfil SSO ──
app.post('/api/aws/sso/configure', (req, res) => {
  const { profileName, ssoStartUrl, ssoRegion, ssoAccountId, ssoRoleName, region, ssoSessionName } = req.body;

  if (!ssoStartUrl && !ssoSessionName) {
    return res.status(400).json({ success: false, error: 'ssoStartUrl o ssoSessionName requerido' });
  }
  if (!ssoAccountId || !ssoRoleName) {
    return res.status(400).json({ success: false, error: 'Account ID y Nombre del Rol son requeridos para SSO' });
  }

  try {
    const result = configureSsoProfile(
      profileName || 'sap-alwaysops-sso',
      ssoStartUrl,
      ssoRegion,
      ssoAccountId,
      ssoRoleName,
      region,
      ssoSessionName
    );
    res.json(result);
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// ── POST /api/aws/sso/login — Iniciar login SSO (abre browser) ──
app.post('/api/aws/sso/login', (req, res) => {
  const { profileName } = req.body;
  const profile = profileName || 'sap-alwaysops-sso';

  // Iniciar el login SSO (sincrono, bloquea hasta completar o timeout)
  const result = startSsoLogin(profile);
  res.json(result);
});

// ── POST /api/aws/sso/validate — Validar sesion SSO activa ──
app.post('/api/aws/sso/validate', async (req, res) => {
  const { profileName } = req.body;
  const profile = profileName || 'sap-alwaysops-sso';

  const result = await validateSsoProfile(profile);
  res.json(result);
});

// ── POST /api/aws/sso/activate — Activar perfil SSO existente ──
app.post('/api/aws/sso/activate', (req, res) => {
  const { profileName } = req.body;
  if (!profileName) {
    return res.status(400).json({ success: false, error: 'profileName requerido' });
  }
  const result = activateSsoProfile(profileName);
  res.json(result);
});

// ════════════════════════════════════════════════════════════
//  FASE B: CONFIGURACION (Verificacion + Discovery + Config)
// ════════════════════════════════════════════════════════════

// ── GET /api/aws/check — Verificar credenciales AWS ──
app.get('/api/aws/check', async (req, res) => {
  try {
    const { STSClient, GetCallerIdentityCommand } = require('@aws-sdk/client-sts');
    const sts = new STSClient({});
    const identity = await sts.send(new GetCallerIdentityCommand({}));

    const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1';

    res.json({
      success: true,
      account: identity.Account,
      arn: identity.Arn,
      userId: identity.UserId,
      region,
      profile: process.env.AWS_PROFILE || 'default'
    });
  } catch (err) {
    res.json({
      success: false,
      error: 'No se encontraron credenciales AWS configuradas',
      detail: err.message,
      help: 'Configura tus credenciales en el Paso 2 del wizard'
    });
  }
});

// ── POST /api/aws/permissions/check — Verificar permisos IAM ──
app.post('/api/aws/permissions/check', async (req, res) => {
  const region = req.body.region || process.env.AWS_REGION || 'us-east-1';
  try {
    const result = await checkPermissions(region);
    res.json({ success: true, ...result });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// ── GET /api/aws/regions — Listar regiones ──
app.get('/api/aws/regions', async (req, res) => {
  try {
    const regions = await listRegions();
    res.json({ success: true, regions });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// ── GET /api/aws/discover — Auto-descubrir recursos ──
app.get('/api/aws/discover', async (req, res) => {
  const region = req.query.region || process.env.AWS_REGION || 'us-east-1';
  try {
    const discovery = await discoverResources(region);
    res.json({ success: true, region, discovery });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// ════════════════════════════════════════════════════════════
//  SAP AUTO-DISCOVERY via SSM
// ════════════════════════════════════════════════════════════

// ── GET /api/sap/ssm-instances — Listar instancias con SSM activo ──
app.get('/api/sap/ssm-instances', async (req, res) => {
  const region = req.query.region || process.env.AWS_REGION || 'us-east-1';
  try {
    const instances = await listSsmInstances(region);
    res.json({ success: true, instances });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// ── POST /api/sap/discover — Descubrir configuracion SAP via SSM ──
app.post('/api/sap/discover', async (req, res) => {
  const { instanceId, platform, region } = req.body;
  if (!instanceId) {
    return res.status(400).json({ success: false, error: 'instanceId requerido' });
  }

  try {
    const result = await discoverSapConfig(
      region || process.env.AWS_REGION || 'us-east-1',
      instanceId,
      platform || 'Linux'
    );
    res.json({ success: true, discovery: result });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// ── POST /api/sap/discover-deep — Descubrimiento profundo via Lambda discovery-engine ──
app.post('/api/sap/discover-deep', async (req, res) => {
  const { instanceIds, region } = req.body;
  if (!instanceIds || !Array.isArray(instanceIds) || instanceIds.length === 0) {
    return res.status(400).json({ success: false, error: 'instanceIds requerido (array de IDs de EC2)' });
  }

  try {
    const result = await discoverSapConfigDeep(
      region || process.env.AWS_REGION || 'us-east-1',
      instanceIds
    );
    res.json(result);
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// ════════════════════════════════════════════════════════════
//  INLINE SCAN — Escaneo por instancia con progreso en vivo
// ════════════════════════════════════════════════════════════

// ── POST /api/scan/start — Iniciar scan de una instancia ──
app.post('/api/scan/start', (req, res) => {
  const { instanceId, region, platform } = req.body;
  if (!instanceId) {
    return res.status(400).json({ success: false, error: 'instanceId requerido' });
  }
  const scanId = scanManager.startScan(
    instanceId,
    region || process.env.AWS_REGION || 'us-east-1',
    platform || 'Linux'
  );
  res.json({ success: true, scanId, instanceId });
});

// ── POST /api/scan/batch — Iniciar scan de multiples instancias en paralelo ──
app.post('/api/scan/batch', (req, res) => {
  const { instances, region } = req.body;
  if (!instances || !Array.isArray(instances) || instances.length === 0) {
    return res.status(400).json({ success: false, error: 'instances requerido (array de { instanceId, platform })' });
  }
  const results = scanManager.startBatchScan(
    instances,
    region || process.env.AWS_REGION || 'us-east-1'
  );
  res.json({ success: true, scans: results });
});

// ── GET /api/scan/status — Estado de todos los scans o uno especifico ──
app.get('/api/scan/status', (req, res) => {
  const { scanId } = req.query;
  if (scanId) {
    const status = scanManager.getScanStatus(scanId);
    if (!status) return res.status(404).json({ success: false, error: 'Scan no encontrado' });
    return res.json({ success: true, scan: status });
  }
  res.json({ success: true, scans: scanManager.getAllScans() });
});

// ── POST /api/scan/retry — Reintentar scans fallidos ──
app.post('/api/scan/retry', (req, res) => {
  const { scanId } = req.body;
  if (scanId) {
    // Reintentar un scan especifico
    const status = scanManager.getScanStatus(scanId);
    if (!status) return res.status(404).json({ success: false, error: 'Scan no encontrado' });
    // Cancelar el viejo y crear uno nuevo
    scanManager.cancelScan(scanId);
    const newScanId = scanManager.startScan(
      status.instanceId,
      status.region || process.env.AWS_REGION || 'us-east-1',
      status.platform || 'Linux'
    );
    return res.json({ success: true, scanId: newScanId, instanceId: status.instanceId });
  }
  // Reintentar todos los fallidos
  const retried = scanManager.retryFailed();
  res.json({ success: true, retried });
});

// ── POST /api/scan/cancel — Cancelar un scan ──
app.post('/api/scan/cancel', (req, res) => {
  const { scanId } = req.body;
  if (!scanId) return res.status(400).json({ success: false, error: 'scanId requerido' });
  const cancelled = scanManager.cancelScan(scanId);
  res.json({ success: true, cancelled });
});

// ── POST /api/scan/reset — Limpiar todos los scans ──
app.post('/api/scan/reset', (req, res) => {
  scanManager.reset();
  res.json({ success: true, message: 'Scans reseteados' });
});

// ════════════════════════════════════════════════════════════
//  FASE C: DEPLOY + HEALTH
// ════════════════════════════════════════════════════════════

// ── POST /api/deploy/start — Iniciar despliegue ──
app.post('/api/deploy/start', async (req, res) => {
  const config = req.body;

  if (!config.stackName || !config.systemId || !config.dbType || !config.adminEmail) {
    return res.status(400).json({ error: 'Faltan parametros requeridos: stackName, systemId, dbType, adminEmail' });
  }

  const currentState = getDeployState();
  if (currentState.status === 'deploying') {
    return res.status(409).json({ error: 'Ya hay un despliegue en curso' });
  }

  resetDeployState(config);
  res.json({ success: true, message: 'Despliegue iniciado', status: 'deploying' });

  runFullDeploy(config).catch(err => {
    const state = getDeployState();
    state.status = 'error';
    state.errors.push(err.message);
    addLog(`ERROR FATAL: ${err.message}`, 'error');
  });
});

// ── GET /api/deploy/status — Estado en tiempo real ──
app.get('/api/deploy/status', (req, res) => {
  const state = getDeployState();
  const since = parseInt(req.query.since) || 0;
  res.json({
    status: state.status,
    step: state.step,
    totalSteps: state.totalSteps,
    currentAction: state.currentAction,
    logs: state.logs.slice(since),
    logOffset: state.logs.length,
    outputs: state.outputs,
    errors: state.errors,
    elapsed: state.startTime ? Date.now() - state.startTime : 0
  });
});

// ── POST /api/deploy/retry-step — Reintentar un paso ──
app.post('/api/deploy/retry-step', async (req, res) => {
  const { step } = req.body;
  const state = getDeployState();

  if (!step || step < 1 || step > 8) {
    return res.status(400).json({ error: 'Paso invalido (1-8)' });
  }
  if (!state.config) {
    return res.status(400).json({ error: 'No hay configuracion de deploy. Inicia un deploy primero.' });
  }

  res.json({ success: true, message: `Reintentando paso ${step}` });

  retryStep(step, state.config).catch(err => {
    addLog(`ERROR retry: ${err.message}`, 'error');
  });
});

// ── POST /api/deploy/cancel — Cancelar deploy ──
app.post('/api/deploy/cancel', async (req, res) => {
  const state = getDeployState();
  const stackName = req.body.stackName || state.config?.stackName;
  const region = req.body.region || state.config?.region || 'us-east-1';

  if (!stackName) {
    return res.status(400).json({ error: 'No hay stack para cancelar' });
  }

  const result = await cancelDeploy(stackName, region);
  res.json(result);
});

// ── POST /api/deploy/secrets — Crear secretos manualmente ──
app.post('/api/deploy/secrets', async (req, res) => {
  const { region, dbCredentials, appCredentials } = req.body;
  const clients = createClients(region || 'us-east-1');
  const { CreateSecretCommand } = require('@aws-sdk/client-secrets-manager');

  try {
    const results = [];
    if (dbCredentials) {
      try {
        await clients.secrets.send(new CreateSecretCommand({
          Name: 'sap-alwaysops/db-credentials',
          SecretString: JSON.stringify(dbCredentials),
          Description: 'Avvale SAP AlwaysOps — Credenciales de base de datos'
        }));
        results.push({ name: 'db-credentials', status: 'created' });
      } catch (e) {
        if (e.name === 'ResourceExistsException') results.push({ name: 'db-credentials', status: 'already_exists' });
        else throw e;
      }
    }
    if (appCredentials) {
      try {
        await clients.secrets.send(new CreateSecretCommand({
          Name: 'sap-alwaysops/app-credentials',
          SecretString: JSON.stringify(appCredentials),
          Description: 'Avvale SAP AlwaysOps — Credenciales de aplicacion SAP'
        }));
        results.push({ name: 'app-credentials', status: 'created' });
      } catch (e) {
        if (e.name === 'ResourceExistsException') results.push({ name: 'app-credentials', status: 'already_exists' });
        else throw e;
      }
    }
    res.json({ success: true, results });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// ── GET /api/deploy/health — Health checks post-deploy ──
app.get('/api/deploy/health', async (req, res) => {
  const state = getDeployState();
  const region = req.query.region || state.config?.region || 'us-east-1';
  const outputs = { ...state.outputs, stackName: state.config?.stackName };

  try {
    const result = await runHealthChecks(outputs, region);
    res.json({ success: true, ...result });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// ── POST /api/deploy/teardown — Eliminar stack ──
app.post('/api/deploy/teardown', async (req, res) => {
  const state = getDeployState();
  const stackName = req.body.stackName || state.config?.stackName;
  const region = req.body.region || state.config?.region || 'us-east-1';

  if (!stackName) {
    return res.status(400).json({ error: 'stackName requerido' });
  }

  const result = await teardownStack(stackName, region);
  res.json(result);
});

// ── GET /api/deploy/report — Reporte del deploy ──
app.get('/api/deploy/report', (req, res) => {
  const state = getDeployState();
  const report = generateReport(state);
  res.json({ success: true, report });
});

// ── POST /api/test/db-connection — Test conectividad a DB ──
app.post('/api/test/db-connection', (req, res) => {
  const { host, port } = req.body;
  if (!host || !port) {
    return res.status(400).json({ success: false, error: 'host y port requeridos' });
  }

  const net = require('net');
  const start = Date.now();
  const socket = new net.Socket();

  socket.setTimeout(5000);
  socket.on('connect', () => {
    const latency = Date.now() - start;
    socket.destroy();
    res.json({ success: true, reachable: true, latencyMs: latency, host, port });
  });
  socket.on('timeout', () => {
    socket.destroy();
    res.json({ success: true, reachable: false, error: 'Timeout (5s)', host, port });
  });
  socket.on('error', (err) => {
    res.json({ success: true, reachable: false, error: err.message, host, port });
  });
  socket.connect(parseInt(port), host);
});

// ════════════════════════════════════════════════════════════
//  HA ORCHESTRATION ROUTES (v1.5) — Mock Mode
//  Rutas para operaciones de Alta Disponibilidad.
//  Usan datos mock y drivers mock para pruebas sin AWS.
// ════════════════════════════════════════════════════════════

const haData = require('./mock-data-ha');

// Estado en memoria para operaciones HA activas
// Map<operationId, operationObject>
const haOperationsStore = new Map();

// Cargar historial mock en el store
haData.OPERATION_HISTORY.forEach(op => {
  haOperationsStore.set(op.operationId, op);
});

// Instancias de mock drivers (lazy init)
let mockNetworkDriver = null;
let mockDbDriver = null;
let mockSapDriver = null;

/** Obtener o crear instancia del mock network driver */
function getMockNetworkDriver() {
  if (!mockNetworkDriver) {
    const MockNetworkDriver = require('../lambda/utilidades/ha-drivers/mock/mock-network-driver');
    mockNetworkDriver = new MockNetworkDriver({
      strategy: 'PACEMAKER_VIP',
      minDelayMs: 1000,  // Delays reducidos para mock server
      maxDelayMs: 3000,
    });
  }
  return mockNetworkDriver;
}

/** Obtener o crear instancia del mock DB driver */
function getMockDbDriver() {
  if (!mockDbDriver) {
    const MockDbDriver = require('../lambda/utilidades/ha-drivers/mock/mock-db-driver');
    mockDbDriver = new MockDbDriver({
      sid: 'HDB',
      instanceNumber: '00',
      replicationMode: 'SYNC',
      minDelayMs: 1500,
      maxDelayMs: 4000,
    });
  }
  return mockDbDriver;
}

/** Obtener o crear instancia del mock SAP driver */
function getMockSapDriver() {
  if (!mockSapDriver) {
    const MockSapDriver = require('../lambda/utilidades/ha-drivers/mock/mock-sap-driver');
    mockSapDriver = new MockSapDriver({
      sid: 'PRD',
      instanceNumber: '00',
      minDelayMs: 2000,
      maxDelayMs: 5000,
    });
  }
  return mockSapDriver;
}

// ─── POST /ha/operations — Crear nueva operacion HA ───
app.post('/ha/operations', (req, res) => {
  const { systemId, operationType, triggeredBy, reason } = req.body;

  // Validaciones basicas
  if (!systemId) {
    return res.status(400).json({ success: false, error: 'systemId es requerido' });
  }
  if (!operationType || !['FAILOVER', 'TAKEOVER', 'FAILBACK'].includes(operationType)) {
    return res.status(400).json({
      success: false,
      error: 'operationType es requerido y debe ser FAILOVER, TAKEOVER o FAILBACK',
    });
  }

  // Verificar que el sistema existe
  const system = haData.findSystemById(systemId);
  if (!system) {
    return res.status(404).json({ success: false, error: `Sistema ${systemId} no encontrado` });
  }

  // Verificar que HA esta habilitado
  if (!system.haEnabled) {
    return res.status(400).json({
      success: false,
      error: `Sistema ${systemId} no tiene HA habilitado (haStatus: ${system.haStatus})`,
    });
  }

  // Verificar que no hay otra operacion en curso para este sistema
  const activeOp = [...haOperationsStore.values()].find(
    op => op.systemId === systemId &&
    ['PLANNED', 'PREREQUISITES_CHECK', 'EXECUTING'].includes(op.status)
  );
  if (activeOp) {
    return res.status(409).json({
      success: false,
      error: `Ya existe una operacion activa para ${systemId}: ${activeOp.operationId} (status: ${activeOp.status})`,
    });
  }

  // Crear la operacion
  const operation = haData.createMockOperation({
    systemId,
    operationType,
    triggeredBy: triggeredBy || 'mock-user@empresa.com',
    reason: reason || '',
  });

  if (!operation) {
    return res.status(500).json({ success: false, error: 'Error creando operacion mock' });
  }

  haOperationsStore.set(operation.operationId, operation);

  console.log(`[HA] Operacion creada: ${operation.operationId} (${operationType} en ${systemId})`);

  res.status(201).json({
    success: true,
    operation: {
      operationId: operation.operationId,
      systemId: operation.systemId,
      sid: operation.sid,
      operationType: operation.operationType,
      status: operation.status,
      plannedSteps: operation.plannedSteps.length,
      estimatedDurationMs: operation.estimatedDurationMs,
      createdAt: operation.timestamps.createdAt,
    },
  });
});

// ─── GET /ha/operations — Listar todas las operaciones HA ───
app.get('/ha/operations', (req, res) => {
  const { systemId, status, limit } = req.query;
  let operations = [...haOperationsStore.values()];

  // Filtrar por systemId si se especifica
  if (systemId) {
    operations = operations.filter(op => op.systemId === systemId);
  }

  // Filtrar por status si se especifica
  if (status) {
    const statuses = status.split(',');
    operations = operations.filter(op => statuses.includes(op.status));
  }

  // Ordenar por fecha de creacion descendente
  operations.sort((a, b) => {
    const dateA = new Date(a.timestamps?.createdAt || 0);
    const dateB = new Date(b.timestamps?.createdAt || 0);
    return dateB - dateA;
  });

  // Limitar resultados
  const maxResults = Math.min(parseInt(limit) || 50, 100);
  operations = operations.slice(0, maxResults);

  // Retornar resumen sin los steps completos
  const summaries = operations.map(op => ({
    operationId: op.operationId,
    systemId: op.systemId,
    sid: op.sid,
    operationType: op.operationType,
    status: op.status,
    triggeredBy: op.triggeredBy,
    reason: op.reason,
    networkStrategy: op.networkStrategy,
    sourceNode: op.sourceNode,
    targetNode: op.targetNode,
    timestamps: op.timestamps,
    estimatedDurationMs: op.estimatedDurationMs,
    actualDurationMs: op.actualDurationMs || null,
    stepsTotal: op.plannedSteps?.length || op.executedSteps?.length || 0,
    stepsCompleted: (op.executedSteps || []).filter(s => s.status === 'COMPLETED').length,
    error: op.error,
  }));

  res.json({
    success: true,
    count: summaries.length,
    operations: summaries,
  });
});

// ─── GET /ha/operations/:id — Detalle de una operacion HA ───
app.get('/ha/operations/:id', (req, res) => {
  const operationId = req.params.id;
  const operation = haOperationsStore.get(operationId);

  if (!operation) {
    return res.status(404).json({
      success: false,
      error: `Operacion ${operationId} no encontrada`,
    });
  }

  res.json({
    success: true,
    operation,
  });
});

// ─── POST /ha/operations/:id/execute — Ejecutar operacion HA ───
app.post('/ha/operations/:id/execute', (req, res) => {
  const operationId = req.params.id;
  const operation = haOperationsStore.get(operationId);

  if (!operation) {
    return res.status(404).json({ success: false, error: `Operacion ${operationId} no encontrada` });
  }

  if (operation.status !== 'PLANNED') {
    return res.status(400).json({
      success: false,
      error: `Operacion ${operationId} no esta en estado PLANNED (actual: ${operation.status})`,
    });
  }

  // Marcar como ejecutando
  operation.status = 'EXECUTING';
  operation.timestamps.startedAt = new Date().toISOString();

  console.log(`[HA] Ejecutando operacion: ${operationId}`);

  // Responder inmediatamente y ejecutar en background
  res.json({
    success: true,
    message: `Operacion ${operationId} iniciada`,
    operationId,
    status: 'EXECUTING',
  });

  // Ejecutar los steps en background con los mock drivers
  _executeOperationAsync(operation).catch(err => {
    console.error(`[HA] Error fatal ejecutando ${operationId}:`, err.message);
    operation.status = 'FAILED';
    operation.error = { message: err.message };
    operation.timestamps.completedAt = new Date().toISOString();
  });
});

// ─── POST /ha/operations/:id/cancel — Cancelar operacion HA ───
app.post('/ha/operations/:id/cancel', (req, res) => {
  const operationId = req.params.id;
  const operation = haOperationsStore.get(operationId);

  if (!operation) {
    return res.status(404).json({ success: false, error: `Operacion ${operationId} no encontrada` });
  }

  const cancellableStates = ['PLANNED', 'PREREQUISITES_CHECK', 'EXECUTING'];
  if (!cancellableStates.includes(operation.status)) {
    return res.status(400).json({
      success: false,
      error: `Operacion ${operationId} no se puede cancelar (estado: ${operation.status})`,
    });
  }

  operation.status = 'CANCELLED';
  operation.timestamps.cancelledAt = new Date().toISOString();
  operation._cancelled = true;

  console.log(`[HA] Operacion cancelada: ${operationId}`);

  res.json({
    success: true,
    message: `Operacion ${operationId} cancelada`,
    operationId,
    status: 'CANCELLED',
  });
});

// ─── GET /ha/prerequisites/:systemId — Verificar prerequisitos de un sistema ───
app.get('/ha/prerequisites/:systemId', async (req, res) => {
  const systemId = req.params.systemId;
  const system = haData.findSystemById(systemId);

  if (!system) {
    return res.status(404).json({ success: false, error: `Sistema ${systemId} no encontrado` });
  }

  // Retornar prerequisitos del mock data con un pequeno delay
  const delay = 500 + Math.floor(Math.random() * 1000);
  setTimeout(() => {
    const prerequisites = haData.PREREQUISITES_BY_SYSTEM[systemId] || [];
    const allPassed = prerequisites.every(p => p.status === 'PASS' || p.status === 'WARN' || p.status === 'SKIP');
    const requiredFailed = prerequisites.filter(p => p.required && p.status === 'FAIL');

    res.json({
      success: true,
      systemId,
      sid: system.sid,
      haEnabled: system.haEnabled,
      haStatus: system.haStatus,
      prerequisites,
      summary: {
        total: prerequisites.length,
        passed: prerequisites.filter(p => p.status === 'PASS').length,
        warnings: prerequisites.filter(p => p.status === 'WARN').length,
        failed: prerequisites.filter(p => p.status === 'FAIL').length,
        skipped: prerequisites.filter(p => p.status === 'SKIP').length,
      },
      canExecute: requiredFailed.length === 0 && system.haEnabled,
      blockers: requiredFailed.map(p => ({ name: p.name, details: p.details, remediation: p.remediation })),
    });
  }, delay);
});

// ─── GET /ha/drivers — Listar drivers HA disponibles ───
app.get('/ha/drivers', (req, res) => {
  const { type } = req.query;
  let drivers = haData.getAllDriverConfigs();

  // Filtrar por tipo si se especifica
  if (type) {
    drivers = drivers.filter(d => d.driverType === type.toUpperCase());
  }

  res.json({
    success: true,
    count: drivers.length,
    drivers,
  });
});

// ─── GET /ha/systems/:systemId — Info HA de un sistema ───
app.get('/ha/systems/:systemId', (req, res) => {
  const systemId = req.params.systemId;
  const system = haData.findSystemById(systemId);

  if (!system) {
    return res.status(404).json({ success: false, error: `Sistema ${systemId} no encontrado` });
  }

  // Obtener ultima operacion para este sistema
  const systemOps = [...haOperationsStore.values()]
    .filter(op => op.systemId === systemId)
    .sort((a, b) => new Date(b.timestamps?.createdAt || 0) - new Date(a.timestamps?.createdAt || 0));

  const lastOperation = systemOps.length > 0
    ? {
        operationId: systemOps[0].operationId,
        operationType: systemOps[0].operationType,
        status: systemOps[0].status,
        timestamps: systemOps[0].timestamps,
      }
    : null;

  res.json({
    success: true,
    system: {
      ...system,
      lastOperation,
      operationCount: systemOps.length,
      prerequisites: haData.PREREQUISITES_BY_SYSTEM[systemId] || [],
    },
  });
});

// ─── Funcion interna: ejecutar operacion en background con mock drivers ───
async function _executeOperationAsync(operation) {
  const startTime = Date.now();
  const steps = operation.plannedSteps || [];

  operation.executedSteps = [];

  for (let i = 0; i < steps.length; i++) {
    const step = { ...steps[i] };

    // Verificar cancelacion
    if (operation._cancelled || operation.status === 'CANCELLED') {
      step.status = 'SKIPPED';
      operation.executedSteps.push(step);
      console.log(`[HA] Step ${step.order} omitido (operacion cancelada): ${step.name}`);
      continue;
    }

    step.timestamps = { startedAt: new Date().toISOString(), completedAt: null };
    step.status = 'EXECUTING';
    console.log(`[HA] Ejecutando step ${step.order}/${steps.length}: ${step.name}`);

    try {
      let result;

      // Ejecutar segun el tipo de driver
      switch (step.driverType) {
        case 'SYSTEM':
          // Steps de sistema: simular con un pequeno delay
          await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 1000));
          result = { success: true, action: step.action, mock: true };
          break;

        case 'NETWORK':
          result = await getMockNetworkDriver().executeStep(step, {
            sourceNode: operation.sourceNode,
            targetNode: operation.targetNode,
          });
          break;

        case 'DB':
          result = await getMockDbDriver().executeStep(step, {
            sourceNode: operation.sourceNode,
            targetNode: operation.targetNode,
            sid: operation.sid,
          });
          break;

        case 'SAP':
          result = await getMockSapDriver().executeStep(step, {
            sourceNode: operation.sourceNode,
            targetNode: operation.targetNode,
            sid: operation.sid,
          });
          break;

        default:
          await new Promise(resolve => setTimeout(resolve, 1000));
          result = { success: true, action: step.action, mock: true };
      }

      step.status = 'COMPLETED';
      step.result = result;
      step.timestamps.completedAt = new Date().toISOString();
      step.durationMs = new Date(step.timestamps.completedAt) - new Date(step.timestamps.startedAt);
      operation.executedSteps.push(step);

      console.log(`[HA] Step ${step.order} completado en ${step.durationMs}ms: ${step.name}`);

    } catch (stepError) {
      step.status = 'FAILED';
      step.result = { error: stepError.message };
      step.timestamps.completedAt = new Date().toISOString();
      step.durationMs = new Date(step.timestamps.completedAt) - new Date(step.timestamps.startedAt);
      operation.executedSteps.push(step);

      console.error(`[HA] Step ${step.order} FALLO: ${step.name} — ${stepError.message}`);

      // Iniciar rollback
      operation.status = 'ROLLBACK';
      operation.rollbackReason = stepError.message;

      console.log(`[HA] Iniciando rollback desde step ${step.order}...`);

      // Rollback de steps completados en orden inverso
      const completedSteps = operation.executedSteps
        .filter(s => s.status === 'COMPLETED' && s.canRollback)
        .reverse();

      for (const rbStep of completedSteps) {
        try {
          console.log(`[HA] Rollback de step: ${rbStep.name}`);
          switch (rbStep.driverType) {
            case 'NETWORK':
              await getMockNetworkDriver().rollbackStep(rbStep, {
                sourceNode: operation.sourceNode,
                targetNode: operation.targetNode,
              });
              break;
            case 'DB':
              await getMockDbDriver().rollbackStep(rbStep, {
                sourceNode: operation.sourceNode,
                targetNode: operation.targetNode,
                sid: operation.sid,
              });
              break;
            case 'SAP':
              await getMockSapDriver().rollbackStep(rbStep, {
                sourceNode: operation.sourceNode,
                targetNode: operation.targetNode,
                sid: operation.sid,
              });
              break;
            default:
              // System steps: no rollback especial
              break;
          }
          rbStep.status = 'ROLLED_BACK';
        } catch (rbError) {
          console.error(`[HA] Rollback fallo para ${rbStep.name}: ${rbError.message}`);
        }
      }

      // Marcar steps restantes como omitidos
      for (let j = i + 1; j < steps.length; j++) {
        operation.executedSteps.push({
          ...steps[j],
          status: 'SKIPPED',
          timestamps: { startedAt: null, completedAt: null },
          durationMs: 0,
        });
      }

      operation.status = 'FAILED';
      operation.error = { message: stepError.message };
      operation.timestamps.completedAt = new Date().toISOString();
      operation.actualDurationMs = Date.now() - startTime;

      console.log(`[HA] Operacion ${operation.operationId} FALLIDA en ${operation.actualDurationMs}ms`);
      return;
    }
  }

  // Todos los steps completados exitosamente
  if (operation.status === 'EXECUTING') {
    operation.status = 'COMPLETED';
  }
  operation.timestamps.completedAt = new Date().toISOString();
  operation.actualDurationMs = Date.now() - startTime;

  console.log(`[HA] Operacion ${operation.operationId} COMPLETADA en ${operation.actualDurationMs}ms`);
}

// ════════════════════════════════════════════════════════════
//  INICIAR SERVIDOR
// ════════════════════════════════════════════════════════════

const PORT = process.env.PORT || 5001;

app.listen(PORT, () => {
  console.log('');
  console.log('  ╔══════════════════════════════════════════════════╗');
  console.log('  ║  🛡️  Avvale SAP AlwaysOps — Setup Portal v2.0            ║');
  console.log('  ╠══════════════════════════════════════════════════╣');
  console.log(`  ║  🌐 http://localhost:${PORT}                       ║`);
  console.log('  ║  📋 Wizard 100% automatizado (10 pasos)          ║');
  if (MOCK_MODE) {
  console.log('  ║  🧪 MODO MOCK — Datos simulados                  ║');
  } else {
  console.log('  ║  🔧 Prerequisitos + Credenciales + Deploy        ║');
  }
  console.log('  ╚══════════════════════════════════════════════════╝');
  console.log('');

  // Auto-abrir navegador
  try {
    const openCmd = process.platform === 'darwin' ? 'open' :
                    process.platform === 'win32' ? 'start' : 'xdg-open';
    execSync(`${openCmd} http://localhost:${PORT}`, { stdio: 'ignore' });
  } catch (e) {
    console.log(`  Abre tu navegador en: http://localhost:${PORT}`);
  }
});
