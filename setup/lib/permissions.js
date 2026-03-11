// ============================================================================
//  SAP Spektra v1.0 — Setup Portal — Verificacion de permisos IAM
// ============================================================================

'use strict';

// Errores que realmente indican falta de permisos
const ACCESS_DENIED_CODES = [
  'AccessDenied', 'AccessDeniedException',
  'UnauthorizedAccess', 'UnauthorizedOperation',
  'AuthorizationError', 'Forbidden',
  'InvalidClientTokenId', 'SignatureDoesNotMatch',
  'ExpiredToken', 'ExpiredTokenException'
];

function isPermissionError(err) {
  if (!err) return false;
  var code = err.name || err.Code || err.code || '';
  var msg = (err.message || '').toLowerCase();
  if (ACCESS_DENIED_CODES.includes(code)) return true;
  if (msg.includes('access denied') || msg.includes('not authorized') || msg.includes('forbidden')) return true;
  return false;
}

// ── Verificar permisos por servicio AWS ──
async function checkPermissions(region) {
  const checks = [];

  // Helper: ejecutar un check y clasificar el resultado
  async function runCheck(service, action, fn) {
    try {
      await fn();
      checks.push({ service, action, allowed: true });
    } catch (e) {
      if (isPermissionError(e)) {
        checks.push({ service, action, allowed: false, error: e.message });
      } else {
        // No es error de permisos — el servicio respondio (puede ser error de uso, timeout, etc.)
        checks.push({ service, action, allowed: true, warning: e.message });
      }
    }
  }

  // CloudFormation
  await runCheck('CloudFormation', 'ListStacks', async () => {
    const { CloudFormationClient, ListStacksCommand } = require('@aws-sdk/client-cloudformation');
    const client = new CloudFormationClient({ region });
    await client.send(new ListStacksCommand({ StackStatusFilter: ['CREATE_COMPLETE'] }));
  });

  // EC2
  await runCheck('EC2', 'DescribeRegions', async () => {
    const { EC2Client, DescribeRegionsCommand } = require('@aws-sdk/client-ec2');
    const client = new EC2Client({ region });
    await client.send(new DescribeRegionsCommand({}));
  });

  // Cognito
  await runCheck('Cognito', 'ListUserPools', async () => {
    const { CognitoIdentityProviderClient, ListUserPoolsCommand } = require('@aws-sdk/client-cognito-identity-provider');
    const client = new CognitoIdentityProviderClient({ region });
    await client.send(new ListUserPoolsCommand({ MaxResults: 1 }));
  });

  // SES
  await runCheck('SES', 'GetIdentityVerification', async () => {
    const { SESClient, GetIdentityVerificationAttributesCommand } = require('@aws-sdk/client-ses');
    const client = new SESClient({ region });
    await client.send(new GetIdentityVerificationAttributesCommand({ Identities: ['test@check.com'] }));
  });

  // Secrets Manager
  await runCheck('Secrets Manager', 'ListSecrets', async () => {
    const { SecretsManagerClient, ListSecretsCommand } = require('@aws-sdk/client-secrets-manager');
    const client = new SecretsManagerClient({ region });
    await client.send(new ListSecretsCommand({ MaxResults: 1 }));
  });

  // SSM
  await runCheck('SSM', 'DescribeInstances', async () => {
    const { SSMClient, DescribeInstanceInformationCommand } = require('@aws-sdk/client-ssm');
    const client = new SSMClient({ region });
    await client.send(new DescribeInstanceInformationCommand({ MaxResults: 5 }));
  });

  // Bedrock
  await runCheck('Bedrock', 'ListModels', async () => {
    const { BedrockClient, ListFoundationModelsCommand } = require('@aws-sdk/client-bedrock');
    const client = new BedrockClient({ region });
    await client.send(new ListFoundationModelsCommand({ byProvider: 'Anthropic' }));
  });

  // S3
  await runCheck('S3', 'ListBuckets', async () => {
    const { S3Client, ListBucketsCommand } = require('@aws-sdk/client-s3');
    const client = new S3Client({ region });
    await client.send(new ListBucketsCommand({}));
  });

  // Resumen
  const allowed = checks.filter(c => c.allowed).length;
  const total = checks.length;
  const allOk = allowed === total;

  const required = ['CloudFormation', 'EC2', 'S3', 'Cognito', 'SSM', 'Secrets Manager'];
  const optional = ['SES', 'Bedrock'];

  const missingRequired = checks.filter(c => !c.allowed && required.includes(c.service));
  const missingOptional = checks.filter(c => !c.allowed && optional.includes(c.service));

  return {
    checks,
    allowed,
    total,
    allOk,
    requiredOk: missingRequired.length === 0,
    missingRequired: missingRequired.map(c => c.service),
    missingOptional: missingOptional.map(c => c.service),
    summary: `${allowed}/${total} servicios accesibles`
  };
}

module.exports = { checkPermissions };
