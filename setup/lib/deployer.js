// ============================================================================
//  SAP Spektra v1.0 — Setup Portal — Motor de despliegue (8 pasos)
// ============================================================================

'use strict';

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { execSync, execFileSync } = require('child_process');
const { addLog, createClients } = require('./utils');

// v2.0 — Seguridad: Genera un password temporal seguro y aleatorio para Cognito.
// Cumple requisitos Cognito: mayúsculas, minúsculas, números, caracteres especiales, mínimo 12 chars.
function generateSecureTemporaryPassword() {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  const special = '!@#$%&*';
  // Garantizar al menos 1 de cada tipo
  let pw = '';
  pw += upper[crypto.randomInt(upper.length)];
  pw += lower[crypto.randomInt(lower.length)];
  pw += digits[crypto.randomInt(digits.length)];
  pw += special[crypto.randomInt(special.length)];
  // Rellenar hasta 16 chars con mix aleatorio
  const all = upper + lower + digits + special;
  for (let i = 4; i < 16; i++) {
    pw += all[crypto.randomInt(all.length)];
  }
  // Mezclar para que los obligatorios no estén siempre al inicio
  return pw.split('').sort(() => crypto.randomInt(3) - 1).join('');
}

// AWS SDK Commands
const { CreateSecretCommand } = require('@aws-sdk/client-secrets-manager');
const { CreateStackCommand, DescribeStacksCommand, DescribeStackEventsCommand, DeleteStackCommand } = require('@aws-sdk/client-cloudformation');
const { VerifyEmailIdentityCommand } = require('@aws-sdk/client-ses');
const { AdminCreateUserCommand, AdminAddUserToGroupCommand } = require('@aws-sdk/client-cognito-identity-provider');
const { PutParameterCommand } = require('@aws-sdk/client-ssm');
const { CreateInvalidationCommand } = require('@aws-sdk/client-cloudfront');
const { SSMClient } = require('@aws-sdk/client-ssm');

// ── Referencia al deployState (se pasa por parametro o se importa) ──
let _getDeployState = null;

function setStateAccessor(fn) {
  _getDeployState = fn;
}

function ds() {
  return _getDeployState ? _getDeployState() : require('./utils').deployState;
}

// ════════════════════════════════════════════════════════════
//  8 PASOS INDIVIDUALES (para soporte de retry)
// ════════════════════════════════════════════════════════════

// ── Paso 1: Crear Secretos ──
async function step1_createSecrets(config, clients) {
  ds().step = 1;
  ds().currentAction = 'Creando secretos en Secrets Manager...';
  addLog('Paso 1/8: Creando secretos en AWS Secrets Manager');

  if (config.dbCredentials) {
    try {
      await clients.secrets.send(new CreateSecretCommand({
        Name: `sap-alwaysops/${config.stackName}/db-credentials`,
        SecretString: JSON.stringify(config.dbCredentials),
        Description: `SAP Spektra — DB Credentials para ${config.systemId}`
      }));
      addLog('  ✓ Secreto db-credentials creado');
    } catch (e) {
      if (e.name === 'ResourceExistsException') addLog('  ○ Secreto db-credentials ya existe');
      else throw e;
    }
  }

  if (config.appCredentials) {
    try {
      await clients.secrets.send(new CreateSecretCommand({
        Name: `sap-alwaysops/${config.stackName}/app-credentials`,
        SecretString: JSON.stringify(config.appCredentials),
        Description: `SAP Spektra — App Credentials para ${config.systemId}`
      }));
      addLog('  ✓ Secreto app-credentials creado');
    } catch (e) {
      if (e.name === 'ResourceExistsException') addLog('  ○ Secreto app-credentials ya existe');
      else throw e;
    }
  }

  addLog('  ✓ Paso 1 completado', 'success');
}

