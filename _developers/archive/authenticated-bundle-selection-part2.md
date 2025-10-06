Below is a structured plan for adding a fully working “bundle” system (allowing users to request features like HMRC test API access) to your repository.  The plan starts with a high‑level summary and then details each change, including the files to modify, the code to add and the tests to write or update.  A final section explains how to run the full test suite and iterate until everything passes.

---

## Summary of Steps

1. **Add Cognito custom attribute:** Modify the CDK stack to create a `custom:bundles` attribute on the user pool, and pass the user pool ID into the bundle Lambda via environment variables.
2. **Fix bundle Lambda handler:** Point the `bundle.Dockerfile` handler to the correct file and export name (`app/functions/bundle.js: httpPostMock`).
3. **Expose `/api/request-bundle` endpoint:**

    * Add a new route in `app/bin/server.js` to proxy POST requests to the bundle Lambda.
    * Update `cdk.json` and the Java stack to define and deploy a new Lambda (`BundleLambda`), its function URL and environment variables.
4. **Add environment variables:** Define `COGNITO_USER_POOL_ID`, `TEST_BUNDLE_EXPIRY_DATE` and `TEST_BUNDLE_USER_LIMIT` in `.env.dev`, `.env.test` and GitHub secrets.
5. **Update the front‑end:** Ensure `bundles.html` uses the correct token (`idToken` or `accessToken`) for the Authorization header and update the button states consistently.
6. **Write/adjust tests:**

    * Unit test the new `bundle.js` Lambda to verify grant logic (expiry date check, user limit check, duplicate detection).
    * Integration test the `/api/request-bundle` route in the express server.
    * End‑to‑end test for the front‑end that clicks the “Add HMRC Test API Bundle” button and checks for success messages.
7. **Test‑fix‑test loop:** Run all test suites (`npm run test-client`, `npm run test-app`, `npm run test-behaviour`, `npm run test-infra`) and iterate on code changes until the tests pass.

---

## Detailed Instructions

### 1. Add a Cognito `custom:bundles` attribute

1. In `infra/main/java/co/uk/diyaccounting/submit/constructs/WebStack.java`, locate where the Cognito user pool is defined.
2. Add a new custom attribute named `custom:bundles` of type string with a reasonable maximum length (2048 characters) to the user pool definition (the backlog doc specifies this).
3. After creating the user pool, export its ID as an output (e.g., `CfnOutput` with key `UserPoolId`) so it can be passed to the bundle Lambda.
4. Update the environment variables section of the bundle Lambda definition to include `COGNITO_USER_POOL_ID` and set its value to the exported user pool ID.

### 2. Fix the bundle Lambda handler

The existing `infra/runtimes/bundle.Dockerfile` references `app/functions/bundle/bundle.httpPostMock`, but the actual file is `app/functions/bundle.js` and exports `httpPostMock`.  Update the Dockerfile as follows:

```dockerfile
# infra/runtimes/bundle.Dockerfile
# …
CMD ["app/functions/bundle.httpPostMock"]
```

Also, ensure that `app/functions/bundle.js` resides in `app/functions` (as it currently does) and that it exports `httpPostMock` and `httpOptions` as named exports.

### 3. Expose `/api/request-bundle` endpoint

1. **Server route:**

    * Open `app/bin/server.js` and import the bundle handler:

      ```js
      import { httpPostMock as requestBundleHttpPost } from "../functions/bundle.js";
      ```
    * Add a new constant for the path, e.g.:

      ```js
      const requestBundlePath = context.requestBundleLambdaUrlPath || "/api/request-bundle";
      ```
    * Add a route before the catch‑all handler:

      ```js
      app.post(requestBundlePath, async (req, res) => {
        const event = {
          path: req.path,
          headers: { host: req.get("host") || "localhost:3000", authorization: req.headers.authorization },
          queryStringParameters: req.query || {},
          body: JSON.stringify(req.body),
        };
        const { statusCode, body } = await requestBundleHttpPost(event);
        res.status(statusCode).json(JSON.parse(body));
      });
      app.options(requestBundlePath, async (req, res) => {
        const { statusCode, body } = await requestBundleHttpPost({ httpMethod: "OPTIONS" });
        res.status(statusCode).json(body ? JSON.parse(body) : {});
      });
      ```

