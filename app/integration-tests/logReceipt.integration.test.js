// app/integration-tests/logReceipt.integration.test.js

import { describe, beforeAll, afterAll, beforeEach, afterEach, it, expect, vi } from "vitest";
import { setupServer } from "msw/node";
import { mockClient } from "aws-sdk-client-mock";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";

import { handler as logReceiptHandler } from "@app/functions/hmrc/hmrcReceiptPost.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const dynamoDbMock = mockClient(DynamoDBDocumentClient);

// spin up MSW server to catch HMRC calls
const server = setupServer();

describe("Integration – log receipt flow", () => {
  const originalEnv = process.env;
  beforeAll(() => {
    server.listen({ onUnhandledRequest: "error" });
    // stub out console if you want less noise
  });
  afterAll(() => server.close());

  beforeEach(() => {
    vi.resetAllMocks();
    process.env = {
      ...originalEnv,
      TEST_SERVER_HTTP_PORT: "3000",
      HMRC_BASE_URI: "https://test.test.test.uk",
      HMRC_CLIENT_ID: "test client id",
      // eslint-disable-next-line sonarjs/no-clear-text-protocols
      DIY_SUBMIT_BASE_URL: "http://hmrc.redirect:3000/",
      HMRC_CLIENT_SECRET: "test hmrc client secret",
      RECEIPTS_DYNAMODB_TABLE_NAME: "test-receipts-table",
    };
    dynamoDbMock.reset();
  });

  afterEach(() => {
    dynamoDbMock.restore();
  });

  it("should log a receipt to DynamoDB via the in-memory mock", async () => {
    // arrange DynamoDB to succeed
    dynamoDbMock.on(PutCommand).resolves({});
    const fakeReceipt = {
      formBundleNumber: "FOO123",
      chargeRefNumber: "BAR456",
      processingDate: "2025-07-14T10:00:00.000Z",
    };
    // Create a simple JWT token for test-sub
    const header = { alg: "none", typ: "JWT" };
    const payload = { sub: "test-sub", email: "test@test.submit.diyaccunting.co.uk", scope: "read write" };
    const base64UrlEncode = (obj) =>
      Buffer.from(JSON.stringify(obj)).toString("base64").replace(/=+$/g, "").replace(/\+/g, "-").replace(/\//g, "_");
    const token = `${base64UrlEncode(header)}.${base64UrlEncode(payload)}.`;

    const res = await logReceiptHandler({
      requestContext: {
        requestId: "test-request-id",
        authorizer: {
          lambda: {
            jwt: {
              claims: {
                "sub": "test-sub",
                "cognito:username": "test",
                "email": "test@test.submit.diyaccunting.co.uk",
                "scope": "read write",
              },
            },
          },
        },
      },
      headers: {
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(fakeReceipt),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.receipt).toEqual(fakeReceipt);
    // Key should include userSub when authenticated
    expect(body.key).toMatch(/^receipts\/test-sub\//);
    expect(body.key).toMatch(/FOO123\.json$/);

    // ensure the DynamoDB client was called correctly
    expect(dynamoDbMock.calls()).toHaveLength(1);
    const [firstCall] = dynamoDbMock.calls();
    const input = firstCall.args[0].input;
    expect(input.TableName).toBe("test-receipts-table");
    expect(input.Item.receipt).toEqual(fakeReceipt);
    expect(input.Item.hashedSub).toBeDefined();
    expect(input.Item.receiptId).toMatch(/FOO123$/);
    expect(input.Item.ttl).toBeDefined();
  });
});
