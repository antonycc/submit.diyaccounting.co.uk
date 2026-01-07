# Claude Code Memory - DIY Accounting Submit

## Quick Reference

**Primary documentation**: See `REPOSITORY_DOCUMENTATION.md` for complete architecture, npm scripts, AWS stacks, and directory structure.

**Other AI assistants in this repo**:
- `.junie/guidelines.md` - Junie (testing & iteration focus)
- `.github/copilot-instructions.md` - GitHub Copilot (code review focus)

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
   # Run Playwright tests against deployed environment
   npm run test:submitVatBehaviour-aws-<branch>
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

## Code Quality Rules

- **Trace code paths** before running tests - follow both test execution and AWS deployment paths
- **No unnecessary formatting** - don't reformat lines you're not changing
- **No import reordering** - considered unnecessary formatting
- **No fallback paths** for silent failures when fixing bugs
- **No compatibility adaptors** when refactoring - change names everywhere consistently
- Only run `npm run linting-fix && npm run formatting-fix` when specifically asked

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
| proxy | `.env.proxy` | Local dev (ngrok, Docker OAuth2, dynalite) |
| ci | `.env.ci` | CI with real AWS |
| prod | `.env.prod` | Production |

## Naming Conventions

- Lambda files: `{feature}{Method}.js` (e.g., `hmrcVatReturnPost.js`)
- CDK stacks: `{Purpose}Stack` (e.g., `AuthStack`)
- DynamoDB tables: `{env}-submit-{purpose}`
- npm scripts: colon separator for variants (e.g., `test:unit`)

## Security Checklist

- Never commit secrets - use AWS Secrets Manager ARNs
- Check IAM for least privilege (avoid `Resource: "*"`)
- Validate all user input in Lambda functions
- Verify OAuth state parameter validation
- Check JWT validation in `app/functions/auth/customAuthorizer.js`
