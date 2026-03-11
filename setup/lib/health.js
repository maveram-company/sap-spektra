// ============================================================================
//  SAP Spektra v1.0 — Setup Portal — Health checks y teardown post-deploy
// ============================================================================

'use strict';

const https = require('https');
const { createClients } = require('./utils');
const { DescribeStacksCommand, DeleteStackCommand } = require('@aws-sdk/client-cloudformation');

// ── Health check de un URL (GET con timeout) ──
function checkUrl(url, timeoutMs = 10000) {
  return new Promise((resolve) => {
    const start = Date.now();
    const req = https.get(url, { timeout: timeoutMs }, (res) => {
      const latency = Date.now() - start;
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        resolve({
          healthy: res.statusCode >= 200 && res.statusCode < 400,
          statusCode: res.statusCode,
          latencyMs: latency,
          body: body.substring(0, 200)
        });
      });
    });
    req.on('error', (err) => {
      resolve({ healthy: false, error: err.message, latencyMs: Date.now() - start });
    });
    req.on('timeout', () => {
      req.destroy();
      resolve({ healthy: false, error: 'Timeout', latencyMs: timeoutMs });
    });
  });
}

// ── Ejecutar todos los health checks post-deploy ──
async function runHealthChecks(outputs, region) {
  const checks = [];

  // 1. Dashboard (CloudFront)
  const dashboardUrl = outputs.dashboardUrl || outputs.FrontendDistributionUrl;
  if (dashboardUrl) {
    const url = dashboardUrl.startsWith('http') ? dashboardUrl : `https://${dashboardUrl}`;
    const result = await checkUrl(url);
    checks.push({ resource: 'Dashboard (CloudFront)', url, ...result });
  } else {
    checks.push({ resource: 'Dashboard (CloudFront)', healthy: false, error: 'URL no disponible' });
  }

  // 2. API Gateway
  const apiUrl = outputs.apiUrl || outputs.DashboardApiUrl;
  if (apiUrl) {
    const healthUrl = `${apiUrl}/health`;
    const result = await checkUrl(healthUrl);
    checks.push({ resource: 'API Gateway', url: healthUrl, ...result });
  } else {
    checks.push({ resource: 'API Gateway', healthy: false, error: 'URL no disponible' });
  }

  // 3. CloudFormation Stack status
  if (outputs.stackName || outputs.StackName) {
    try {
      const clients = createClients(region);
      const stackName = outputs.stackName || outputs.StackName;
      const stackResult = await clients.cfn.send(new DescribeStacksCommand({ StackName: stackName }));
      const stack = stackResult.Stacks && stackResult.Stacks[0];
      const status = stack ? stack.StackStatus : 'NOT_FOUND';
      checks.push({
        resource: 'CloudFormation Stack',
        healthy: status === 'CREATE_COMPLETE' || status === 'UPDATE_COMPLETE',
        status,
        stackName
      });
    } catch (e) {
      checks.push({ resource: 'CloudFormation Stack', healthy: false, error: e.message });
    }
  }

  // 4. Cognito User Pool
  if (outputs.CognitoUserPoolId) {
    try {
      const { CognitoIdentityProviderClient, DescribeUserPoolCommand } = require('@aws-sdk/client-cognito-identity-provider');
      const cognito = new CognitoIdentityProviderClient({ region });
      const result = await cognito.send(new DescribeUserPoolCommand({ UserPoolId: outputs.CognitoUserPoolId }));
      checks.push({
        resource: 'Cognito User Pool',
        healthy: result.UserPool?.Status === 'Enabled' || !!result.UserPool,
        status: result.UserPool?.Status || 'Active',
        userPoolId: outputs.CognitoUserPoolId
      });
    } catch (e) {
      checks.push({ resource: 'Cognito User Pool', healthy: false, error: e.message });
    }
  }

  // Resumen
  const healthy = checks.filter(c => c.healthy).length;
  const total = checks.length;

  return {
    checks,
    healthy,
    total,
    allHealthy: healthy === total,
    summary: `${healthy}/${total} servicios saludables`
  };
}

// ── Teardown — eliminar stack y recursos ──
async function teardownStack(stackName, region) {
  const clients = createClients(region);

  try {
    // Verificar que el stack existe
    const stackResult = await clients.cfn.send(new DescribeStacksCommand({ StackName: stackName }));
    if (!stackResult.Stacks || stackResult.Stacks.length === 0) {
      return { success: false, error: `Stack '${stackName}' no encontrado` };
    }

    // Eliminar stack
    await clients.cfn.send(new DeleteStackCommand({ StackName: stackName }));

    return {
      success: true,
      message: `Stack '${stackName}' marcado para eliminacion. La eliminacion toma 5-10 minutos.`,
      stackName
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ── Generar reporte del deploy ──
function generateReport(deployState) {
  return {
    generatedAt: new Date().toISOString(),
    version: '1.0',
    status: deployState.status,
    duration: deployState.startTime ? Date.now() - deployState.startTime : 0,
    config: {
      stackName: deployState.config?.stackName,
      systemId: deployState.config?.systemId,
      dbType: deployState.config?.dbType,
      osType: deployState.config?.osType,
      environment: deployState.config?.environment,
      mode: deployState.config?.mode,
      region: deployState.config?.region
    },
    outputs: deployState.outputs,
    steps: deployState.totalSteps,
    errors: deployState.errors,
    logsCount: deployState.logs.length
  };
}

module.exports = {
  runHealthChecks,
  teardownStack,
  generateReport
};
