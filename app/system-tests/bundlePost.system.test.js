// app/system-tests/bundlePost.system.test.js

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { buildLambdaEvent, makeIdToken } from "@app/test-helpers/eventBuilders.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

let stopDynalite;
const bundlesTableName = "sys-bundlepost-bundles";

describe("System: account/bundlePost high-level behaviours", () => {
  beforeAll(async () => {
    const { ensureBundleTableExists, startDynamoDB } = await import("@app/bin/dynamodb.js");
    process.env.DYNAMODB_PORT = "0"; // random free port to avoid conflicts
    const { endpoint, stop } = await startDynamoDB();
    stopDynalite = stop;

    process.env.AWS_REGION = process.env.AWS_REGION || "us-east-1";
    process.env.AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID || "dummy";
    process.env.AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY || "dummy";
    process.env.AWS_ENDPOINT_URL = endpoint;
    process.env.AWS_ENDPOINT_URL_DYNAMODB = endpoint;
    process.env.BUNDLE_DYNAMODB_TABLE_NAME = bundlesTableName;

    await ensureBundleTableExists(bundlesTableName, endpoint);
  });

  afterAll(async () => {
    try {
      await stopDynalite?.();
    } catch {}
  });

  beforeEach(async () => {
    vi.resetAllMocks();
  });

  it("returns 401 when Authorization header is missing", async () => {
    const { handler } = await import("@app/functions/account/bundlePost.js");
    const event = buildLambdaEvent({ method: "POST", path: "/api/v1/bundle", body: { bundleId: "guest" } });
    // Remove Authorization header entirely
    delete event.headers.Authorization;
    delete event.headers.authorization;
    const res = await handler(event);
    expect(res.statusCode).toBe(401);
  });

  it("returns 400 for invalid JSON body", async () => {
    const { handler } = await import("@app/functions/account/bundlePost.js");
    const token = makeIdToken("test-sub");
    const event = buildLambdaEvent({ method: "POST", path: "/api/v1/bundle", headers: { Authorization: `Bearer ${token}` } });
    // Force invalid JSON
    event.body = "{not-json";
    const res = await handler(event);
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toMatch(/Invalid JSON/i);
  });

  it("returns 400 when bundleId is missing", async () => {
    const { handler } = await import("@app/functions/account/bundlePost.js");
    const token = makeIdToken("test-sub");
    const event = buildLambdaEvent({ method: "POST", path: "/api/v1/bundle", headers: { Authorization: `Bearer ${token}` }, body: {} });
    const res = await handler(event);
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toMatch(/Missing bundleId/i);
  });

  it("returns already_granted when user already has the bundle", async () => {
    const { handler } = await import("@app/functions/account/bundlePost.js");
    const { updateUserBundles } = await import("@app/services/bundleManagement.js");
    const token = makeIdToken("test-sub");
    const expiry = new Date(Date.now() + 3600_000).toISOString();
    await updateUserBundles("test-sub", [{ bundleId: "guest", expiry }]);
    const event = buildLambdaEvent({
      method: "POST",
      path: "/api/v1/bundle",
      headers: { Authorization: `Bearer ${token}` },
      body: { bundleId: "guest" },
    });
    const res = await handler(event);
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe("already_granted");
    expect(body.granted).toBe(false);
  });

  it("returns 400 unknown_qualifier when unexpected qualifier is provided", async () => {
    const { handler } = await import("@app/functions/account/bundlePost.js");
    const token = makeIdToken("qual-user");
    const event = buildLambdaEvent({
      method: "POST",
      path: "/api/v1/bundle",
      headers: { Authorization: `Bearer ${token}` },
      body: { bundleId: "guest", qualifiers: { foo: "bar" } },
    });
    const res = await handler(event);
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toBe("unknown_qualifier");
  });

  it("grants an automatic bundle when user does not already have it (fresh user)", async () => {
    const { handler } = await import("@app/functions/account/bundlePost.js");
    const token = makeIdToken("grant-user");
    const event = buildLambdaEvent({
      method: "POST",
      path: "/api/v1/bundle",
      headers: { Authorization: `Bearer ${token}` },
      body: { bundleId: "guest" },
    });
    const res = await handler(event);
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe("granted");
    expect(body.granted).toBe(true);
  });
});
