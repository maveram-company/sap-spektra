// ============================================================================
//  Avvale SAP AlwaysOps v1.0 — Setup Portal — Utilidades compartidas
// ============================================================================

'use strict';

const { execSync, spawn } = require('child_process');

// ── Estado global del despliegue ──
let deployState = {
  status: 'idle',
  step: 0,
  totalSteps: 8,
  currentAction: '',
  logs: [],
  outputs: {},
  errors: [],
  startTime: null,
  config: null
};

// ── Estado de instalacion de prerequisitos ──
let installState = {
  status: 'idle',
  logs: [],
  error: null
};

// ── Agregar log al deploy ──
function addLog(msg, type = 'info') {
  const entry = { timestamp: new Date().toISOString(), message: msg, type };
  deployState.logs.push(entry);
  console.log(`[${type.toUpperCase()}] ${msg}`);
}

// ── Agregar log a instalacion ──
function addInstallLog(msg, type = 'info') {
  installState.logs.push({ timestamp: new Date().toISOString(), message: msg, type });
}

// ── Resetear estado de deploy ──
function resetDeployState(config) {
  deployState = {
    status: 'deploying',
    step: 0,
    totalSteps: 8,
    currentAction: 'Iniciando despliegue...',
    logs: [],
    outputs: {},
    errors: [],
    startTime: Date.now(),
    config
  };
}

// ── Resetear estado de instalacion ──
function resetInstallState() {
  installState = { status: 'idle', logs: [], error: null };
}

// ── Crear clientes AWS con region dinamica ──
function createClients(region) {
  const { STSClient } = require('@aws-sdk/client-sts');
  const { EC2Client } = require('@aws-sdk/client-ec2');
  const { CloudFormationClient } = require('@aws-sdk/client-cloudformation');
  const { S3Client } = require('@aws-sdk/client-s3');
  const { CognitoIdentityProviderClient } = require('@aws-sdk/client-cognito-identity-provider');
  const { SESClient } = require('@aws-sdk/client-ses');
  const { SecretsManagerClient } = require('@aws-sdk/client-secrets-manager');
  const { SSMClient } = require('@aws-sdk/client-ssm');
  const { CloudFrontClient } = require('@aws-sdk/client-cloudfront');
  const { BedrockClient } = require('@aws-sdk/client-bedrock');

  const config = { region };
  return {
    sts: new STSClient(config),
    ec2: new EC2Client(config),
    cfn: new CloudFormationClient(config),
    s3: new S3Client(config),
    cognito: new CognitoIdentityProviderClient(config),
    ses: new SESClient(config),
    secrets: new SecretsManagerClient(config),
    ssm: new SSMClient(config),
    cloudfront: new CloudFrontClient(config),
    bedrock: new BedrockClient(config)
  };
}

// ── Ejecutar comando shell de forma segura ──
// ⚠ SEGURIDAD (v1.4): Esta funcion usa execSync con un string de comando.
// Los llamadores DEBEN validar/sanitizar todas las entradas antes de interpolarlas en `cmd`.
// Preferir execFileSync con array de argumentos en codigo nuevo para evitar inyeccion de comandos.
function execSafe(cmd, options = {}) {
  try {
    return { success: true, output: execSync(cmd, { encoding: 'utf-8', timeout: 30000, ...options }).trim() };
  } catch (e) {
    return { success: false, error: e.message, output: '' };
  }
}

// ── Labels de regiones AWS ──
function getRegionLabel(region) {
  const labels = {
    'us-east-1': 'Virginia del Norte (recomendado)',
    'us-west-2': 'Oregon',
    'eu-west-1': 'Irlanda',
    'eu-central-1': 'Frankfurt',
    'sa-east-1': 'Sao Paulo',
    'ap-southeast-1': 'Singapur',
    'ap-northeast-1': 'Tokio',
    'ca-central-1': 'Canada'
  };
  return labels[region] || region;
}

module.exports = {
  deployState,
  installState,
  addLog,
  addInstallLog,
  resetDeployState,
  resetInstallState,
  createClients,
  execSafe,
  getRegionLabel,
  // Getters para acceso por referencia
  getDeployState: () => deployState,
  setDeployState: (newState) => { deployState = newState; },
  getInstallState: () => installState,
  setInstallState: (newState) => { installState = newState; }
};
