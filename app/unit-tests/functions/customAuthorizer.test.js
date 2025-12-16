// app/unit-tests/functions/customAuthorizer.test.js
import { describe, it, expect, vi, beforeEach } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

// Mock aws-jwt-verify CognitoJwtVerifier
const mockVerify = vi.fn();
vi.mock("aws-jwt-verify", () => {
  return {
    CognitoJwtVerifier: {
      create: vi.fn().mockReturnValue({ verify: mockVerify }),
    },
  };
});

function makeEvent(headers = {}, arn = "arn:aws:execute-api:eu-west-2:123456789012:abc123/prod/GET/resource") {
  return {
    routeArn: arn,
    headers,
    requestContext: {},
  };
}

describe("functions/auth/customAuthorizer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(process.env, {
      COGNITO_USER_POOL_ID: "pool-123",
      COGNITO_USER_POOL_CLIENT_ID: "client-123",
    });
  });

  it("denies when X-Authorization header is missing", async () => {
    const { handler } = await import("@app/functions/auth/customAuthorizer.js");
    const res = await handler(makeEvent({}));
    expect(res.policyDocument.Statement[0].Effect).toBe("Deny");
  });

  it("denies when X-Authorization is not 'Bearer <token>'", async () => {
    const { handler } = await import("@app/functions/auth/customAuthorizer.js");
    const res = await handler(makeEvent({ "X-Authorization": "token" }));
    expect(res.policyDocument.Statement[0].Effect).toBe("Deny");
  });

  it("allows when verifier succeeds and returns payload", async () => {
    const { handler } = await import("@app/functions/auth/customAuthorizer.js");
    mockVerify.mockResolvedValueOnce({ sub: "user-sub", username: "user", scope: "read" });
    const res = await handler(makeEvent({ "x-authorization": "Bearer token-abc" }));
    expect(res.policyDocument.Statement[0].Effect).toBe("Allow");
    expect(res.principalId).toBe("user-sub");
    expect(res.context.sub).toBe("user-sub");
  });

  it("denies when verifier throws (invalid token)", async () => {
    const { handler } = await import("@app/functions/auth/customAuthorizer.js");
    mockVerify.mockRejectedValueOnce(new Error("invalid"));
    const res = await handler(makeEvent({ "x-authorization": "Bearer bad" }));
    expect(res.policyDocument.Statement[0].Effect).toBe("Deny");
  });
});
