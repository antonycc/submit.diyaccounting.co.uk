#!/usr/bin/env bash
# Provision AWS Account for DIY Accounting Submit
#
# This script creates the necessary IAM roles and infrastructure for deploying
# the DIY Accounting Submit application to a new or existing AWS account.
#
# Usage:
#   ./scripts/provision-account.sh <aws-account-id> <environment> [region]
#
# Example:
#   ./scripts/provision-account.sh 123456789012 ci eu-west-2
#
# Requirements:
# - AWS CLI configured with credentials for the target account
# - jq installed for JSON processing
# - Appropriate permissions to create IAM roles and policies

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Parse arguments
AWS_ACCOUNT_ID="${1:-}"
ENVIRONMENT="${2:-}"
AWS_REGION="${3:-eu-west-2}"

if [ -z "$AWS_ACCOUNT_ID" ] || [ -z "$ENVIRONMENT" ]; then
  echo -e "${RED}Usage: $0 <aws-account-id> <environment> [region]${NC}"
  echo "Example: $0 123456789012 ci eu-west-2"
  exit 1
fi

# Validate account ID format
if ! [[ "$AWS_ACCOUNT_ID" =~ ^[0-9]{12}$ ]]; then
  echo -e "${RED}Error: AWS account ID must be 12 digits${NC}"
  exit 1
fi

# Validate environment
if [[ "$ENVIRONMENT" != "ci" ]] && [[ "$ENVIRONMENT" != "prod" ]]; then
  echo -e "${RED}Error: Environment must be 'ci' or 'prod'${NC}"
  exit 1
fi

echo -e "${GREEN}=== Provisioning AWS Account ===${NC}"
echo "Account ID: $AWS_ACCOUNT_ID"
echo "Environment: $ENVIRONMENT"
echo "Region: $AWS_REGION"
echo ""

# Check AWS CLI access
echo "Verifying AWS access..."
CURRENT_ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
if [ "$CURRENT_ACCOUNT" != "$AWS_ACCOUNT_ID" ]; then
  echo -e "${YELLOW}Warning: Current AWS credentials are for account $CURRENT_ACCOUNT${NC}"
  echo -e "${YELLOW}You need credentials for account $AWS_ACCOUNT_ID${NC}"
  read -p "Continue anyway? (y/n) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
  fi
fi

# GitHub repository info (update if forked)
GITHUB_ORG="antonycc"
GITHUB_REPO="submit.diyaccounting.co.uk"

echo -e "${GREEN}Step 1: Create OIDC Provider for GitHub Actions${NC}"

# Check if OIDC provider exists
OIDC_ARN="arn:aws:iam::${AWS_ACCOUNT_ID}:oidc-provider/token.actions.githubusercontent.com"
if aws iam get-open-id-connect-provider --open-id-connect-provider-arn "$OIDC_ARN" &>/dev/null; then
  echo "✓ OIDC provider already exists"
else
  echo "Creating OIDC provider..."
  
  # GitHub's OIDC thumbprint (verified as of 2024)
  # This is GitHub's SSL certificate thumbprint for token.actions.githubusercontent.com
  # To verify/update: openssl s_client -servername token.actions.githubusercontent.com \
  #   -showcerts -connect token.actions.githubusercontent.com:443 2>/dev/null \
  #   | openssl x509 -fingerprint -sha1 -noout | cut -d'=' -f2 | tr -d ':'
  # Official thumbprint documented at: https://github.blog/changelog/2023-06-27-github-actions-update-on-oidc-integration-with-aws/
  THUMBPRINT="6938fd4d98bab03faadb97b34396831e3780aea1"
  
  aws iam create-open-id-connect-provider \
    --url "https://token.actions.githubusercontent.com" \
    --client-id-list "sts.amazonaws.com" \
    --thumbprint-list "$THUMBPRINT" \
    --tags Key=Environment,Value="$ENVIRONMENT" Key=ManagedBy,Value="provision-account.sh"
  
  echo "✓ Created OIDC provider"
