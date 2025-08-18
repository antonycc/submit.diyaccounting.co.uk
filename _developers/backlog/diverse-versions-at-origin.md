# Goal summary

Split into five stacks: **Edge**, **Identity**, **Data**, **App**, **Ops**.
- **Edge**: One CloudFront distribution per env (ci, prod) with wildcard alias.
- **Identity**: Cognito pools, domains, clients. Stable OAuth redirect URIs.
- **Data**: Receipts bucket and stateful data.
- **App**: Per-commit stack (e.g., ci-d56db64, prod-d56db64). Owns its **web
  origin** (per-commit S3 bucket) and the **commit subdomain**. No Edge change.
- **Ops**: Logs, alarms, and a dispatcher API for dynamic Lambda alias routing.

Outcome:
- Each commit deploys an **App** stack and a **commit domain**:
  - ci: `ci-d56db64.submit.diyaccounting.co.uk`
  - prod: `prod-d56db64.submit.diyaccounting.co.uk`
- The **pool domains** stay stable:
  - `ci.submit.diyaccounting.co.uk` and `submit.diyaccounting.co.uk`
- CI: immediately switches pool to the new commit, prunes older ci app stacks.
- Prod: tests on commit domain, then switch pool, then test on top-level.

---

## High-level design

**Edge** (us-east-1)
- Single CloudFront distribution per env.
- ACM cert with SANs: `submit…`, `ci.submit…`, `*.submit…` (covers commit hosts).
- Behaviours:
  - `/api/*` → Ops dispatcher API.
  - `/*` → “web” origin (placeholder). Real origin overridden at **origin-request**
    by Lambda@Edge to the **per-commit** S3 bucket owned by the App stack.
- Functions:
  - **viewer-request** (CloudFront Function): parse host, set `x-commit=<sha>`.
  - **origin-request** (Lambda@Edge): compute S3 bucket name for `<sha>`, override
    origin to that bucket. No Edge deployment per commit.

**Identity** (eu-west-2)
- Cognito user pool, domain, and clients.
- Redirect URIs pinned to **stable** domains:
  - `https://auth.ci.submit.diyaccounting.co.uk/callback`
  - `https://auth.submit.diyaccounting.co.uk/callback`

**Data** (eu-west-2)
- **Receipts** S3 bucket. KMS/SSE-S3, lifecycle to Glacier DA, blocking public
  access. Optional replication. This bucket is **not** per-commit.
- Optional commit registry (SSM parameters or DynamoDB) for metadata.

**App** per commit (eu-west-2)
- **Web origin S3 bucket** named deterministically, e.g. `web-ci-d56db64` or
  `web-prod-d56db64`. Content uploaded here.
- API Lambda(s) built and **published** as versions with **alias = <sha>`.
- **DNS**: creates A/AAAA or CNAME for `ci-<sha>.submit…` or `prod-<sha>.submit…`
  to the env’s Edge distribution. App is the **only** stack that adds commit DNS.
- No Edge changes. Viewer-request/origin-request handle routing.

**Ops** (eu-west-2)
- CloudTrail, log buckets, alarms, dashboards.
- Dispatcher API (HTTP API + Lambda). Reads `x-commit` and invokes
  `YourApiFn:Qualifier=<sha>`.

---

## Routing

- **Commit domains**: host matches `^(ci|prod)-<sha>.submit…` → viewer-request
  sets `x-commit=<sha>`. origin-request overrides origin to S3 bucket
  `web-<env>-<sha>`. APIs go to dispatcher, which invokes alias `<sha>`.
- **Pool domains**: `ci.submit…` and `submit…` resolve to the same distribution.
  Edge reads the active `<sha>` from a small config (KeyValueStore or SSM via
  Lambda@Edge) and sets `x-commit=<sha>`.

---

## Deployment flow

**CI**
1) Build `d56db64`.  
2) Deploy **App** stack `App-ci-d56db64`:
   - Create S3 bucket `web-ci-d56db64`. Upload SPA.
   - Publish Lambdas and create alias `d56db64`.
   - Create Route53 record: `ci-d56db64.submit…` → Edge distribution.
3) Set `active_ci = d56db64` (KeyValueStore or SSM).  
4) Behaviour tests against:
   - `https://ci.submit.diyaccounting.co.uk`
   - `https://ci-d56db64.submit.diyaccounting.co.uk`
