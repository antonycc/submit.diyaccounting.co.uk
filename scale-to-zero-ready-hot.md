To fully support provisioned concurrency on the **async‑polling‑hmrc** branch, you’ll need to **publish a version and alias for every Lambda** and then target those aliases in your scaling workflow.  Below is a detailed plan your agentic AI can follow at Phase 6 (with all async GET lambdas added).  The plan aligns `lambda-concurrency-config.yaml` with the actual function names and adopts the “zero/ready/hot” nomenclature.

---

## 1 Publish versions and create aliases in CDK (Option A)

1. **Modify the base Lambda constructs.**

   In both `Lambda.java` (for single‑stage functions) and `AsyncApiLambda.java` (for async handlers/consumers), after creating the `DockerImageFunction`, **publish a version** and **create aliases** for each concurrency level you want to control.  For example:

   ```java
   import software.amazon.awscdk.services.lambda.Version;
   import software.amazon.awscdk.services.lambda.Alias;

   // After building the function
   Version version = this.lambda.getCurrentVersion(); // publishes a version

   // Create aliases; names must be unique
   Alias readyAlias = Alias.Builder.create(scope, props.idPrefix() + "-ready-alias")
       .aliasName("ready")
       .version(version)
       .provisionedConcurrentExecutions(props.defaultReadyConcurrency())
       .build();

   Alias hotAlias = Alias.Builder.create(scope, props.idPrefix() + "-hot-alias")
       .aliasName("hot")
       .version(version)
       .provisionedConcurrentExecutions(props.defaultHotConcurrency())
       .build();

   // Optionally a zero alias with zero concurrency (or omit)
   Alias zeroAlias = Alias.Builder.create(scope, props.idPrefix() + "-zero-alias")
       .aliasName("zero")
       .version(version)
       .provisionedConcurrentExecutions(0)
       .build();
   ```

    * `props.defaultReadyConcurrency()` and `props.defaultHotConcurrency()` are optional helpers you can add to set sensible defaults.
    * For **AsyncApiLambda**, repeat the alias creation for the consumer function if you plan to provision concurrency on consumers as well.
    * Ensure the alias names (`ready`, `hot`, `zero`) match the target levels in your scaling config.

2. **Export alias ARNs or names.**

   Add environment variables for each alias if needed (e.g., `FUNCTION_READY_ALIAS`, `FUNCTION_HOT_ALIAS`).  This is not strictly necessary for concurrency but can help in other parts of the pipeline.

3. **Rebuild and deploy** via your existing CDK pipeline so the functions now have aliases and published versions.  After deployment, each Lambda will have `$LATEST`, version `1`, and aliases `zero`, `ready`, `hot` pointing to that version.

---

## 2 Update `lambda-concurrency-config.yaml`

Phase 6 introduces async GET handlers and consumers for VAT obligations and returns.  Ensure the names match the actual functions when deployed.  In `lambda-concurrency-config.yaml` on `async-polling-hmrc`:

* Use **handler names** and **consumer names** that correspond to the new async GET endpoints:

  ```yaml
  lambdas:
    - name: submit-app-hmrc-vat-return-get
      handler: app/functions/hmrc/hmrcVatReturnGet.handler
      concurrency:
        zero: 0
        ready: 1
        hot: 1

    - name: submit-app-hmrc-vat-return-get-consumer
      handler: app/functions/hmrc/hmrcVatReturnGet.consumer
      concurrency:
        zero: 0
        ready: 0
        hot: 1

    - name: submit-app-hmrc-vat-obligation-get
      handler: app/functions/hmrc/hmrcVatObligationGet.handler
      concurrency:
        zero: 0
        ready: 1
        hot: 1

    - name: submit-app-hmrc-vat-obligation-get-consumer
      handler: app/functions/hmrc/hmrcVatObligationGet.consumer
      concurrency:
        zero: 0
        ready: 0
        hot: 1
  ```

  Align the `name` prefix (`submit-app-…`) with your CDK deployment naming scheme (`{deployment-name}-{name}`).  Confirm that consumer functions are actually deployed; remove or adjust entries for any non-existent functions.

* **Remove any “peak” field**.  Your scaling action now recognizes `zero`, `ready`, and `hot` only.

* Retain the concurrency values (0/1/2/4 etc.) as originally intended; the alias defaults in CDK are only fallback values.

---

## 3 Modify the scaling script and workflow

Your scaling workflow currently uses `$LATEST`.  Replace that with the **alias names** you created (`ready` or `hot`):

1. In `.github/actions/scale-lambda-concurrency/action.yml`, update the AWS CLI commands:

   ```bash
   # For non-zero concurrency
   aws lambda put-provisioned-concurrency-config \
     --function-name "${FUNCTION_NAME}" \
     --qualifier "${CONCURRENCY_LEVEL}" \
     --provisioned-concurrent-executions "${TARGET_CONCURRENCY}" \
     --region "${AWS_REGION}"
   ```

   and for deletion:

   ```bash
   aws lambda delete-provisioned-concurrency-config \
     --function-name "${FUNCTION_NAME}" \
     --qualifier "${CONCURRENCY_LEVEL}" \
     --region "${AWS_REGION}"
   ```

   Here `CONCURRENCY_LEVEL` will be either `zero`, `ready`, or `hot`.  Because you created aliases with those names, the qualifier will resolve correctly.

2. Adjust the polling step to query the alias instead of `$LATEST`:

   ```bash
   STATUS=$(aws lambda get-provisioned-concurrency-config \
     --function-name "${FUNCTION_NAME}" \
     --qualifier "${CONCURRENCY_LEVEL}" \
     --region "${AWS_REGION}" \
     --query 'Status' \
     --output text 2>/dev/null || echo "NOT_CONFIGURED")
   ```

3. Commit these changes to the repository.  When you run the workflow with `concurrency-level: ready` (or `hot`/`zero`), it will now set or delete concurrency on the alias.

---

## 4 Test with Phase 6 Lambdas

Once you deploy Phase 6 (asynchronous HMRC GET lambdas and consumers) and rebuild the project:

1. **Verify the functions and aliases exist** in AWS Lambda:

    * The functions should now have versions (e.g. `1`) and aliases (`zero`, `ready`, `hot`) pointing to that version.
2. **Run `scale-to`** for `ci-asyncpoll` and `prod-asyncpoll` with concurrency levels zero, ready, and hot.  The action should now succeed without `InvalidParameterValueException`.
3. **Check CloudWatch** for concurrency status; the “Polling provisioned concurrency status” step in the workflow should report “READY” within a few minutes.

---

## 5 Update documentation and nomenclature

* Replace any remaining references to “peak” with **“hot”** in docs and comments.
* Document that aliases (`zero`, `ready`, `hot`) control provisioned concurrency and are created automatically by the CDK.
* Note that new async GET endpoints require concurrency entries in `lambda-concurrency-config.yaml` and will be created as Phase 6 completes.

---

By publishing a version and using aliases (`zero`, `ready`, `hot`) in your CDK code, then targeting those aliases in the scaling script, you satisfy AWS’s requirement and allow your `scale-to.yml` workflow to update provisioned concurrency successfully.  The updated `lambda-concurrency-config.yaml` entries ensure that the naming scheme matches your deployed handler and consumer functions, and moving all nomenclature to zero/ready/hot keeps the configuration consistent.
