// app/system-tests/cognitoAuth.system.test.js

import { describe, it, expect, beforeEach, vi } from "vitest";
import { handler as cognitoAuthUrlGetHandler } from "../functions/auth/cognitoAuthUrlGet.js";
import { handler as cognitoTokenPostHandler } from "../functions/auth/cognitoTokenPost.js";
import { buildLambdaEvent, buildHeadEvent } from "../test-helpers/eventBuilders.js";
import { setupTestEnv, parseResponseBody, setupFetchMock, mockHmrcSuccess } from "../test-helpers/mockHelpers.js";

// Avoid DynamoDB side-effects from token exchange auditing
vi.mock("../data/dynamoDbHmrcApiRequestRepository.js", () => ({
  putHmrcApiRequest: vi.fn().mockResolvedValue(undefined),
}));

describe("System: Cognito Auth Flow (cognitoAuthUrl + cognitoToken)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    Object.assign(process.env, setupTestEnv());
  });

  it("should generate Cognito auth URL when given a valid state", async () => {
    const event = buildLambdaEvent({
      method: "GET",
      path: "/api/v1/cognito/authUrl",
      queryStringParameters: { state: "state-123" },
    });

    const res = await cognitoAuthUrlGetHandler(event);
    expect(res.statusCode).toBe(200);
    const body = parseResponseBody(res);
    expect(body).toHaveProperty("authUrl");
    expect(body.authUrl).toContain("/oauth2/authorize");
    expect(body.authUrl).toContain(`client_id=${encodeURIComponent(process.env.COGNITO_CLIENT_ID)}`);
    expect(body.authUrl).toContain(`state=state-123`);
    expect(body.authUrl).toContain(encodeURIComponent("/auth/loginWithCognitoCallback.html"));
  });

  it("should return 400 when state is missing", async () => {
    const event = buildLambdaEvent({ method: "GET", path: "/api/v1/cognito/authUrl", queryStringParameters: {} });
    const res = await cognitoAuthUrlGetHandler(event);
    expect(res.statusCode).toBe(400);
    const body = parseResponseBody(res);
    expect(body.message).toMatch(/Missing state/);
  });

  it("should return 200 for HEAD on authUrl", async () => {
    const event = buildHeadEvent({ path: "/api/v1/cognito/authUrl" });
    const res = await cognitoAuthUrlGetHandler(event);
    expect(res.statusCode).toBe(200);
  });

  it("should validate missing code on token exchange", async () => {
    const event = buildLambdaEvent({ method: "POST", path: "/api/v1/cognito/token" });
    // cognitoTokenPost expects base64 form body; we send empty to trigger validation error
    event.body = Buffer.from("").toString("base64");
    const res = await cognitoTokenPostHandler(event);
    expect(res.statusCode).toBe(400);
    const body = parseResponseBody(res);
    expect(body.message).toMatch(/Missing code/);
  });

  it("should exchange code for token and return tokens (fetch mocked)", async () => {
    const mockFetch = setupFetchMock();
    mockHmrcSuccess(mockFetch, {
      access_token: "access-123",
      id_token: "id-456",
      refresh_token: "ref-789",
      expires_in: 3600,
      token_type: "Bearer",
    });

    const event = buildLambdaEvent({ method: "POST", path: "/api/v1/cognito/token" });
    const form = new URLSearchParams({ code: "auth-code-123" }).toString();
    event.body = Buffer.from(form).toString("base64");

    const res = await cognitoTokenPostHandler(event);
    expect(res.statusCode).toBe(200);
    const body = parseResponseBody(res);
    expect(body).toMatchObject({
      accessToken: "access-123",
      hmrcAccessToken: "access-123",
      tokenType: "Bearer",
      expiresIn: 3600,
    });
  });

  it("should return 200 for HEAD on token endpoint", async () => {
    const event = buildHeadEvent({ path: "/api/v1/cognito/token" });
    const res = await cognitoTokenPostHandler(event);
    expect(res.statusCode).toBe(200);
  });
});
