# DIY Accounting Submit

This project allows UK businesses to submit tax returns to HMRC under the Making Tax Digital (MTD) framework. It simplifies interactions through HMRC’s official APIs, providing streamlined VAT submissions initially via a straightforward web interface.

---

# Build and run locally

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
http-server public/ --port 3000
```

Webserver output:
```log
Starting up http-server, serving public/

http-server version: 14.1.1

http-server settings: 
CORS: disabled
Cache: 3600 seconds
Connection Timeout: 120 seconds
Directory Listings: visible
AutoIndex: visible
Serve GZIP Files: false
Serve Brotli Files: false
Default File Extension: none

Available on:
  http://127.0.0.1:3000
  http://192.168.1.121:3000
  http://10.14.0.2:3000
  http://169.254.59.96:3000
Hit CTRL-C to stop the server
```

Access via [http://127.0.0.1:3000](http://127.0.0.1:3000) or...
install [ngrok](https://ngrok.com/) and run to expose http://127.0.0.1:3000 to an SSL terminated public URL:
```bash
ngrok http 3000
```

ngrok runs:
```log
ngrok                                                                                                                                                                                                          (Ctrl+C to quit)
                                                                                                                                                                                                                               
🤖 Want to hang with ngrokkers on our new Discord? http://ngrok.com/discord                                                                                                                                                    
                                                                                                                                                                                                                               
Session Status                online                                                                                                                                                                                           
Account                       Antony @ Polycode (Plan: Free)                                                                                                                                                                   
Version                       3.22.1                                                                                                                                                                                           
Region                        Europe (eu)                                                                                                                                                                                      
Web Interface                 http://127.0.0.1:4040                                                                                                                                                                            
Forwarding                    https://d57b-146-70-103-222.ngrok-free.app -> http://localhost:3000                                                                                                                              
                                                                                                                                                                                                                               
Connections                   ttl     opn     rt1     rt5     p50     p90                                                                                                                                                      
                              0       0       0.00    0.00    0.00    0.00                  
```

Here you can open https://d57b-146-70-103-222.ngrok-free.app in a browser of your choice (you'll have your own URL
unless I am still running this one, I don't know when the id's roll so I might.)

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
        if: steps.mvn.outputs.pomXmlExists == 'true'
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
WebStack.error404NotFoundAtDistribution = 404-error-distribution.html (Source: CDK context.)
WebStack.hostedZoneId = Z09934692CHZL2KPE9Q9F (Source: CDK context.)
WebStack.hostedZoneName = diyaccounting.co.uk (Source: CDK context.)
WebStack.logGzippedS3ObjectEventHandlerSource = target/web-0.0.1.jar (Source: CDK context.)
WebStack.logS3ObjectEventHandlerSource = target/web-0.0.1.jar (Source: CDK context.)
WebStack.s3RetainBucket = false (Source: CDK context.)
WebStack.s3UseExistingBucket = false (Source: CDK context.)
WebStack.subDomainName = web (Source: CDK context.)
WebStack.useExistingCertificate = true (Source: CDK context.)
WebStack.useExistingHostedZone = true (Source: CDK context.)
Stack ARN:
arn:aws:cloudformation:eu-west-2:541134664601:stack/SubmitWebStack/b49af1d0-2f5e-11f0-a683-063fb0a54f1d

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
  --log-group-name '/aws/lambda/dev-submit-diyaccounting-co-uk-distribution-access-log-forwarder'
```

---

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

