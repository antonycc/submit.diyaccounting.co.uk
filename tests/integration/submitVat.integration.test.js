// tests/integration/primaryPaths.integration.test.js
import { describe, beforeAll, afterAll, beforeEach, afterEach, it, expect, vi } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { mockClient } from "aws-sdk-client-mock";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

import { authUrlHandler, exchangeTokenHandler, submitVatHandler, logReceiptHandler } from "@src/lib/main.js";
import dotenv from 'dotenv';

dotenv.config({ path: '.env.test' });

const HMRC = "https://test.test.test.uk";
const s3Mock = mockClient(S3Client);

// spin up MSW server to catch HMRC calls
const server = setupServer(
  // stub token exchange
  http.post(`${HMRC}/oauth/token`, async ({ request }) => {
    const formData = await request.formData();
    // verify grant_type etc. if you like
    return HttpResponse.json({ access_token: "stubbed-access-token" }, { status: 200 });
  }),
  // stub VAT submission
  http.post(`${HMRC}/organisations/vat/:vrn/returns`, async ({ params }) => {
    const { vrn } = params;
    // echo back a fake receipt
    return HttpResponse.json(
      {
        formBundleNumber: `${vrn}-FB123`,
        chargeRefNumber: `${vrn}-CR456`,
        processingDate: new Date().toISOString(),
      },
      { status: 200 },
    );
  }),
);

describe("Integration – VAT flow", () => {
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
      HMRC_REDIRECT_URI: "http://hmrc.redirect:3000/",
      HMRC_CLIENT_SECRET: "test hmrc client secret",
      TEST_ACCESS_TOKEN: "test access token",
      TEST_RECEIPT: JSON.stringify({
        formBundleNumber: "test-123456789012",
        chargeRefNumber: "test-XM002610011594",
        processingDate: "2023-01-01T12:00:00.000Z",
      }),
      RECEIPTS_BUCKET_POSTFIX: "test-receipts-bucket",
    };
    s3Mock.reset();
  });

  afterEach(() => {
    s3Mock.restore();
  });

  it("should submit VAT and receive a stubbed receipt", async () => {
    const payload = {
      vatNumber: "999999999",
      periodKey: "23A1",
      vatDue: "500.00",
      hmrcAccessToken: "stubbed-access-token",
    };
    const res = await submitVatHandler({ body: JSON.stringify(payload) });
    expect(res.statusCode).toBe(200);
    const response = JSON.parse(res.body);
    expect(response.receipt.formBundleNumber).toBe("999999999-FB123");
    expect(response.receipt.chargeRefNumber).toBe("999999999-CR456");
    expect(typeof response.receipt.processingDate).toBe("string");
  });

  it("should run the whole flow end-to-end in memory", async () => {
    // 1) auth
    const authRes = await authUrlHandler({ queryStringParameters: { state: "ABC" } });
    expect(authRes.statusCode).toBe(200);

    // 2) exchange
    const exchRes = await exchangeTokenHandler({ body: JSON.stringify({ code: "C1" }) });
    const { hmrcAccessToken } = JSON.parse(exchRes.body);
    expect(hmrcAccessToken).toBe("stubbed-access-token");

    // 3) submit
    const submitRes = await submitVatHandler({
      body: JSON.stringify({
        vatNumber: "123123123",
        periodKey: "23A1",
        vatDue: "750.00",
        hmrcAccessToken,
      }),
    });
    const submitResponse = JSON.parse(submitRes.body);
    expect(submitResponse.receipt.formBundleNumber).toMatch(/123123123-FB/);

    // 4) log
    s3Mock.on(PutObjectCommand).resolves({});
    const logRes = await logReceiptHandler({ body: JSON.stringify(submitResponse.receipt) });
    const logResponse = JSON.parse(logRes.body);
    expect(logResponse.receipt).toBeDefined();
    expect(logResponse.key).toBeDefined();
  });
});