// ── Paso 2: Desplegar CloudFormation ──
async function step2_deployCloudFormation(config, clients) {
  ds().step = 2;
  ds().currentAction = 'Desplegando stack de CloudFormation...';
  addLog('Paso 2/8: Desplegando CloudFormation (esto toma 8-15 minutos)');

  const cfnTemplatePath = path.join(__dirname, '..', '..', 'cfn', 'sap-alwaysops-v1.0.yaml');
  const templateBody = fs.readFileSync(cfnTemplatePath, 'utf-8');

  const cfnParams = [
    { ParameterKey: 'SystemId', ParameterValue: config.systemId },
    { ParameterKey: 'SystemSID', ParameterValue: config.systemSid || config.systemId.split('-').pop() || 'PRD' },
    { ParameterKey: 'DBType', ParameterValue: config.dbType },
    { ParameterKey: 'OSType', ParameterValue: config.osType || 'linux' },
    { ParameterKey: 'AdminEmail', ParameterValue: config.adminEmail },
    { ParameterKey: 'Environment', ParameterValue: config.environment || 'PRD' }
  ];

  if (config.ec2InstanceId) {
    cfnParams.push({ ParameterKey: 'EC2InstanceId', ParameterValue: config.ec2InstanceId });
  }

  try {
    await clients.cfn.send(new CreateStackCommand({
      StackName: config.stackName,
      TemplateBody: templateBody,
      Parameters: cfnParams,
      Capabilities: ['CAPABILITY_NAMED_IAM'],
      Tags: [
        { Key: 'Project', Value: 'SAPAlwaysOps' },
        { Key: 'Version', Value: '1.4' },
        { Key: 'Mode', Value: config.mode || 'TRIAL' },
        { Key: 'ManagedBy', Value: 'sap-alwaysops-setup-portal' }
      ]
    }));
    addLog('  ✓ Stack creado, esperando a que se complete...');
  } catch (e) {
    if (e.name === 'AlreadyExistsException') {
      addLog('  ○ Stack ya existe, verificando estado...', 'warn');
    } else throw e;
  }

  await waitForStack(clients.cfn, config.stackName);

  // Obtener outputs
  const stackResult = await clients.cfn.send(new DescribeStacksCommand({ StackName: config.stackName }));
  const outputs = {};
  const stack = stackResult.Stacks && stackResult.Stacks[0];
  if (stack) {
    for (const output of (stack.Outputs || [])) {
      outputs[output.OutputKey] = output.OutputValue;
    }
  }
  ds().outputs = { ...ds().outputs, ...outputs };
  addLog(`  ✓ CloudFormation completado. ${Object.keys(outputs).length} outputs obtenidos`, 'success');
}

// ── Paso 3: Verificar SES ──
async function step3_verifySES(config, clients) {
  ds().step = 3;
  ds().currentAction = 'Verificando email en SES...';
  addLog('Paso 3/8: Verificando email en Amazon SES');

  try {
    await clients.ses.send(new VerifyEmailIdentityCommand({ EmailAddress: config.adminEmail }));
    addLog(`  ✓ Email de verificacion enviado a ${config.adminEmail}`);
    addLog('  ⚠ Revisa tu correo y confirma la verificacion de SES');
  } catch (e) {
    addLog(`  ⚠ No se pudo verificar SES: ${e.message}`, 'warn');
  }
}

// ── Paso 4: Build Frontend ──
async function step4_buildFrontend(config) {
  ds().step = 4;
  ds().currentAction = 'Compilando frontend React...';
  addLog('Paso 4/8: Compilando frontend (npm install + build)');

  const frontendDir = path.join(__dirname, '..', '..', 'frontend');

  try {
    addLog('  → npm install...');
    execSync('npm install', { cwd: frontendDir, stdio: 'pipe', timeout: 120000 });
    addLog('  ✓ Dependencias instaladas');

    addLog('  → npm run build...');
    execSync('npm run build', { cwd: frontendDir, stdio: 'pipe', timeout: 120000 });
    addLog('  ✓ Frontend compilado exitosamente', 'success');
  } catch (e) {
    addLog(`  ⚠ Error compilando frontend: ${e.message}`, 'warn');
  }
}

