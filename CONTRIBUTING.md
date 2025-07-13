

## Deployment to AWS

You'll need to have run `cdk bootstrap` to set up the environment for the CDK. This is a one-time setup per AWS account and region.
General administrative permissions are required to run this command. (NPM installed the CDK.)

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
