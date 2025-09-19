Here is a detailed plan to extend the **cdk-refactor** branch so that Cognito’s advanced‑security logging is enabled and every available Cognito trigger logs to CloudWatch in a similar way to your existing S3 log‑forwarding lambdas.

---

## 1. Understand the current state

* **CognitoAuth.java** – currently creates a `UserPool`, optional Google IdP and `UserPoolClient`. It does **not** set an advanced security mode or feature plan, nor does it configure log delivery or Lambda triggers.
* **WebApp.java** – passes many environment variables to `WebStack` (e.g., `CLOUD_TRAIL_ENABLED`, `X_RAY_ENABLED`, `ACCESS_LOG_GROUP_RETENTION_PERIOD_DAYS`, Google client settings, etc.).  These values are used to toggle CloudTrail, X‑Ray and log retention in `WebStack`.
* **WebStack.java** – when `cloudTrailEnabled` is true it creates a CloudTrail trail for S3 events and sends logs to CloudWatch; when `xRayEnabled` is true it sets `Tracing.ACTIVE` on each Lambda via the `LambdaUrlOrigin` builder.  The pattern is applied consistently to API Lambdas via `LambdaUrlOrigin` but no Cognito triggers exist.
* **LogS3ObjectEvent.java** – demonstrates a simple Lambda that reads an S3 object and logs each line to CloudWatch via `context.getLogger().log`.  This is the pattern to emulate for Cognito triggers.

From the repository README we know there is optional CloudTrail and X‑Ray support, and that the CDK can deploy CloudFront, S3, Lambda, Cognito and Google IdP.

---

## 2. Enable advanced security and log delivery on Cognito

AWS’s advanced security features produce risk scores and log sign‑in/sign‑up events; these logs can be exported to CloudWatch Logs, Firehose or S3.  Without the Plus plan, only API calls show up in CloudTrail.  To stream these logs into CloudWatch:

1. **Upgrade the user pool to the Plus plan** – Use the new `featurePlan` property (CDK ≥2.173) on the `UserPool` construct.  Alternatively, if using an older CDK, set `advancedSecurityMode` to `AdvancedSecurityMode.ENFORCED` or `AUDIT`.

2. **Create CloudWatch log groups** – Derive names from the stack/domain (e.g. `/aws/cognito/<dashedDomainName>/userAuthEvents` and `/aws/cognito/<dashedDomainName>/userNotification`).  Set their retention to the same value as `ACCESS_LOG_GROUP_RETENTION_PERIOD_DAYS` so log lifetimes are consistent.  Mark them with `RemovalPolicy.DESTROY`.

3. **Add a low‑level log delivery configuration** – Use `CfnUserPoolLogDeliveryConfiguration` to attach log streams:

   ```java
   List<CfnUserPoolLogDeliveryConfiguration.LogConfigurationProperty> logConfigs = List.of(
       CfnUserPoolLogDeliveryConfiguration.LogConfigurationProperty.builder()
           .eventSource("userAuthEvents")    // sign‑in/sign‑up events
           .logLevel("INFO")
           .cloudWatchLogsConfiguration(
               CfnUserPoolLogDeliveryConfiguration.CloudWatchLogsConfigurationProperty.builder()
                   .logGroupArn(authLogGroup.getLogGroupArn())
                   .build())
           .build(),
       CfnUserPoolLogDeliveryConfiguration.LogConfigurationProperty.builder()
           .eventSource("userNotification")   // email/SMS delivery failures
           .logLevel("ERROR")
           .cloudWatchLogsConfiguration(
               CfnUserPoolLogDeliveryConfiguration.CloudWatchLogsConfigurationProperty.builder()
                   .logGroupArn(notificationLogGroup.getLogGroupArn())
                   .build())
           .build()
   );
   CfnUserPoolLogDeliveryConfiguration delivery =
       CfnUserPoolLogDeliveryConfiguration.Builder.create(scope, "UserPoolLogDelivery")
           .userPoolId(userPool.getUserPoolId())
           .logConfigurations(logConfigs)
           .build();
   delivery.addDependency(userPool);
   ```

