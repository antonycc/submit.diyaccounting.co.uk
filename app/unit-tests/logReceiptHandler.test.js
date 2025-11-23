// app/unit-tests/logReceiptHandler.test.js

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

// Mock AWS S3 client - must be done before importing main.js
const mockSend = vi.fn();
vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: vi.fn().mockImplementation(function MockS3Client() {
    this.send = mockSend;
  }),
  PutObjectCommand: vi.fn().mockImplementation(function MockPutObjectCommand(params) {
    return params;
  }),
}));

import { handler as logReceiptHandler } from "@app/functions/hmrc/hmrcReceiptPost.js";

describe("httpPostMock", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();

    process.env = {
      ...originalEnv,
      DIY_SUBMIT_RECEIPTS_BUCKET_NAME: "test-receipts-bucket",
      TEST_S3_ENDPOINT: "http://localhost:9000", // Enable S3 operations for tests
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  test("should log receipt to S3 successfully", async () => {
    mockSend.mockResolvedValueOnce({});

    const receipt = {
      formBundleNumber: "123456789012",
      chargeRefNumber: "XM002610011594",
      processingDate: "2023-01-01T12:00:00.000Z",
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
      body: JSON.stringify(receipt),
    };

    const result = await logReceiptHandler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(200);
    expect(body.receipt).not.toBeUndefined;
    expect(body.receipt.formBundleNumber).not.toBeUndefined;
    expect(body.receipt.formBundleNumber).toBe(receipt.formBundleNumber);

    // Verify S3 client was called with correct parameters
    expect(mockSend).toHaveBeenCalledWith({
      Bucket: "test-receipts-bucket",
      Key: "receipts/123456789012.json",
      Body: JSON.stringify(receipt),
      ContentType: "application/json",
    });
  });

  test("should handle S3 error", async () => {
    const s3Error = new Error("Access denied");
    s3Error.name = "AccessDenied";
    mockSend.mockRejectedValueOnce(s3Error);

    const receipt = {
      formBundleNumber: "123456789012",
      chargeRefNumber: "XM002610011594",
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
      body: JSON.stringify(receipt),
    };

    const result = await logReceiptHandler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(500);
    expect(body.message).toContain("Failed to log receipt");
    expect(body.details).toContain("Failed to log receipt: Access denied");
  });

  test("should handle malformed JSON in request body", async () => {
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
      body: "invalid-json",
    };

    const result = await logReceiptHandler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(400);
    expect(body.message).toContain("Missing receipt parameter from body");
  });

  test("should handle S3 network timeout error", async () => {
    const timeoutError = new Error("Request timeout");
    timeoutError.name = "TimeoutError";
    mockSend.mockRejectedValueOnce(timeoutError);

    const receipt = {
      formBundleNumber: "123456789012",
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
      body: JSON.stringify(receipt),
    };

    const result = await logReceiptHandler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(500);
    expect(body.message).toContain("Failed to log receipt");
    expect(body.details).toContain("Failed to log receipt: Request timeout");
  });

  test("should handle S3 bucket not found error", async () => {
    const bucketError = new Error("The specified bucket does not exist");
    bucketError.name = "NoSuchBucket";
    mockSend.mockRejectedValueOnce(bucketError);

    const receipt = {
      formBundleNumber: "123456789012",
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
      body: JSON.stringify(receipt),
    };

    const result = await logReceiptHandler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(500);
    expect(body.message).toContain("Failed to log receipt");
    expect(body.details).toContain("Failed to log receipt: The specified bucket does not exist");
  });

  test("should handle receipt with special characters in formBundleNumber", async () => {
    mockSend.mockResolvedValueOnce({});

    const receipt = {
      formBundleNumber: "ABC-123_456.789",
      chargeRefNumber: "XM002610011594",
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
      body: JSON.stringify(receipt),
    };

    const result = await logReceiptHandler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(200);
    expect(body.receipt).not.toBeUndefined;

    // Verify S3 client was called with special characters in key
    expect(mockSend).toHaveBeenCalledWith({
      Bucket: "test-receipts-bucket",
      Key: "receipts/ABC-123_456.789.json",
      Body: JSON.stringify(receipt),
      ContentType: "application/json",
    });
  });
});
