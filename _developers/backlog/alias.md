Here’s how to implement Route 53 weighted alias switching (option A) across the lambdas2 branch.  The idea is to remove CloudFront‑to‑CloudFront chaining and instead use DNS to point the apex (submit.diyaccounting.co.uk) or CI base domain (ci.submit.diyaccounting.co.uk) directly at the appropriate environment distribution.  When no deployment is active the apex will instead point at a maintenance distribution.

### 1. Update the CDK (ApexStack)

The Apex stack should no longer create a Route 53 alias record or manage origin switching.  It should simply host the maintenance bucket/distribution and expose its domain name/id as outputs.  Remove the `apexAlias` field and associated Route 53 record creation:

```diff
*** Begin Patch
*** Update File: infra/main/java/co/uk/diyaccounting/submit/stacks/ApexStack.java
@@
-    import software.amazon.awscdk.services.route53.ARecord;
-    import software.amazon.awscdk.services.route53.ARecordProps;
+    // Removed Route 53 alias import.  ApexStack no longer creates an alias record.

@@
-        public ARecord apexAlias;
+        // ApexStack no longer stores an alias record.  DNS is managed externally via weighted records.

@@ public ApexStack(final Construct scope, final String id, final ApexStackProps props) {
-            // Alias A/AAAA for apex
-            this.apexAlias = new ARecord(
-                    this,
-                    props.resourceNamePrefix() + "-ApexAlias",
-                    ARecordProps.builder()
-                            .recordName(recordName)
-                            .zone(zone)
-                            .target(RecordTarget.fromAlias(new CloudFrontTarget(this.distribution)))
-                            .deleteExisting(true)
-                            .build());
-
-            Aspects.of(this).add(new SetAutoDeleteJobLogRetentionAspect(props.deploymentName(), RetentionDays.THREE_DAYS));
-
-            // Outputs
-            cfnOutput(this, "ApexDistributionDomainName", this.distribution.getDomainName());
-            cfnOutput(this, "ApexDistributionId", this.distribution.getDistributionId());
-            cfnOutput(this, "ApexAlias", this.apexAlias.getDomainName());
-        }
+            // Outputs
+            cfnOutput(this, "ApexDistributionDomainName", this.distribution.getDomainName());
+            cfnOutput(this, "ApexDistributionId", this.distribution.getDistributionId());
+
+            // Keep the short log retention aspect.  No alias record is created here;
+            // DNS records are managed via Route 53 weighted aliases in the CI workflow.
+            Aspects.of(this).add(new SetAutoDeleteJobLogRetentionAspect(props.deploymentName(), RetentionDays.THREE_DAYS));
+        }
*** End Patch
```

With this change the apex distribution continues to serve a static maintenance page but does not create an A/AAAA alias record.  The outputs `ApexDistributionDomainName` and `ApexDistributionId` are still emitted so that the GitHub workflow can look up the maintenance distribution domain.

### 2. Remove the old “set‑origins” logic

The existing workflow updates the apex distribution origins via the `set-origins` composite action.  This is no longer needed, and the whole job can be deleted or commented out.  In `.github/workflows/deploy.yml` remove the `set-origins` job and any dependencies on it:

```diff
*** Begin Patch
*** Update File: .github/workflows/deploy.yml
@@
-      set-origins:
-        name: 'set origins'
-        # TODO: revert to set origin only on success when stable
-        if: ${{ !cancelled() && (needs.names.outputs.environment-name != 'prod' || needs.origin-test.outputs.result == 'success') }}
-        needs:
-          - names
-          - skip-deploy-check
-          - deploy-auth
-          - deploy-hmrc
-          - deploy-account
-          - deploy-edge
-          - deploy-publish
-          - origin-test
-        runs-on: ubuntu-24.04
-        environment: ${{ needs.names.outputs.environment-name }}
-        permissions:
-          id-token: write
-          contents: read
-        env:
-          ENVIRONMENT_NAME: ${{ needs.names.outputs.environment-name }}
-        steps:
-          - name: Checkout
-            uses: actions/checkout@v5
-          - name: Use local set-origins composite action
-            uses: ./.github/actions/set-origins
-            with:
-              originsCsv:  "${{ needs.names.outputs.deployment-name == 'prod' &&  'submit.diyaccounting.co.uk' || format('{0}.submit.diyaccounting.co.uk', needs.names.outputs.deployment-name) }}"
*** End Patch
```

You can also delete the `.github/actions/set-origins` directory and the Node script `app/actions/set-apex-origins.mjs` since they are no longer used.

