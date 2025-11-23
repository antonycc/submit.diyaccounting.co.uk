// app/unit-tests/hmrcReceiptPost.handler.test.js

import { describe, test, expect, vi, beforeEach } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { handler as postReceiptHandler } from "@app/functions/hmrc/hmrcReceiptPost.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

describe("hmrcReceiptPost handler (new tests)", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = {
      ...originalEnv,
      NODE_ENV: "stubbed", // Use stubbed mode to avoid actual S3 writes
      DIY_SUBMIT_RECEIPTS_BUCKET_NAME: "test-receipts-bucket",
    };
  });

  test("logs receipt successfully in stubbed mode", async () => {
    const receipt = {
      formBundleNumber: "bundle-123",
      chargeRefNumber: "charge-456",
      processingDate: "2025-01-01T00:00:00Z",
    };

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
      body: JSON.stringify({ receipt }),
    };

    const result = await postReceiptHandler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(200);
    expect(body.receipt).toEqual(receipt);
    expect(body.key).toContain("bundle-123");
  });

  test("returns 400 when receipt is missing", async () => {
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
      body: JSON.stringify({}),
    };

    const result = await postReceiptHandler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(400);
    expect(String(body.message)).toMatch(/Missing receipt parameter/i);
  });

  test("returns 400 when formBundleNumber is missing", async () => {
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
      body: JSON.stringify({ receipt: { someField: "value" } }),
    };

    const result = await postReceiptHandler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(400);
    expect(String(body.message)).toMatch(/Missing formBundleNumber/i);
  });
});
