// app/system-tests/hmrcReceipt.system.test.js

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { dotenvConfigIfNotBlank } from "../lib/env.js";
import { handler as hmrcReceiptGetHandler } from "../functions/hmrc/hmrcReceiptGet.js";
import { buildLambdaEvent, makeIdToken } from "../test-helpers/eventBuilders.js";
import { setupTestEnv, parseResponseBody } from "../test-helpers/mockHelpers.js";
import { ensureReceiptsTableExists, ensureBundleTableExists } from "@app/bin/dynamodb.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

let stopDynalite;
let importedDynamoDbReceiptStore;
const receiptsTableName = "system-test-vat-journey-receipts";
const bundleTableName = "test-bundle-table";

describe("System: HMRC Receipt Flow (hmrcReceiptPost + hmrcReceiptGet)", () => {
  const testUserSub = "test-user-receipt-123";
  const testToken = makeIdToken(testUserSub);

  beforeAll(async () => {
    const { ensureReceiptsTableExists, ensureBundleTableExists } = await import("../bin/dynamodb.js");
    const { default: dynalite } = await import("dynalite");

    const host = "127.0.0.1";
    const port = 9004;
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
    process.env.RECEIPTS_DYNAMODB_TABLE_NAME = receiptsTableName;
    process.env.BUNDLE_DYNAMODB_TABLE_NAME = bundleTableName;

    await ensureReceiptsTableExists(receiptsTableName, endpoint);
    await ensureBundleTableExists(bundleTableName, endpoint);

    importedDynamoDbReceiptStore = await import("../data/dynamoDbReceiptRepository.js");
  });

  afterAll(async () => {
    try {
      await stopDynalite?.();
    } catch {}
  });

  beforeEach(() => {
    vi.resetAllMocks();
    Object.assign(
      process.env,
      setupTestEnv({
        RECEIPTS_DYNAMODB_TABLE_NAME: receiptsTableName,
      }),
    );
  });

  it("should post a receipt and then retrieve it", async () => {
    const receiptData = {
      formBundleNumber: "RECEIPT-12345",
      chargeRefNumber: "CHARGE-67890",
      processingDate: "2025-01-15T10:30:00.000Z",
      paymentIndicator: "BANK",
    };

    const getListEvent = buildLambdaEvent({
      method: "GET",
      path: "/api/v1/hmrc/receipt",
      headers: { Authorization: `Bearer ${testToken}` },
      authorizer: {
        authorizer: {
          lambda: {
            jwt: {
              claims: {
                "sub": testUserSub,
                "cognito:username": "testuser",
              },
            },
          },
        },
      },
    });

    const getListResponse = await hmrcReceiptGetHandler(getListEvent);
    expect(getListResponse.statusCode).toBe(200);

    const getListBody = parseResponseBody(getListResponse);
    expect(getListBody).toHaveProperty("receipts");
    expect(Array.isArray(getListBody.receipts)).toBe(true);

    const postBody = {
      receipt: receiptData,
      key: `receipts/${testUserSub}/${receiptData.formBundleNumber}.json`,
    };

    const getEvent = buildLambdaEvent({
      method: "GET",
      path: `/api/v1/hmrc/receipt/${postBody.key.split("/").pop()}`,
      pathParameters: { name: postBody.key.split("/").pop() },
      headers: { Authorization: `Bearer ${testToken}` },
      authorizer: {
        authorizer: {
          lambda: {
            jwt: {
              claims: {
                "sub": testUserSub,
                "cognito:username": "testuser",
              },
            },
          },
        },
      },
    });

    const getResponse = await hmrcReceiptGetHandler(getEvent);
    expect(getResponse.statusCode).toBe(200);

    const getBody = parseResponseBody(getResponse);
    expect(getBody).toEqual(receiptData);
  });

  it("should require authentication for receipt retrieval", async () => {
    const getEvent = buildLambdaEvent({
      method: "GET",
      path: "/api/v1/hmrc/receipt",
      headers: {},
    });

    const getResponse = await hmrcReceiptGetHandler(getEvent);
    expect(getResponse.statusCode).toBe(401);

    const getBody = parseResponseBody(getResponse);
    expect(getBody.message).toContain("Authentication required");
  });
});
