# Claude Code Memory - DIY Accounting Submit

## Quick Reference

**Primary documentation**: See `REPORT_REPOSITORY_CONTENTS.md` for complete architecture, npm scripts, AWS stacks, and directory structure.

**Other AI assistants in this repo**:
- `.junie/guidelines.md` - Junie (testing & iteration focus)
- `.github/copilot-instructions.md` - GitHub Copilot (code review focus)

## Permission Handling (CRITICAL)

**Before starting any task**, review what permissions may be required and request them all upfront:

1. **Analyze the task** - What tools, commands, and access will be needed?
2. **List all permissions** - File access, git operations, shell commands, external services
3. **Request upfront** - Ask for all permissions at the start, not piecemeal during execution

**If a permission is missing mid-task:**
- Continue working on other parts of the task that don't require the missing permission
- Run background tasks that can proceed independently
- Only block and ask when you've exhausted all parallel work options

**Common permissions to consider:**
- Git: commit, push, branch operations
- GitHub CLI: workflow monitoring, PR operations, log retrieval
- Shell: specific command patterns (npm, mvnw, aws, etc.)
- File operations: read/write in specific directories
- External services: API calls, web fetches

## Git Workflow

**You may**: create branches, commit changes, push branches, open pull requests

**You may NOT**: merge PRs, push to main, delete branches, rewrite history

**Branch naming**: `claude/<short-description>`

## Test Commands

Run in sequence to verify code works:
```bash
npm test                              # Unit + system tests (~4s)
./mvnw clean verify                   # Java CDK build
npm run test:submitVatBehaviour-proxy # E2E behaviour tests
```

Capture output for analysis:
```bash
npm test > target/test.txt 2>&1
./mvnw clean verify > target/mvnw.txt 2>&1
npm run test:submitVatBehaviour-proxy > target/behaviour.txt 2>&1
```

Find failures:
```bash
grep -i -n -A 20 -E 'fail|error' target/test.txt
```

**Important**: Behaviour tests generate too much output to read directly - always pipe to file.

## Active Test Monitoring (CRITICAL)

**You MUST actively monitor running tests, not sit waiting for an exit code.**

Behaviour tests (`npm run test:submitVatBehaviour-*`) take approximately 2-3 minutes. If a test appears stuck:

1. **Tail the output file** to see progress:
   ```bash
   tail -f target/behaviour.txt
   ```

2. **Kill stuck processes** if no progress for 60+ seconds:
   ```bash
   pkill -f "playwright|ngrok|server.js"
   ```

3. **Never wait indefinitely** - if a test hasn't produced output in 2 minutes, it's stuck.

**Signs a test is stuck:**
- No new output for 60+ seconds
- "Waiting for..." messages that don't resolve
- Test running longer than 5 minutes total

## HMRC Obligation Flexibility (CRITICAL)

**YOU CANNOT RELY UPON SPECIFIC OBLIGATIONS COMING BACK.**

- HMRC obligations are unpredictable
- Period keys are opaque and cannot be calculated
- Different environments return different obligations
- Tests MUST NOT be overfit to specific responses
- Simulator should NOT encourage hardcoding specific dates/periods

See `_developers/archive/OBLIGATION_FLEXIBILITY_FIX.md` for detailed guidance.

## Target Directory Access

The `./target` directory is always accessible - you do not need to ask about accessing it. This directory contains:
- Test output files (e.g., `target/test.txt`, `target/behaviour.txt`)
- Build artifacts from Maven CDK builds
- Browser test results and screenshots
- Playwright reports and traces

Use this directory freely for capturing test output, reading results, and debugging. Do not ask for permission to access files in `./target`.

## Bash Command Construction (Permission System)

The permission system matches from the **start of the command string**. When you chain commands with `;` or `&&`, only the first command's pattern is matched.

**Do NOT** construct compound commands like:
```bash
# Bad - permission matches "pkill" not "npm run"
pkill -f "playwright"; sleep 2; npm run test:foo > target/output.txt 2>&1
```