2. **CDK/Java:**

    * Add configuration keys to `cdk.json` and the `SubmitApplication` builder, similar to other Lambdas:

      ```json
      "requestBundleLambdaHandlerFunctionName": "bundle.httpPostMock",
      "requestBundleLambdaUrlPath": "/api/request-bundle",
      "requestBundleLambdaDuration": "30000"
      ```
    * In `WebStack.java`, create a new `Function` for the bundle Lambda (e.g., `requestBundleLambda`) using the same runtime and layers as other JS Lambdas.  Use the Docker image built from `bundle.Dockerfile`.
    * Create a `FunctionUrl` for this Lambda with the appropriate auth type (likely `AWS_IAM` if you want Cognito tokens verified upstream; for local development you might use `NONE`).
    * Add environment variables: `TEST_BUNDLE_EXPIRY_DATE`, `TEST_BUNDLE_USER_LIMIT`, `COGNITO_USER_POOL_ID`, and `AWS_REGION`.
    * Export the function ARN and URL in `SubmitApplication.java` (similar to other outputs) for downstream reference.

### 4. Add environment variables

* Open `.env.dev`, `.env.test`, `.env.prod` and add default values:

  ```env
  COGNITO_USER_POOL_ID=<populate in CDK outputs or tests>
  TEST_BUNDLE_EXPIRY_DATE=2025-12-31
  TEST_BUNDLE_USER_LIMIT=1000
  ```
* For CI, add these variables to the repository secrets or `set-repository-variables.yml`.
* Ensure that tests (`.env.test`) set a fake user pool ID or use stubbing so that Cognito API calls don’t fail.

### 5. Update the front‑end

1. Review `web/public/bundles.html`.
2. The `requestBundle()` function currently uses `idToken` for the `Authorization` header.  Decide whether to use the ID token or access token.  Since the Lambda does not verify signatures, either works; for consistency with AWS best practices, use the ID token.  Ensure the token retrieval logic looks in both `localStorage` and `sessionStorage`, and handle missing tokens gracefully.
3. After a successful bundle grant, update the button label and disable further clicks; this is partly implemented but ensure each bundle button uses its own `bundleId` variable rather than resetting to a hard‑coded value on error (`"Add HMRC Test API Bundle"`).

### 6. Write or update tests

1. **Unit tests for bundle logic (Vitest):**

    * Create `app/unit-tests/bundle.test.js` that mocks the AWS SDK (`@aws-sdk/client-cognito-identity-provider`) and verifies:

        * Requests without an `Authorization` header return 401.
        * Expired bundles (using a small expiry date in environment) return a 403.
        * Duplicate bundle requests return `status: "already_granted"`.
        * A successful request adds the bundle and returns `status: "granted"` with the correct expiry.
        * The user limit is enforced by mocking `getCurrentUserCountForBundle`.
    * Use dependency injection or mocking libraries to replace `cognitoClient.send` calls with stubs.

2. **Integration test for server route:**

    * In `test-app` or `app/unit-tests`, write a test that starts the express server (similar to existing server tests), sends a `POST /api/request-bundle` with a stubbed Authorization header, and asserts that the response matches expected JSON and status codes.
    * Mock the imported bundle handler so that the test does not hit AWS.

3. **Front‑end test:**

    * In `web/unit-tests`, add a test that loads `bundles.html` using happy-dom, simulates a logged‑in user by setting tokens in `localStorage`, clicks the “Add HMRC Test API Bundle” button, mocks the fetch call to return `{ status: "granted", expiryDate: "2025-12-31" }`, and asserts that the button text changes and the alert displays.
    * Also test the scenario where the user is not authenticated and the page redirects to `login.html`.

4. **Infra test updates:**

    * Extend the `test-infra` suite to verify that the CDK synthesises a `RequestBundleLambda`, that its URL path matches `/api/request-bundle`, and that it has the correct environment variables.

### 7. Run tests and iterate

After making the above changes:

1. Install dependencies if necessary (`npm install` and `mvn -q package`).
2. Run all test suites:

```bash
npm run test-client     # front-end and unit tests
npm run test-app        # server and Lambda tests
npm run test-behaviour  # Playwright end-to-end tests (optional until UI is finalised)
npm run test-infra      # CDK/Java integration tests
```

3. Fix any failing tests.  Common causes include incorrect environment variables, mismatched path names or handler references, and missing mocks.
4. Repeat the test‑fix‑test cycle until **all** tests pass and the bundle feature works end‑to‑end.  Don’t forget to run `npx cdk synth` to ensure the infrastructure changes compile.

---

By following these detailed steps, your AI agent can bridge the gap between the current partial bundle implementation and a fully working feature integrated into the existing serverless architecture.
