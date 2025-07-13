# intentïon.com (repository0-xn-intenton-z2a.com)

The consumer front end of intentïon.com 
featuring [repository0](https://github.com/xn-intenton-z2a/repository0) 
and the [agentic-lib](https://github.com/xn-intenton-z2a/agentic-lib).

`xn--intenton-z2a.com` is a project by Polycode Limited which presents the intentïon home page: https://xn--intenton-z2a.com/

# Repository variables

| Variable                  | Description                              | Level        | Type     | Example                          |
|---------------------------|------------------------------------------|--------------|----------|----------------------------------|
| `CHATGPT_API_SECRET_KEY`  | The OpenAI API key for the ChatGPT API.  | Repository   | Secret   | `sk-01234-FAKE-012340000T3Bl...` |
| `CHATGPT_API_MODEL`       | The OpenAI API model to use.             | Repository   | String   | `o4-mini`                        |
| `AWS_HOSTED_ZONE_ID`      | The AWS hosted zone ID for the domain.   | Repository   | String   | `Z01234-FAKE-012340000`          |
| `AWS_HOSTED_ZONE_NAME`    | The AWS hosted zone name for the domain. | Repository   | String   | `my-fake-domaim.com`             |
| `AWS_CERTIFICATE_ARN`      | The AWS certificate ID for the domain.   | Environment  | String   | `01234-FAKE-012340000`           |
| `AWS_CLOUD_TRAIL_ENABLED` | Enable CloudTrail logging.               | Environment  | Boolean  | `true`                           |

# Deployment

## Local Development Environment

### Clone the Repository

```bash

git clone https://github.com/your-username/repository0-xn-intenton-z2a.com.git
cd repository0-xn-intenton-z2a.com
```

### Install Node.js dependencies and test

```bash

npm install
npm test
```

### Build and test the Java Application

```bash
./mvnw clean package
```

### Synthesis the CDK

```bash
npx cdk synth
```

### Run the website locally

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

Access via http://127.0.0.1:3000 or install [ngrok](https://ngrok.com/) and get a SSL terminated public URL:
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

## Setup for AWS CDK

You'll need to have run `cdk bootstrap` to set up the environment for the CDK. This is a one-time setup per AWS account and region.
General administrative permissions are required to run this command. (NPM installed the CDK.)

In this example for user `antony-local-user` and `agentic-lib-github-actions-role` we would add the following
trust policy so that they can assume the role: `agentic-lib-deployment-role`:
```json
{
	"Version": "2012-10-17",
	"Statement": [
		{
			"Sid": "Statement1",
			"Effect": "Allow",
			"Action": ["sts:AssumeRole", "sts:TagSession"],
			"Resource": ["arn:aws:iam::541134664601:role/agentic-lib-deployment-role"]
		}
	]
}
```

The `agentic-lib-github-actions-role` also needs the following trust entity to allow GitHub Actions to assume the role:
```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Principal": {
                "Federated": "arn:aws:iam::541134664601:oidc-provider/token.actions.githubusercontent.com"
            },
            "Action": "sts:AssumeRoleWithWebIdentity",
            "Condition": {
                "StringEquals": {
                    "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
                },
                "StringLike": {
                    "token.actions.githubusercontent.com:sub": "repo:xn-intenton-z2a/s3-sqs-bridge:*"
                }
            }
        }
    ]
}
```

Create the IAM role with the necessary permissions to assume role from your authenticated user:
```bash

cat <<'EOF' > agentic-lib-deployment-trust-policy.json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "AWS": [
          "arn:aws:iam::541134664601:user/antony-local-user",
          "arn:aws:iam::541134664601:role/agentic-lib-github-actions-role"
        ]
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
EOF
aws iam create-role \
  --role-name agentic-lib-deployment-role \
  --assume-role-policy-document file://agentic-lib-deployment-trust-policy.json
```

Add the necessary permissions to deploy `repository0-xn-intenton-z2a.com`:
```bash

cat <<'EOF' > agentic-lib-deployment-permissions-policy.json
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
        "sts:AssumeRole"
      ],
      "Resource": "*"
    }
  ]
}
EOF
aws iam put-role-policy \
  --role-name agentic-lib-deployment-role \
  --policy-name agentic-lib-deployment-permissions-policy \
  --policy-document file://agentic-lib-deployment-permissions-policy.json
```

Assume the deployment role:
```bash

ROLE_ARN="arn:aws:iam::541134664601:role/agentic-lib-deployment-role"
SESSION_NAME="agentic-lib-deployment-session-local"
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
  "UserId": "AROAX37RDWOM7ZHORNHKD:agentic-lib-deployment-session",
  "Account": "541134664601",
  "Arn": "arn:aws:sts::541134664601:assumed-role/agentic-lib-deployment-role/agentic-lib-deployment-session"
}
```

Check the permissions of the role:
```bash

aws iam list-role-policies \
  --role-name agentic-lib-deployment-role
```
Output (the policy we created above):
```json
{
  "PolicyNames": [
    "agentic-lib-deployment-permissions-policy"
  ]
}
```

An example of the GitHub Actions role being assumed in a GitHub Actions Workflow:
```yaml
      - name: Configure AWS Credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::541134664601:role/agentic-lib-deployment-role
          aws-region: eu-west-2
      - name: Set up Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'
      - run: npm install -g aws-cdk
      - run: aws s3 ls --region eu-west-2
```

## Deployment to AWS

See also:
* local running using [Localstack](LOCALSTACK.md).
* Debugging notes for the AWS deployment here [DEBUGGING](DEBUGGING.md).

Package the CDK, deploy the CDK stack which rebuilds the Docker image, and deploy the AWS infrastructure:
```bash

./mvnw clean package
```

Maven build output:
```log
...truncated...
[INFO] Replacing original artifact with shaded artifact.
[INFO] Replacing /Users/antony/projects/repository0-xn--intenton-z2a.com/target/web-1.1.0.jar with /Users/antony/projects/repository0-xn--intenton-z2a.com/target/web-1.1.0-shaded.jar
[INFO] ------------------------------------------------------------------------
[INFO] BUILD SUCCESS
[INFO] ------------------------------------------------------------------------
[INFO] Total time:  15.522 s
[INFO] Finished at: 2025-05-14T03:16:19+02:00
[INFO] ------------------------------------------------------------------------
```

Assume deployment role:
```bash

. ./scripts/aws-assume-agentic-lib-deployment-role.sh                                     
```

Output:
```log
Assumed arn:aws:iam::541134664601:role/agentic-lib-deployment-role successfully, expires: 2025-05-14T02:19:16+00:00. Identity is now:
{
"UserId": "AROAX37RDWOMSMQUIZOI4:agentic-lib-deployment-session-local",
"Account": "541134664601",
"Arn": "arn:aws:sts::541134664601:assumed-role/agentic-lib-deployment-role/agentic-lib-deployment-session-local"
}
```~/projects/repository0-xn--intenton-z2a.com %
```

Deploys the AWS infrastructure including an App Runner service, an SQS queue, Lambda functions, and a PostgresSQL table.
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
WebStack.ARecord = dev.web.xn--intenton-z2a.com
WebStack.AaaaRecord = dev.web.xn--intenton-z2a.com
WebStack.CertificateArn = arn:aws:acm:us-east-1:541134664601:certificate/73421403-bd8c-493c-888c-e3e08eec1c41
WebStack.DistributionAccessLogBucketArn = arn:aws:s3:::dev-web-intention-com-distribution-access-logs
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
WebStack.hostedZoneName = xn--intenton-z2a.com (Source: CDK context.)
WebStack.logGzippedS3ObjectEventHandlerSource = target/web-1.1.0.jar (Source: CDK context.)
WebStack.logS3ObjectEventHandlerSource = target/web-1.1.0.jar (Source: CDK context.)
WebStack.s3RetainBucket = false (Source: CDK context.)
WebStack.s3UseExistingBucket = false (Source: CDK context.)
WebStack.subDomainName = web (Source: CDK context.)
WebStack.useExistingCertificate = true (Source: CDK context.)
WebStack.useExistingHostedZone = true (Source: CDK context.)
Stack ARN:
arn:aws:cloudformation:eu-west-2:541134664601:stack/WebStack/b49af1d0-2f5e-11f0-a683-063fb0a54f1d

✨  Total time: 52.69s

```

Destroy a previous stack and delete related log groups:
```bash

npx cdk destroy
```

Delete the log groups:
```bash

aws logs delete-log-group \
  --log-group-name "/aws/s3/s3-sqs-bridge-bucket"
```

# Prompts

Website brief:
```shell
I want a single index.html file that is well-formed, declares
and adheres to all the latest accessibility guidelines and is
responsively rendered on all mainstream devices.

The page should render the word intentïon when the screen is
tapped (or mouse moved) for 3 seconds then fade out.

The word intentïon should be in dark grey (charcoal?) and
as wide as the horizontal viewport. The background should be
light grey, almost white with a hint of yellow (like fog
under bright sunlight).

The background (full screen, no text) should have the
attached images all fading in and out of transparency at
different rates.

Please show the HTML (all inline JS and CSS) the images
and any libraries you pull in would be links.
```

# TODO

Public brand:
- [x] Website for intentïon.com text light, light grey or misty: https://xn--intenton-z2a.com/
- [x] Logo selection
- [x] Sign up for LinkTree
- [x] CDK deploy
- [x] Swap to use repository0 template.
- [x] CI deployment
- [x] Swap over to host live site from the CDK deployment by adding default environment 'ci' and the option of 'prod'.
- [x] Chat to interact with the projects
- [x] Change AWS_CERTIFICATE_ARN to ARN
- [x] Automated activity generation from showcased repositories
- [x] Access links to experiments from the intention logo which appears by the hamburger menu.
- [x] intentïon.com shows: past experiments: <link to branch intentïon.md>
- [x] Move the activity log to the menu
- [x] Add 1-2-3 to the website
```
1. Create a GitHub repository from our template.
2. Save a mission statement for your project.
3. Watch and interact with the AI driven refinement and development until it’s done or reset and try-again.
```
- [n] Create a repository from main via a button.
- [ ] Create websites from archived branches and add these to ./public/ to showcase the projects.
- [ ] Showcase completed projects, back off to something achievable and that's where I am.
- [ ] Generate articles from the library - like feature generation - then use Markdown to HTML to generate the articles.
- [ ] Announce articles on socials
- [ ] Automated feed generation
- [ ] Publish feed generations to socials
- [ ] Add contact bots for socials
- [ ] Add contact bots via Slack / Discord or Redit
- [ ] Link to Linktree
- [ ] Audience Dashboard

# Ownership

`xn--intenton-z2a.com` is a project by Polycode Limited which presents the intentïon home page: https://xn--intenton-z2a.com/

## License

This project is licensed under the GNU General Public License (GPL). See [LICENSE](LICENSE) for details.

License notice:
```
agentic-lib
Copyright (C) 2025 Polycode Limited

agentic-lib is free software: you can redistribute it and/or modify
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

*IMPORTANT*: The project README and any derived work should always include the following attribution:
_"This work is derived from https://github.com/xn-intenton-z2a/repository0-xn-intenton-z2a.com"_

# Thank you

Thank you for your interest in intentïon. Please be careful with our public brand.