fi

echo ""
echo -e "${GREEN}Step 2: Create GitHub Actions Role${NC}"

ACTIONS_ROLE_NAME="submit-github-actions-role"
ACTIONS_ROLE_ARN="arn:aws:iam::${AWS_ACCOUNT_ID}:role/${ACTIONS_ROLE_NAME}"

# Create trust policy for GitHub Actions
cat > /tmp/github-actions-trust-policy.json << EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::${AWS_ACCOUNT_ID}:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
        },
        "StringLike": {
          "token.actions.githubusercontent.com:sub": "repo:${GITHUB_ORG}/${GITHUB_REPO}:*"
        }
      }
    }
  ]
}
EOF

if aws iam get-role --role-name "$ACTIONS_ROLE_NAME" &>/dev/null; then
  echo "✓ GitHub Actions role already exists"
  echo "  Updating trust policy..."
  aws iam update-assume-role-policy \
    --role-name "$ACTIONS_ROLE_NAME" \
    --policy-document file:///tmp/github-actions-trust-policy.json
else
  echo "Creating GitHub Actions role..."
  aws iam create-role \
    --role-name "$ACTIONS_ROLE_NAME" \
    --assume-role-policy-document file:///tmp/github-actions-trust-policy.json \
    --description "Role for GitHub Actions to deploy DIY Accounting Submit" \
    --tags Key=Environment,Value="$ENVIRONMENT" Key=ManagedBy,Value="provision-account.sh"
  
  echo "✓ Created GitHub Actions role"
fi

# Create inline policy for GitHub Actions role
cat > /tmp/github-actions-policy.json << EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AssumeDeploymentRole",
      "Effect": "Allow",
      "Action": "sts:AssumeRole",
      "Resource": "arn:aws:iam::${AWS_ACCOUNT_ID}:role/submit-deployment-role"
    },
    {
      "Sid": "ReadOnlyAccess",
      "Effect": "Allow",
      "Action": [
        "sts:GetCallerIdentity",
        "cloudformation:DescribeStacks",
        "cloudformation:ListStacks"
      ],
      "Resource": "*"
    }
  ]
}
EOF

echo "  Attaching policy..."
aws iam put-role-policy \
  --role-name "$ACTIONS_ROLE_NAME" \
  --policy-name "AssumeDeploymentRole" \
  --policy-document file:///tmp/github-actions-policy.json

echo "✓ Policy attached"

echo ""
echo -e "${GREEN}Step 3: Create Deployment Role${NC}"

DEPLOYMENT_ROLE_NAME="submit-deployment-role"
DEPLOYMENT_ROLE_ARN="arn:aws:iam::${AWS_ACCOUNT_ID}:role/${DEPLOYMENT_ROLE_NAME}"

# Create trust policy for deployment role
cat > /tmp/deployment-trust-policy.json << EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "AWS": "${ACTIONS_ROLE_ARN}"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
EOF

if aws iam get-role --role-name "$DEPLOYMENT_ROLE_NAME" &>/dev/null; then
  echo "✓ Deployment role already exists"
  echo "  Updating trust policy..."
  aws iam update-assume-role-policy \
    --role-name "$DEPLOYMENT_ROLE_NAME" \
    --policy-document file:///tmp/deployment-trust-policy.json
else
  echo "Creating deployment role..."
  aws iam create-role \
    --role-name "$DEPLOYMENT_ROLE_NAME" \
    --assume-role-policy-document file:///tmp/deployment-trust-policy.json \
    --description "Role for deploying DIY Accounting Submit infrastructure" \
    --tags Key=Environment,Value="$ENVIRONMENT" Key=ManagedBy,Value="provision-account.sh"
  
  echo "✓ Created deployment role"
fi