5) Prune older `App-ci-*` stacks and buckets (keep N).

**Prod**
1) Build `d56db64`.  
2) Deploy **App** stack `App-prod-d56db64`.  
3) Behaviour tests against:
   - `https://prod-d56db64.submit.diyaccounting.co.uk`
4) If green, set `active_prod = d56db64`.  
5) Behaviour tests against:
   - `https://submit.diyaccounting.co.uk`
6) Periodic prune of older `App-prod-*` stacks and buckets.

---

## Callbacks, referrers, and provider constraints

- Keep OAuth redirect URIs **stable**. Google/HMRC do **not** provide a public,
  supported API to add redirect URIs on each commit. Use the stable Identity
  domains and keep commit subdomains **out** of the providers’ lists.
- If you need an internal “allowed referrers” list, expose an app config API you
  can update per commit. Do not rely on Google/HMRC for this.

---

Weighted CNAME record update (pipeline step)

After deploying the commit stack, the CI/CD pipeline should update the
weighted CNAME record. Here is an example using the AWS CLI:

```
# For CI environment (point ci.submit.diyaccounting.co.uk to the commit domain)
aws route53 change-resource-record-sets \
  --hosted-zone-id <HOSTED_ZONE_ID> \
  --change-batch '{
    "Comment": "CI switch to new commit", 
    "Changes": [
      {"Action": "UPSERT", "ResourceRecordSet": {
        "Name": "ci.submit.diyaccounting.co.uk",
        "Type": "CNAME",
        "TTL": 60,
        "ResourceRecords": [ {"Value": "ci-d56db64.submit.diyaccounting.co.uk"} ]
      }}
    ]
  }'

# For prod environment (canary deployment)
aws route53 change-resource-record-sets \
  --hosted-zone-id <HOSTED_ZONE_ID> \
  --change-batch '{
    "Comment": "Prod add new commit", 
    "Changes": [
      {"Action": "UPSERT", "ResourceRecordSet": {
        "Name": "submit.diyaccounting.co.uk",
        "Type": "CNAME",
        "SetIdentifier": "prod-d56db64", 
        "Weight": 10, 
        "TTL": 60,
        "ResourceRecords": [ {"Value": "prod-d56db64.submit.diyaccounting.co.uk"} ]
      }},
      {"Action": "UPSERT", "ResourceRecordSet": {
        "Name": "submit.diyaccounting.co.uk",
        "Type": "CNAME",
        "SetIdentifier": "prod-old", 
        "Weight": 90, 
        "TTL": 60,
        "ResourceRecords": [ {"Value": "prod-OLDHASH.submit.diyaccounting.co.uk"} ]
      }}
    ]
  }'

```

---

## Step-by-step plan

1) **Edge stack**
- Create/validate ACM cert (us-east-1) with SANs:
  - `submit.diyaccounting.co.uk`
  - `ci.submit.diyaccounting.co.uk`
  - `*.submit.diyaccounting.co.uk`
- Create distribution with:
  - Aliases: above three names.
  - Origins: `api-origin` (dispatcher HTTP API). A placeholder `web-origin`
    (any S3 origin; it will be **overridden** by Lambda@Edge per request).
  - Behaviours: `/api/*` → `api-origin` (no cache), `/*` → `web-origin`.
  - Associate:
    - viewer-request **Function** to derive `env`/`sha` and set `x-commit`.
    - origin-request **Lambda@Edge** to override origin to
      `web-<env>-<sha>.s3.<region>.amazonaws.com` (virtual-hosted style).
- Route53:
  - A/AAAA for `submit…`, `ci.submit…`, and wildcard `*.submit…` to distribution.

2) **Identity stack**
- Cognito user pool and clients.
- Domains:
  - `auth.ci.submit…`
  - `auth.submit…`
- Redirect URIs: only these two. Configure Google/HMRC once.

3) **Data stack**
- Receipts bucket with lifecycle, encryption, and access policies.
- Optional DynamoDB table `CommitRegistry(env, sha, status, time, notes)`.

4) **Ops stack**
- Log buckets, CloudTrail, alarms/dashboards.
- HTTP API + `dispatcher` Lambda that reads `x-commit` and invokes the aliased
  API function. Add guardrails to allow only known `<sha>`.

