// app/system-tests/asyncRequestPersistence.system.test.js

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { buildLambdaEvent, makeIdToken } from "@app/test-helpers/eventBuilders.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

let stopDynalite;
const asyncRequestsTableName = "sys-test-async-requests";
const bundlesTableName = "sys-test-bundles-async";

describe("System: async request persistence with dynalite", () => {
  beforeAll(async () => {
    const { ensureAsyncRequestsTableExists, ensureBundleTableExists, startDynamoDB } = await import("@app/bin/dynamodb.js");

    // Use a random free port to avoid collisions with other suites
    process.env.DYNAMODB_PORT = "0";

    const { endpoint, stop } = await startDynamoDB();
    stopDynalite = stop;

    process.env.AWS_REGION = process.env.AWS_REGION || "us-east-1";
    process.env.AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID || "dummy";
    process.env.AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY || "dummy";
    process.env.AWS_ENDPOINT_URL = endpoint;
    process.env.AWS_ENDPOINT_URL_DYNAMODB = endpoint;
    process.env.ASYNC_REQUESTS_DYNAMODB_TABLE_NAME = asyncRequestsTableName;
    process.env.BUNDLE_DYNAMODB_TABLE_NAME = bundlesTableName;

    await ensureAsyncRequestsTableExists(asyncRequestsTableName, endpoint);
    await ensureBundleTableExists(bundlesTableName, endpoint);
  });

  afterAll(async () => {
    try {
      await stopDynalite?.();
    } catch {}
  });

  beforeEach(async () => {
    // Seed bundles: grant 'guest' to test-async-user
    const { updateUserBundles } = await import("@app/services/bundleManagement.js");
    const expiry = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    await updateUserBundles("test-async-user", [{ bundleId: "guest", expiry }]);
  });

  it("stores pending request state for async processing", async () => {
    const { handler } = await import("@app/functions/account/bundleGet.js");
    const token = makeIdToken("test-async-user");
    const requestId = "async-test-request-1";
    
    const event = buildLambdaEvent({
      method: "GET",
      path: "/api/v1/bundle",
      headers: {
        Authorization: `Bearer ${token}`,
        "x-request-id": requestId,
        "x-wait-time-ms": "50", // Very short wait to trigger async processing
      },
    });

    const res = await handler(event);

    // Should return 202 for async processing, or 200 if it completed very quickly
    expect([200, 202]).toContain(res.statusCode);
    
    if (res.statusCode === 202) {
      const body = JSON.parse(res.body);
      expect(body.message).toBe("Request accepted for processing");
    } else {
      const body = JSON.parse(res.body);
      expect(Array.isArray(body.bundles)).toBe(true);
    }

    // Verify request was stored in DynamoDB
    const { getAsyncRequest } = await import("@app/data/dynamoDbAsyncRequestRepository.js");
    const storedRequest = await getAsyncRequest("test-async-user", requestId);
    expect(storedRequest).not.toBeNull();
    expect(["pending", "completed"]).toContain(storedRequest.status);
  });

  it("retrieves completed request from persistence after waiting", async () => {
    const { handler } = await import("@app/functions/account/bundleGet.js");
    const token = makeIdToken("test-async-user");
    const requestId = "async-test-request-2";

    const event = buildLambdaEvent({
      method: "GET",
      path: "/api/v1/bundle",
      headers: {
        Authorization: `Bearer ${token}`,
        "x-request-id": requestId,
        "x-wait-time-ms": "2000", // Wait 2 seconds to allow async completion
      },
    });

    const res = await handler(event);

    // Should either return 200 with bundles or 202 if still processing
    expect([200, 202]).toContain(res.statusCode);
    
    if (res.statusCode === 200) {
      const body = JSON.parse(res.body);
      expect(Array.isArray(body.bundles)).toBe(true);
    }

    // Verify request was stored in DynamoDB
    const { getAsyncRequest } = await import("@app/data/dynamoDbAsyncRequestRepository.js");
    const storedRequest = await getAsyncRequest("test-async-user", requestId);
    expect(storedRequest).not.toBeNull();
  });

  it("returns synchronous response when no wait header is provided", async () => {
    const { handler } = await import("@app/functions/account/bundleGet.js");
    const token = makeIdToken("test-async-user");
    const requestId = "sync-test-request-1";

    const event = buildLambdaEvent({
      method: "GET",
      path: "/api/v1/bundle",
      headers: {
        Authorization: `Bearer ${token}`,
        "x-request-id": requestId,
      },
    });

    const res = await handler(event);

    // Should return 200 immediately for synchronous processing
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(Array.isArray(body.bundles)).toBe(true);
    expect(body.bundles.length).toBeGreaterThanOrEqual(0);
  });

  it("stores completed bundles in async request state", async () => {
    const { retrieveUserBundles } = await import("@app/functions/account/bundleGet.js");
    const requestId = "retrieve-test-request-1";

    // Call retrieveUserBundles directly with requestId
    const bundles = await retrieveUserBundles("test-async-user", requestId);
    expect(Array.isArray(bundles)).toBe(true);

    // Verify the result was stored
    const { getAsyncRequest } = await import("@app/data/dynamoDbAsyncRequestRepository.js");
    const storedRequest = await getAsyncRequest("test-async-user", requestId);
    expect(storedRequest).not.toBeNull();
    expect(storedRequest.status).toBe("completed");
    expect(storedRequest.data).toHaveProperty("bundles");
    expect(Array.isArray(storedRequest.data.bundles)).toBe(true);
  });

  it("handles missing async requests table gracefully", async () => {
    // Temporarily disable the async requests table
    const originalTableName = process.env.ASYNC_REQUESTS_DYNAMODB_TABLE_NAME;
    delete process.env.ASYNC_REQUESTS_DYNAMODB_TABLE_NAME;

    try {
      const { handler } = await import("@app/functions/account/bundleGet.js");
      const token = makeIdToken("test-async-user");

      const event = buildLambdaEvent({
        method: "GET",
        path: "/api/v1/bundle",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const res = await handler(event);

      // Should still work without async table (synchronous mode)
      expect(res.statusCode).toBe(200);
    } finally {
      // Restore the table name
      process.env.ASYNC_REQUESTS_DYNAMODB_TABLE_NAME = originalTableName;
    }
  });
});
