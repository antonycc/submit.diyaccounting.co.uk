// tests/integration/auth.integration.test.js
import { describe, beforeAll, afterAll, beforeEach, afterEach, it, expect, vi } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { mockClient } from "aws-sdk-client-mock";
import { S3Client } from "@aws-sdk/client-s3";

import { authUrlHandler, exchangeTokenHandler } from "@src/lib/main.js";

const HMRC = "https://api.service.hmrc.gov.uk";
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

  it("should generate an auth URL when state is supplied", async () => {
    const evt = { queryStringParameters: { state: "xyz-123" } };
    const res = await authUrlHandler(evt);
    expect(res.statusCode).toBe(200);
    const { authUrl } = JSON.parse(res.body);
    expect(authUrl).toContain("response_type=code");
    expect(authUrl).toContain("client_id=int-test-client-id");
    expect(authUrl).toContain("redirect_uri=https%3A%2F%2Fexample.com%2Fcb");
    expect(authUrl).toContain("state=xyz-123");
  });

  it("should exchange code for a stubbed access token", async () => {
    const evt = { body: JSON.stringify({ code: "anything" }) };
    const res = await exchangeTokenHandler(evt);
    console.log("[DEBUG_LOG] Response status:", res.statusCode);
    console.log("[DEBUG_LOG] Response body:", res.body);
    expect(res.statusCode).toBe(200);
    const { accessToken } = JSON.parse(res.body);
    expect(accessToken).toBe("stubbed-access-token");
  });
});