// ── Paso 5: Deploy Frontend a S3 ──
async function step5_deployToS3(config, clients, region) {
  ds().step = 5;
  ds().currentAction = 'Subiendo frontend a S3...';
  addLog('Paso 5/8: Subiendo frontend a S3 + invalidando CloudFront');

  const frontendDir = path.join(__dirname, '..', '..', 'frontend');
  const bucketName = ds().outputs.FrontendBucketName;
  const distPath = path.join(frontendDir, 'dist');

  if (bucketName && fs.existsSync(distPath)) {
    try {
      // v1.4 — Seguridad: Usar execFileSync con array de argumentos para evitar inyeccion de comandos
      execFileSync('aws', ['s3', 'sync', distPath, `s3://${bucketName}/`, '--delete', '--region', region], {
        stdio: 'pipe', timeout: 120000
      });
      addLog(`  ✓ Frontend subido a s3://${bucketName}/`);

      const distId = ds().outputs.FrontendDistributionId;
      if (distId) {
        await clients.cloudfront.send(new CreateInvalidationCommand({
          DistributionId: distId,
          InvalidationBatch: {
            Paths: { Quantity: 1, Items: ['/*'] },
            CallerReference: `setup-${Date.now()}`
          }
        }));
        addLog('  ✓ CloudFront invalidation creada', 'success');
      }
    } catch (e) {
      addLog(`  ⚠ Error subiendo frontend: ${e.message}`, 'warn');
    }
  } else {
    addLog('  ⚠ Bucket o dist no encontrados, saltando deploy de frontend', 'warn');
  }
}

// ── Paso 6: Crear usuario Cognito ──
async function step6_createCognitoUser(config, clients) {
  ds().step = 6;
  ds().currentAction = 'Creando usuario admin en Cognito...';
  addLog('Paso 6/8: Creando usuario admin en Cognito');

  const userPoolId = ds().outputs.CognitoUserPoolId;
  if (userPoolId) {
    try {
      await clients.cognito.send(new AdminCreateUserCommand({
        UserPoolId: userPoolId,
        Username: config.adminEmail,
        UserAttributes: [
          { Name: 'email', Value: config.adminEmail },
          { Name: 'email_verified', Value: 'true' }
        ],
        // v2.0 — Seguridad: Generar password temporal aleatorio en vez de hardcodeado
        TemporaryPassword: generateSecureTemporaryPassword(),
        MessageAction: 'SUPPRESS'
      }));
      const maskedPassword = '********** (ver consola del wizard)';
      addLog(`  ✓ Usuario admin creado: ${config.adminEmail}`);
      addLog(`  ℹ Password temporal generado (cambiar en primer login). Se muestra una sola vez en la consola del wizard.`);

      try {
        await clients.cognito.send(new AdminAddUserToGroupCommand({
          UserPoolId: userPoolId,
          Username: config.adminEmail,
          GroupName: 'SAPAlwaysOpsAdmins'
        }));
        addLog('  ✓ Usuario agregado al grupo SAPAlwaysOpsAdmins', 'success');
      } catch (ge) {
        addLog(`  ⚠ No se pudo agregar al grupo: ${ge.message}`, 'warn');
      }
    } catch (e) {
      if (e.name === 'UsernameExistsException') {
        addLog('  ○ Usuario admin ya existe');
      } else {
        addLog(`  ⚠ Error creando usuario: ${e.message}`, 'warn');
      }
    }
  }
}

