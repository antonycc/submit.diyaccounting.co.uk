// app/system-tests/hmrcReceipt.system.test.js

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
//import { mockClient } from "aws-sdk-client-mock";
//import { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { Readable } from "stream";
import { dotenvConfigIfNotBlank } from "../lib/env.js";
import { handler as hmrcReceiptPostHandler } from "../functions/hmrc/hmrcReceiptPost.js";
import { handler as hmrcReceiptGetHandler } from "../functions/hmrc/hmrcReceiptGet.js";
import { buildLambdaEvent, makeIdToken } from "../test-helpers/eventBuilders.js";
import { setupTestEnv, parseResponseBody } from "../test-helpers/mockHelpers.js";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { ensureReceiptsTableExists } from "@app/bin/dynamodb.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

let stopDynalite;
let importedDynamoDbReceiptStore;
//const s3Mock = mockClient(S3Client);
const receiptsTableName = "system-test-vat-journey-receipts";

function makeDocClient() {
  const endpoint = process.env.AWS_ENDPOINT_URL_DYNAMODB || process.env.AWS_ENDPOINT_URL;
  const client = new DynamoDBClient({
    region: process.env.AWS_REGION || "us-east-1",
    ...(endpoint ? { endpoint } : {}),
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || "dummy",
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "dummy",
    },
  });
  return DynamoDBDocumentClient.from(client);
}

describe("System: HMRC Receipt Flow (hmrcReceiptPost + hmrcReceiptGet)", () => {
  const testUserSub = "test-user-receipt-123";
  const testToken = makeIdToken(testUserSub);

  beforeAll(async () => {
    const { ensureReceiptsTableExists } = await import("../bin/dynamodb.js");
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
    //process.env.BUNDLE_DYNAMODB_TABLE_NAME = tableName;
    //process.env.HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME = hmrcReqsTableName;
    process.env.RECEIPTS_DYNAMODB_TABLE_NAME = receiptsTableName;

    await ensureReceiptsTableExists(receiptsTableName, endpoint);

    importedDynamoDbReceiptStore = await import("../lib/dynamoDbReceiptStore.js");
  });

  afterAll(async () => {
    try {
      await stopDynalite?.();
    } catch {}
  });

  beforeEach(() => {
    vi.resetAllMocks();
    //s3Mock.reset();
    Object.assign(
      process.env,
      setupTestEnv({
        DIY_SUBMIT_RECEIPTS_BUCKET_NAME: "test-receipts-bucket",
        RECEIPTS_DYNAMODB_TABLE_NAME: receiptsTableName,
        TEST_S3_ENDPOINT: "http://localhost:9000",
        TEST_S3_ACCESS_KEY: "minioadmin",
        TEST_S3_SECRET_KEY: "minioadmin",
      }),
    );
  });

  it("should post a receipt and then retrieve it", async () => {
    // Step 1: Post receipt to S3
    //s3Mock.on(PutObjectCommand).resolves({});

    const receiptData = {
      formBundleNumber: "RECEIPT-12345",
      chargeRefNumber: "CHARGE-67890",
      processingDate: "2025-01-15T10:30:00.000Z",
      paymentIndicator: "BANK",
    };

    const postEvent = buildLambdaEvent({
      method: "POST",
      path: "/api/v1/hmrc/receipt",
      body: { receipt: receiptData },
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

    const postResponse = await hmrcReceiptPostHandler(postEvent);
    expect(postResponse.statusCode).toBe(200);

    const postBody = parseResponseBody(postResponse);
    expect(postBody).toHaveProperty("receipt");
    expect(postBody).toHaveProperty("key");
    expect(postBody.receipt).toEqual(receiptData);
    expect(postBody.key).toContain(`receipts/${testUserSub}/`);
    expect(postBody.key).toContain("RECEIPT-12345.json");

    // Verify S3 was called
    //expect(s3Mock.calls()).toHaveLength(1);
    //const [putCall] = s3Mock.calls();
    //expect(putCall.args[0].input.Bucket).toBe("test-receipts-bucket");
    //expect(putCall.args[0].input.Key).toContain(testUserSub);

    // Step 2: Retrieve the receipt
    //s3Mock.reset();

    // Mock list receipts
    // s3Mock.on(ListObjectsV2Command).resolves({
    //   Contents: [
    //     {
    //       Key: postBody.key,
    //       Size: 200,
    //       LastModified: new Date(),
    //     },
    //   ],
    // });

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

    // Step 3: Get specific receipt
    //s3Mock.reset();

    // Mock get specific receipt
    //const receiptStream = Readable.from([JSON.stringify(receiptData)]);
    //s3Mock.on(GetObjectCommand).resolves({
    //  Body: receiptStream,
    //});

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

  it("should handle multiple receipts for same user", async () => {
    // Post two different receipts
    //s3Mock.on(PutObjectCommand).resolves({});

    const receipt1 = {
      formBundleNumber: "RECEIPT-001",
      chargeRefNumber: "CHARGE-001",
      processingDate: "2025-01-15T10:00:00.000Z",
    };

    const receipt2 = {
      formBundleNumber: "RECEIPT-002",
      chargeRefNumber: "CHARGE-002",
      processingDate: "2025-01-15T11:00:00.000Z",
    };

    const postEvent1 = buildLambdaEvent({
      method: "POST",
      path: "/api/v1/hmrc/receipt",
      body: { receipt: receipt1 },
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

    const postResponse1 = await hmrcReceiptPostHandler(postEvent1);
    expect(postResponse1.statusCode).toBe(200);

    const postEvent2 = buildLambdaEvent({
      method: "POST",
      path: "/api/v1/hmrc/receipt",
      body: { receipt: receipt2 },
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

    const postResponse2 = await hmrcReceiptPostHandler(postEvent2);
    expect(postResponse2.statusCode).toBe(200);

    // Verify both were saved
    //expect(s3Mock.calls()).toHaveLength(2);
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
