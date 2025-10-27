#!/usr/bin/env node
/**
 * set-apex-origins.mjs
 * 
 * This script updates the CloudFront distribution to ensure the API Gateway origin
 * is properly configured for the /api/v1/* behavior.
 * 
 * It queries CloudFormation to get the API Gateway URL from the ApiStack outputs,
 * then updates the CloudFront distribution's origin configuration.
 */

import { CloudFormationClient, DescribeStacksCommand } from '@aws-sdk/client-cloudformation';
import { CloudFrontClient, GetDistributionConfigCommand, UpdateDistributionCommand } from '@aws-sdk/client-cloudfront';

// Configuration
const REGION = process.env.AWS_REGION || 'eu-west-2';
const US_EAST_1 = 'us-east-1';
const ENVIRONMENT_NAME = process.env.ENVIRONMENT_NAME || 'ci';
const DEPLOYMENT_NAME = process.env.DEPLOYMENT_NAME || ENVIRONMENT_NAME;

// Stack names
const API_STACK_NAME = `app-${DEPLOYMENT_NAME}-ApiStack`;
const EDGE_STACK_NAME = `del-${DEPLOYMENT_NAME}-EdgeStack`;

const cfnClient = new CloudFormationClient({ region: REGION });
const cfnClientUsEast1 = new CloudFormationClient({ region: US_EAST_1 });
const cloudFrontClient = new CloudFrontClient({ region: US_EAST_1 });

/**
 * Get CloudFormation stack outputs
 */
async function getStackOutputs(client, stackName) {
  try {
    const command = new DescribeStacksCommand({ StackName: stackName });
    const response = await client.send(command);
    
    if (!response.Stacks || response.Stacks.length === 0) {
      throw new Error(`Stack ${stackName} not found`);
    }
    
    const outputs = {};
    for (const output of response.Stacks[0].Outputs || []) {
      outputs[output.OutputKey] = output.OutputValue;
    }
    
    return outputs;
  } catch (error) {
    console.error(`Error getting outputs for stack ${stackName}:`, error.message);
    throw error;
  }
}

/**
 * Extract hostname from URL
 */
function getHostFromUrl(url) {
  if (!url) return null;
  
  const match = url.match(/^https?:\/\/([^\/]+)/);
  return match ? match[1] : null;
}

/**
 * Update CloudFront distribution origin
 */
