# DIY Accounting Submit - Developer Setup Guide

This project allows UK businesses to submit tax returns to HMRC under the Making Tax Digital (MTD) framework. It simplifies interactions through HMRC’s official APIs, providing streamlined VAT submissions initially via a straightforward web interface.

---

# Build and run locally

## Java code formatting (Maven Spotless + Palantir Java Format)

CLI (applies exactly what the IDE should do):
- ./mvnw spotless:apply  # formats code
- ./mvnw spotless:check  # verifies formatting (CI-safe)

Spotless is configured in pom.xml to use palantir-java-format (pinned). This is a Google Java Format fork with a fixed 100-column wrap.

### Eclipse setup to follow Maven (Palantir Java Format)
1) Install the Palantir Java Format plugin for Eclipse:
   - Eclipse Marketplace: search for "palantir-java-format" and install; or
   - Update site: https://palantir.github.io/palantir-java-format/eclipse/update/ (Help → Install New Software... → Add...)
2) Enable Palantir formatter in Eclipse:
   - Preferences → Java → Code Style → Formatter:
     - Select "palantir-java-format" as the active formatter profile.
     - Optionally disable other custom profiles.
3) Configure Save Actions to format on save:
   - Preferences → Java → Editor → Save Actions:
     - Check "Perform the selected actions on save"
     - Check "Format source code" (All lines)
     - Check "Organize imports" (Spotless also removes unused imports; duplication is harmless)
4) Right margin guide at 100 columns (visual aid only):
   - Preferences → General → Editors → Text Editors → Show print margin, set to 100.
   - The repo .editorconfig also sets this for IDEs that honor it.

Notes:
- Palantir formatter is deterministic and ignores most Eclipse code style settings; it enforces ~Google style with 100 columns.
- If you have the Google Java Format plugin instead, it will also use 100 columns but may differ subtly from Palantir on some constructs. Prefer the Palantir plugin to match Maven exactly.

### IntelliJ IDEA setup (optional)
- Install the "Palantir Java Format" plugin or "Google Java Format" with the Palantir fork if available. Then enable it under Settings → Tools → Palantir/Google Java Format.
- Set Right Margin to 100 (Editor → Code Style → Java) or rely on .editorconfig.

## Clone the Repository

```bash

git clone git@github.com:antonycc/submit.diyaccounting.co.uk.git
cd submit.diyaccounting.co.uk.git
```

## Install Node.js dependencies and test

```bash

npm install
npm test
```

## Build and test the Java Application

```bash
./mvnw clean package
```

## Synthesis the CDK

```bash
npx cdk synth
```

## Run the website locally

```bash
npm run server
```

Webserver output:
```log

> web-submit-diyaccounting-co-uk@0.0.2-4 start
> node app/bin/server.js

Listening at http://127.0.0.1:3000 for https://test-api.service.hmrc.gov.uk

```

