what next for MTD VAT submission
================================

Please examine the contents of the main branch of the repository https://github.com/antonycc/submit.diyaccounting.co.uk/,
consider and state what appear to be the goals of the repository and consider the work to the point of customers being
able to submit VAT using this system and come up with a plan that resolves any quality, accuracy or completeness issues
that exist today and then closes the gap to be ready for HMRC approval and real customer use (free).

Constraints and guidance specific to this repository:
- Use `REPOSITORY_DOCUMENTATION.md` for architecture and environment context (local Express vs Lambda, Cognito + Google IdP, HMRC OAuth 2.0, DynamoDB tables, CloudFront/S3).
- Use `package.json` scripts when proposing verification steps:
  - Unit/system tests: `npm run test:unit`, `npm run test:system`, or `npm test`.
  - Behaviour/browser tests: `npm run test:allBehaviour` / `npm run test:allBehaviour-proxy` / `npm run test:browser`.
  - Format/lint: `npm run formatting`, `npm run formatting-fix`, `npm run linting`, `npm run linting-fix`.
  - Build and CDK synth: `npm run build`, `npm run cdk-ci`, `npm run cdk`.
- Before running tests, trace the code paths you intend to exercise (both the local Express server and the Lambda adaptor) and resolve issues uncovered by inspection.
- Behaviour tests are very verbose — pipe output to a file when running (e.g. `npm run test:allBehaviour-proxy > target/behaviour-test-results/behaviour.log 2>&1`).
