// app/unit-tests/hmrcReceiptGet.handler.test.js

import { describe, test, expect, vi, beforeEach } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { handler as getReceiptHandler } from "@app/functions/hmrc/hmrcReceiptGet.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

// Mock AWS SDK S3 client
vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: vi.fn().mockImplementation(() => ({
    send: vi.fn(),
  })),
  ListObjectsV2Command: vi.fn(),
  GetObjectCommand: vi.fn(),
}));

describe("hmrcReceiptGet handler (new tests)", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = {
      ...originalEnv,
      NODE_ENV: "test",
      DIY_SUBMIT_RECEIPTS_BUCKET_NAME: "test-receipts-bucket",
      TEST_MINIO_S3: "off", // Disable actual S3 calls
    };
  });

  test("returns 401 when authentication is missing", async () => {
    const event = {
      requestContext: { requestId: "req-1" },
      headers: {},
    };

    const result = await getReceiptHandler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(401);
    expect(String(body.message)).toMatch(/Authentication required/i);
  });

  test("returns 400 when name format is invalid", async () => {
    // Create a valid JWT token for testing
    const payload = { sub: "test-user-123" };
    const base64Payload = Buffer.from(JSON.stringify(payload)).toString("base64");
    const token = `header.${base64Payload}.signature`;

    const event = {
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
      headers: { authorization: `Bearer ${token}` },
      pathParameters: { name: "invalid-name-without-json" },
    };

    const result = await getReceiptHandler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(400);
    expect(String(body.message)).toMatch(/Invalid name format/i);
  });

  test("returns 403 when key is forbidden", async () => {
    // Create a valid JWT token for testing
    const payload = { sub: "test-user-123" };
    const base64Payload = Buffer.from(JSON.stringify(payload)).toString("base64");
    const token = `header.${base64Payload}.signature`;

    const event = {
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
      headers: { authorization: `Bearer ${token}` },
      queryStringParameters: { key: "receipts/other-user/receipt.json" },
    };

    const result = await getReceiptHandler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(403);
    expect(String(body.message)).toMatch(/Forbidden/i);
  });
});
