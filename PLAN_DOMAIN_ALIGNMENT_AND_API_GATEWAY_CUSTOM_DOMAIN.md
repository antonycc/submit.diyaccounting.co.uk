# Plan: API Gateway Custom Domain + Domain Convention Alignment + Fraud Prevention Fix

## Context

HMRC rejected our fraud prevention headers because `Gov-Client-Public-Port` was missing. To get the client's source port, we need CloudFront to forward the `CloudFront-Viewer-Address` header to API Gateway. The only CDK option is `OriginRequestHeaderBehavior.all("CloudFront-Viewer-Address")`, which forwards ALL viewer headers including `Host`. API Gateway rejects requests where the forwarded `Host` header doesn't match a configured custom domain, returning 403. This broke 10/17 CI behaviour tests.

The fix: configure API Gateway custom domains matching the `Host` headers CloudFront forwards. Concurrently, align submit's domain naming with gateway/spreadsheets conventions.

## Domain Naming: Current vs Proposed

| Purpose | Current | Proposed |
|---------|---------|----------|
| CI env apex | `ci.submit.diyaccounting.co.uk` | `ci-submit.diyaccounting.co.uk` |
| Prod env apex | `submit.diyaccounting.co.uk` | `prod-submit.diyaccounting.co.uk` + `submit.diyaccounting.co.uk` |
| CI deployment | `ci-rootdns.submit.diyaccounting.co.uk` | unchanged |
| Prod deployment | `prod-a1b2c3d.submit.diyaccounting.co.uk` | unchanged |
| CI holding | `ci-holding.submit.diyaccounting.co.uk` | `ci-holding.diyaccounting.co.uk` |
| Prod holding | `prod-holding.submit.diyaccounting.co.uk` | `prod-holding.diyaccounting.co.uk` |
| Cognito (CI) | `ci-auth.submit.diyaccounting.co.uk` | `ci-auth.diyaccounting.co.uk` |
| Cognito (prod) | `prod-auth.submit.diyaccounting.co.uk` | `prod-auth.diyaccounting.co.uk` |
| Simulator (CI) | `ci-simulator.submit.diyaccounting.co.uk` | `ci-simulator.diyaccounting.co.uk` |
| Simulator (prod) | `prod-simulator.submit.diyaccounting.co.uk` | `prod-simulator.diyaccounting.co.uk` |

## Prerequisites (Manual — before any code deploy)

### P1. us-east-1 ACM certificates (3 total)

**Keep existing cert `d340de40`** for EdgeStack + ApexStack. It already has the 6 SANs needed:
- `submit.diyaccounting.co.uk`, `*.submit.diyaccounting.co.uk`
- `ci-submit.diyaccounting.co.uk`, `prod-submit.diyaccounting.co.uk`
- `ci-holding.diyaccounting.co.uk`, `prod-holding.diyaccounting.co.uk`

No change to `certificateArn` in `cdk-application/cdk.json` or `cdk-environment/cdk.json`. Done.

**Create new auth cert** (us-east-1) for IdentityStack/Cognito custom domain:
- `ci-auth.diyaccounting.co.uk`
- `prod-auth.diyaccounting.co.uk`

Done: arn:aws:acm:eu-west-2:887764105431:certificate/2b09cb4f-0edf-4495-a883-68ef498982e0

Add authCertificateArn to cdk-environment/cdk.json.

Dome

**Create new simulator cert** (us-east-1) for SimulatorStack:
- `ci-simulator.diyaccounting.co.uk`
- `prod-simulator.diyaccounting.co.uk`

Done: arn:aws:acm:eu-west-2:887764105431:certificate/7ae3bc98-843b-4103-8ff5-744dd9307ea7

Add simulatorCertificateArn to cdk-environment/cdk.json.

Done

### P2. eu-west-2 ACM certificate — Done

Cert `1f9c9a57-5834-41d3-822d-4aae7e32d633` already covers:
- `submit.diyaccounting.co.uk`, `*.submit.diyaccounting.co.uk`
- `ci-submit.diyaccounting.co.uk`, `prod-submit.diyaccounting.co.uk`

`regionalCertificateArn` in `cdk-application/cdk.json` already updated. Done.

