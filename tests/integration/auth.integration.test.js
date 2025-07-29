// tests/integration/auth.integration.test.js

import { describe, beforeAll, afterAll, beforeEach, afterEach, it, expect, vi } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { mockClient } from "aws-sdk-client-mock";
import { S3Client } from "@aws-sdk/client-s3";
import dotenv from 'dotenv';

import { httpGet as authUrlHandler } from "@app/functions/authUrl.js";
import { httpPost as exchangeTokenHandler } from "@app/functions/exchangeToken.js";

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
      DIY_SUBMIT_DIY_SUBMIT_TEST_SERVER_HTTP_PORT: "3000",
      DIY_SUBMIT_HMRC_BASE_URI: "https://test.test.test.uk",
      DIY_SUBMIT_HMRC_CLIENT_ID: "test client id",
      DIY_SUBMIT_HOME_URL: "http://test.redirect:3000/",
      DIY_SUBMIT_HMRC_CLIENT_SECRET: "test hmrc client secret",
      // Clear these to ensure HTTP calls are made and MSW can intercept them
      DIY_SUBMIT_TEST_ACCESS_TOKEN: undefined,
      DIY_SUBMIT_TEST_RECEIPT: undefined,
      DIY_SUBMIT_RECEIPTS_BUCKET_POSTFIX: "test-receipts-bucket",
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
    console.log("Response status:", res.statusCode);
    console.log("Response body:", res.body);
    expect(res.statusCode).toBe(200);
    const { hmrcAccessToken } = JSON.parse(res.body);
    expect(hmrcAccessToken).toBe("stubbed-access-token");
  });
});