async function updateDistributionOrigin(distributionId, apiGatewayUrl) {
  try {
    console.log(`\nUpdating CloudFront distribution ${distributionId}...`);
    
    // Get current distribution configuration
    const getConfigCommand = new GetDistributionConfigCommand({ Id: distributionId });
    const configResponse = await cloudFrontClient.send(getConfigCommand);
    
    const config = configResponse.DistributionConfig;
    const etag = configResponse.ETag;
    
    if (!config) {
      throw new Error('Failed to get distribution configuration');
    }
    
    // Extract hostname from API Gateway URL
    const apiGatewayHost = getHostFromUrl(apiGatewayUrl);
    if (!apiGatewayHost) {
      throw new Error(`Invalid API Gateway URL: ${apiGatewayUrl}`);
    }
    
    console.log(`API Gateway host: ${apiGatewayHost}`);
    
    // Find or create the API Gateway origin
    let originFound = false;
    const originId = 'api-gateway-origin';
    
    // Check if origin already exists
    for (const origin of config.Origins.Items) {
      if (origin.Id === originId || origin.DomainName === apiGatewayHost) {
        console.log(`Updating existing origin: ${origin.Id}`);
        origin.Id = originId;
        origin.DomainName = apiGatewayHost;
        origin.CustomOriginConfig = {
          HTTPPort: 80,
          HTTPSPort: 443,
          OriginProtocolPolicy: 'https-only',
          OriginSslProtocols: {
            Quantity: 1,
            Items: ['TLSv1.2']
          }
        };
        originFound = true;
        break;
      }
    }
    
    // If origin doesn't exist, add it
    if (!originFound) {
      console.log(`Adding new origin: ${originId}`);
      config.Origins.Items.push({
        Id: originId,
        DomainName: apiGatewayHost,
        CustomOriginConfig: {
          HTTPPort: 80,
          HTTPSPort: 443,
          OriginProtocolPolicy: 'https-only',
          OriginSslProtocols: {
            Quantity: 1,
            Items: ['TLSv1.2']
          }
        },
        ConnectionAttempts: 3,
        ConnectionTimeout: 10,
        OriginShield: {
          Enabled: false
        }
      });
      config.Origins.Quantity = config.Origins.Items.length;
    }
    
    // Update or create the /api/v1/* cache behavior
    let behaviorFound = false;
    const targetPath = '/api/v1/*';
    
    for (const behavior of config.CacheBehaviors?.Items || []) {
      if (behavior.PathPattern === targetPath) {
        console.log(`Updating cache behavior for ${targetPath}`);
        behavior.TargetOriginId = originId;
        behaviorFound = true;
        break;
      }
    }
    
    if (!behaviorFound) {
      console.log(`Adding new cache behavior for ${targetPath}`);
      if (!config.CacheBehaviors) {
        config.CacheBehaviors = {
          Quantity: 0,
          Items: []
        };
      }
      
      config.CacheBehaviors.Items.push({
        PathPattern: targetPath,
        TargetOriginId: originId,
        ViewerProtocolPolicy: 'redirect-to-https',
        AllowedMethods: {
          Quantity: 7,
          Items: ['GET', 'HEAD', 'OPTIONS', 'PUT', 'POST', 'PATCH', 'DELETE'],
          CachedMethods: {
            Quantity: 2,
            Items: ['GET', 'HEAD']
          }
        },
        Compress: true,
        CachePolicyId: '4135ea2d-6df8-44a3-9df3-4b5a84be39ad', // CachingDisabled policy
        OriginRequestPolicyId: 'b689b0a8-53d0-40ab-baf2-68738e2966ac', // AllViewerExceptHostHeader policy
        ResponseHeadersPolicyId: '5cc3b908-e619-4b99-88e5-2cf7f45965bd', // CORS-With-Preflight-And-SecurityHeadersPolicy
        SmoothStreaming: false,
        Compress: true,
        FieldLevelEncryptionId: '',
        TrustedSigners: {
          Enabled: false,
          Quantity: 0
        },
        TrustedKeyGroups: {
          Enabled: false,
          Quantity: 0
        },
        MinTTL: 0
      });
      config.CacheBehaviors.Quantity = config.CacheBehaviors.Items.length;
    }
    
    // Update the distribution
    const updateCommand = new UpdateDistributionCommand({
      Id: distributionId,
      DistributionConfig: config,
      IfMatch: etag
    });
    
    await cloudFrontClient.send(updateCommand);
    console.log(`✓ Successfully updated distribution ${distributionId}`);
    console.log(`  - Origin: ${apiGatewayHost}`);
    console.log(`  - Behavior: ${targetPath} -> ${originId}`);
    
    return true;
  } catch (error) {
    console.error('Error updating distribution:', error.message);
    throw error;
  }
}

/**
 * Main execution
 */
async function main() {
  try {
    console.log('='.repeat(60));
    console.log('CloudFront Origin Configuration Tool');
    console.log('='.repeat(60));
    console.log(`Environment: ${ENVIRONMENT_NAME}`);
    console.log(`Deployment: ${DEPLOYMENT_NAME}`);
    console.log(`Region: ${REGION}`);
    console.log('');
    
    // Get API Gateway URL from ApiStack
    console.log(`Fetching outputs from ${API_STACK_NAME}...`);
    const apiOutputs = await getStackOutputs(cfnClient, API_STACK_NAME);
    const httpApiUrl = apiOutputs.HttpApiUrl;
    
    if (!httpApiUrl) {
      throw new Error('HttpApiUrl not found in ApiStack outputs');
    }
    
    console.log(`✓ Found HTTP API URL: ${httpApiUrl}`);
    
    // Get Distribution ID from EdgeStack
    console.log(`\nFetching outputs from ${EDGE_STACK_NAME}...`);
    const edgeOutputs = await getStackOutputs(cfnClientUsEast1, EDGE_STACK_NAME);
    const distributionId = edgeOutputs.DistributionId;
    
    if (!distributionId) {
      throw new Error('DistributionId not found in EdgeStack outputs');
    }
    
    console.log(`✓ Found Distribution ID: ${distributionId}`);
    
    // Update the CloudFront distribution
    await updateDistributionOrigin(distributionId, httpApiUrl);
    
    console.log('\n' + '='.repeat(60));
    console.log('✓ Configuration complete!');
    console.log('='.repeat(60));
    console.log('\nNote: CloudFront changes may take several minutes to propagate.');
    console.log(`Test the API at: https://${ENVIRONMENT_NAME}.submit.diyaccounting.co.uk/api/v1/catalog`);
    
  } catch (error) {
    console.error('\n' + '='.repeat(60));
    console.error('✗ Configuration failed!');
    console.error('='.repeat(60));
    console.error(`Error: ${error.message}`);
    console.error('\nStack trace:', error);
    process.exit(1);
  }
}

// Run the script
main();