4. **Modify `CognitoAuth.Builder`** – Add new builder fields to accept the feature plan, retention days and whether to enable log delivery.  Use the retention days passed down from `WebApp` (re‑use `ACCESS_LOG_GROUP_RETENTION_PERIOD_DAYS` to avoid introducing another env var).  Set `.featurePlan(...)` or `.advancedSecurityMode(...)` on the `UserPool` builder accordingly.  Create the log groups and the `CfnUserPoolLogDeliveryConfiguration` inside the `CognitoAuth` constructor.

5. **Propagate settings from `WebApp`** – In `WebApp.java` add environment variables such as `DIY_SUBMIT_COGNITO_FEATURE_PLAN` and optional `DIY_SUBMIT_ENABLE_LOG_DELIVERY`.  Pass these to `WebStack.Builder` via new builder methods like `.cognitoFeaturePlan(...)` and `.cognitoEnableLogDelivery(...)`.

6. **Update `WebStack`** – Accept the new builder fields and forward them to `CognitoAuth.Builder`.  Use the existing `accessLogGroupRetentionPeriodDays` for the Cognito log groups.  Make the retention period conversion using `RetentionDaysConverter` as is done for other logs.

---

## 3. Add logging for every Cognito trigger

Cognito triggers fire at various stages (pre‑sign‑up, post‑confirmation, pre‑authentication, post‑authentication, pre‑token‑generation, custom message, user migration, etc.).  To log these events to CloudWatch:

1. **Create new Lambda classes** – For each trigger type you care about, add a class in `infra/main/java/co/uk/diyaccounting/submit/functions` similar to `LogS3ObjectEvent.java`.  Each class implements `RequestHandler<TriggerEventType, Object>` and simply prints out the incoming event to stdout, which CloudWatch will capture.  For example, a pre‑authentication logger:

   ```java
   package co.uk.diyaccounting.submit.functions;

   import com.amazonaws.services.lambda.runtime.Context;
   import com.amazonaws.services.lambda.runtime.RequestHandler;
   import com.amazonaws.services.lambda.runtime.events.CognitoUserPoolPreAuthenticationEvent;

   public class LogPreAuthentication implements
         RequestHandler<CognitoUserPoolPreAuthenticationEvent, CognitoUserPoolPreAuthenticationEvent> {
       @Override
       public CognitoUserPoolPreAuthenticationEvent handleRequest(
             CognitoUserPoolPreAuthenticationEvent event, Context context) {
           context.getLogger().log("Pre‑auth event: " + event.toString());
           return event; // return unchanged to allow authentication
       }
   }
   ```

   Implement analogous classes for `PreSignUp`, `PostConfirmation`, `PostAuthentication`, `PreTokenGeneration`, and any other triggers you want to audit.

2. **Package these lambdas** – Ensure your build (Gradle/Maven) includes these classes in the JAR used for lambda functions.  You can reuse the same base Docker image and `LAMBDA_ENTRY` mechanism from the existing `LambdaUrlOrigin` builder or define them as plain Java Lambdas (`Runtime.JAVA_21` or similar) if you prefer.

3. **Create the trigger functions in CDK** – In `WebStack`, after constructing the `CognitoAuth`:

   ```java
   Function preAuthLambda = Function.Builder.create(this, "LogPreAuthLambda")
       .runtime(Runtime.JAVA_17)
       .handler("co.uk.diyaccounting.submit.functions.LogPreAuthentication")
       .code(Code.fromAsset("path/to/your/compiled/jar"))   // same as other functions
       .logGroup(LogGroup.Builder.create(this, "LogPreAuthGroup")
           .logGroupName("/aws/lambda/" + functionName)
           .retention(accessLogRetention)
           .removalPolicy(RemovalPolicy.DESTROY)
           .build())
       .tracing(xRayEnabled ? Tracing.ACTIVE : Tracing.DISABLED)
       .build();
   ```

   Repeat for each trigger.  Use `accessLogRetention` for the log group retention and set `.tracing(Tracing.ACTIVE)` when `xRayEnabled` is true so that X‑Ray traces are captured consistently.