### P3. Register new callback URLs in HMRC Developer Hub — Done

### P4. Register new redirect URIs in Google Cloud Console

Google OAuth redirects to the Cognito domain. Since `cognitoDomainName` is changing from `ci-auth.submit.diyaccounting.co.uk` to `ci-auth.diyaccounting.co.uk`, add:
- `https://ci-auth.diyaccounting.co.uk/oauth2/idpresponse`
- `https://prod-auth.diyaccounting.co.uk/oauth2/idpresponse`

Keep old URIs until migration is complete.

## Code Changes

### C1. `SubmitSharedNames.java` — Domain name construction

**File**: `infra/main/java/co/uk/diyaccounting/submit/SubmitSharedNames.java` (lines 329-335)

Change `envDomainName` (line 329-331):
```java
// Before:
this.envDomainName = props.envName.equals("prod")
        ? "%s.%s".formatted(props.subDomainName, props.hostedZoneName)
        : "%s.%s.%s".formatted(props.envName, props.subDomainName, props.hostedZoneName);
// After:
this.envDomainName = "%s-%s.%s".formatted(props.envName, props.subDomainName, props.hostedZoneName);
```

Change `cognitoDomainName` (line 332):
```java
// Before:
this.cognitoDomainName = "%s-auth.%s.%s".formatted(props.envName, props.subDomainName, props.hostedZoneName);
// After:
this.cognitoDomainName = "%s-auth.%s".formatted(props.envName, props.hostedZoneName);
```

Change `holdingDomainName` (line 333):
```java
// Before:
this.holdingDomainName = "%s-holding.%s.%s".formatted(props.envName, props.subDomainName, props.hostedZoneName);
// After:
this.holdingDomainName = "%s-holding.%s".formatted(props.envName, props.hostedZoneName);
```

Change `simulatorDomainName` (lines 334-335):
```java
// Before:
this.simulatorDomainName = "%s-simulator.%s.%s".formatted(props.envName, props.subDomainName, props.hostedZoneName);
// After:
this.simulatorDomainName = "%s-simulator.%s".formatted(props.envName, props.hostedZoneName);
```

`baseUrl` (line 343) and `envBaseUrl` (line 346) derive from `deploymentDomainName` and `envDomainName` respectively — they auto-update.

### C2. `.github/actions/get-names/action.yml` — Apex + holding domain computation

**File**: `.github/actions/get-names/action.yml` (lines 96-104)

```bash
# Before (lines 96-100):
if [ "${ENVIRONMENT_NAME?}" = "prod" ]; then
  DIY_SUBMIT_APEX_DOMAIN="submit.diyaccounting.co.uk"
else
  DIY_SUBMIT_APEX_DOMAIN="${ENVIRONMENT_NAME?}.submit.diyaccounting.co.uk"
fi
# After:
DIY_SUBMIT_APEX_DOMAIN="${ENVIRONMENT_NAME?}-submit.diyaccounting.co.uk"

# Before (line 103):
DIY_SUBMIT_HOLDING_DOMAIN="${ENVIRONMENT_NAME?}-holding.submit.diyaccounting.co.uk"
# After:
DIY_SUBMIT_HOLDING_DOMAIN="${ENVIRONMENT_NAME?}-holding.diyaccounting.co.uk"
```

For prod, `submit.diyaccounting.co.uk` becomes an additional alias (see C12).

### C3. `ApiStack.java` — Add API Gateway custom domain

**File**: `infra/main/java/co/uk/diyaccounting/submit/stacks/ApiStack.java`

Add to ApiStackProps interface:
- `String regionalCertificateArn();`

Add after HTTP API creation (after line 128), before the access logging section:
```java
ICertificate regionalCert = Certificate.fromCertificateArn(
    this, props.resourceNamePrefix() + "-RegionalCert", props.regionalCertificateArn());

DomainName deploymentCustomDomain = DomainName.Builder.create(
        this, props.resourceNamePrefix() + "-CustomDomain")
    .domainName(props.sharedNames().deploymentDomainName)
    .certificate(regionalCert)
    .build();

ApiMapping.Builder.create(this, props.resourceNamePrefix() + "-ApiMapping")
    .api(this.httpApi)
    .domainName(deploymentCustomDomain)
    .build();
```

