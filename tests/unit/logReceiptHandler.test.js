import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";

// Mock AWS S3 client - must be done before importing main.js
const mockSend = vi.fn();
vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: vi.fn(() => ({
    send: mockSend,
  })),
  PutObjectCommand: vi.fn((params) => params),
}));

import { logReceiptHandler } from "@src/lib/main.js";

describe("logReceiptHandler", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      RECEIPTS_BUCKET: "test-receipts-bucket",
    };
    vi.clearAllMocks();
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
      body: JSON.stringify(receipt),
    };

    const result = await logReceiptHandler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(200);
    expect(body.status).toBe("receipt logged");

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
      body: JSON.stringify(receipt),
    };

    const result = await logReceiptHandler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(500);
    expect(body.error).toBe("Failed to log receipt");
    expect(body.details).toBe("Access denied");
  });

  test("should handle empty receipt object", async () => {
    mockSend.mockResolvedValueOnce({});

    const receipt = {};

    const event = {
      body: JSON.stringify(receipt),
    };

    const result = await logReceiptHandler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(200);
    expect(body.status).toBe("receipt logged");

    // Verify S3 client was called with undefined formBundleNumber
    expect(mockSend).toHaveBeenCalledWith({
      Bucket: "test-receipts-bucket",
      Key: "receipts/undefined.json",
      Body: JSON.stringify(receipt),
      ContentType: "application/json",
    });
  });

  test("should handle receipt with null formBundleNumber", async () => {
    mockSend.mockResolvedValueOnce({});

    const receipt = {
      formBundleNumber: null,
      chargeRefNumber: "XM002610011594",
    };

    const event = {
      body: JSON.stringify(receipt),
    };

    const result = await logReceiptHandler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(200);
    expect(body.status).toBe("receipt logged");

    // Verify S3 client was called with null formBundleNumber
    expect(mockSend).toHaveBeenCalledWith({
      Bucket: "test-receipts-bucket",
      Key: "receipts/null.json",
      Body: JSON.stringify(receipt),
      ContentType: "application/json",
    });
  });

  test("should handle complex receipt object", async () => {
    mockSend.mockResolvedValueOnce({});

    const receipt = {
      formBundleNumber: "987654321098",
      chargeRefNumber: "XM002610011595",
      processingDate: "2023-02-01T15:30:00.000Z",
      vatDueSales: 1500.75,
      vatDueAcquisitions: 0,
      totalVatDue: 1500.75,
      vatReclaimedCurrPeriod: 200.5,
      netVatDue: 1300.25,
      additionalData: {
        nested: "value",
        array: [1, 2, 3],
      },
    };

    const event = {
      body: JSON.stringify(receipt),
    };

    const result = await logReceiptHandler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(200);
    expect(body.status).toBe("receipt logged");

    // Verify S3 client was called with correct parameters
    expect(mockSend).toHaveBeenCalledWith({
      Bucket: "test-receipts-bucket",
      Key: "receipts/987654321098.json",
      Body: JSON.stringify(receipt),
      ContentType: "application/json",
    });
  });

  test("should handle empty body", async () => {
    mockSend.mockResolvedValueOnce({});

    const event = {
      body: "",
    };

    const result = await logReceiptHandler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(200);
    expect(body.status).toBe("receipt logged");

    // Verify S3 client was called with empty object
    expect(mockSend).toHaveBeenCalledWith({
      Bucket: "test-receipts-bucket",
      Key: "receipts/undefined.json",
      Body: JSON.stringify({}),
      ContentType: "application/json",
    });
  });

  test("should handle null body", async () => {
    mockSend.mockResolvedValueOnce({});

    const event = {
      body: null,
    };

    const result = await logReceiptHandler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(200);
    expect(body.status).toBe("receipt logged");

    // Verify S3 client was called with empty object
    expect(mockSend).toHaveBeenCalledWith({
      Bucket: "test-receipts-bucket",
      Key: "receipts/undefined.json",
      Body: JSON.stringify({}),
      ContentType: "application/json",
    });
  });

  test("should handle missing body property", async () => {
    mockSend.mockResolvedValueOnce({});

    const event = {};

    const result = await logReceiptHandler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(200);
    expect(body.status).toBe("receipt logged");

    // Verify S3 client was called with empty object
    expect(mockSend).toHaveBeenCalledWith({
      Bucket: "test-receipts-bucket",
      Key: "receipts/undefined.json",
      Body: JSON.stringify({}),
      ContentType: "application/json",
    });
  });

  test("should handle malformed JSON in request body", async () => {
    const event = {
      body: "invalid-json",
    };

    await expect(logReceiptHandler(event)).rejects.toThrow();
  });

  test("should handle S3 network timeout error", async () => {
    const timeoutError = new Error("Request timeout");
    timeoutError.name = "TimeoutError";
    mockSend.mockRejectedValueOnce(timeoutError);

    const receipt = {
      formBundleNumber: "123456789012",
    };

    const event = {
      body: JSON.stringify(receipt),
    };

    const result = await logReceiptHandler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(500);
    expect(body.error).toBe("Failed to log receipt");
    expect(body.details).toBe("Request timeout");
  });

  test("should handle S3 bucket not found error", async () => {
    const bucketError = new Error("The specified bucket does not exist");
    bucketError.name = "NoSuchBucket";
    mockSend.mockRejectedValueOnce(bucketError);

    const receipt = {
      formBundleNumber: "123456789012",
    };

    const event = {
      body: JSON.stringify(receipt),
    };

    const result = await logReceiptHandler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(500);
    expect(body.error).toBe("Failed to log receipt");
    expect(body.details).toBe("The specified bucket does not exist");
  });

  test("should handle receipt with special characters in formBundleNumber", async () => {
    mockSend.mockResolvedValueOnce({});

    const receipt = {
      formBundleNumber: "ABC-123_456.789",
      chargeRefNumber: "XM002610011594",
    };

    const event = {
      body: JSON.stringify(receipt),
    };

    const result = await logReceiptHandler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(200);
    expect(body.status).toBe("receipt logged");

    // Verify S3 client was called with special characters in key
    expect(mockSend).toHaveBeenCalledWith({
      Bucket: "test-receipts-bucket",
      Key: "receipts/ABC-123_456.789.json",
      Body: JSON.stringify(receipt),
      ContentType: "application/json",
    });
  });
});
