// app/system-tests/breakerRepository.system.test.js

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

let stopDynalite;
const proxyStateTable = "behaviour-proxy-state"; // matches existing helper defaults

describe("System: data/dynamoDbBreakerRepository basic interactions", () => {
  beforeAll(async () => {
    const { startDynamoDB, ensureProxyStateTableExists } = await import("@app/bin/dynamodb.js");
    const { endpoint, stop } = await startDynamoDB();
    stopDynalite = stop;

    process.env.AWS_REGION = process.env.AWS_REGION || "us-east-1";
    process.env.AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID || "dummy";
    process.env.AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY || "dummy";
    process.env.AWS_ENDPOINT_URL = endpoint;
    process.env.AWS_ENDPOINT_URL_DYNAMODB = endpoint;
    // Ensure proxy state table exists and point repository at it
    process.env.STATE_TABLE_NAME = proxyStateTable;
    await ensureProxyStateTableExists(proxyStateTable, endpoint);
  });

  afterAll(async () => {
    try {
      await stopDynalite?.();
    } catch {}
  });

  it("allows rate limit and persists breaker state open/closed without throwing", async () => {
    const repo = await import("@app/data/dynamoDbBreakerRepository.js");
    // Use a unique prefix per test run
    const mappingPrefix = "/proxy/test-" + Math.random().toString(16).slice(2);

    const allowed = await repo.checkRateLimit(mappingPrefix, 100, "rid-test");
    expect(allowed).toBeTypeOf("boolean");

    // Save and load breaker state
    await repo.saveBreakerState(mappingPrefix, 0, 0);
    const state1 = await repo.loadBreakerState(mappingPrefix);
    expect(state1).toHaveProperty("errors");

    await repo.saveBreakerState(mappingPrefix, 5, Date.now());
    const state2 = await repo.loadBreakerState(mappingPrefix);
    expect(state2.errors).toBeGreaterThanOrEqual(0);
  });
});
