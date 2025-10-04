// app/unit-tests/bundle.test.js
import { describe, test, beforeEach, expect } from "vitest";
import dotenv from "dotenv";

import { httpPost as requestBundle } from "@app/functions/bundle.js";

dotenv.config({ path: ".env.test" });

function base64UrlEncode(obj) {
  const json = JSON.stringify(obj);
  return Buffer.from(json).toString("base64").replace(/=+$/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function makeIdToken(sub = "user-1", extra = {}) {
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

function buildEvent(token, body) {
  return {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: JSON.stringify(body || {}),
  };
}

describe("bundle.js httpPostMock (MOCK mode)", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, DIY_SUBMIT_TEST_BUNDLE_MOCK: "true" };
  });

  test("401 when Authorization missing", async () => {
    const res = await requestBundle(buildEvent(null, { bundleId: "HMRC_TEST_API" }));
    expect(res.statusCode).toBe(401);
  });

  test("400 when bundleId missing", async () => {
    const token = makeIdToken("user-missing-bundle");
    const res = await requestBundle(buildEvent(token, {}));
    expect(res.statusCode).toBe(400);
  });

  test("403 when bundle expired", async () => {
    process.env.DIY_SUBMIT_TEST_BUNDLE_EXPIRY_DATE = "2000-01-01";
    const token = makeIdToken("user-expired");
    const res = await requestBundle(buildEvent(token, { bundleId: "HMRC_TEST_API" }));
    expect(res.statusCode).toBe(403);
  });

  test("403 when user limit reached", async () => {
    process.env.DIY_SUBMIT_TEST_BUNDLE_EXPIRY_DATE = "2025-12-31";
    process.env.DIY_SUBMIT_TEST_BUNDLE_USER_LIMIT = "0";
    const token = makeIdToken("user-limit");
    const res = await requestBundle(buildEvent(token, { bundleId: "HMRC_TEST_API" }));
    expect(res.statusCode).toBe(403);
  });

  test("200 granted and 200 already_granted on duplicate", async () => {
    process.env.DIY_SUBMIT_TEST_BUNDLE_EXPIRY_DATE = "2025-12-31";
    process.env.DIY_SUBMIT_TEST_BUNDLE_USER_LIMIT = "1000";
    const token = makeIdToken("user-success");

    const res1 = await requestBundle(buildEvent(token, { bundleId: "HMRC_TEST_API" }));
    expect(res1.statusCode).toBe(200);
    const body1 = JSON.parse(res1.body);
    expect(body1.status).toBe("granted");
    expect(Array.isArray(body1.bundles)).toBe(true);

    const res2 = await requestBundle(buildEvent(token, { bundleId: "HMRC_TEST_API" }));
    expect(res2.statusCode).toBe(200);
    const body2 = JSON.parse(res2.body);
    expect(body2.status).toBe("already_granted");
  });
});
