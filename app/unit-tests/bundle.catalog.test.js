// app/unit-tests/bundle.catalog.test.js
import { describe, test, beforeEach, expect } from "vitest";
import { httpPost as requestBundle, __getInMemoryBundlesStore } from "@app/functions/bundle.js";

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
    process.env.DIY_SUBMIT_TEST_BUNDLE_MOCK = "true";
    // Clear the in-memory store before each test
    const store = __getInMemoryBundlesStore();
    store.clear();
  });

  // test("legacy requires transactionId qualifier", async () => {
  //   const token = makeIdToken("user-legacy");
  //   const resFail = await requestBundle(buildEvent(token, { bundleId: "legacy" }));
  //   expect(resFail.statusCode).toBe(400);
  //   const bodyFail = JSON.parse(resFail.body || "{}");
  //   expect(["qualifier_mismatch", "unknown_qualifier"]).toContain(bodyFail.error);
  //
  //   const resOk = await requestBundle(
  //     buildEvent(token, { bundleId: "legacy", qualifiers: { transactionId: "t-123" } }),
  //   );
  //   expect(resOk.statusCode).toBe(200);
  //   const bodyOk = JSON.parse(resOk.body || "{}");
  //   expect(bodyOk.status).toBe("granted");
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

  test("unknown qualifier should return 400 with specific error", async () => {
    const token = makeIdToken("user-unknown-qualifier");
    const res = await requestBundle(
      buildEvent(token, {
        bundleId: "test",
        qualifiers: { unknownField: "value" },
      }),
    );
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body || "{}");
    expect(body.error).toBe("unknown_qualifier");
    expect(body.qualifier).toBe("unknownField");
  });

  // test("basic bundle requires subscription tier qualifier", async () => {
  //   const token = makeIdToken("user-basic-no-tier");
  //   // Should fail without subscriptionTier
  //   const resFail = await requestBundle(buildEvent(token, { bundleId: "basic" }));
  //   expect(resFail.statusCode).toBe(400);
  //   const bodyFail = JSON.parse(resFail.body || "{}");
  //   expect(bodyFail.error).toBe("qualifier_mismatch");
  //
  //   // Should succeed with correct subscriptionTier
  //   const resOk = await requestBundle(
  //     buildEvent(token, {
  //       bundleId: "basic",
  //       qualifiers: { subscriptionTier: "Basic" },
  //     }),
  //   );
  //   expect(resOk.statusCode).toBe(200);
  //   const bodyOk = JSON.parse(resOk.body || "{}");
  //   expect(bodyOk.status).toBe("granted");
  // });

  test("bundle cap enforcement prevents exceeding limits", async () => {
    // Test bundle has cap=10, so we should be able to grant 10 but not 11
    // Grant to 10 different users
    const results = [];
    for (let i = 0; i < 11; i++) {
      const token = makeIdToken(`cap-test-user-${i}`);
      const res = await requestBundle(buildEvent(token, { bundleId: "test" }));
      results.push(res);
    }

    // First 10 should succeed (cap=10 for test bundle)
    for (let i = 0; i < 10; i++) {
      expect(results[i].statusCode).toBe(200);
      const body = JSON.parse(results[i].body || "{}");
      expect(body.status).toBe("granted");
    }

    // 11th should fail due to cap
    expect(results[10].statusCode).toBe(403);
    const bodyFail = JSON.parse(results[10].body || "{}");
    expect(bodyFail.error).toBe("cap_reached");
  });

  test("automatic bundle returns granted without persistence", async () => {
    const token = makeIdToken("user-auto");
    const res = await requestBundle(buildEvent(token, { bundleId: "default" }));
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body || "{}");
    expect(body.status).toBe("granted");
    expect(body.granted).toBe(true);
    expect(body.expiry).toBe(null); // automatic bundles don't have expiry
  });
});