Add imports: `DomainName`, `ApiMapping`, `ICertificate`, `Certificate`.

Export API Gateway ID as CfnOutput (already has `HttpApiId` output at line 242 — verify it's exported with a stable name for deploy.yml to reference).

### C4. `SubmitApplication.java` — Wire regionalCertificateArn to ApiStack

**File**: `infra/main/java/co/uk/diyaccounting/submit/SubmitApplication.java`

Add `regionalCertificateArn` to `SubmitApplicationProps` (line ~45):
```java
public String regionalCertificateArn;
```

Pass to ApiStack builder (around line 292):
```java
.regionalCertificateArn(appProps.regionalCertificateArn)
```

### C5. `EdgeStack.java` — No change needed

The `all("CloudFront-Viewer-Address")` ORP stays. The 403 is fixed by API GW custom domains.

### C6. `SubmitEnvironment.java` — Wire separate auth/simulator cert ARNs

**File**: `infra/main/java/co/uk/diyaccounting/submit/SubmitEnvironment.java`

Add to `SubmitEnvironmentProps`:
```java
public String authCertificateArn;
public String simulatorCertificateArn;
```

Pass `authCertificateArn` to IdentityStack (instead of `certificateArn`):
```java
.certificateArn(appProps.authCertificateArn != null && !appProps.authCertificateArn.isBlank()
    ? appProps.authCertificateArn : appProps.certificateArn)
```

Pass `simulatorCertificateArn` to SimulatorStack (instead of `certificateArn`):
```java
.certificateArn(appProps.simulatorCertificateArn != null && !appProps.simulatorCertificateArn.isBlank()
    ? appProps.simulatorCertificateArn : appProps.certificateArn)
```

This gracefully falls back to the main cert if the specific cert isn't set.

### C7. `cdk-environment/cdk.json` — Add auth/simulator cert ARNs

**File**: `cdk-environment/cdk.json`

Add after existing `certificateArn`:
```json
"authCertificateArn": "",
"simulatorCertificateArn": ""
```

Values will be populated manually after creating the certs in P1.

### C8. `.github/actions/set-origins/action.yml` — Add API GW custom domain transfer

**File**: `.github/actions/set-origins/action.yml`

Add new inputs:
- `api-gateway-id`
- `regional-certificate-arn`

Add new step after CloudFront alias and Route53 steps:
```bash
# Delete existing API GW custom domain for the apex (if owned by another API)
EXISTING=$(aws apigatewayv2 get-domain-names \
  --query "Items[?DomainName=='${APEX_DOMAIN}'].DomainName | [0]" --output text)
if [ "$EXISTING" != "None" ] && [ -n "$EXISTING" ]; then
  MAPPING_IDS=$(aws apigatewayv2 get-api-mappings --domain-name "${APEX_DOMAIN}" \
    --query 'Items[*].ApiMappingId' --output text)
  for MID in $MAPPING_IDS; do
    aws apigatewayv2 delete-api-mapping --domain-name "${APEX_DOMAIN}" --api-mapping-id "$MID"
  done
  aws apigatewayv2 delete-domain-name --domain-name "${APEX_DOMAIN}"
fi

# Create new custom domain + mapping
aws apigatewayv2 create-domain-name \
  --domain-name "${APEX_DOMAIN}" \
  --domain-name-configurations CertificateArn="${REGIONAL_CERT_ARN}",EndpointType=REGIONAL
aws apigatewayv2 create-api-mapping \
  --domain-name "${APEX_DOMAIN}" \
  --api-id "${API_GATEWAY_ID}" \
  --stage '$default'
```

For prod, repeat for `submit.diyaccounting.co.uk`.

### C9. `deploy.yml` — Pass new parameters to set-origins

**File**: `.github/workflows/deploy.yml`

Extract API Gateway ID from ApiStack CloudFormation outputs. Pass to set-origins along with `regional-certificate-arn`.

### C10. `.env.ci` and `.env.prod` — Update base URLs

`.env.ci` line 12: `DIY_SUBMIT_BASE_URL=https://ci-submit.diyaccounting.co.uk/`
`.env.prod` line 12: `DIY_SUBMIT_BASE_URL=https://prod-submit.diyaccounting.co.uk/`

### C11. IdentityStack — Cognito domain change (destructive)

**File**: `infra/main/java/co/uk/diyaccounting/submit/stacks/IdentityStack.java`

No code changes needed — all values come from `SubmitSharedNames`:
- Callback URLs (lines 202-205): Use `envDomainName` -> now `ci-submit.diyaccounting.co.uk`
- Cognito custom domain (line 217): Uses `cognitoDomainName` -> now `ci-auth.diyaccounting.co.uk`
- Route53 alias (lines 224-229): Points `cognitoDomainName` to Cognito CloudFront endpoint
- Auth cert (line 120): Uses `certificateArn()` -- now the new auth cert via C6 fallback wiring

**WARNING**: Changing the Cognito custom domain is destructive -- Cognito deletes the old domain and creates the new one. Auth will briefly break during the switchover. Acceptable for CI.

### C12. Prod additional alias — `submit.diyaccounting.co.uk`

Add `prod-apex-alias` output to get-names for prod deployments:
```bash
if [ "${ENVIRONMENT_NAME?}" = "prod" ]; then
  echo "DIY_SUBMIT_PROD_ALIAS=submit.diyaccounting.co.uk" >> "$GITHUB_OUTPUT"
fi
```

Update set-origins to handle a third CloudFront alias and third API GW custom domain when `prod-apex-alias` is present.

## Deployment Sequence

1. **Manual**: Create auth + simulator certs in us-east-1 (P1), register Google callbacks (P4)
2. **Manual**: Update `authCertificateArn` and `simulatorCertificateArn` in `cdk-environment/cdk.json`
3. **Code**: All code changes (C1-C12) on the `rootdns` branch
4. **Local test**: `npm test` + `./mvnw clean verify`
5. **Push**: Triggers deploy.yml
   - deploy-environment runs first -> IdentityStack gets new Cognito domain + callback URLs
   - App stacks deploy -> ApiStack creates deployment-level API GW custom domain
   - set-origins -> Moves apex CloudFront alias + creates apex API GW custom domain
   - Behaviour tests run against `ci-submit.diyaccounting.co.uk`
6. **Validate**: All 17 behaviour tests pass

## Testing & Verification

- `npm test` -- Unit tests pass
- `./mvnw clean verify` -- CDK compiles, synth produces valid templates
- After CI deploy: `curl -I https://ci-submit.diyaccounting.co.uk/` returns 200
- After CI deploy: All 17 behaviour tests pass (especially auth-dependent ones)
- Verify fraud prevention headers include `Gov-Client-Public-Port` in DynamoDB receipts

## Risk Mitigations

- **Separate certs**: Auth and simulator get their own certs -- no risk to existing EdgeStack/ApexStack cert
- **Cognito domain change**: Destructive but only affects CI initially
- **Old callbacks**: Keep old HMRC/Google redirect URIs until fully migrated
- **Rollback**: Revert EdgeStack ORP to `denyList("Host")` -- loses `Gov-Client-Public-Port` but restores functionality

## Files Modified Summary

| File | Change |
|------|--------|
| `infra/.../SubmitSharedNames.java` | envDomainName, cognitoDomainName, holdingDomainName, simulatorDomainName |
| `infra/.../stacks/ApiStack.java` | Add regionalCertificateArn prop, custom domain + ApiMapping |
| `infra/.../SubmitApplication.java` | Add regionalCertificateArn prop, wire to ApiStack |
| `infra/.../SubmitEnvironment.java` | Add authCertificateArn/simulatorCertificateArn, wire to stacks |
| `.github/actions/get-names/action.yml` | apex-domain + holding-domain construction |
| `.github/actions/set-origins/action.yml` | Add API GW custom domain management |
| `.github/workflows/deploy.yml` | Pass API GW ID + cert ARN to set-origins |
| `.env.ci` | DIY_SUBMIT_BASE_URL |
| `.env.prod` | DIY_SUBMIT_BASE_URL |
| `cdk-environment/cdk.json` | Add authCertificateArn + simulatorCertificateArn |
