import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";

// We mirror the dynalite setup used by dynamoDbBundleStore.system.test.js
let stopDynalite;
/** @typedef {typeof import("../lib/bundleManagement.js")} BundleManagement */
/** @type {BundleManagement} */
let bm;

const tableName = "bundles-system-test-bm";

function base64UrlEncode(obj) {
  const json = JSON.stringify(obj);
  return Buffer.from(json).toString("base64").replace(/=+$/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function makeJWT(sub = "user-123", extra = {}) {
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

function buildEvent(token, authorizerContext = null, urlPath = null) {
  const event = {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  };

  if (authorizerContext) {
    event.requestContext = {
      authorizer: {
        lambda: authorizerContext,
      },
    };
  }

  if (urlPath) {
    event.requestContext = event.requestContext || {};
    event.requestContext.http = event.requestContext.http || {};
    event.requestContext.http.path = urlPath;
  }

  return event;
}

beforeAll(async () => {
  const { ensureBundleTableExists } = await import("../bin/dynamodb.js");
  const { default: dynalite } = await import("dynalite");

  // Start an isolated dynalite on a different port to avoid conflicts with
  // other system tests that may also use 8000.
  const host = "127.0.0.1";
  const port = 8001;
  const server = dynalite({ createTableMs: 0 });
  await new Promise((resolve, reject) => {
    server.listen(port, host, (err) => (err ? reject(err) : resolve(null)));
  });
  stopDynalite = async () => {
    try {
      server.close();
    } catch {}
  };
  const endpoint = `http://${host}:${port}`;

  // Minimal AWS SDK env for local usage with endpoint override
  process.env.AWS_REGION = process.env.AWS_REGION || "us-east-1";
  process.env.AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID || "dummy";
  process.env.AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY || "dummy";

  process.env.AWS_ENDPOINT_URL = endpoint;
  process.env.AWS_ENDPOINT_URL_DYNAMODB = endpoint;

  process.env.BUNDLE_DYNAMODB_TABLE_NAME = tableName;

  await ensureBundleTableExists(tableName, endpoint);

  // Import after env configured
  bm = await import("../lib/bundleManagement.js");
});

afterAll(async () => {
  try {
    await stopDynalite?.();
  } catch {
    // ignore
  }
});

beforeEach(() => {
  // Default: no mock mode for tests unless explicitly enabled in a test
  delete process.env.TEST_BUNDLE_MOCK;
});

describe("System: bundleManagement with local dynalite", () => {
  it("isMockMode should reflect TEST_BUNDLE_MOCK env", async () => {
    delete process.env.TEST_BUNDLE_MOCK;
    expect(bm.isMockMode()).toBe(false);

    process.env.TEST_BUNDLE_MOCK = "true";
    expect(bm.isMockMode()).toBe(true);

    process.env.TEST_BUNDLE_MOCK = "1";
    expect(bm.isMockMode()).toBe(true);

    process.env.TEST_BUNDLE_MOCK = "FALSE";
    expect(bm.isMockMode()).toBe(false);
  });

  it("getUserBundles should return [] initially (Dynamo mode)", async () => {
    const userId = "bm-sys-empty";
    const bundles = await bm.getUserBundles(userId);
    expect(Array.isArray(bundles)).toBe(true);
    expect(bundles.length).toBe(0);
  });

  it("updateUserBundles should add new bundles and getUserBundles should retrieve them (Dynamo mode)", async () => {
    const userId = "bm-sys-add";
    const expiry = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const bundlesToSet = [
      { bundleId: "guest", expiry },
      { bundleId: "test", expiry },
    ];

    await bm.updateUserBundles(userId, bundlesToSet);

    const after = await bm.getUserBundles(userId);
    const ids = after.map((b) => b.bundleId);
    expect(new Set(ids)).toEqual(new Set(["guest", "test"]));
  });

  it("updateUserBundles should remove bundles not present in next update (Dynamo mode)", async () => {
    const userId = "bm-sys-remove";
    const expiry = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    await bm.updateUserBundles(userId, [
      { bundleId: "guest", expiry },
      { bundleId: "test", expiry },
    ]);

    await bm.updateUserBundles(userId, [{ bundleId: "guest", expiry }]);

    const after = await bm.getUserBundles(userId);
    const ids = after.map((b) => b.bundleId);
    expect(ids).toContain("guest");
    expect(ids).not.toContain("test");
  });

  it("addBundles should append new entries and avoid duplicates (mock mode)", async () => {
    process.env.TEST_BUNDLE_MOCK = "true";
    const userId = "bm-mock-add";

    await bm.updateUserBundles(userId, []);
    let updated = await bm.addBundles(userId, ["BUNDLE_A"]);
    expect(updated).toEqual(["BUNDLE_A"]);

    // Try to add duplicate
    updated = await bm.addBundles(userId, ["BUNDLE_A", "BUNDLE_B"]);
    expect(updated).toEqual(["BUNDLE_A", "BUNDLE_B"]);

    const persisted = await bm.getUserBundles(userId);
    expect(persisted).toEqual(["BUNDLE_A", "BUNDLE_B"]);
  });

  it("removeBundles should remove by exact id and prefix matches (mock mode)", async () => {
    process.env.TEST_BUNDLE_MOCK = "true";
    const userId = "bm-mock-remove";
    // Note: mock store stores plain strings; include a variant with metadata suffix
    await bm.updateUserBundles(userId, ["BUNDLE_X", "BUNDLE_Y|EXP2026-01-01"]);

    const afterRemoval = await bm.removeBundles(userId, ["BUNDLE_X", "BUNDLE_Y"]);
    expect(afterRemoval).toEqual([]);
    const persisted = await bm.getUserBundles(userId);
    expect(persisted).toEqual([]);
  });

  it("enforceBundles should pass when no non-automatic bundles are required (unknown path)", async () => {
    const sub = "bm-auth-user";
    const token = makeJWT(sub);
    const authorizer = {
      jwt: {
        claims: {
          sub,
          "cognito:username": "u",
        },
      },
    };
    const event = buildEvent(token, authorizer, "/unknown/path");

    // Should not throw even if user has no bundles, because required = []
    await bm.enforceBundles(event);
  });

  it("enforceBundles should fail without a required bundle for HMRC paths, then pass after grant (Dynamo mode)", async () => {
    const sub = "bm-enforce-user";
    const token = makeJWT(sub);
    const authorizer = {
      jwt: {
        claims: {
          sub,
          "cognito:username": "u",
        },
      },
    };
    const hmrcPath = "/api/v1/hmrc/vat/return";
    const event = buildEvent(token, authorizer, hmrcPath);

    await expect(bm.enforceBundles(event)).rejects.toThrow();

    // Grant a qualifying bundle and try again
    const expiry = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    await bm.updateUserBundles(sub, [{ bundleId: "guest", expiry }]);

    await bm.enforceBundles(event); // should not throw now
  });
});
