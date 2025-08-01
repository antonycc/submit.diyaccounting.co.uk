// app/integration-tests/logReceipt.integration.test.js

import { describe, beforeAll, afterAll, beforeEach, afterEach, it, expect, vi } from "vitest";
import { setupServer } from "msw/node";
import { mockClient } from "aws-sdk-client-mock";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import dotenv from 'dotenv';

import { httpPost as logReceiptHandler } from "@app/functions/logReceipt.js";

dotenv.config({ path: '.env.test' });

const s3Mock = mockClient(S3Client);

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
      DIY_SUBMIT_DIY_SUBMIT_TEST_SERVER_HTTP_PORT: "3000",
      DIY_SUBMIT_HMRC_BASE_URI: "https://test.test.test.uk",
      DIY_SUBMIT_HMRC_CLIENT_ID: "test client id",
      DIY_SUBMIT_HOME_URL: "http://hmrc.redirect:3000/",
      DIY_SUBMIT_HMRC_CLIENT_SECRET: "test hmrc client secret",
      DIY_SUBMIT_RECEIPTS_BUCKET_POSTFIX: "test-receipts-bucket",
      DIY_SUBMIT_TEST_S3_ENDPOINT: "http://localhost:9000", // Enable S3 operations for tests
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
    expect(body.receipt).toEqual(fakeReceipt);
    expect(body.key).toBe("receipts/FOO123.json");

    // ensure the S3 client was called correctly
    expect(s3Mock.calls()).toHaveLength(1);
    const [firstCall] = s3Mock.calls();
    expect(firstCall.args[0].input).toEqual({
      Bucket: "hmrc-redirect-test-receipts-bucket",
      Key: "receipts/FOO123.json",
      Body: JSON.stringify(fakeReceipt),
      ContentType: "application/json",
    });
  });
});