public class MtdStack extends Stack {
  public MtdStack(final Construct scope, final String id) {
    super(scope, id);

    Bucket submissionBucket = Bucket.Builder.create(this, "SubmissionBucket")
      .versioned(true)
      .build();

    Queue submissionQueue = Queue.Builder.create(this, "SubmissionQueue").build();

    Function handler = Function.Builder.create(this, "VatSubmissionHandler")
      .runtime(Runtime.NODEJS_20_X)
      .handler("index.handler")
      .code(Code.fromAsset("lambda"))
      .environment(Map.of(
        "BUCKET_NAME", submissionBucket.getBucketName()
      ))
      .build();

    submissionBucket.grantReadWrite(handler);
    submissionQueue.grantConsumeMessages(handler);
  }
}
```

---

## 🚧 Beta 1 (User Accounts & Persistent Auth)

### Added Features:

* Google Sign-In
* Persistent HMRC OAuth tokens per user

### Additional Stack:

* **Auth:** Passport.js (Google OAuth)
* **DB:** PostgreSQL

---

## 🚀 Beta 2 (Workbook Integration)

### Added Features:

* Upload DIY accounting CSV/XLS files
* Pre-populated VAT submission forms

### Additional Stack:

* SheetJS for parsing CSV/XLS

---

## 🎉 Version 1.0 (Monetization)

### Added Features:

* Payment integration for donations/subscriptions
* Submission restriction based on active subscriptions/donations

### Additional Stack:

* Stripe API for payments

---

## 🛂 HMRC Approval & Onboarding

### HMRC Approval Checklist:

* Register at [HMRC Developer Hub](https://developer.service.hmrc.gov.uk)
* Sandbox tests (VAT obligations & return submissions)
* Implement fraud prevention headers
* Email [SDSTeam@hmrc.gov.uk](mailto:SDSTeam@hmrc.gov.uk) after successful sandbox testing
* Complete HMRC questionnaires
* Accept Terms of Use

### HMRC OAuth Flow:

* User redirected to HMRC consent
* HMRC returns authorization code
* Exchange authorization code for access token

---

## 🔖 Code Samples Reference:

### OAuth Token Exchange (JavaScript):

```javascript
const getToken = async (code) => {
  return axios.post('https://test-api.service.hmrc.gov.uk/oauth/token', {
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    redirect_uri: REDIRECT_URI,
    grant_type: 'authorization_code',
    code: code
  });
};
```

### Frontend Form Submission (JavaScript):

```javascript
document.querySelector('form').onsubmit = async (e) => {
  e.preventDefault();
  const formData = new FormData(e.target);
  await fetch('/submit', {
    method: 'POST',
    body: JSON.stringify(Object.fromEntries(formData)),
    headers: { 'Content-Type': 'application/json' }
  });
};
```

---

## 📅 Project Roadmap

| Release     | Features                           | Timeframe |
| ----------- | ---------------------------------- | --------- |
| MVP         | Basic submission via HTML form     | 6 Weeks   |
| Beta 1      | Google Login, persistent HMRC auth | +4 Weeks  |
| Beta 2      | CSV/XLS Integration                | +3 Weeks  |
| Version 1.0 | Monetization via Stripe            | +4 Weeks  |

---

# Delivery

Here’s how HMRC handles onboarding developers (and users) for its Making Tax Digital (MTD) APIs—step by step:

---

### 1. Developer Registration

* **Create an account** on the [HMRC Developer Hub](https://developer.service.hmrc.gov.uk) and sign in ([developer.service.hmrc.gov.uk][1]).
* **Register your application**:

    * Choose sandbox or production environment.
    * Subscribe to relevant MTD APIs (e.g., VAT, Income Tax) ([Infor Documentation][2], [Microsoft Learn][3]).
    * HMRC provides a **Client ID** and **Secret**.

---

### 2. Sandbox Setup

* In sandbox mode, you can **create test users** via the "Create Test User" API. You can choose between individual, organisation, or agent test users. Each includes credentials like user ID, password, VAT, SA‑UTR, etc. ([developer.service.hmrc.gov.uk][4]).
* These test users act as HMRC-registered customers in the sandbox environment.

---

### 3. Configure Redirect URIs and Scopes

* Add one or more **redirect URIs** in the Developer Hub configuration so HMRC knows where to return users after OAuth login ([Infor Documentation][2]).
* Set OAuth scopes, such as `read:vat` and `write:vat`, to control API access ([Microsoft Learn][3]).

---

### 4. Obtain Authorization Code (OAuth 2.0)

* The app redirects the user (or test user) to HMRC’s OAuth authorization endpoint with the chosen scopes.
* The user logs in with their HMRC credentials (Government Gateway account or test user) and **grants consent**.
* HMRC returns an **authorization code** to the redirect URI ([Microsoft Learn][3]).

---

### 5. Exchange Code for Tokens

* Your backend exchanges the authorization code for an **access token** (and optionally a refresh token). The service enforces secure TLS 1.2 connections.
* These tokens are used to authenticate subsequent calls to HMRC’s MTD APIs.

---

### 6. API Subscription and Access

* Once tokens are obtained, your application can access endpoints like:

    * `/organisations/vat/{vrn}/obligations` to fetch VAT periods
    * `POST /organisations/vat/{vrn}/returns` to submit returns
      ([Microsoft Learn][3]).
* For production use, apps must go through HMRC’s **production approval** and meet requirements like fraud headers, STS, and logging ([developer.service.hmrc.gov.uk][5]).

---

### 7. Agent Onboarding (for Tax Agents)

* Agents require an **Agent Services Account (ASA)** in addition to a GOV.UK account ([Clear Books Support][6]).
* They use the **Agent Authorisation API** to authorise for clients ([developer.service.hmrc.gov.uk][1]).

---

### 8. Production Approval

* HMRC enforces compliance through monitoring and safeguards to ensure:

    * Secure data handling
    * Streamlined customer journeys
    * Fraud prevention mechanisms
      ([developer.service.hmrc.gov.uk][5], [docs.data-community.publishing.service.gov.uk][7], [GOV.UK][8]).

---

### 🗺️ Summary Flowchart

1. Developer registers app → gets credentials
2. Create sandbox test user (optional)
3. Configure scopes & redirect URI
4. Redirect user → HMRC login → consent
5. Receive authorization code → exchange tokens
6. Use token to call MTD APIs
7. (Agent case) Use Agent Auth API
8. Ensure production readiness & HMRC approval

---

[1]: https://developer.service.hmrc.gov.uk/api-documentation/docs/api?utm_source=chatgpt.com "API Documentation - HMRC Developer Hub - GOV.UK"
[2]: https://docs.infor.com/csdis/2022.x/en-us/useradminlib_csd_cloud/saolh/mrz1553526224446.html?utm_source=chatgpt.com "Setting up VAT HMRC digital reporting - Infor Documentation Central"
[3]: https://learn.microsoft.com/en-us/dynamics365/finance/localizations/united-kingdom/emea-gbr-mtd-vat-integration-sandbox?utm_source=chatgpt.com "Test interoperation with the MTD VAT sandbox | Dynamics 365"
[4]: https://developer.service.hmrc.gov.uk/api-test-user?utm_source=chatgpt.com "Create test user - HMRC Developer Hub - GOV.UK"
[5]: https://developer.service.hmrc.gov.uk/guides/vat-mtd-end-to-end-service-guide/?utm_source=chatgpt.com "VAT (MTD) end-to-end service guide"
[6]: https://support.clearbooks.co.uk/support/solutions/articles/33000232533-mtd-onboarding-for-partners?utm_source=chatgpt.com "MTD onboarding for Partners - VAT - Clear Books Support"
[7]: https://docs.data-community.publishing.service.gov.uk/get-started/onboard-data-labs/?utm_source=chatgpt.com "New starter onboarding - Data Services"
[8]: https://www.gov.uk/government/consultations/better-use-of-new-and-improved-third-party-data/better-use-of-new-and-improved-third-party-data-to-make-it-easier-to-pay-tax-right-first-time?utm_source=chatgpt.com "Better use of new and improved third-party data to make it ... - GOV.UK"

---

# 📅 HMRC Onboarding

Here’s a detailed look at HMRC’s **production approval** process for MTD (Making Tax Digital), especially for VAT — covering criteria, requirements, testing, and final sign‑off:

---

## 🛡️ 1. Objectives & Minimum Standards

HMRC’s approval focuses on two key goals:

* Ensuring a **streamlined, end‑to‑end experience** for businesses.
* Protecting customer data and guarding against fraud ([developer.service.hmrc.gov.uk][1]).

To qualify for production credentials, **at minimum your software must**:

1. Send all **required fraud prevention headers**.
2. Support **retrieving VAT obligations** via the API.
3. Perform **VAT return submission** over the appropriate endpoint ([developer.service.hmrc.gov.uk][1]).

Optional—but highly recommended—features include:

* Retrieving customer information.
* Viewing past returns, liabilities, payments, and penalties.
* Handling amendments and appeals ([Microsoft Learn][2], [developer.service.hmrc.gov.uk][1]).

---

## 🔐 2. Fraud Prevention Headers

Your application must include full fraud‑prevention headers in every API call. HMRC uses a **Test Fraud Prevention Headers API** to validate their accuracy before granting approval ([developer.service.hmrc.gov.uk][3]).

---

## 🧪 3. Testing Requirements (Sandbox Phase)

Before production, complete these sandbox tests:

1. **Create a test-user** of type “organisation” via the HMRC test-user API.
2. **Retrieve VAT obligations** to confirm you handle obligation data.
3. **Submit a VAT return** for the open obligation period.
4. Optionally, test additional endpoints if your product uses them ([developer.service.hmrc.gov.uk][3]).

Your software must also:

* Gracefully handle errors and rate limits.
* Clearly instruct users (e.g., advising them to log in with correct credentials).
* Avoid unnecessary or excessive API calls ([developer.service.hmrc.gov.uk][3]).

---

## 📤 4. Requesting Production Credentials

Once sandbox testing is complete:

* Email **[SDSTeam@hmrc.gov.uk](mailto:SDSTeam@hmrc.gov.uk)** within **two weeks** of finishing your tests, so they can review log entries.
* Expect a ten-working-day turnaround ([developer.service.hmrc.gov.uk][3]).
* You’ll be asked to complete **two questionnaires** about your fraud-prevention implementation and API testing ([developer.service.hmrc.gov.uk][3]).

Importantly, sign **HMRC’s Terms of Use** before production credentials can be issued ([developer.service.hmrc.gov.uk][3]).

---

## ✅ 5. Post‑Approval Steps

After approval:

1. **Obtain production credentials** (Client ID/secret).
2. Make a **live VAT return submission** using actual VRNs; HMRC will verify this live submission before you can be listed as MTD‑approved ([developer.service.hmrc.gov.uk][3]).
3. Once confirmed, you can appear on GOV.UK’s official list of HMRC-approved software.

---

## 🧭 Summary of Approval Process

1. **Build** key features: fraud headers, obligation fetch, return submission.
2. **Test thoroughly** in sandbox with required endpoints.
3. **Engage HMRC**:

    * Email SDSTeam with test logs.
    * Fill out questionnaires.
    * Accept Terms of Use.
4. **Receive production credentials**.
5. **Submit live return** for official verification.
6. **Get listed** on HMRC’s approved software register.

---

[1]: https://developer.service.hmrc.gov.uk/guides/vat-mtd-end-to-end-service-guide?utm_source=chatgpt.com "VAT (MTD) end-to-end service guide"
[2]: https://learn.microsoft.com/en-us/dynamics365/finance/localizations/united-kingdom/emea-gbr-mtd-vat-integration-authorization?utm_source=chatgpt.com "Authorize your Finance environment to interoperate with HMRC's ..."
[3]: https://developer.service.hmrc.gov.uk/guides/vat-mtd-end-to-end-service-guide/?utm_source=chatgpt.com "VAT (MTD) end-to-end service guide"


---


## License

This project is licensed under the GNU General Public License (GPL). See [LICENSE](LICENSE) for details.

License notice:
```
DIY Accounting Submit - submit.diyaccounting.co.uk
Copyright (C) 2025 DIY Accounting Limited

DIY Accounting Submit is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License v3.0 (GPL‑3).
along with this program. If not, see <https://www.gnu.org/licenses/>.

IMPORTANT: Any derived work must include the following attribution:
"This work is derived from https://github.com/xn-intenton-z2a/agentic-lib"
```