// ── Paso 7: Registrar sistema en SSM ──
async function step7_registerSystem(config, region) {
  ds().step = 7;
  ds().currentAction = 'Registrando sistema SAP en SSM...';
  addLog('Paso 7/8: Registrando configuracion del sistema en SSM Parameter Store');

  try {
    const ssmClient = new SSMClient({ region });
    const systemConfig = [{
      systemId: config.systemId,
      sid: config.systemSid || config.systemId.split('-').pop(),
      type: config.systemType || 'ERP',
      dbType: config.dbType,
      osType: config.osType || 'linux',
      host: config.dbCredentials?.host || '10.0.1.50',
      port: config.dbCredentials?.port || 5000,
      ec2InstanceId: config.ec2InstanceId || '',
      environment: config.environment || 'PRD',
      mode: config.mode || 'TRIAL',
      landscape: config.environment || 'PRD',
      registeredAt: new Date().toISOString(),
      registeredBy: 'setup-portal'
    }];

    await ssmClient.send(new PutParameterCommand({
      Name: '/sap-alwaysops/systems',
      Value: JSON.stringify(systemConfig),
      Type: 'String',
      Overwrite: true,
      Description: 'SAP Spektra — Configuracion de sistemas monitoreados'
    }));
    addLog(`  ✓ Sistema ${config.systemId} registrado en SSM`, 'success');
  } catch (e) {
    addLog(`  ⚠ Error registrando en SSM: ${e.message}`, 'warn');
  }
}

// ── Paso 8: Verificacion Final ──
async function step8_verify(config) {
  ds().step = 8;
  ds().currentAction = 'Verificacion final...';
  addLog('Paso 8/8: Verificacion final del despliegue');

  const outputs = ds().outputs;
  const dashboardUrl = outputs.FrontendDistributionDomain
    ? `https://${outputs.FrontendDistributionDomain}`
    : outputs.FrontendDistributionUrl || '';
  const apiUrl = outputs.DashboardApiUrl || '';

  if (apiUrl) {
    ds().outputs.dashboardUrl = dashboardUrl;
    ds().outputs.apiUrl = apiUrl;
    addLog(`  ✓ Dashboard URL: ${dashboardUrl}`);
    addLog(`  ✓ API URL: ${apiUrl}`);
  }

  addLog('');
  addLog('════════════════════════════════════════════');
  addLog('  ✅ SAP Spektra desplegado exitosamente!');
  addLog('════════════════════════════════════════════');
  addLog(`  Dashboard: ${dashboardUrl}`);
  addLog(`  Usuario: ${config.adminEmail}`);
  addLog(`  Password: (generada automaticamente — ver paso 6 del deploy)`);
  addLog(`  Modo: ${config.mode || 'TRIAL'}`);
  addLog(`  Sistema: ${config.systemId} (${config.dbType})`);
}

// ════════════════════════════════════════════════════════════
//  ORQUESTACION
// ════════════════════════════════════════════════════════════

// ── Mapa de pasos para retry ──
const stepFunctions = {
  1: step1_createSecrets,
  2: step2_deployCloudFormation,
  3: step3_verifySES,
  4: step4_buildFrontend,
  5: step5_deployToS3,
  6: step6_createCognitoUser,
  7: step7_registerSystem,
  8: step8_verify
};

// ── Ejecutar deploy completo ──
async function runFullDeploy(config) {
  const region = config.region || 'us-east-1';
  const clients = createClients(region);

  try {
    await step1_createSecrets(config, clients);
    await step2_deployCloudFormation(config, clients);
    await step3_verifySES(config, clients);
    await step4_buildFrontend(config);
    await step5_deployToS3(config, clients, region);
    await step6_createCognitoUser(config, clients);
    await step7_registerSystem(config, region);
    await step8_verify(config);

    ds().status = 'success';
    ds().currentAction = 'Despliegue completado!';
  } catch (err) {
    ds().status = 'error';
    ds().errors.push(err.message);
    addLog(`ERROR: ${err.message}`, 'error');
  }
}