5) **App stack per commit**
- Create bucket `web-<env>-<sha>` and upload SPA.
- Build API Lambdas, publish versions, and create alias `<sha>`.
- Route53 record for `(<env>)-<sha>.submit…` → Edge distribution.
- Register commit in registry if used.

6) **Switch**
- Small function/API to set `active_ci` or `active_prod`. For ci, set
  immediately; for prod, set after commit-domain tests pass.

7) **Prune**
- Scheduled job removes:
  - old **App** stacks
  - old `web-<env>-<sha>` buckets (after retention)
- Never auto-delete **receipts**.

---

## GitHub Actions sketch

```yaml
name: deploy-app
on:
  workflow_dispatch:
  push:
    branches: [ main ]

jobs:
  deploy-ci:
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    permissions: { id-token: write, contents: read }
    steps:
      - uses: actions/checkout@v4

      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: \${{ secrets.AWS_ROLE_CI }}
          aws-region: eu-west-2

      - name: Compute short SHA
        id: meta
        run: echo "sha=\$(git rev-parse --short=7 HEAD)" >> \$GITHUB_OUTPUT

      - name: Deploy App stack
        run: |
          ./gradlew :cdk:build    # or mvn/npn; align with your repo
          npx cdk deploy "App-ci-\${{ steps.meta.outputs.sha }}" \
            --require-approval never \
            -c env=ci -c commit=\${{ steps.meta.outputs.sha }}

      - name: Set active_ci
        run: node scripts/set-active.js ci \${{ steps.meta.outputs.sha }}

      - name: Behaviour tests
        run: |
          npm run test:behaviour -- \
            --base https://ci.submit.diyaccounting.co.uk \
            --commit https://ci-\${{ steps.meta.outputs.sha }}.submit.diyaccounting.co.uk

      - name: Prune old commits
        run: node scripts/prune.js ci --keep 3
```

---

## CloudFront Function (viewer-request) — derive `<sha>` and tag request

```javascript
// edge/viewer-request.js (CloudFront Function)
function parse(host) {
  // ci.submit… | submit… | ci-<sha>.submit… | prod-<sha>.submit…
  var m = host.match(/^((ci|prod)(?:-([a-f0-9]{7}))?)\.submit\.diyaccounting\.co\.uk$/i);
  if (!m) return null;
  return { env: m[2], sha: m[3] || null };
}

async function handler(event) {
  var req = event.request;
  var host = (req.headers.host && req.headers.host.value) || '';
  var x = parse(host);
  if (!x) return req;

  // If pool domain, fetch active sha from KV (pseudo-API; or hard-code to Functions KV)
  if (!x.sha) {
    // Example using a simple header passthrough that Ops fills via origin policy,
    // or replace with Functions KeyValueStore when available in your account.
    // req.headers['x-commit'] = { value: /* read active sha */ };
  } else {
    req.headers['x-commit'] = { value: x.sha };
  }
  return req;
}
```

---

## Lambda@Edge (origin-request) — override to the per-commit S3 web bucket

```javascript
// edge/origin-request.js (Lambda@Edge, Node.js 18.x)
exports.handler = async (event) => {
  const req = event.Records[0].cf.request;
  const host = req.headers.host?.[0]?.value || '';
  const sha = req.headers['x-commit']?.[0]?.value;

  const m = host.match(/^((ci|prod))(?:-[a-f0-9]{7})?\.submit\.diyaccounting\.co\.uk$/i);
  if (!m || !sha) return req;

  const env = m[2]; // ci | prod
  const region = 'eu-west-2';
  const bucket = `web-${env}-${sha}`;

  // Rewrite to your SPA entry if needed
  const isApi = req.uri.startsWith('/api/');
  if (!isApi) {
    const path = req.uri === '/' ? '/index.html' : req.uri;
    req.uri = path;
  }

  // Override origin to the commit’s bucket (virtual-hosted style)
  req.origin = {
    s3: {
      authMethod: 'origin-access-control',
      domainName: `${bucket}.s3.${region}.amazonaws.com`,
      region,
      path: '',
    },
  };
  req.headers['host'] = [{ key: 'host', value: `${bucket}.s3.${region}.amazonaws.com` }];

  return req;
};
```