**Instead**, run commands separately:
```bash
# Step 1: Clean up
pkill -f "playwright|ngrok|server.js"

# Step 2: Wait
sleep 2

# Step 3: Run test with output capture (use tee, not redirect)
npm run test:submitVatBehaviour-proxy 2>&1 | tee target/behaviour.txt
```

**For output capture**, use `| tee target/filename.txt` instead of `> target/filename.txt` because:
- `npm run:*` is already in the allow list
- `tee` is already in the allow list
- Redirects with `>` create a new command pattern that may not be allowed

## Deployment & Infrastructure Workflow

**Hybrid Orchestration Approach**: You can autonomously handle the commit/push/monitor cycle for infrastructure deployments.

### Permissions
At the start of each session where deployment work is needed, request permission to:
- Use GitHub CLI (`gh`) commands for: push, workflow monitoring, and log retrieval
- Commit and push to feature branches (following Git Workflow rules above)
- Monitor GitHub Actions workflows until completion

### Deployment Cycle (Steps 3.1-3.4)

When implementing features that require infrastructure validation:

1. **Local validation first** (3.1):
   ```bash
   npm test
   ./mvnw clean verify
   npm run test:submitVatBehaviour-proxy
   ```
   Ensure all tests pass locally before pushing.

2. **Commit and push** (3.2):
   ```bash
   git add [files]
   git commit -m "descriptive message"
   git push origin claude/<branch-name>
   ```
   This triggers feature branch deployment via GitHub Actions.

3. **Monitor deployment** (3.3):
   ```bash
   # Watch workflow status
   gh run list --branch claude/<branch-name> --limit 5

   # Get specific workflow run details
   gh run view <run-id>

   # Stream logs for active run
   gh run watch <run-id>

   # Download logs for completed run if needed
   gh run view <run-id> --log
   ```

   **Wait for deployment completion**: Poll every 30-60 seconds until workflow completes.

   **Interpret failures**: Analyze GitHub Actions logs for:
   - CloudFormation stack errors (stuck/failed states)
   - Lambda deployment issues
   - Resource creation timeouts
   - IAM permission problems

   If deployment fails, diagnose from logs and iterate back to step 1.

4. **Validate against AWS deployment** (3.4):
   ```bash
   # Run Playwright tests against CI environment
   npm run test:submitVatBehaviour-ci
   ```

   If tests fail against AWS but passed locally, investigate environment-specific issues:
   - Check AWS-specific configuration in GitHub Actions logs
   - Compare `.env.proxy` vs `.env.ci` settings
   - Look for infrastructure state issues in deployment logs

### Iteration Strategy

- **Success path**: Local tests pass → Push → Deployment succeeds → AWS tests pass → Done
- **Failure at deployment**: Analyze logs → Fix infrastructure code → Back to step 1
- **Failure at AWS tests**: Compare local vs AWS behavior → Fix environment-specific issues → Back to step 1

### Key Principles

- All deployment validation is available through GitHub Actions - no direct AWS console access needed
- Deployment feedback loop is slower than local testing - expect 2-5 minute wait times
- Always capture and analyze full logs when debugging infrastructure issues
- Infrastructure errors are often in CloudFormation events or Lambda initialization logs

## Simulator Website (CRITICAL)

**Never edit files in `web/public-simulator/` directly.** This directory is an automated export/build of the main site in `web/public/`. All changes must be made in `web/public/` and the simulator version will be regenerated from it. Editing the simulator files directly will result in changes being overwritten on the next build.

## Code Quality Rules

- **Trace code paths** before running tests - follow both test execution and AWS deployment paths
- **No unnecessary formatting** - don't reformat lines you're not changing
- **No import reordering** - considered unnecessary formatting
- **No fallback paths** for silent failures when fixing bugs
- **No compatibility adaptors** when refactoring - change names everywhere consistently
- **No "legacy" support code** - all requests originate in this repository, so there's no external caller needing backwards compatibility. Code that accepts parameters and ignores them is toxic. If a parameter isn't used, remove it. Don't add complexity pretending to support something.
- **No backwards-compatible aliases** - when renaming a function/export, update ALL callers in this repository instead of creating aliases like `export const oldName = newName`. All code in this repo can be refactored together; aliases create tech debt and confuse future readers.
- **No server-side fallbacks to favor tests** - if a header or parameter is required, the client must send it. Don't add `|| process.env.X` fallbacks in production code to work around test setup issues.
- Only run `npm run linting-fix && npm run formatting-fix` when specifically asked

