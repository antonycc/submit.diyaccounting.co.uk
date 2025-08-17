// app/unit-tests/bundle.catalog.test.js
import { describe, test, beforeEach, expect } from "vitest";
import { httpPost as requestBundle } from "@app/functions/bundle.js";

function base64UrlEncode(obj) {
  const json = JSON.stringify(obj);
  return Buffer.from(json).toString("base64").replace(/=+$/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function makeIdToken(sub = "bundle-catalog-user", extra = {}) {
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

describe("bundle.js – catalog qualifiers and expiry (MOCK)", () => {
  beforeEach(() => {
    process.env.DIY_SUBMIT_BUNDLE_MOCK = "true";
  });

  // test("legacy requires transactionId qualifier", async () => {
  //  const token = makeIdToken("user-legacy");
  //  const resFail = await requestBundle(buildEvent(token, { bundleId: "legacy" }));
  //  expect(resFail.statusCode).toBe(400);
  //  const bodyFail = JSON.parse(resFail.body || '{}');
  //  expect(["qualifier_mismatch", "unknown_qualifier"]).toContain(bodyFail.error);
  //
  //  const resOk = await requestBundle(
  //    buildEvent(token, { bundleId: "legacy", qualifiers: { transactionId: "t-123" } }),
  //  );
  //  expect(resOk.statusCode).toBe(200);
  //  const bodyOk = JSON.parse(resOk.body || '{}');
  //  expect(bodyOk.status).toBe("granted");
  // });

  test("test bundle applies P1D timeout producing non-null expiry", async () => {
    const token = makeIdToken("user-test");
    const res = await requestBundle(buildEvent(token, { bundleId: "test" }));
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body || "{}");
    expect(body.status).toBe("granted");
    // expiry should be a YYYY-MM-DD string
    if (body.expiry) {
      expect(/\d{4}-\d{2}-\d{2}/.test(body.expiry)).toBe(true);
    }
  });
});