---

## Dispatcher Lambda (.NET 8) — route API to the `<sha>` alias

```csharp
// ops/Dispatcher.cs
using System.Text.Json;
using Amazon.Lambda.Core;
using Amazon.Lambda.APIGatewayEvents;
using Amazon.Lambda;
using Amazon.Lambda.Model;
using System.Collections.Generic;

[assembly: LambdaSerializer(typeof(
  Amazon.Lambda.Serialization.SystemTextJson.DefaultLambdaJsonSerializer))]

public class Function {
  private static readonly AmazonLambdaClient _lambda = new();

  public async Task<APIGatewayHttpApiV2ProxyResponse> FunctionHandler(
    APIGatewayHttpApiV2ProxyRequest req, ILambdaContext ctx) {

    if (!req.Headers.TryGetValue("x-commit", out var sha) || string.IsNullOrWhiteSpace(sha))
      return new APIGatewayHttpApiV2ProxyResponse { StatusCode = 400, Body = "Missing commit" };

    var invokeReq = new InvokeRequest {
      FunctionName = "YourApiFunction", // base fn name
      Qualifier    = sha,               // alias per commit
      Payload      = JsonSerializer.SerializeToUtf8Bytes(req)
    };

    var result = await _lambda.InvokeAsync(invokeReq);
    var body = System.Text.Encoding.UTF8.GetString(result.Payload.ToArray());

    return new APIGatewayHttpApiV2ProxyResponse {
      StatusCode = (int)result.StatusCode,
      Body = body,
      Headers = new Dictionary<string,string>{{"content-type","application/json"}}
    };
  }
}
```

---

## CDK Java skeletons (illustrative)

**EdgeStack** — ACM, CF dist, viewer/origin functions, DNS.

```java
// EdgeStack.java (us-east-1)
public class EdgeStack extends Stack {
  public EdgeStack(final Construct scope, final String id, final StackProps props, final EdgeProps p) {
    super(scope, id, props);

    Certificate cert = Certificate.Builder.create(this, "EdgeCert")
      .domainName("submit.diyaccounting.co.uk")
      .subjectAlternativeNames(List.of("ci.submit.diyaccounting.co.uk", "*.submit.diyaccounting.co.uk"))
      .validation(CertificateValidation.fromDns())
      .build();

    CloudFrontFunction viewerFn = CloudFrontFunction.Builder.create(this, "ViewerFn")
      .code(FunctionCode.fromFile("./edge/viewer-request.js"))
      .build();

    Function originFn = Function.Builder.create(this, "OriginFn")
      .runtime(Runtime.NODEJS_18_X)
      .handler("origin-request.handler")
      .code(Code.fromAsset("./edge"))
      .currentVersionOptions(VersionOptions.builder().removalPolicy(RemovalPolicy.RETAIN).build())
      .build();

    Distribution dist = Distribution.Builder.create(this, "Dist")
      .defaultBehavior(BehaviorOptions.builder()
        .origin(new HttpOrigin("placeholder.invalid")) // overridden by originFn
        .functionAssociations(List.of(FunctionAssociation.builder()
          .eventType(FunctionEventType.VIEWER_REQUEST)
          .function(viewerFn).build()))
        .edgeLambdas(List.of(EdgeLambda.builder()
          .functionVersion(originFn.getCurrentVersion())
          .eventType(LambdaEdgeEventType.ORIGIN_REQUEST).build()))
        .build())
      .additionalBehaviors(Map.of("/api/*", BehaviorOptions.builder()
        .origin(new HttpOrigin(p.getDispatcherApiDomain()))
        .cachePolicy(CachePolicy.CACHING_DISABLED)
        .originRequestPolicy(OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER)
        .functionAssociations(List.of(FunctionAssociation.builder()
          .eventType(FunctionEventType.VIEWER_REQUEST)
          .function(viewerFn).build()))
        .build()))
      .certificate(cert)
      .domainNames(List.of("submit.diyaccounting.co.uk","ci.submit.diyaccounting.co.uk","*.submit.diyaccounting.co.uk"))
      .build();

    // Route53 records for submit, ci, and wildcard to dist...
  }
}
```

**IdentityStack** — Cognito with stable auth domains.