### 3. Add a new composite action to update Route 53 weighted alias records

Create a new composite action at `.github/actions/set-alias-records/` that updates the weighted A/AAAA records for either `submit.diyaccounting.co.uk` (in prod) or `ci.submit.diyaccounting.co.uk` (in CI).  It uses the AWS CLI to resolve the maintenance and environment distribution domain names from CloudFormation outputs and then calls `route53 change-resource-record-sets` to upsert weighted records.  For example, the `action.yml` might look like this:

```yaml
# .github/actions/set-alias-records/action.yml
name: "Set DNS alias records"
description: "Configure weighted Route 53 alias records for the apex and CI domains."
runs:
  using: "composite"
  steps:
    - name: Configure AWS credentials via GitHub OIDC
      uses: aws-actions/configure-aws-credentials@v5
      with:
        role-to-assume: ${{ env.ACTIONS_ROLE_ARN }}
        aws-region: ${{ env.AWS_REGION }}
    - name: Assume deployment role
      uses: aws-actions/configure-aws-credentials@v5
      with:
        role-to-assume: ${{ env.DEPLOY_ROLE_ARN }}
        aws-region: ${{ env.AWS_REGION }}
        role-chaining: true

    - name: Install jq
      run: sudo apt-get update && sudo apt-get install -y jq
      shell: bash

    - name: Update weighted alias records
      shell: bash
      run: |
        set -euo pipefail
        # Determine the record name.  Prod uses the naked domain, CI uses env subdomain.
        if [ "$ENVIRONMENT_NAME" = "prod" ]; then
          RECORD_NAME="$HOSTED_ZONE_NAME"
        else
          RECORD_NAME="$ENVIRONMENT_NAME.$HOSTED_ZONE_NAME"
        fi
        # Resolve CloudFront distribution domain names from the stacks
        EDGE_STACK_NAME="env-${ENVIRONMENT_NAME}-${DEPLOYMENT_NAME}-EdgeStack"
        PRIMARY_DOMAIN=$(aws cloudformation describe-stacks --stack-name "$EDGE_STACK_NAME" \
          --query "Stacks[0].Outputs[?OutputKey=='WebDistributionDomainName'].OutputValue" --output text)
        APEX_STACK_NAME="env-${ENVIRONMENT_NAME}-ApexStack"
        MAINT_DOMAIN=$(aws cloudformation describe-stacks --stack-name "$APEX_STACK_NAME" \
          --query "Stacks[0].Outputs[?OutputKey=='ApexDistributionDomainName'].OutputValue" --output text)

        # Build change batch for A and AAAA records with weights 100/0.  SetIdentifier equals deployment name.
        jq -n \
          --arg rn "$RECORD_NAME." \
          --arg pid "$DEPLOYMENT_NAME" \
          --arg primary "$PRIMARY_DOMAIN" \
          --arg maint "$MAINT_DOMAIN" \
          '{
            Changes: [
              {
                Action: "UPSERT",
                ResourceRecordSet: {
                  Name: $rn,
                  Type: "A",
                  SetIdentifier: $pid,
                  Weight: 100,
                  AliasTarget: {
                    HostedZoneId: "Z2FDTNDATAQYW2",
                    DNSName: $primary,
                    EvaluateTargetHealth: false
                  }
                }
              },
              {
                Action: "UPSERT",
                ResourceRecordSet: {
                  Name: $rn,
                  Type: "A",
                  SetIdentifier: "maintenance",
                  Weight: 0,
                  AliasTarget: {
                    HostedZoneId: "Z2FDTNDATAQYW2",
                    DNSName: $maint,
                    EvaluateTargetHealth: false
                  }
                }
              }
            ]
          }' > /tmp/a.json

        jq -n \
          --arg rn "$RECORD_NAME." \
          --arg pid "$DEPLOYMENT_NAME" \
          --arg primary "$PRIMARY_DOMAIN" \
          --arg maint "$MAINT_DOMAIN" \
          '{
            Changes: [
              {
                Action: "UPSERT",
                ResourceRecordSet: {
                  Name: $rn,
                  Type: "AAAA",
                  SetIdentifier: $pid,
                  Weight: 100,
                  AliasTarget: {
                    HostedZoneId: "Z2FDTNDATAQYW2",
                    DNSName: $primary,
                    EvaluateTargetHealth: false
                  }
                }
              },
              {
                Action: "UPSERT",
                ResourceRecordSet: {
                  Name: $rn,
                  Type: "AAAA",
                  SetIdentifier: "maintenance",
                  Weight: 0,
                  AliasTarget: {
                    HostedZoneId: "Z2FDTNDATAQYW2",
                    DNSName: $maint,
                    EvaluateTargetHealth: false
                  }
                }
              }
            ]
          }' > /tmp/aaaa.json

        aws route53 change-resource-record-sets --hosted-zone-id "$HOSTED_ZONE_ID" --change-batch file:///tmp/a.json
        aws route53 change-resource-record-sets --hosted-zone-id "$HOSTED_ZONE_ID" --change-batch file:///tmp/aaaa.json
```