Access via [http://127.0.0.1:3000](http://127.0.0.1:3000) or...
use the built-in ngrok proxy to expose http://127.0.0.1:3000 to an SSL terminated public URL:

```bash
# Set your ngrok authtoken first (get it from https://dashboard.ngrok.com/get-started/your-authtoken)
export NGROK_AUTHTOKEN=your_authtoken_here

# Start the ngrok tunnel
npm run proxy
```

Or you can also use ngrok directly by running:
```bash
node app/bin/ngrok.js 3000
```

ngrok runs and outputs something like:
```log
[ngrok]: ✅ Tunnel established at https://wanted-finally-anteater.ngrok-free.app
Ngrok started url=https://wanted-finally-anteater.ngrok-free.app
[ngrok]: Tunnel is running. Press CTRL-C to stop.
```

Here you can open the ngrok URL (e.g., https://wanted-finally-anteater.ngrok-free.app) in a browser of your choice.
The URL will be based on your `.env.proxy` configuration or a random URL if not specified.

# Local usage with HMRC

Add the ngrok URL to the HMRC MTD service as a redirect URI, e.g. `https://wanted-finally-anteater.ngrok-free.app/`.
Start at https://d57b-146-70-103-222.ngrok-free.app
Enter your VAT number, Period Key, and VAT Due in the form and click "Submit VAT Return".
Log in to HMRC...

More details on usage are in [USERGUIDE.md](programmers/USERGUIDE.md).

---

# Deployment to AWS

## Repository set-up

Add the following repository variables to your GitHub repository settings under "Settings":

| Variable                  | Description                              | Level        | Type     | Example                         |
|---------------------------|------------------------------------------|--------------|----------|---------------------------------|
| `AWS_HOSTED_ZONE_ID`      | The AWS hosted zone ID for the domain.   | Repository   | String   | `Z0315522208PWZSSBI9AL`         |
| `AWS_HOSTED_ZONE_NAME`    | The AWS hosted zone name for the domain. | Repository   | String   | `submit.diyaccounting.co.uk`             |
| `AWS_CERTIFICATE_ARN`      | The AWS certificate ID for the domain.   | Environment  | String   | `arn:aws:acm:us-east-1:887764105431:certificate/b23cd904-8e3b-4cd0-84f1-57ca11d7fe2b`          |
| `AWS_CLOUD_TRAIL_ENABLED` | Enable CloudTrail logging.               | Environment  | Boolean  | `true`                          |

To use a repository level variable certificate should be able to cover the domain `submit.diyaccounting.co.uk` and
`*.submit.diyaccounting.co.uk`. If a more specific certificate is required, then the `AWS_CERTIFICATE_ARN` variable can
be set at the environment level. Similarly, zone files can be per environment.

## OIDC Set-up

Add an OIDC identity provider to your AWS account to allow GitHub Actions to assume roles in your AWS account.
In this document it assumed that the identity provider is: `arn:aws:iam::887764105431:oidc-provider/token.actions.githubusercontent.com`.

See setting up an OIDC identity provider in the GitHub documentation: [Configuring OpenID Connect in Amazon Web Services](https://docs.github.com/en/actions/how-tos/security-for-github-actions/security-hardening-your-deployments/configuring-openid-connect-in-amazon-web-services).

## GitHub Actions role creation

The GitHub Actions role authenticates with AWS but does not have permissions to deploy the application.
These permissions are granted to the `submit-deployment-role` which is assumed by the GitHub Actions role.

The `submit-github-actions-role` needs the following trust entity to allow GitHub Actions to assume the role:
```bash

cat <<'EOF' > submit-github-actions-trust-policy.json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Principal": {
                "Federated": "arn:aws:iam::887764105431:oidc-provider/token.actions.githubusercontent.com"
            },
            "Action": "sts:AssumeRoleWithWebIdentity",
            "Condition": {
                "StringEquals": {
                    "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
                },
                "StringLike": {
                    "token.actions.githubusercontent.com:sub": "repo:antonycc/submit.diyaccounting.co.uk:*"
                }
            }
        }
    ]
}
EOF
```

Create the submit-github-actions-role:
```bash
aws iam create-role \
  --role-name submit-github-actions-role \
  --assume-role-policy-document file://submit-github-actions-trust-policy.json
```

Add the necessary permissions to deploy `submit.diyaccounting.co.uk`:
```bash

cat <<'EOF' > submit-assume-deployment-role-permissions-policy.json
{
  "Version": "2012-10-17",
  "Statement": [
    {
        "Sid": "Statement1",
        "Effect": "Allow",
        "Action": [
            "sts:AssumeRole",
            "sts:TagSession"
        ],
        "Resource": [
            "arn:aws:iam::887764105431:role/submit-deployment-role"
        ]
    }
  ]
}
EOF
aws iam put-role-policy \
  --role-name submit-github-actions-role \
  --policy-name assume-deployment-role-permissions-policy \
  --policy-document file://submit-assume-deployment-role-permissions-policy.json
```

An example of the GitHub Actions role being assumed in a GitHub Actions Workflow:
```yaml
      - name: Configure AWS Credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::887764105431:role/submit-github-actions-role
          role-chaining: false
          aws-region: eu-west-2
          audience: sts.amazonaws.com
          role-skip-session-tagging: true
          output-credentials: true
          retry-max-attempts: 3
      - run: aws sts get-caller-identity
```

## Deployment role creation

Create the IAM role with the necessary permissions be assumed from the authenticated users:
(Assumes these roles exist: `antony-local-user` and `submit-github-actions-role`.)
```bash

cat <<'EOF' > submit-deployment-trust-policy.json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "AWS": [
          "arn:aws:iam::541134664601:user/antony-local-user",
          "arn:aws:iam::887764105431:role/submit-github-actions-role"
        ]
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
EOF
aws iam create-role \
  --role-name submit-deployment-role \
  --assume-role-policy-document file://submit-deployment-trust-policy.json
```

Add the necessary permissions to deploy `submit.diyaccounting.co.uk`:
```bash

cat <<'EOF' > submit-deployment-permissions-policy.json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "cloudformation:*",
        "iam:*",
        "s3:*",
        "cloudtrail:*",
        "logs:*",
        "events:*",
        "lambda:*",
        "dynamodb:*",
        "sqs:*",
        "ecr:*",
        "ssm:*",
        "sts:AssumeRole"
      ],
      "Resource": "*"
    }
  ]
}
EOF
aws iam put-role-policy \
  --role-name submit-deployment-role \
  --policy-name submit-deployment-permissions-policy \
  --policy-document file://submit-deployment-permissions-policy.json
```

An example of the Deployment role being assumed in a GitHub Actions Workflow:
```yaml
      - name: Configure AWS Credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::887764105431:role/submit-deployment-role
          role-chaining: true
          aws-region: eu-west-2
          audience: sts.amazonaws.com
          role-skip-session-tagging: true
          output-credentials: true
          retry-max-attempts: 3
      - run: aws sts get-caller-identity
```

## Deployment role trust relationships

For this example, user `antony-local-user` has the following
trust policy so that they can assume the role: `submit-deployment-role`:
```json
{
	"Version": "2012-10-17",
	"Statement": [
		{
			"Sid": "Statement1",
			"Effect": "Allow",
			"Action": ["sts:AssumeRole", "sts:TagSession"],
			"Resource": ["arn:aws:iam::887764105431:role/submit-deployment-role"]
		}
	]
}
```

Assume the deployment role from the command line starting as `antony-local-user`:
```bash

ROLE_ARN="arn:aws:iam::887764105431:role/submit-deployment-role"
SESSION_NAME="submit-deployment-session-local"
ASSUME_ROLE_OUTPUT=$(aws sts assume-role --role-arn "$ROLE_ARN" --role-session-name "$SESSION_NAME" --output json)
if [ $? -ne 0 ]; then
  echo "Error: Failed to assume role."
  exit 1
fi
export AWS_ACCESS_KEY_ID=$(echo "$ASSUME_ROLE_OUTPUT" | jq -r '.Credentials.AccessKeyId')
export AWS_SECRET_ACCESS_KEY=$(echo "$ASSUME_ROLE_OUTPUT" | jq -r '.Credentials.SecretAccessKey')
export AWS_SESSION_TOKEN=$(echo "$ASSUME_ROLE_OUTPUT" | jq -r '.Credentials.SessionToken')
EXPIRATION=$(echo "$ASSUME_ROLE_OUTPUT" | jq -r '.Credentials.Expiration')
echo "Assumed role successfully. Credentials valid until: $EXPIRATION"
```
Output:
```log
Assumed role successfully. Credentials valid until: 2025-03-25T02:27:18+00:00
```

Check the session:
```bash

aws sts get-caller-identity
```

Output:
```json
{
  "UserId": "AROA45MW5HDLYEIKWFG6F:submit-deployment-session-local",
  "Account": "887764105431",
  "Arn": "arn:aws:sts::887764105431:assumed-role/submit-deployment-role/submit-deployment-session-local"
}
```

Check the permissions of the role:
```bash

aws iam list-role-policies \
  --role-name submit-deployment-role
```
Output (the policy we created above):
```json
{
  "PolicyNames": [
    "submit-deployment-permissions-policy"
  ]
}
```

## Deployment from local to AWS

### CDK Bootstrap

You'll need to have run `npx cdk bootstrap` to set up the environment for the CDK. This is a one-time setup per AWS account and region.

Assume deployment role:
```bash

. ./scripts/aws-assume-submit-deployment-role.sh
```

Output:
```log
Assumed arn:aws:iam::541134664601:role/submit-deployment-role successfully, expires: 2025-05-14T02:19:16+00:00. Identity is now:
{
"UserId": "AROAX37RDWOMSMQUIZOI4:agentic-lib-deployment-session-local",
"Account": "541134664601",
"Arn": "arn:aws:sts::541134664601:assumed-role/submit-deployment-role/agentic-lib-deployment-session-local"
}
```~/projects/submit.diyaccounting.co.uk %
```

The role `submit-deployment-role` has sufficient permissions to bootstrap the CDK environment and deploy the stack.
```bash

npx cdk bootstrap aws://887764105431/eu-west-2
```

```log

~/projects/submit.diyaccounting.co.uk % npx cdk bootstrap aws://887764105431/eu-west-2
[INFO] Scanning for projects...
[INFO]
[INFO] -------------------< submit.diyaccounting.co.uk:web >-------------------
[INFO] Building web 0.0.1
[INFO]   from pom.xml
[INFO] --------------------------------[ jar ]---------------------------------
[INFO]
[INFO] --- exec:3.5.1:java (default-cli) @ web ---
[WARNING] aws-cdk-lib.aws_cloudfront_origins.S3Origin is deprecated.
  Use `S3BucketOrigin` or `S3StaticWebsiteOrigin` instead.
  This API will be removed in the next major release.
[WARNING] aws-cdk-lib.aws_cloudfront_origins.S3Origin#bind is deprecated.
  Use `S3BucketOrigin` or `S3StaticWebsiteOrigin` instead.
  This API will be removed in the next major release.
[WARNING] aws-cdk-lib.aws_lambda.FunctionOptions#logRetention is deprecated.
  use `logGroup` instead
  This API will be removed in the next major release.
[WARNING] aws-cdk-lib.aws_lambda.FunctionOptions#logRetention is deprecated.
  use `logGroup` instead
  This API will be removed in the next major release.
[INFO] ------------------------------------------------------------------------
[INFO] BUILD SUCCESS
[INFO] ------------------------------------------------------------------------
[INFO] Total time:  3.585 s
[INFO] Finished at: 2025-07-13T20:03:56+01:00
[INFO] ------------------------------------------------------------------------
 ⏳  Bootstrapping environment aws://887764105431/eu-west-2...
Trusted accounts for deployment: (none)
Trusted accounts for lookup: (none)
Using default execution policy of 'arn:aws:iam::aws:policy/AdministratorAccess'. Pass '--cloudformation-execution-policies' to customize.
CDKToolkit: creating CloudFormation changeset...
 ✅  Environment aws://887764105431/eu-west-2 bootstrapped.

NOTICES         (What's this? https://github.com/aws/aws-cdk/wiki/CLI-Notices)

34892   CDK CLI will collect telemetry data on command usage starting at version 2.1100.0 (unless opted out)

        Overview: We do not collect customer content and we anonymize the
                  telemetry we do collect. See the attached issue for more
                  information on what data is collected, why, and how to
                  opt-out. Telemetry will NOT be collected for any CDK CLI
                  version prior to version 2.1100.0 - regardless of
                  opt-in/out.

        Affected versions: cli: ^2.0.0

        More information at: https://github.com/aws/aws-cdk/issues/34892


If you don’t want to see a notice anymore, use "cdk acknowledge <id>". For example, "cdk acknowledge 34892".
~/projects/submit.diyaccounting.co.uk %
```

Package the CDK, deploy the CDK stack which rebuilds the Docker image, and deploy the AWS infrastructure:
```bash

./mvnw clean package
```

Maven build output:
```log
...truncated...
[INFO] Replacing original artifact with shaded artifact.
[INFO] Replacing /Users/antony/projects/submit.diyaccounting.co.uk/target/web-0.0.1.jar with /Users/antony/projects/submit.diyaccounting.co.uk/target/web-0.0.1-shaded.jar
[INFO] ------------------------------------------------------------------------
[INFO] BUILD SUCCESS
[INFO] ------------------------------------------------------------------------
[INFO] Total time:  15.522 s
[INFO] Finished at: 2025-05-14T03:16:19+02:00
[INFO] ------------------------------------------------------------------------
```

Assume deployment role:
```bash

. ./scripts/aws-assume-submit-deployment-role.sh
```

Output:
```log
Assumed arn:aws:iam::541134664601:role/submit-deployment-role successfully, expires: 2025-05-14T02:19:16+00:00. Identity is now:
{
"UserId": "AROAX37RDWOMSMQUIZOI4:agentic-lib-deployment-session-local",
"Account": "541134664601",
"Arn": "arn:aws:sts::541134664601:assumed-role/submit-deployment-role/agentic-lib-deployment-session-local"
}
~/projects/submit.diyaccounting.co.uk %
```

Synthesise the CDK:
```bash
npx cdk synth
```

Compute a diff of the AWS infrastructure:
```bash

npx cdk diff
```

Deploy the AWS infrastructure:
```bash

npx cdk deploy
```

Example output:
```log
WebStack | 4/8 | 3:20:29 AM | UPDATE_COMPLETE      | AWS::CloudFormation::Stack                      | WebStack
[03:20:34] Stack WebStack has completed updating

 ✅  WebStack

✨  Deployment time: 46.85s

Outputs:
WebStack.ARecord = dev.submit.diyaccounting.co.uk
WebStack.AaaaRecord = dev.submit.diyaccounting.co.uk
WebStack.CertificateArn = arn:aws:acm:us-east-1:541134664601:certificate/73421403-bd8c-493c-888c-e3e08eec1c41
WebStack.DistributionAccessLogBucketArn = arn:aws:s3:::dev-web-intention-com-dist-access-logs
WebStack.DistributionId = E24DIA1LSWOHYI
WebStack.HostedZoneId = Z09934692CHZL2KPE9Q9F
WebStack.OriginAccessLogBucketArn = arn:aws:s3:::dev-web-intention-com-origin-access-logs
WebStack.OriginBucketArn = arn:aws:s3:::dev-web-intention-com
WebStack.accessLogGroupRetentionPeriodDays = 30 (Source: CDK context.)
WebStack.certificateArn = 73421403-bd8c-493c-888c-e3e08eec1c41 (Source: CDK context.)
WebStack.cloudTrailEnabled = true (Source: CDK context.)
WebStack.cloudTrailEventSelectorPrefix = none (Source: CDK context.)
WebStack.cloudTrailLogGroupPrefix = /aws/s3/ (Source: CDK context.)
WebStack.cloudTrailLogGroupRetentionPeriodDays = 3 (Source: CDK context.)
WebStack.defaultDocumentAtOrigin = index.html (Source: CDK context.)
WebStack.docRootPath = public (Source: CDK context.)
WebStack.env = dev (Source: CDK context.)
WebStack.error404NotFoundAtDistribution = errors/404-error-distribution.html (Source: CDK context.)
WebStack.hostedZoneId = Z09934692CHZL2KPE9Q9F (Source: CDK context.)
WebStack.hostedZoneName = diyaccounting.co.uk (Source: CDK context.)
WebStack.s3RetainOriginBucket = false (Source: CDK context.)
WebStack.s3RetainReceiptsBucket = false (Source: CDK context.)
WebStack.s3UseExistingBucket = false (Source: CDK context.)
WebStack.subDomainName = web (Source: CDK context.)
WebStack.useExistingCertificate = true (Source: CDK context.)
WebStack.useExistingHostedZone = true (Source: CDK context.)
Stack ARN:
arn:aws:cloudformation:eu-west-2:541134664601:stack/WebStack/b49af1d0-2f5e-11f0-a683-063fb0a54f1d

✨  Total time: 52.69s

```

## Troubleshooting - destroying the stack and cleaning up log groups

Destroy a previous stack and delete related log groups:
```bash

npx cdk destroy
```

Force delete the buckets:
```bash

aws s3 rm 's3://dev-submit-diyaccounting-co-uk-origin-access-logs' --recursive
aws s3 rb 's3://dev-submit-diyaccounting-co-uk-origin-access-logs' --force
```

Manually delete the log groups:
```bash

aws logs delete-log-group \
  --log-group-name '/aws/lambda/dev-submit-diyaccounting-co-uk-origin-access-log-forwarder'
aws logs delete-log-group \
  --log-group-name '/aws/lambda/dev-submit-diyaccounting-co-uk-dist-access-log-forwarder'
```

## 🎯 MVP (Initial Release)

### Features:

* Basic HTML form to submit VAT returns.
* No persistent identity—OAuth performed per submission.
* Submission status and receipts stored securely in AWS S3.

### Tech Stack:

* **Frontend:** HTML5, JavaScript
* **Backend:** Node.js (Express.js), AWS Lambda
* **Infrastructure:** AWS CDK (Java), AWS S3, AWS SQS
* **Authentication:** HMRC OAuth 2.0 (Authorization Code Grant)

### Frontend (HTML form):

```html
<form action="/submit" method="post">
  <input name="vatNumber" placeholder="VAT Number">
  <input name="periodKey" placeholder="Period Key">
  <input name="vatDue" placeholder="VAT Due">
  <button type="submit">Submit VAT Return</button>
</form>
```

### OAuth Handler (JavaScript):

```javascript
app.get('/auth/hmrc', (req, res) => {
  const authUrl = `https://test-api.service.hmrc.gov.uk/oauth/authorize?client_id=${CLIENT_ID}&redirect_uri=${REDIRECT_URI}&response_type=code&scope=write:vat`;
  res.redirect(authUrl);
});

app.get('/callback', async (req, res) => {
  const code = req.query.code;
  const tokenResponse = await axios.post('https://test-api.service.hmrc.gov.uk/oauth/token', {
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    redirect_uri: REDIRECT_URI,
    grant_type: 'authorization_code',
    code: code
  });
  const accessToken = tokenResponse.data.access_token;
  // Queue submission task with SQS
});
```

### Lambda Task Example (JavaScript):

```javascript
exports.handler = async (event) => {
  const { accessToken, vatNumber, periodKey, vatDue } = event;
  await axios.post(`https://test-api.service.hmrc.gov.uk/organisations/vat/${vatNumber}/returns`, {
    periodKey, vatDueSales: vatDue, totalVatDue: vatDue
  }, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
};
```

### Infrastructure Setup (AWS CDK - Java):

```java
import software.amazon.awscdk.*;
import software.amazon.awscdk.services.lambda.*;
import software.amazon.awscdk.services.sqs.*;
import software.amazon.awscdk.services.s3.*;
import software.amazon.awscdk.services.logs.*;

public class MtdStack extends Stack {
  public MtdStack(final Construct scope, final String id) {
    super(scope, id);

    Bucket submissionBucket = Bucket.Builder.create(this, "SubmissionBucket")
      .versioned(true)
      .build();

    Queue submissionQueue = Queue.Builder.create(this, "SubmissionQueue").build();

    LogGroup handlerLogGroup = LogGroup.Builder.create(this, "VatSubmissionHandlerLogGroup")
      .logGroupName("/aws/lambda/VatSubmissionHandler")
      .retention(RetentionDays.DAYS_7)
      .removalPolicy(RemovalPolicy.DESTROY)
      .build();

    Function handler = Function.Builder.create(this, "VatSubmissionHandler")
      .runtime(Runtime.NODEJS_22_X)
      .handler("index.handler")
      .code(Code.fromAsset("lambda"))
      .logGroup(handlerLogGroup)
      .environment(Map.of(
        "BUCKET_NAME", submissionBucket.getBucketName()
      ))
      .build();

    submissionBucket.grantReadWrite(handler);
    submissionQueue.grantConsumeMessages(handler);
  }
}
```