```java
// IdentityStack.java
public class IdentityStack extends Stack {
  public IdentityStack(final Construct scope, final String id, final StackProps props) {
    super(scope, id, props);
    // Cognito pool, clients, hosted UI domain at auth.ci.* and auth.* with fixed redirects.
  }
}
```

**DataStack** — receipts and optional registry.

```java
// DataStack.java
public class DataStack extends Stack {
  public final Bucket receipts;
  public DataStack(final Construct scope, final String id, final StackProps props) {
    super(scope, id, props);
    this.receipts = Bucket.Builder.create(this, "Receipts")
      .blockPublicAccess(BlockPublicAccess.BLOCK_ALL)
      .encryption(BucketEncryption.S3_MANAGED)
      .lifecycleRules(List.of(LifecycleRule.builder()
        .transitions(List.of(Transition.builder()
          .storageClass(StorageClass.DEEP_ARCHIVE).transitionAfter(Duration.days(90)).build()))
        .build()))
      .build();
    // Optional: DDB table for commit registry
  }
}
```

**OpsStack** — logs and dispatcher API.

```java
// OpsStack.java
public class OpsStack extends Stack {
  public final String dispatcherApiDomain;
  public OpsStack(final Construct scope, final String id, final StackProps props) {
    super(scope, id, props);
    // Log buckets, CloudTrail, alarms
    Function dispatcher = Function.Builder.create(this, "DispatcherFn")
      .runtime(Runtime.DOTNET_8)
      .handler("Dispatcher::Function::FunctionHandler")
      .code(Code.fromAsset("../dispatcher-publish"))
      .timeout(Duration.seconds(10))
      .memorySize(512)
      .build();
    HttpApi api = new HttpApi(this, "DispatcherApi");
    api.addRoutes(AddRoutesOptions.builder()
      .path("/{proxy+}")
      .integration(new HttpLambdaIntegration("Int", dispatcher)).build());
    this.dispatcherApiDomain = Fn.select(2, Fn.split("/", api.getUrl()));
  }
}
```

**AppStack** (per commit) — web bucket, alias, commit DNS.

```java
// AppStack.java
public class AppStack extends Stack {
  public AppStack(final Construct scope, final String id, final StackProps props, final AppProps a) {
    super(scope, id, props);

    Bucket web = Bucket.Builder.create(this, "Web")
      .bucketName(String.format("web-%s-%s", a.getEnv(), a.getSha()))
      .blockPublicAccess(BlockPublicAccess.BLOCK_ALL)
      .encryption(BucketEncryption.S3_MANAGED)
      .build();

    // Upload SPA via CI (aws s3 sync ...) or custom resource.

    Function api = Function.Builder.create(this, "ApiFn")
      .runtime(Runtime.DOTNET_8)
      .handler("YourApi::Function::FunctionHandler")
      .code(Code.fromAsset(a.getApiAssetPath()))
      .build();

    Alias alias = Alias.Builder.create(this, "ApiAlias")
      .aliasName(a.getSha())
      .version(api.getCurrentVersion())
      .build();

    // Commit DNS record to the shared Edge distribution
    // Requires shared discovery of dist domain/hosted zone via SSM or env
    // new ARecord(this, "CommitRecord", ...);
  }
}
```

---

## Notes and trade-offs

- **Why Lambda@Edge origin override?** CloudFront Functions cannot change origin;
  **origin-request** can. This lets Edge stay static while each App stack brings
  its own S3 **web origin**.
- **Why wildcard alias?** You cannot attach the same alias to multiple CF
  distributions. A wildcard on one distribution cleanly accepts commit hosts.
- **Identity**: keep OAuth redirect URIs stable; providers do not expose a safe,
  public API to mutate them per commit.

---

## References

- CloudFront alias limitation and blue/green options:
  - https://serverfault.com/questions/714742/blue-green-deployments-with-cloudfront
  - https://chester.codes/cloudfront-green-blue
- CloudFront Functions vs Lambda@Edge capabilities:
  - https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/cloudfront-functions.html
  - https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/lambda-at-the-edge.html
- ACM certificate for CloudFront must be in us-east-1:
  - https://docs.aws.amazon.com/acm/latest/userguide/acm-services.html#services-cloudfront

