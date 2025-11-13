# GitHub Actions Workflows

This directory contains CI/CD workflows for the DIY Accounting Submit application.

## Workflows Overview

### test.yml

**Purpose**: Continuous testing workflow that runs on every push and daily schedule.

**Triggers**:
- Push to any branch (except `gh_pages`)
- Manual dispatch (`workflow_dispatch`)
- Workflow call from other workflows
- Daily at 04:23 UTC (`schedule`)

**Key Steps**:
1. Checkout code
2. Setup Java 21 and Node 22
3. Run linting (ESLint + Prettier)
4. Run formatting checks (Prettier + Spotless)
5. Run unit tests (Vitest)
6. Run integration tests (Vitest)
7. Run system tests (Vitest with Docker)
8. Run browser tests (Playwright)
9. Run behavior tests (Playwright)
10. Build CDK stacks (Docker + Maven)
11. Report test results

**Configuration**:
- Java Version: 21
- Node Version: 22
- AWS Region: eu-west-2
- AWS Account: 887764105431

**Inputs**:
- `environment-name`: Override environment (optional: ci, prod)
- `deployment-name`: Override deployment name (optional)

### deploy.yml

**Purpose**: Main deployment workflow for staging and production environments.

**Triggers**:
- Push to any branch (except `gh_pages`, `dependabot/**`)
- Manual dispatch with configuration options
- Daily at 04:11 UTC (`schedule`)

**Key Steps**:
1. Run all tests (via test.yml workflow)
2. Assume AWS deployment role
3. Build base Docker image
4. Synth CDK stacks (environment, application, delivery)
5. Deploy stacks to AWS:
   - Environment stacks (Observability, Data, Identity, Apex)
   - Application stacks (Dev, Auth, HMRC, Account, API, Ops)
   - Delivery stacks (Edge, Publish)
6. Configure CloudFront origins
7. Run post-deployment tests
8. Setup self-destruct timer (non-prod)

**Deployment Stages**:
1. **Environment**: Core infrastructure (VPC, databases, identity)
2. **Application**: Lambda functions and APIs
3. **Delivery**: CloudFront CDN and static assets

**Configuration Options** (workflow_dispatch):
- `forceAllStackDeployment`: Force redeploy all stacks (default: false)
- `skipDeploy`: Run tests only, skip deployment (default: false)
- `environment-name`: Override environment
- `deployment-name`: Override deployment name
- `loadTestDuration`: Load test duration (default: 30s)
- `selfDestructDelayHours`: Hours until auto-cleanup for non-prod (default: 1)
- `convertTestVideo`: Convert test videos to mp4 (default: false)

**Concurrency**: One deployment per branch at a time (cancel-in-progress: false)

### deploy-environment.yml

**Purpose**: Deploy or update environment-level infrastructure only.

**Triggers**:
- Manual dispatch (`workflow_dispatch`)
- Workflow call from other workflows

**Key Steps**:
1. Setup AWS credentials
2. Build CDK application
3. Synth environment stacks
4. Deploy ObservabilityStack, DataStack, IdentityStack, ApexStack

**Use Cases**:
- Update core infrastructure without redeploying application
- Separate deployment of foundational resources
- Infrastructure maintenance and updates

### destroy.yml

**Purpose**: Tear down deployed stacks and clean up resources.

**Triggers**:
- Manual dispatch with environment selection
- Automated (via self-destruct mechanism)

**Key Steps**:
1. Verify environment (prevents accidental prod deletion)
2. Empty S3 buckets
3. Destroy delivery stacks
4. Destroy application stacks
5. Destroy environment stacks
6. Clean up log groups
7. Delete CloudFormation stacks

**Safety Features**:
- Requires explicit environment confirmation
- Protected environments (prod) require additional approval
- Validates stack existence before destruction
- Comprehensive resource cleanup

**Inputs**:
- `environment-name`: Target environment (required)
- `deployment-name`: Target deployment (required)

### publish.yml

**Purpose**: Publish package to GitHub Package Registry.

**Triggers**:
- Push to main branch with version changes
- Manual dispatch

**Key Steps**:
1. Build application
2. Run tests
3. Package artifacts
4. Publish to npm registry (GitHub Packages)

**Configuration**:
- Registry: `https://npm.pkg.github.com`
- Package: `@antonycc/submit-diyaccounting-co-uk`

### set-origins.yml

**Purpose**: Update CloudFront distribution origins after deployment.

**Triggers**:
- Manual dispatch
- Called after stack deployment

**Key Steps**:
1. Retrieve Lambda function URLs from CloudFormation outputs
2. Update CloudFront distribution origin configuration
3. Invalidate CloudFront cache

**Use Cases**:
- Update API endpoints after Lambda redeployment
- Fix origin configuration mismatches
- Refresh CDN configuration

### copilot-agent.yml

**Purpose**: GitHub Copilot integration for automated code assistance.

**Triggers**:
- Pull request events
- Issue comments with Copilot mentions

**Key Steps**:
1. Analyze PR or issue context
2. Provide code suggestions
3. Run automated checks
4. Comment results back to PR/issue

### copilot-setup-steps.yml

**Purpose**: Setup steps for Copilot integration in other workflows.

**Triggers**:
- Reusable workflow (called by other workflows)

**Key Steps**:
1. Install Copilot CLI
2. Configure authentication
3. Set environment variables

## Workflow Best Practices