This script uses your existing IAM roles (`ACTIONS_ROLE_ARN` and `DEPLOY_ROLE_ARN`) to retrieve the distribution domain names from CloudFormation (`WebDistributionDomainName` for the environment’s `EdgeStack` and `ApexDistributionDomainName` for the maintenance distribution) and then updates two weighted records for both A and AAAA.  The `DEPLOYMENT_NAME` (e.g. `prod-<commit>` or `ci-<branch>`) is used as the `SetIdentifier` so that multiple deployments can coexist and you can simply flip the weight from 0 to 100 to route traffic.  When you need to put the site into maintenance, switch the weights (maintenance=100, deployment=0).

### 4. Use the new action in `deploy.yml`

Add a new job that invokes the `set-alias-records` action.  It should run after your stacks are deployed and tested.  Here is an example (replacing the removed `set-origins` job):

```yaml
# inside .github/workflows/deploy.yml, after deploy-publish and origin-test
set-alias-records:
  name: 'set alias records'
  if: ${{ !cancelled() && (needs.names.outputs.environment-name != 'prod' || needs.origin-test.outputs.result == 'success') }}
  needs:
    - names
    - skip-deploy-check
    - deploy-auth
    - deploy-hmrc
    - deploy-account
    - deploy-edge
    - deploy-publish
    - origin-test
  runs-on: ubuntu-24.04
  environment: ${{ needs.names.outputs.environment-name }}
  permissions:
    id-token: write
    contents: read
  env:
    HOSTED_ZONE_NAME: diyaccounting.co.uk              # update to your zone
    HOSTED_ZONE_ID: ZABCDEFGHIJKL                      # update to your zone ID
    ENVIRONMENT_NAME: ${{ needs.names.outputs.environment-name }}
    DEPLOYMENT_NAME: ${{ needs.names.outputs.deployment-name }}
    AWS_REGION: ${{ env.AWS_REGION }}
  steps:
    - name: Checkout
      uses: actions/checkout@v5
    - name: Use local set-alias-records composite action
      uses: ./.github/actions/set-alias-records
```

This job calls the new action to update weighted DNS records.  In prod, it writes to the root record (`submit.diyaccounting.co.uk`); in CI it writes to `ci.submit.diyaccounting.co.uk`.  Deployments automatically get weights of 100%, and the maintenance distribution gets weight 0.  To switch traffic away from a deployment (for example during a rollback or while migrating to a new commit), you simply run the action again with the appropriate `DEPLOYMENT_NAME` and set the weight to zero; the script above always sets the latest deployment to `100` and maintenance to `0`.  If you need more than one deployment live at the same time (e.g. canary), you can adjust the script to split the weight between multiple `SetIdentifier` values.

### 5. Certificates

Your existing ACM certificate (passed via `certificateArn`) must cover the root domain and wildcard subdomains.  In other words, it should include both `submit.diyaccounting.co.uk` and `*.submit.diyaccounting.co.uk` in its Subject Alternative Names.  `EdgeStack` uses this certificate for every environment distribution and `ApexStack` uses it for the maintenance distribution.  As long as the certificate includes the apex and the wildcard, there is nothing else you need to change.  If it currently omits the apex name, re‑issue or extend it to include the naked domain.

### Summary

By removing the CloudFront‑to‑CloudFront chaining in the apex stack and controlling traffic via Route 53 weighted alias records, you achieve a cleaner setup with simpler switching.  Deployments (`ci-branch.submit...` or `prod-<commit>.submit...`) remain fully independent distributions with their own WAFs, and the apex domain just points to whichever distribution should currently serve traffic.  You can add new branches at any time—just deploy their `EdgeStack` and run the `set-alias-records` action to give them a `100%` weight when desired.  When no deployment is active, set the environment weight to `0` so the maintenance distribution will take over.