## API Error Handling (CRITICAL)

**API endpoints (`/api/*`) must ALWAYS return JSON responses, NEVER HTML.**

- CloudFront custom error responses apply GLOBALLY to all origins (S3 AND API Gateway)
- Do NOT configure CloudFront `.errorResponses()` - it breaks API JSON error handling
- When debugging "Unexpected token '<'" JSON parse errors, check CloudFront error config
- Test error cases (404, 500) against deployed AWS, not just local Express server
- Lambda functions must return proper JSON error responses via `httpResponseHelper.js`
- Express server routes and API Gateway routes MUST match exactly (path params vs query params)

## Four-Tier Testing Pyramid

| Tier | Location | Command | Focus |
|------|----------|---------|-------|
| Unit | `app/unit-tests/`, `web/unit-tests/` | `npm run test:unit` | Business logic |
| System | `app/system-tests/` | `npm run test:system` | Docker integration |
| Browser | `web/browser-tests/` | `npm run test:browser` | UI components |
| Behaviour | `behaviour-tests/` | `npm run test:submitVatBehaviour-proxy` | E2E journeys |

## Environments

| Environment | File | Purpose |
|-------------|------|---------|
| test | `.env.test` | Unit/system tests (mocked) |
| simulator | `.env.simulator` | Local dev with HTTP simulator (no Docker, no external config) |
| proxy | `.env.proxy` | Local dev (ngrok, Docker OAuth2, dynalite) |
| ci | `.env.ci` | CI with real AWS |
| prod | `.env.prod` | Production |

## Naming Conventions

- Lambda files: `{feature}{Method}.js` (e.g., `hmrcVatReturnPost.js`)
- CDK stacks: `{Purpose}Stack` (e.g., `AuthStack`)
- DynamoDB tables: `{env}-submit-{purpose}`
- npm scripts: colon separator for variants (e.g., `test:unit`)

## Infrastructure Teardown Philosophy

**Core principle**: Stacks must be cleanly destroyable. Data protection comes from backups (PITR, cross-account copies), NOT from CloudFormation `RemovalPolicy.RETAIN`.

### RemovalPolicy Guidelines

**Use `DESTROY` for everything except:**
- Lambda Versions with provisioned concurrency (RETAIN prevents CloudFormation deadlocks - this is an AWS bug workaround, not data protection)

**Why not RETAIN?**
- Blocks stack teardown and redeployment (name conflicts)
- Creates manual cleanup burden
- Causes CloudFormation drift when resources are manually deleted
- AWS log groups with RETAIN block deployments if deleted externally

**Customer data protection strategy:**
- DynamoDB: PITR enabled (35-day recovery window)
- Backups: Cross-account copying (planned)
- HMRC receipts: 7-year TTL with PITR backup
- If you need the data, back it up properly - don't rely on CloudFormation refusing to delete it

### Stack Architecture for Teardown

- **App stacks** (per-deployment): Fully teardown-able, no persistent state
- **Env stacks** (per-environment): Teardown-able except customer data tables which have PITR backups
- **Logs**: Operational logs in env stacks (not app stacks) to allow app teardown without losing debugging info

### Idempotent Deployments

When CloudFormation references resources that might not exist (e.g., log groups deleted externally):
- Use `AwsCustomResource` with `ignoreErrorCodesMatching` to create resources idempotently before they're referenced
- Never assume CloudFormation state matches AWS reality
- See `ObservabilityStack.java` CloudTrail LogGroup pattern for example

## Before Making Infrastructure Changes

1. **Trace all dependencies**: When modifying a CDK construct, read its documentation to understand ALL resources it creates, not just the ones you're directly changing. For example, `Trail` auto-creates an S3 bucket and IAM role.

