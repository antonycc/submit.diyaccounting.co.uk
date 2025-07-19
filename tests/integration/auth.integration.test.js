// tests/integration/auth.integration.test.js
import { describe, beforeAll, afterAll, beforeEach, afterEach, it, expect, vi } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { mockClient } from "aws-sdk-client-mock";
import { S3Client } from "@aws-sdk/client-s3";

import { authUrlHandler, exchangeTokenHandler } from "@src/lib/main.js";

const HMRC = "https://test.test.test.uk";
const s3Mock = mockClient(S3Client);

// spin up MSW server to catch HMRC calls
const server = setupServer(
  // stub token exchange
  http.post(`${HMRC}/oauth/token`, async ({ request }) => {
    const formData = await request.formData();
    // verify grant_type etc. if you like
    return HttpResponse.json({ hmrcAccessToken: "stubbed-access-token" }, { status: 200 });
  }),
);

describe("Integration – auth flow", () => {
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
      PORT: "3000",
      HMRC_BASE_URI: "https://test.test.test.uk",
      HMRC_CLIENT_ID: "test client id",
      HMRC_REDIRECT_URI: "http://test.redirect:3000/",
      HMRC_CLIENT_SECRET: "test hmrc client secret",
      TEST_REDIRECT_URI: "http://test.redirect:3000/",
      TEST_ACCESS_TOKEN: "test access token",
      TEST_RECEIPT: JSON.stringify({
        formBundleNumber: "test-123456789012",
        chargeRefNumber: "test-XM002610011594",
        processingDate: "2023-01-01T12:00:00.000Z",
      }),
      RECEIPTS_BUCKET: "test-receipts-bucket",
    };
    s3Mock.reset();
  });

  afterEach(() => {
    s3Mock.restore();
  });

  it("should generate an auth URL when state is supplied", async () => {
    const evt = { queryStringParameters: { state: "xyz-123" } };
    const res = await authUrlHandler(evt);
    expect(res.statusCode).toBe(200);
    const { authUrl } = JSON.parse(res.body);
    expect(authUrl).toContain("response_type=code");
    expect(authUrl).toContain("client_id=test%20client%20id");
    expect(authUrl).toContain("redirect_uri=http%3A%2F%2Ftest.redirect");
    expect(authUrl).toContain("state=xyz-123");
  });

  it("should exchange code for a stubbed access token", async () => {
    const evt = { body: JSON.stringify({ code: "anything" }) };
    const res = await exchangeTokenHandler(evt);
    console.log("[DEBUG_LOG] Response status:", res.statusCode);
    console.log("[DEBUG_LOG] Response body:", res.body);
    expect(res.statusCode).toBe(200);
    const { hmrcAccessToken } = JSON.parse(res.body);
    expect(hmrcAccessToken).toBe("test access token");
  });
});
