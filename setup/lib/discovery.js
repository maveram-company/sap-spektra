// ============================================================================
//  SAP Spektra v1.0 — Setup Portal — Auto-discovery de recursos AWS
// ============================================================================

'use strict';

const { createClients, getRegionLabel } = require('./utils');
const { DescribeInstancesCommand, DescribeVpcsCommand, DescribeSubnetsCommand, DescribeRegionsCommand } = require('@aws-sdk/client-ec2');
const { DescribeInstanceInformationCommand } = require('@aws-sdk/client-ssm');
const { ListStacksCommand } = require('@aws-sdk/client-cloudformation');
const { ListSecretsCommand } = require('@aws-sdk/client-secrets-manager');
const { ListFoundationModelsCommand } = require('@aws-sdk/client-bedrock');
const { GetIdentityVerificationAttributesCommand } = require('@aws-sdk/client-ses');

// ── Listar regiones AWS disponibles ──
async function listRegions() {
  const { EC2Client } = require('@aws-sdk/client-ec2');
  const ec2 = new EC2Client({ region: 'us-east-1' });
  const result = await ec2.send(new DescribeRegionsCommand({}));

  const recommended = ['us-east-1', 'us-west-2', 'eu-west-1', 'eu-central-1', 'ap-southeast-1'];

  return result.Regions.map(r => ({
    name: r.RegionName,
    recommended: recommended.includes(r.RegionName),
    label: getRegionLabel(r.RegionName)
  })).sort((a, b) => (b.recommended ? 1 : 0) - (a.recommended ? 1 : 0));
}

// ── Descubrir todos los recursos AWS en una region ──
async function discoverResources(region) {
  const clients = createClients(region);
  const discovery = {};

  // 1. SSM Instances
  try {
    const ssmResult = await clients.ssm.send(new DescribeInstanceInformationCommand({ MaxResults: 50 }));
    discovery.ssmInstances = (ssmResult.InstanceInformationList || []).map(i => ({
      instanceId: i.InstanceId,
      name: i.Name || i.ComputerName || i.InstanceId,
      platform: i.PlatformType,
      platformName: i.PlatformName,
      ipAddress: i.IPAddress,
      pingStatus: i.PingStatus,
      agentVersion: i.AgentVersion,
      isOnline: i.PingStatus === 'Online'
    }));
  } catch (e) {
    discovery.ssmInstances = [];
    discovery.ssmError = e.message;
  }

  // 2. EC2 Instances
  try {
    const ec2Result = await clients.ec2.send(new DescribeInstancesCommand({
      Filters: [{ Name: 'instance-state-name', Values: ['running'] }],
      MaxResults: 50
    }));
    discovery.ec2Instances = [];
    for (const reservation of (ec2Result.Reservations || [])) {
      for (const inst of (reservation.Instances || [])) {
        const nameTag = (inst.Tags || []).find(t => t.Key === 'Name');
        discovery.ec2Instances.push({
          instanceId: inst.InstanceId,
          name: nameTag?.Value || inst.InstanceId,
          type: inst.InstanceType,
          platform: inst.Platform === 'windows' ? 'Windows' : 'Linux',
          privateIp: inst.PrivateIpAddress,
          publicIp: inst.PublicIpAddress,
          vpcId: inst.VpcId,
          subnetId: inst.SubnetId,
          state: inst.State.Name,
          hasSSM: (discovery.ssmInstances || []).some(s => s.instanceId === inst.InstanceId)
        });
      }
    }
  } catch (e) {
    discovery.ec2Instances = [];
  }

  // 3. VPCs
  try {
    const vpcResult = await clients.ec2.send(new DescribeVpcsCommand({}));
    discovery.vpcs = (vpcResult.Vpcs || []).map(v => {
      const nameTag = (v.Tags || []).find(t => t.Key === 'Name');
      return { vpcId: v.VpcId, name: nameTag?.Value || v.VpcId, cidr: v.CidrBlock, isDefault: v.IsDefault };
    });
  } catch (e) {
    discovery.vpcs = [];
  }

  // 4. Subnets
  try {
    const subResult = await clients.ec2.send(new DescribeSubnetsCommand({}));
    discovery.subnets = (subResult.Subnets || []).map(s => {
      const nameTag = (s.Tags || []).find(t => t.Key === 'Name');
      return {
        subnetId: s.SubnetId, name: nameTag?.Value || s.SubnetId,
        vpcId: s.VpcId, az: s.AvailabilityZone, cidr: s.CidrBlock,
        availableIps: s.AvailableIpAddressCount, isPublic: s.MapPublicIpOnLaunch
      };
    });
  } catch (e) {
    discovery.subnets = [];
  }

  // 5. Stacks existentes
  try {
    const stackResult = await clients.cfn.send(new ListStacksCommand({
      StackStatusFilter: ['CREATE_COMPLETE', 'UPDATE_COMPLETE', 'UPDATE_ROLLBACK_COMPLETE']
    }));
    discovery.existingStacks = (stackResult.StackSummaries || [])
      .filter(s => s.StackName.toLowerCase().includes('sap-alwaysops') || s.StackName.toLowerCase().includes('alwaysops'))
      .map(s => ({ stackName: s.StackName, status: s.StackStatus, createdAt: s.CreationTime }));
  } catch (e) {
    discovery.existingStacks = [];
  }

  // 6. Secretos existentes
  try {
    const secretsResult = await clients.secrets.send(new ListSecretsCommand({ MaxResults: 20 }));
    discovery.existingSecrets = (secretsResult.SecretList || [])
      .filter(s => s.Name.includes('sap-alwaysops'))
      .map(s => ({ name: s.Name, lastChanged: s.LastChangedDate }));
  } catch (e) {
    discovery.existingSecrets = [];
  }

  // 7. Bedrock (Claude models)
  try {
    const bedrockResult = await clients.bedrock.send(new ListFoundationModelsCommand({ byProvider: 'Anthropic' }));
    discovery.bedrockModels = (bedrockResult.modelSummaries || [])
      .filter(m => m.modelId.includes('claude'))
      .map(m => ({ modelId: m.modelId, name: m.modelName, status: m.modelLifecycle?.status }));
    discovery.bedrockAvailable = discovery.bedrockModels.length > 0;
  } catch (e) {
    discovery.bedrockAvailable = false;
    discovery.bedrockError = 'Bedrock no disponible en esta region o sin permisos';
  }

  // 8. SES
  try {
    await clients.ses.send(new GetIdentityVerificationAttributesCommand({ Identities: ['test@example.com'] }));
    discovery.sesAvailable = true;
  } catch (e) {
    discovery.sesAvailable = false;
  }

  return discovery;
}

module.exports = { listRegions, discoverResources };