2. **Check existing patterns**: Search the codebase for similar constructs (e.g., other S3 buckets, other LogGroups) and follow the same configuration approach. Don't invent new patterns.

3. **Propose before implementing**: For infrastructure changes, describe the change in plain text and wait for approval before editing files.

4. **No manual interventions**: Never suggest AWS CLI commands, console actions, or workflow hacks. Everything goes through code changes → git push → GitHub Actions.

5. **Understand the full error**: When a deployment fails, don't just fix the immediate error. Ask: "What other resources does this construct depend on? What else could be in a bad state?"

6. **Verify compilation locally**: Run `./mvnw clean verify` before considering any infrastructure change complete.

## AWS Write Operations (CRITICAL)

**ALWAYS ask before writing to AWS.** Any mutating operation (create, update, delete) requires explicit user approval. Present the command, explain what it does, and wait for a "yes" before executing.

- **Preferred path for secrets**: GitHub Actions Secrets/Variables → `deploy-environment.yml` → AWS Secrets Manager. Direct AWS writes are the exception, not the norm.
- **Preferred path for infrastructure**: CDK code → git push → GitHub Actions deploy.
- **Read-only AWS operations are always permitted** (describe, get, list, scan, logs, etc.) — no need to ask.
- If you need to persist data between sessions and GitHub Actions is not appropriate, ask the user.

## Confirm Means Stop and Wait (CRITICAL)

When the user says "confirm each command" or similar:

1. **Present the command** in a code block.
2. **STOP. Do not execute.** Wait for the user to explicitly approve.
3. Only after the user says "yes", "go ahead", "run it", or similar, execute that single command.
4. Then present the next command and **STOP again**.

"Confirm" NEVER means "narrate what you're doing as you do it." It means **ask permission, then wait.**

This applies to ALL external side effects: AWS, Stripe, Telegram, GitHub, or any other service that changes state outside the local filesystem.

## AWS CLI Access (Local Development)

**Read-only AWS operations are always permitted.** You may always query AWS resources (describe, get, list, logs, etc.) without asking for permission. This includes CloudFormation stack status, Lambda configuration, CloudWatch logs, DynamoDB scans, CloudFront distributions, and any other read-only API calls needed for investigation and debugging.

To query AWS resources or debug infrastructure issues locally, use the assume role scripts.

**CRITICAL for Claude Code:** Each Bash tool call runs in a fresh shell - environment variables do NOT persist between calls. You MUST combine the assume-role source and the aws command in a **single** Bash tool call:

```bash
# CORRECT - assume and query in one command
. ./scripts/aws-assume-submit-deployment-role.sh 2>/dev/null && aws cloudformation describe-stacks --stack-name ci-env-IdentityStack

# WRONG - credentials lost between separate Bash tool calls
. ./scripts/aws-assume-submit-deployment-role.sh   # Call 1: sets env vars
aws cloudformation describe-stacks ...              # Call 2: fresh shell, no credentials!
```

**Suppress assume script output** with `2>/dev/null` to keep command output clean. Do NOT use `2>&1` on the assume script - it mixes verbose identity output with command results.

**Multiple AWS commands** - chain them in a single Bash call:
```bash
. ./scripts/aws-assume-submit-deployment-role.sh 2>/dev/null && \
  aws cloudformation describe-stacks --stack-name ci-env-IdentityStack --query 'Stacks[0].StackStatus' && \
  aws dynamodb scan --table-name ci-env-bundles
```

**Available assume role scripts:**
- `scripts/aws-assume-submit-deployment-role.sh` - Deployment role for submit-prod account (887764105431)
- `scripts/aws-assume-user-provisioning-role.sh` - User provisioning role (different account)
- `scripts/aws-unset-iam-session.sh` - Clear assumed role credentials

**Important:**
- Source the script with `. ./script.sh` (not `bash script.sh`) to set env vars in current shell
- Credentials expire after ~1 hour - re-run to refresh
- These scripts assume your local AWS profile can assume the target role

