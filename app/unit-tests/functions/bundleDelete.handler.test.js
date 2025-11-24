// app/unit-tests/bundleDelete.test.js
import { describe, test, beforeEach, expect } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { resetBundlesStore } from "@app/functions/non-lambda-mocks/mockBundleStore.js";

import { handler as bundleDelete } from "@app/functions/account/bundleDelete.js";
import { handler as bundlePost } from "@app/functions/account/bundlePost.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

function base64UrlEncode(obj) {
  const json = JSON.stringify(obj);
  return Buffer.from(json).toString("base64").replace(/=+$/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function makeIdToken(sub = "user-404", extra = {}) {
  const header = { alg: "none", typ: "JWT" };
  const payload = {
    sub,
    email: `${sub}@example.com`,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
    ...extra,
  };
  return `${base64UrlEncode(header)}.${base64UrlEncode(payload)}.`;
}

function authHeaders(token) {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

describe("bundleDelete.js not_found path (MOCK mode)", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, TEST_BUNDLE_MOCK: "true" };
    resetBundlesStore();
  });

  test("returns 404 when attempting to delete a non-existent bundle id", async () => {
    const token = makeIdToken("user-not-found");

    // Ensure user has a different bundle so delete-by-id misses
    await bundlePost({
      requestContext: {
        requestId: "test-request-id",
        authorizer: {
          lambda: {
            jwt: {
              claims: {
                "sub": "user-not-found",
                "cognito:username": "test",
                "email": "test@test.submit.diyaccunting.co.uk",
                "scope": "read write",
              },
            },
          },
        },
      },
      headers: authHeaders(token),
      body: JSON.stringify({ bundleId: "some-other" }),
    });

    const res = await bundleDelete({
      requestContext: {
        requestId: "test-request-id",
        authorizer: {
          lambda: {
            jwt: {
              claims: {
                "sub": "user-not-found",
                "cognito:username": "test",
                "email": "test@test.submit.diyaccunting.co.uk",
                "scope": "read write",
              },
            },
          },
        },
      },
      headers: authHeaders(token),
      pathParameters: { id: "does-not-exist" },
    });
    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.message).toMatch(/not found/i);
    // x-request-id should be present
    expect(res.headers["x-request-id"]).toBeTruthy();
  });
});