### Branch Strategy

- **main**: Production deployments
- **develop**: CI environment deployments
- **feature/***: Temporary test deployments with auto-cleanup
- **gh_pages**: Documentation (excluded from workflows)
- **dependabot/***: Dependency updates (excluded from auto-deploy)

### Environment Variables

Common environment variables used across workflows:

```yaml
JAVA_VERSION: '21'
NODE_VERSION: '22'
AWS_REGION: 'eu-west-2'
AWS_ACCOUNT_ID: '887764105431'
ACTIONS_ROLE_ARN: 'arn:aws:iam::887764105431:role/submit-github-actions-role'
DEPLOY_ROLE_ARN: 'arn:aws:iam::887764105431:role/submit-deployment-role'
```

### Secrets Required

Set these in GitHub repository secrets:

- `AWS_CERTIFICATE_ARN`: SSL certificate ARN for CloudFront
- `HMRC_CLIENT_ID`: HMRC MTD application client ID
- `HMRC_CLIENT_SECRET`: HMRC MTD application secret
- `DIY_SUBMIT_GOOGLE_CLIENT_ID`: Google OAuth client ID
- `GOOGLE_CLIENT_SECRET`: Google OAuth client secret

### Testing Strategy

Tests are run in stages:

1. **Linting & Formatting**: Code quality checks
2. **Unit Tests**: Fast, isolated component tests
3. **Integration Tests**: Module interaction tests with mocks
4. **System Tests**: End-to-end with Docker containers
5. **Browser Tests**: UI component tests with Playwright
6. **Behavior Tests**: Full user journey tests with Playwright

### Deployment Flow

```
Push → Test → Build → Synth CDK → Deploy Environment → Deploy Application → Deploy Delivery → Configure Origins → Verify
```

### Self-Destruct Mechanism

Non-production environments automatically clean up after a configured delay:

- Default: 1 hour after deployment
- Configurable via `selfDestructDelayHours` input
- Prevents resource waste from abandoned test deployments
- Disabled for production environments

## Troubleshooting Workflows

### Common Issues

#### Test Failures

**Symptom**: Workflow fails during test stage

**Solutions**:
1. Check test logs in GitHub Actions
2. Run tests locally: `npm test`
3. Verify environment variables are set
4. Check for dependency issues: `npm ci`

#### CDK Synth Failures

**Symptom**: CDK synthesis step fails

**Solutions**:
1. Verify Java 21 is installed
2. Check Maven build: `./mvnw clean package`
3. Validate CDK app: `npx cdk synth`
4. Review cdk.json and environment variables

#### Deployment Failures

**Symptom**: Stack deployment fails

**Solutions**:
1. Check AWS credentials and permissions
2. Verify CloudFormation stack status in AWS console
3. Review deployment logs for specific errors
4. Check for resource conflicts or quota limits
5. Validate environment configuration

#### Authentication Errors

**Symptom**: "Unable to locate credentials" or similar AWS errors

**Solutions**:
1. Verify OIDC provider is configured
2. Check IAM role trust relationships
3. Ensure `ACTIONS_ROLE_ARN` is correct
4. Verify `id-token: write` permission in workflow

### Debugging Workflows

Enable debug logging:

1. Set repository secret `ACTIONS_RUNNER_DEBUG` to `true`
2. Set repository secret `ACTIONS_STEP_DEBUG` to `true`
3. Re-run workflow to see detailed logs

Manually trigger workflows:

1. Go to Actions tab in GitHub
2. Select workflow
3. Click "Run workflow"
4. Choose branch and set inputs
5. Monitor execution

## Monitoring and Observability

### GitHub Actions Dashboard

View workflow status:
- [Actions Tab](../../actions): All workflow runs
- [Test Workflow](../../actions/workflows/test.yml): Test runs
- [Deploy Workflow](../../actions/workflows/deploy.yml): Deployments

### AWS CloudWatch

Monitor deployed resources:
- Lambda function logs: `/aws/lambda/{function-name}`
- API Gateway logs: `/aws/apigateway/{api-id}`
- CloudFront logs: S3 bucket for access logs

### Metrics

Key metrics tracked:
- Test pass rate
- Deployment frequency
- Deployment duration
- Failed deployments
- Self-destruct cleanup rate

## Maintenance

### Updating Workflows

When modifying workflows:

1. Test changes in feature branch first
2. Use `workflow_dispatch` for manual testing
3. Monitor first runs closely
4. Document changes in PR description
5. Update this README if behavior changes

### Dependency Updates

Workflow dependencies:
- GitHub Actions: Managed by Dependabot
- AWS CLI: Updated via Docker base image
- CDK: Version in package.json
- Node/Java: Specified in workflow env vars

### Security

Security considerations:
- Secrets are never logged
- OIDC for AWS authentication (no long-lived credentials)
- Least privilege IAM roles
- Protected branches for production
- Required reviews for workflow changes
- Automated security scanning in test workflow

## Related Documentation

- [Main README](../../README.md): Application overview
- [Developer Setup](../../_developers/SETUP.md): Local development
- [API Documentation](../../_developers/API.md): API reference
- [User Guide](../../USERGUIDE.md): End-user documentation

## Version History

- v0.0.2-4: Current version with CDK-based deployment
- Major workflow components: test, deploy, destroy automation

For detailed workflow definitions, see individual `.yml` files in this directory.