**Stack naming patterns:**
- Environment stacks: `{env}-env-{StackName}` (e.g., `ci-env-IdentityStack`, `prod-env-DataStack`)
- Application stacks: `{deployment}-app-{StackName}` (e.g., `ci-cleanlogin-app-AuthStack`)

See `PLAN_AWS_ACCOUNTS.md` for multi-account architecture and role structure.

## Running Behaviour Tests Against Deployed Environments (Fast Turnaround)

For faster iteration than pushing commits and waiting for GitHub Actions (`synthetic-test.yml` or `deploy.yml`), run behaviour tests directly against ci or prod from your local machine.

### Prerequisites

The assume role script requires:
- AWS CLI installed and configured
- `jq` installed (for parsing JSON from `aws sts assume-role`)
- Local AWS profile that can assume `arn:aws:iam::887764105431:role/submit-deployment-role`

### Workflow

**1. Assume the deployment role:**
```bash
. ./scripts/aws-assume-submit-deployment-role.sh
```
This sets `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`, and `AWS_REGION` in your shell. Credentials expire after ~1 hour.

**2. Enable Cognito native auth and create test user:**
```bash
# For ci environment (default)
npm run test:enableCognitoNative

# For prod environment
npm run test:enableCognitoNative -- prod
```
This script:
- Adds `COGNITO` to the Hosted UI's SupportedIdentityProviders (enables email/password login)
- Creates a test user with a random email and password
- Saves credentials to `cognito-native-test-credentials.json` (in project root)
- Prints the export commands and test command to run

**3. Run behaviour tests:**
```bash
# Use the credentials printed by the enable script
TEST_AUTH_USERNAME='test-xxx@test.diyaccounting.co.uk' TEST_AUTH_PASSWORD='TestXxx!Aa1' npm run test:submitVatBehaviour-ci

# Or for prod
TEST_AUTH_USERNAME='...' TEST_AUTH_PASSWORD='...' npm run test:submitVatBehaviour-prod
```

Available behaviour test variants: `-ci` and `-prod` (see package.json for full list).

**4. Clean up - disable Cognito native auth and delete test user:**
```bash
npm run test:disableCognitoNative
```
This script:
- Reads the saved credentials from `cognito-native-test-credentials.json`
- Deletes the test user from Cognito
- Removes `COGNITO` from SupportedIdentityProviders (restores federated-only login)
- Deletes the credentials file

### Important Notes

- **Always clean up** after testing - the credentials file acts as a lock to prevent duplicate test users
- If the enable script says credentials already exist, run `npm run test:disableCognitoNative` first
- The scripts are idempotent: enabling when already enabled or disabling when already disabled is a no-op
- For auth-specific tests, use `npm run test:authBehaviour-ci` or `npm run test:authBehaviour-prod`

## Multi-Site Deployments

This repository also deploys related sibling sites via dedicated workflows:

| Site | Workflow | Source |
|------|----------|--------|
| gateway.diyaccounting.co.uk | `deploy-gateway.yml` | `web/www.diyaccounting.co.uk/` |
| spreadsheets.diyaccounting.co.uk | `deploy-spreadsheets.yml` | `web/spreadsheets.diyaccounting.co.uk/` |
| diyaccounting.co.uk (root) | `deploy-root.yml` | Root domain DNS |
| Holding page | `deploy-holding.yml` | `web/holding/` |

Behaviour tests exist for gateway (`test:gatewayBehaviour-*`) and spreadsheets (`test:spreadsheetsBehaviour-*`).

**Stripe Payment Links** are live on the spreadsheets site for donations (see `_developers/archive/PLAN_STRIPE_1.md` — completed). Submit site subscription payments are planned in `PLAN_PAYMENT_INTEGRATION.md`.

## Security Checklist

- Never commit secrets - use AWS Secrets Manager ARNs
- Check IAM for least privilege (avoid `Resource: "*"`)
- Validate all user input in Lambda functions
- Verify OAuth state parameter validation
- Check JWT validation in `app/functions/auth/customAuthorizer.js`
