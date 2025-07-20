// tests/system/submitVat.system.test.js
import { describe, beforeAll, afterAll, beforeEach, it, expect, vi } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { mockClient } from "aws-sdk-client-mock";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";

import { authUrlHandler, exchangeTokenHandler, submitVatHandler, logReceiptHandler } from "@src/lib/main.js";

const HMRC = "https://test.test.test.uk";
let store;
const s3Mock = mockClient(S3Client);

// MSW server to stub HMRC HTTP calls
const server = setupServer(
  http.post(`${HMRC}/oauth/token`, () => {
    return HttpResponse.json({ access_token: "sys-token" }, { status: 200 });
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
      PORT: "3000",
      HMRC_BASE_URI: "https://test.test.test.uk",
      HMRC_CLIENT_ID: "test client id",
      HMRC_REDIRECT_URI: "http://hmrc.redirect:3000/",
      HMRC_CLIENT_SECRET: "test hmrc client secret",
      TEST_REDIRECT_URI: "http://test.redirect:3000/",
      TEST_ACCESS_TOKEN: "test access token",
      TEST_RECEIPT: JSON.stringify({
        formBundleNumber: "test-123456789012",
        chargeRefNumber: "test-XM002610011594",
        processingDate: "2023-01-01T12:00:00.000Z",
      }),
      RECEIPTS_BUCKET_NAME: "test-receipts-bucket",
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
        hmrcAccessToken,
      }),
    });
    const receipt = JSON.parse(submitRes.body);

    // 3) Log receipt
    const logRes = await logReceiptHandler({ body: JSON.stringify(receipt) });
    expect(JSON.parse(logRes.body).receipt).not.toBeUndefined;

    // 4) Read back from S3
    const s3 = new S3Client({});
    const getResult = await s3.send(
      new GetObjectCommand({
        Bucket: process.env.RECEIPTS_BUCKET_NAME,
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