# Create comprehensive deployment policy
# NOTE: This policy grants broad permissions for CDK deployments
# While it uses wildcards for simplicity, in production you may want to:
# 1. Scope resources to specific naming patterns (e.g., ci-* or prod-*)
# 2. Use AWS Organizations Service Control Policies (SCPs) for account-wide limits
# 3. Add Condition clauses to restrict actions to specific VPCs or regions
# 4. Consider AWS Deployment Framework or AWS Control Tower for enterprise governance
#
# The broad permissions are necessary because CDK creates many resources dynamically
# and predicting exact ARNs is difficult. AWS recommends this approach for CDK:
# https://docs.aws.amazon.com/cdk/latest/guide/bootstrapping.html
cat > /tmp/deployment-policy.json << 'EOF'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "CloudFormationFull",
      "Effect": "Allow",
      "Action": "cloudformation:*",
      "Resource": "*"
    },
    {
      "Sid": "S3Management",
      "Effect": "Allow",
      "Action": [
        "s3:*"
      ],
      "Resource": "*"
    },
    {
      "Sid": "LambdaManagement",
      "Effect": "Allow",
      "Action": [
        "lambda:*"
      ],
      "Resource": "*"
    },
    {
      "Sid": "IAMManagement",
      "Effect": "Allow",
      "Action": [
        "iam:*"
      ],
      "Resource": "*"
    },
    {
      "Sid": "CloudFrontManagement",
      "Effect": "Allow",
      "Action": [
        "cloudfront:*"
      ],
      "Resource": "*"
    },
    {
      "Sid": "Route53Management",
      "Effect": "Allow",
      "Action": [
        "route53:*"
      ],
      "Resource": "*"
    },
    {
      "Sid": "ACMManagement",
      "Effect": "Allow",
      "Action": [
        "acm:*"
      ],
      "Resource": "*"
    },
    {
      "Sid": "SecretsManagerManagement",
      "Effect": "Allow",
      "Action": [
        "secretsmanager:*"
      ],
      "Resource": "*"
    },
    {
      "Sid": "CognitoManagement",
      "Effect": "Allow",
      "Action": [
        "cognito-idp:*",
        "cognito-identity:*"
      ],
      "Resource": "*"
    },
    {
      "Sid": "LogsManagement",
      "Effect": "Allow",
      "Action": [
        "logs:*"
      ],
      "Resource": "*"
    },
    {
      "Sid": "CloudWatchManagement",
      "Effect": "Allow",
      "Action": [
        "cloudwatch:*",
        "rum:*"
      ],
      "Resource": "*"
    },
    {
      "Sid": "ECRManagement",
      "Effect": "Allow",
      "Action": [
        "ecr:*"
      ],
      "Resource": "*"
    },
    {
      "Sid": "EventBridgeManagement",
      "Effect": "Allow",
      "Action": [
        "events:*",
        "scheduler:*"
      ],
      "Resource": "*"
    },
    {
      "Sid": "SSMManagement",
      "Effect": "Allow",
      "Action": [
        "ssm:*"
      ],
      "Resource": "*"
    },
    {
      "Sid": "CloudTrailManagement",
      "Effect": "Allow",
      "Action": [
        "cloudtrail:*"
      ],
      "Resource": "*"
    },
    {
      "Sid": "XRayManagement",
      "Effect": "Allow",
      "Action": [
        "xray:*"
      ],
      "Resource": "*"
    },
    {
      "Sid": "CDKBootstrapManagement",
      "Effect": "Allow",
      "Action": [
        "sts:AssumeRole"
      ],
      "Resource": "arn:aws:iam::*:role/cdk-*"
    }
  ]
}
EOF

echo "  Attaching deployment policy..."
aws iam put-role-policy \
  --role-name "$DEPLOYMENT_ROLE_NAME" \
  --policy-name "DeploymentPermissions" \
  --policy-document file:///tmp/deployment-policy.json

echo "✓ Deployment policy attached"

