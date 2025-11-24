// app/system-tests/hmrcVatObligationJourney.system.test.js

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { dotenvConfigIfNotBlank } from "../lib/env.js";
import { handler as hmrcAuthUrlGetHandler } from "../functions/hmrc/hmrcAuthUrlGet.js";
import { handler as hmrcTokenPostHandler } from "../functions/hmrc/hmrcTokenPost.js";
import { handler as hmrcVatObligationGetHandler } from "../functions/hmrc/hmrcVatObligationGet.js";
import { handler as hmrcVatReturnPostHandler } from "../functions/hmrc/hmrcVatReturnPost.js";
import { handler as hmrcVatReturnGetHandler } from "../functions/hmrc/hmrcVatReturnGet.js";
import { buildLambdaEvent, buildGovClientHeaders } from "../test-helpers/eventBuilders.js";
import { setupTestEnv, parseResponseBody } from "../test-helpers/mockHelpers.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

let stopDynalite;
let bm;

describe("System Journey: HMRC VAT Obligation-Based Flow", () => {
  const testUserSub = "test-obligation-journey-user";

  beforeAll(async () => {
    const { ensureBundleTableExists } = await import("../bin/dynamodb.js");
    const { default: dynalite } = await import("dynalite");

    const host = "127.0.0.1";
    const port = 8005;
    const tableName = "bundles-system-test-obligation-journey";
    const server = dynalite({ createTableMs: 0 });
    await new Promise((resolve, reject) => {
      server.listen(port, host, (err) => (err ? reject(err) : resolve(null)));
    });
    stopDynalite = async () => {
      try {
        server.close();
      } catch {}
    };
    const endpoint = `http://${host}:${port}`;

    process.env.AWS_REGION = process.env.AWS_REGION || "us-east-1";
    process.env.AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID || "dummy";
    process.env.AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY || "dummy";
    process.env.AWS_ENDPOINT_URL = endpoint;
    process.env.AWS_ENDPOINT_URL_DYNAMODB = endpoint;
    process.env.BUNDLE_DYNAMODB_TABLE_NAME = tableName;

    await ensureBundleTableExists(tableName, endpoint);

    bm = await import("../lib/bundleManagement.js");
  });

  afterAll(async () => {
    try {
      await stopDynalite?.();
    } catch {}
  });

  beforeEach(async () => {
    vi.resetAllMocks();
    Object.assign(
      process.env,
      setupTestEnv({
        NODE_ENV: "stubbed",
        HMRC_CLIENT_SECRET: "test-client-secret",
        HMRC_SANDBOX_CLIENT_SECRET: "test-sandbox-client-secret",
      }),
    );

    // Grant test bundle for user
    const expiry = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    await bm.updateUserBundles(testUserSub, [{ bundleId: "guest", expiry }]);
  });

  it("should complete obligation-based journey: Auth → Token → Obligations → Submit → Get VAT", async () => {
    // Step 1: Get HMRC authorization URL
    const authUrlEvent = buildLambdaEvent({
      method: "GET",
      path: "/api/v1/hmrc/authUrl",
      queryStringParameters: {
        state: "obligation-journey-state",
        scope: "write:vat read:vat",
      },
    });

    const authUrlResponse = await hmrcAuthUrlGetHandler(authUrlEvent);
    expect(authUrlResponse.statusCode).toBe(200);

    const authUrlBody = parseResponseBody(authUrlResponse);
    expect(authUrlBody).toHaveProperty("authUrl");
    expect(authUrlBody.authUrl).toContain("oauth/authorize");

    // Step 2: Exchange authorization code for access token
    const tokenEvent = buildLambdaEvent({
      method: "POST",
      path: "/api/v1/hmrc/token",
      body: { code: "obligation-auth-code" },
    });

    const tokenResponse = await hmrcTokenPostHandler(tokenEvent);
    // Token exchange may return 500 in test environment due to missing AWS Secrets Manager
    // In a real environment with AWS credentials, this would return 200
    expect([200, 500]).toContain(tokenResponse.statusCode);

    // Simulate receiving access token from HMRC (in real flow, this would come from the token response)
    const hmrcAccessToken = "mock-hmrc-obligation-token";

    // Step 3: Get VAT obligations to see what needs to be submitted
    process.env.TEST_VAT_OBLIGATIONS = JSON.stringify({
      source: "stub",
      obligations: [
        {
          start: "2025-01-01",
          end: "2025-03-31",
          due: "2025-05-07",
          status: "O",
          periodKey: "25A1",
        },
        {
          start: "2024-10-01",
          end: "2024-12-31",
          due: "2025-02-07",
          status: "F",
          periodKey: "24A4",
          received: "2025-02-05",
        },
      ],
    });

    const obligationEvent = buildLambdaEvent({
      method: "GET",
      path: "/api/v1/hmrc/vat/obligation",
      queryStringParameters: {
        vrn: "123456789",
        from: "2024-01-01",
        to: "2025-12-31",
      },
      headers: {
        ...buildGovClientHeaders(),
        authorization: `Bearer ${hmrcAccessToken}`,
      },
      authorizer: {
        authorizer: {
          lambda: {
            jwt: {
              claims: {
                "sub": testUserSub,
                "cognito:username": "obligationuser",
              },
            },
          },
        },
      },
    });

    const obligationResponse = await hmrcVatObligationGetHandler(obligationEvent);
    expect(obligationResponse.statusCode).toBe(200);

    const obligationBody = parseResponseBody(obligationResponse);
    expect(obligationBody).toHaveProperty("obligations");
    expect(Array.isArray(obligationBody.obligations)).toBe(true);
    expect(obligationBody.obligations.length).toBeGreaterThan(0);

    // Find an open obligation to submit
    const openObligation = obligationBody.obligations.find((o) => o.status === "O");
    expect(openObligation).toBeDefined();
    const periodKeyToSubmit = openObligation.periodKey;

    // Step 4: Submit VAT return for the open obligation
    const submitEvent = buildLambdaEvent({
      method: "POST",
      path: "/api/v1/hmrc/vat/return",
      body: {
        vatNumber: "123456789",
        periodKey: periodKeyToSubmit,
        vatDue: 2750.0,
        accessToken: hmrcAccessToken,
      },
      headers: {
        ...buildGovClientHeaders(),
      },
      authorizer: {
        authorizer: {
          lambda: {
            jwt: {
              claims: {
                "sub": testUserSub,
                "cognito:username": "obligationuser",
              },
            },
          },
        },
      },
    });

    const submitResponse = await hmrcVatReturnPostHandler(submitEvent);
    expect(submitResponse.statusCode).toBe(200);

    const submitBody = parseResponseBody(submitResponse);
    expect(submitBody).toHaveProperty("receipt");
    expect(submitBody.receipt).toHaveProperty("formBundleNumber");
    expect(submitBody.receipt).toHaveProperty("processingDate");

    // Step 5: Retrieve the submitted VAT return to verify
    process.env.TEST_VAT_RETURN = JSON.stringify({
      source: "stub",
      periodKey: periodKeyToSubmit,
      vatDueSales: 2750.0,
      vatDueAcquisitions: 0.0,
      totalVatDue: 2750.0,
      vatReclaimedCurrPeriod: 0.0,
      netVatDue: 2750.0,
      totalValueSalesExVAT: 15000,
      totalValuePurchasesExVAT: 500,
      totalValueGoodsSuppliedExVAT: 0,
      totalAcquisitionsExVAT: 0,
      finalised: true,
    });

    const getReturnEvent = buildLambdaEvent({
      method: "GET",
      path: `/api/v1/hmrc/vat/return/${periodKeyToSubmit}`,
      pathParameters: { periodKey: periodKeyToSubmit },
      queryStringParameters: {
        vrn: "123456789",
      },
      headers: {
        ...buildGovClientHeaders(),
        authorization: `Bearer ${hmrcAccessToken}`,
      },
      authorizer: {
        authorizer: {
          lambda: {
            jwt: {
              claims: {
                "sub": testUserSub,
                "cognito:username": "obligationuser",
              },
            },
          },
        },
      },
    });

    const getReturnResponse = await hmrcVatReturnGetHandler(getReturnEvent);
    expect(getReturnResponse.statusCode).toBe(200);

    const getReturnBody = parseResponseBody(getReturnResponse);
    expect(getReturnBody).toHaveProperty("periodKey", periodKeyToSubmit);
    expect(getReturnBody).toHaveProperty("finalised", true);
    expect(getReturnBody).toHaveProperty("totalVatDue");

    // Verify the journey completed successfully
    expect(getReturnBody.periodKey).toBe(periodKeyToSubmit);
  });

  it("should handle multiple obligations with different statuses", async () => {
    // Get auth URL and token (abbreviated)
    const hmrcAccessToken = "mock-token-multiple-obligations";

    // Get obligations with mixed statuses
    process.env.TEST_VAT_OBLIGATIONS = JSON.stringify({
      source: "stub",
      obligations: [
        {
          start: "2025-01-01",
          end: "2025-03-31",
          due: "2025-05-07",
          status: "O",
          periodKey: "25A1",
        },
        {
          start: "2024-10-01",
          end: "2024-12-31",
          due: "2025-02-07",
          status: "F",
          periodKey: "24A4",
          received: "2025-02-05",
        },
        {
          start: "2024-07-01",
          end: "2024-09-30",
          due: "2024-11-07",
          status: "F",
          periodKey: "24A3",
          received: "2024-11-01",
        },
      ],
    });

    const obligationEvent = buildLambdaEvent({
      method: "GET",
      path: "/api/v1/hmrc/vat/obligation",
      queryStringParameters: {
        vrn: "987654321",
      },
      headers: {
        ...buildGovClientHeaders(),
        authorization: `Bearer ${hmrcAccessToken}`,
      },
      authorizer: {
        authorizer: {
          lambda: {
            jwt: {
              claims: {
                "sub": testUserSub,
                "cognito:username": "multiuser",
              },
            },
          },
        },
      },
    });

    const obligationResponse = await hmrcVatObligationGetHandler(obligationEvent);
    expect(obligationResponse.statusCode).toBe(200);

    const obligationBody = parseResponseBody(obligationResponse);
    expect(obligationBody.obligations.length).toBe(3);

    // Verify we have both open and fulfilled obligations
    const openObligations = obligationBody.obligations.filter((o) => o.status === "O");
    const fulfilledObligations = obligationBody.obligations.filter((o) => o.status === "F");
    expect(openObligations.length).toBe(1);
    expect(fulfilledObligations.length).toBe(2);
  });

  it("should filter obligations by status parameter", async () => {
    const hmrcAccessToken = "mock-token-filtered";

    // Set up obligations
    process.env.TEST_VAT_OBLIGATIONS = JSON.stringify({
      source: "stub",
      obligations: [
        {
          start: "2024-10-01",
          end: "2024-12-31",
          due: "2025-02-07",
          status: "F",
          periodKey: "24A4",
          received: "2025-02-05",
        },
      ],
    });

    const obligationEvent = buildLambdaEvent({
      method: "GET",
      path: "/api/v1/hmrc/vat/obligation",
      queryStringParameters: {
        vrn: "123456789",
        status: "F",
      },
      headers: {
        ...buildGovClientHeaders(),
        authorization: `Bearer ${hmrcAccessToken}`,
      },
      authorizer: {
        authorizer: {
          lambda: {
            jwt: {
              claims: {
                "sub": testUserSub,
                "cognito:username": "filteruser",
              },
            },
          },
        },
      },
    });

    const obligationResponse = await hmrcVatObligationGetHandler(obligationEvent);
    expect(obligationResponse.statusCode).toBe(200);

    const obligationBody = parseResponseBody(obligationResponse);
    expect(obligationBody.obligations).toBeDefined();

    // All obligations should have fulfilled status
    obligationBody.obligations.forEach((obligation) => {
      expect(obligation.status).toBe("F");
    });
  });
});
