// tests/integration/logReceipt.integration.test.js
import { describe, beforeAll, afterAll, beforeEach, afterEach, it, expect, vi } from "vitest";
import { setupServer } from "msw/node";
import { mockClient } from "aws-sdk-client-mock";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

import { logReceiptHandler } from "@src/lib/main.js";

const s3Mock = mockClient(S3Client);

// spin up MSW server to catch HMRC calls
const server = setupServer();

describe("Integration – log receipt flow", () => {
  beforeAll(() => {
    server.listen({ onUnhandledRequest: "error" });
    // stub out console if you want less noise
  });
  afterAll(() => server.close());

  beforeEach(() => {
    vi.resetAllMocks();
    process.env = {
      ...process.env,
      HMRC_CLIENT_ID: "int-test-client-id",
      HMRC_CLIENT_SECRET: "int-test-secret",
      REDIRECT_URI: "https://example.com/cb",
      RECEIPTS_BUCKET: "my-test-bucket",
    };
    s3Mock.reset();
  });

  afterEach(() => {
    s3Mock.restore();
  });

  it("should log a receipt to S3 via the in-memory mock", async () => {
    // arrange S3 to succeed
    s3Mock.on(PutObjectCommand).resolves({});
    const fakeReceipt = {
      formBundleNumber: "FOO123",
      chargeRefNumber: "BAR456",
      processingDate: "2025-07-14T10:00:00.000Z",
    };
    const res = await logReceiptHandler({ body: JSON.stringify(fakeReceipt) });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe("receipt logged");

    // ensure the S3 client was called correctly
    expect(s3Mock.calls()).toHaveLength(1);
    const [firstCall] = s3Mock.calls();
    expect(firstCall.args[0].input).toEqual({
      Bucket: "my-test-bucket",
      Key: "receipts/FOO123.json",
      Body: JSON.stringify(fakeReceipt),
      ContentType: "application/json",
    });
  });
});