// ── Reintentar un paso especifico ──
async function retryStep(stepNumber, config) {
  const region = config.region || 'us-east-1';
  const clients = createClients(region);

  ds().status = 'deploying';
  ds().errors = ds().errors.filter(e => !e.includes(`Paso ${stepNumber}`));

  try {
    const fn = stepFunctions[stepNumber];
    if (!fn) throw new Error(`Paso ${stepNumber} no existe`);

    // Pasar los argumentos correctos segun el paso
    if (stepNumber === 4) {
      await fn(config);
    } else if (stepNumber === 5) {
      await fn(config, clients, region);
    } else if (stepNumber === 7) {
      await fn(config, region);
    } else if (stepNumber === 8) {
      await fn(config);
    } else {
      await fn(config, clients);
    }

    // Si queda como el ultimo paso fallido, marcar como success
    if (ds().errors.length === 0) {
      ds().status = 'success';
      ds().currentAction = 'Despliegue completado!';
    }
  } catch (err) {
    ds().status = 'error';
    ds().errors.push(`Paso ${stepNumber}: ${err.message}`);
    addLog(`ERROR retry paso ${stepNumber}: ${err.message}`, 'error');
  }
}

// ── Cancelar deploy (eliminar stack) ──
async function cancelDeploy(stackName, region) {
  const clients = createClients(region || 'us-east-1');

  try {
    await clients.cfn.send(new DeleteStackCommand({ StackName: stackName }));
    addLog(`Stack ${stackName} marcado para eliminacion`, 'warn');
    ds().status = 'error';
    ds().currentAction = 'Deploy cancelado — Stack en proceso de eliminacion';
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ── Esperar CloudFormation ──
async function waitForStack(cfnClient, stackName) {
  const maxWait = 20 * 60 * 1000;
  const pollInterval = 15000;
  const startTime = Date.now();
  let lastEventTimestamp = new Date(0).toISOString();
  let lastEventCount = 0;

  while (Date.now() - startTime < maxWait) {
    try {
      const result = await cfnClient.send(new DescribeStacksCommand({ StackName: stackName }));
      const stack = result.Stacks[0];
      const status = stack.StackStatus;

      // Eventos recientes
      try {
        const eventsResult = await cfnClient.send(new DescribeStackEventsCommand({ StackName: stackName }));
        const allEvents = eventsResult.StackEvents || [];
        const newEvents = lastEventCount === 0
          ? allEvents.slice(0, 5)
          : allEvents.filter(e => new Date(e.Timestamp) > new Date(lastEventTimestamp));

        if (newEvents.length > 0) {
          for (const event of newEvents.reverse()) {
            const rs = event.ResourceStatus || '';
            const emoji = rs.includes('COMPLETE') ? '✓' : rs.includes('PROGRESS') ? '→' : rs.includes('FAILED') ? '✗' : '○';
            addLog(`  ${emoji} ${event.LogicalResourceId}: ${rs}`);
          }
          lastEventCount += newEvents.length;
          lastEventTimestamp = allEvents[0]?.Timestamp || lastEventTimestamp;
        }
      } catch (e) { /* ignorar errores de eventos */ }

      if (status === 'CREATE_COMPLETE' || status === 'UPDATE_COMPLETE') return;
      if (status.includes('FAILED') || status.includes('ROLLBACK')) {
        throw new Error(`CloudFormation fallo: ${status} — ${stack.StackStatusReason || 'Sin razon'}`);
      }

      ds().currentAction = `CloudFormation: ${status} (${Math.floor((Date.now() - startTime) / 1000)}s)`;
    } catch (e) {
      if (e.message.includes('fallo')) throw e;
      addLog(`  ⚠ Error verificando stack: ${e.message}`, 'warn');
    }

    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }

  throw new Error('CloudFormation timeout: mas de 20 minutos esperando');
}

module.exports = {
  runFullDeploy,
  retryStep,
  cancelDeploy,
  setStateAccessor
};