4. **Attach the triggers to the user pool** – Use the `UserPool` API to add triggers:

   ```java
   userPool.addTrigger(UserPoolOperation.PRE_AUTHENTICATION, preAuthLambda);
   userPool.addTrigger(UserPoolOperation.POST_AUTHENTICATION, postAuthLambda);
   userPool.addTrigger(UserPoolOperation.PRE_SIGN_UP, preSignUpLambda);
   userPool.addTrigger(UserPoolOperation.POST_CONFIRMATION, postConfirmationLambda);
   userPool.addTrigger(UserPoolOperation.PRE_TOKEN_GENERATION, preTokenGenLambda);
   ```

   Do this in `CognitoAuth` or in `WebStack` after the `userPool` is created.  Be sure to respect dependency ordering so the lambdas are created before the user pool triggers are bound.

5. **Propagate CloudTrail/X‑Ray flags** – The lambdas must honour the existing `cloudTrailEnabled` and `xRayEnabled` flags.  For X‑Ray, we already apply `.tracing(Tracing.ACTIVE)` when `xRayEnabled` is true.  CloudTrail doesn’t directly apply to Lambda triggers, but ensure all buckets and distributions still have CloudTrail configured when `cloudTrailEnabled` is true.

---

## 4. Review CloudTrail and X‑Ray coverage

* **CloudTrail** – Currently, the trail captures S3 events from your origin bucket and sends them to a log group.  Verify that `cloudTrailEnabled` is passed to every `LambdaUrlOrigin` builder call (it is in WebStack) so that Lambda URL invocations are recorded.  If you want to capture user‑pool API calls as well, create a separate trail with a broader `S3EventSelector` or enable “management events” (not currently done).

* **X‑Ray** – The `LambdaUrlOrigin` builder sets `Tracing.ACTIVE` when `xRayEnabled` is true.  Ensure the same is applied to the new Cognito trigger lambdas.  Also confirm that any Docker‑based lambdas include the environment variable `AWS_XRAY_TRACING_NAME` when tracing is enabled (the builder does this automatically).

* **Missing resources** – Check whether other resources (e.g., the `BundleLambda`, `exchangeToken` lambdas) are created outside of `LambdaUrlOrigin`.  Apply the same `xRayEnabled` flag to their builders and add CloudTrail log groups if not already done.

---

## 5. Testing strategy

1. **Local compilation** – Build the Java project (e.g., `mvn package -Pinfra`) to include the new trigger classes.

2. **Deploy to a dev environment** – Set environment variables in `.env.dev` or `.env.ci`:

   ```env
   DIY_SUBMIT_COGNITO_FEATURE_PLAN=PLUS
   DIY_SUBMIT_ENABLE_LOG_DELIVERY=true
   ACCESS_LOG_GROUP_RETENTION_PERIOD_DAYS=30
   CLOUD_TRAIL_ENABLED=true
   X_RAY_ENABLED=true
   ```

   Run `npx cdk deploy WebStack-dev --require-approval never --verbose`.

3. **Verify resources**:

    * In CloudWatch Logs, confirm that log groups `/aws/cognito/<stack>/userAuthEvents` and `/aws/cognito/<stack>/userNotification` exist and have the correct retention.
    * Confirm the new lambdas (e.g., `LogPreAuthLambda`) exist and have X‑Ray tracing enabled.
    * Inspect the Cognito user pool in the AWS console: advanced security should show as enabled; log delivery configuration should list “userAuthEvents → CloudWatch Logs” and “userNotification → CloudWatch Logs.”

4. **Functional tests**:

    * Sign up and sign in using the Cognito hosted UI (via Google and via email).  Each trigger should invoke its corresponding logging Lambda.  Check the Lambda logs for entries like “Pre‑auth event…” and confirm the `userAuthEvents` log group also receives sign‑in success/failure entries.
    * Trigger a message‑delivery error (e.g., use an invalid email address and attempt password reset) and verify that an error entry appears in the `userNotification` log group.
    * Use AWS X‑Ray console to verify traces for the new triggers and existing lambdas.

5. **Performance and cleanup**:

    * Ensure the new log groups respect the retention period.
    * Validate that destroying the stack cleans up log groups, log delivery configuration and the user pool.

---

By following this plan you’ll have comprehensive logging: Cognito’s built‑in advanced security logs will stream to CloudWatch at the **INFO** and **ERROR** levels, while your custom triggers will capture every critical user‑pool event.  CloudTrail and X‑Ray instrumentation will remain consistent across all Lambda functions, allowing you to trace and audit the entire user journey.