echo ""
echo -e "${GREEN}Step 4: Create Route53 Hosted Zone${NC}"

if [ "$ENVIRONMENT" = "prod" ]; then
  ZONE_NAME="submit.diyaccounting.co.uk"
else
  ZONE_NAME="${ENVIRONMENT}.submit.diyaccounting.co.uk"
fi

EXISTING_ZONE_ID=$(aws route53 list-hosted-zones-by-name \
  --dns-name "${ZONE_NAME}." \
  --query "HostedZones[?Name=='${ZONE_NAME}.'].Id" \
  --output text | cut -d'/' -f3 || echo "")

if [ -n "$EXISTING_ZONE_ID" ]; then
  echo "✓ Hosted zone already exists: $EXISTING_ZONE_ID"
  ZONE_ID="$EXISTING_ZONE_ID"
else
  echo "Creating hosted zone for ${ZONE_NAME}..."
  ZONE_RESPONSE=$(aws route53 create-hosted-zone \
    --name "${ZONE_NAME}" \
    --caller-reference "provision-$(date +%s)" \
    --output json)
  
  ZONE_ID=$(echo "$ZONE_RESPONSE" | jq -r '.HostedZone.Id' | cut -d'/' -f3)
  echo "✓ Created hosted zone: $ZONE_ID"
fi

# Get nameservers
NAMESERVERS=$(aws route53 get-hosted-zone \
  --id "${ZONE_ID}" \
  --query 'DelegationSet.NameServers[]' \
  --output text | tr '\t' ',')

echo "  Zone ID: $ZONE_ID"
echo "  Nameservers: $NAMESERVERS"

echo ""
echo -e "${GREEN}Step 5: Bootstrap AWS CDK${NC}"

echo "Bootstrapping CDK in ${AWS_REGION}..."
npx cdk bootstrap \
  "aws://${AWS_ACCOUNT_ID}/${AWS_REGION}" \
  --cloudformation-execution-policies "arn:aws:iam::aws:policy/AdministratorAccess" \
  || echo -e "${YELLOW}CDK bootstrap may have partially failed - check output above${NC}"

echo ""
echo "Bootstrapping CDK in us-east-1 (for CloudFront)..."
npx cdk bootstrap \
  "aws://${AWS_ACCOUNT_ID}/us-east-1" \
  --cloudformation-execution-policies "arn:aws:iam::aws:policy/AdministratorAccess" \
  || echo -e "${YELLOW}CDK bootstrap may have partially failed - check output above${NC}"

echo ""
echo -e "${GREEN}=== Provisioning Complete ===${NC}"
echo ""
echo -e "${YELLOW}Next Steps:${NC}"
echo ""
echo "1. Configure GitHub Environment Variables in Settings → Environments → ${ENVIRONMENT}:"
echo "   AWS_ACCOUNT_ID=${AWS_ACCOUNT_ID}"
echo "   AWS_REGION=${AWS_REGION}"
echo "   AWS_HOSTED_ZONE_ID=${ZONE_ID}"
echo ""
echo "2. Add DNS delegation in root domain (diyaccounting.co.uk):"
echo "   Create NS record for '${ZONE_NAME}' pointing to:"
for ns in ${NAMESERVERS//,/ }; do
  echo "     - $ns"
done
echo ""
echo "3. Configure GitHub Secrets for ${ENVIRONMENT}:"
echo "   - GOOGLE_CLIENT_SECRET"
echo "   - HMRC_CLIENT_SECRET"
echo ""
echo "4. Test deployment:"
echo "   Run the deploy workflow targeting the ${ENVIRONMENT} environment"
echo ""
echo "✓ Account provisioning complete!"

# Cleanup temp files
rm -f /tmp/github-actions-trust-policy.json \
      /tmp/github-actions-policy.json \
      /tmp/deployment-trust-policy.json \
      /tmp/deployment-policy.json
