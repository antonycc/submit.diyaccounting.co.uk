// app/integration-tests/submitVat.system.test.js

import { describe, beforeAll, afterAll, beforeEach, it, expect, vi } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { mockClient } from "aws-sdk-client-mock";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";

import { httpGetHmrc as authUrlHandler } from "@app/functions/authUrl.js";
import { httpPostMock as exchangeTokenHandler } from "@app/functions/exchangeToken.js";
import { httpPost as submitVatHandler } from "@app/functions/submitVat.js";
import { httpPost as logReceiptHandler } from "@app/functions/logReceipt.js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.test" });

const HMRC = "https://test.test.test.uk";
let store;
const s3Mock = mockClient(S3Client);

// MSW server to stub HMRC HTTP calls
const server = setupServer(
  http.post(`${HMRC}/oauth/token`, () => {
    return HttpResponse.json({ access_token: "test access token" }, { status: 200 });
  }),
  http.post(`${HMRC}/organisations/vat/:vrn/returns`, ({ params }) => {
    const { vrn } = params;
    return HttpResponse.json(
      {
        formBundleNumber: `${vrn}-SYSFB`,
        chargeRefNumber: `${vrn}-SYSCR`,
        processingDate: new Date().toISOString(),
      },
      { status: 200 },
    );
  }),
);

describe("System Test – end-to-end AWS-like flow", () => {
  const originalEnv = process.env;
  beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
  afterAll(() => server.close());

  beforeEach(() => {
    vi.resetAllMocks();
    store = new Map();
    // Stub environment variables
    process.env = {
      ...originalEnv,
      DIY_SUBMIT_TEST_SERVER_HTTP_PORT: "3000",
      DIY_SUBMIT_HMRC_BASE_URI: "https://test.test.test.uk",
      DIY_SUBMIT_HMRC_CLIENT_ID: "test client id",
      DIY_SUBMIT_BASE_URL: "http://hmrc.redirect:3000/",
      DIY_SUBMIT_HMRC_CLIENT_SECRET: "test hmrc client secret",
      DIY_SUBMIT_COGNITO_CLIENT_ID: "integration-test-cognito-client-id",
      DIY_SUBMIT_GOOGLE_CLIENT_SECRET: "test google client secret",
      DIY_SUBMIT_RECEIPTS_BUCKET_POSTFIX: "test-receipts-bucket",
      DIY_SUBMIT_TEST_S3_ENDPOINT: "http://localhost:9000", // Enable S3 operations for tests
    };

    // Configure S3 mock to use in-memory store
    s3Mock.reset();
    s3Mock.on(PutObjectCommand).callsFake((input) => {
      const { Key, Body } = input;
      store.set(Key, Body);
      return Promise.resolve({});
    });
    s3Mock.on(GetObjectCommand).callsFake((input) => {
      const { Key } = input;
      if (!store.has(Key)) return Promise.reject(Object.assign(new Error("NoSuchKey"), { name: "NoSuchKey" }));
      return Promise.resolve({ Body: Buffer.from(store.get(Key)) });
    });
  });

  it("full end-to-end: submit VAT and read back logged receipt from S3", async () => {
    // 1) Exchange token
    const exchRes = await exchangeTokenHandler({ body: JSON.stringify({ code: "xyz" }) });
    const { hmrcAccessToken } = JSON.parse(exchRes.body);

    // 2) Submit VAT
    const submitRes = await submitVatHandler({
      body: JSON.stringify({
        vatNumber: "111222333",
        periodKey: "24B1",
        vatDue: "1000.00",
        accessToken: hmrcAccessToken,
      }),
    });
    const { receipt } = JSON.parse(submitRes.body);

    // 3) Log receipt
    const logRes = await logReceiptHandler({ body: JSON.stringify(receipt) });
    expect(JSON.parse(logRes.body).receipt).not.toBeUndefined;

    // 4) Read back from S3
    const s3 = new S3Client({});
    const getResult = await s3.send(
      new GetObjectCommand({
        Bucket: process.env.DIY_SUBMIT_RECEIPTS_BUCKET_POSTFIX,
        Key: `receipts/${receipt.formBundleNumber}.json`,
      }),
    );
    const bodyStr = getResult.Body.toString();
    const parsed = JSON.parse(bodyStr);

    // Assertions
    expect(parsed.formBundleNumber).toBe(receipt.formBundleNumber);
    expect(parsed.chargeRefNumber).toBe(receipt.chargeRefNumber);
    expect(parsed.processingDate).toBe(receipt.processingDate);
  });
});
