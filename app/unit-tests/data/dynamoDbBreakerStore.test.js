// app/unit-tests/data/dynamoDbBreakerStore.test.js
import { describe, test, beforeEach, expect, vi, afterEach } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

let mockState;
let mockSend;

vi.mock("@aws-sdk/client-dynamodb", () => {
  mockSend = vi.fn(async (command) => {
    const name = command.constructor.name;
    if (name === "GetItemCommand") {
      const key = command.input.Key.stateKey.S;
      const item = mockState[key];
      return item ? { Item: item } : {};
    }
    if (name === "PutItemCommand") {
      const key = command.input.Item.stateKey.S;
      mockState[key] = command.input.Item;
      return {};
    }
    return {};
  });
  class DynamoDBClient {
    send(cmd) {
      return mockSend(cmd);
    }
  }
  class GetItemCommand {
    constructor(input) {
      this.input = input;
    }
  }
  class PutItemCommand {
    constructor(input) {
      this.input = input;
    }
  }
  return { DynamoDBClient, GetItemCommand, PutItemCommand };
});

vi.mock("@aws-sdk/util-dynamodb", () => ({
  unmarshall: (item) => {
    const out = {};
    for (const [k, v] of Object.entries(item || {})) {
      if (v.S !== undefined) out[k] = v.S;
      else if (v.N !== undefined) out[k] = Number(v.N);
    }
    return out;
  },
  marshall: (obj) => {
    const out = {};
    for (const [k, v] of Object.entries(obj || {})) {
      if (typeof v === "number") out[k] = { N: String(v) };
      else if (typeof v === "string") out[k] = { S: v };
    }
    return out;
  },
}));

describe("dynamoDbBreakerStore", () => {
  let store;
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    mockState = {};
    process.env.STATE_TABLE_NAME = "test-proxy-state-table";
    process.env.NODE_ENV = "test";
    delete process.env.PROXY_RATE_LIMIT_STORE;
    store = await import("@app/data/dynamoDbBreakerRepository.js");
  });

  test("checkRateLimit returns true in test mode when not using dynamo store", async () => {
    const ok = await store.checkRateLimit("key", 1, "req1");
    expect(ok).toBe(true);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("checkRateLimit uses dynamo store when configured", async () => {
    process.env.PROXY_RATE_LIMIT_STORE = "dynamo";
    // Keep time stable within same second
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-01T00:00:00Z"));
    const r1 = await store.checkRateLimit("k", 2, "r");
    const r2 = await store.checkRateLimit("k", 2, "r");
    const r3 = await store.checkRateLimit("k", 2, "r");
    expect(r1).toBe(true);
    expect(r2).toBe(true);
    expect(r3).toBe(false);
  });

  test("checkRateLimit returns true in test mode when not using dynamo store", async () => {
    const ok = await store.checkRateLimit("key", 1, "req1");
    expect(ok).toBe(true);
  });

  test("checkRateLimit uses dynamo store when configured", async () => {
    process.env.PROXY_RATE_LIMIT_STORE = "dynamo";
    // Keep time stable within same second
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-01T00:00:00Z"));
    const r1 = await store.checkRateLimit("k", 2, "r");
    const r2 = await store.checkRateLimit("k", 2, "r");
    const r3 = await store.checkRateLimit("k", 2, "r");
    expect(r1).toBe(true);
    expect(r2).toBe(true);
    expect(r3).toBe(false);
  });

  test("loadBreakerState returns defaults when no item", async () => {
    const state = await store.loadBreakerState("prefix");
    expect(state).toEqual({ errors: 0, openSince: 0 });
  });

  test("saveBreakerState persists and loadBreakerState reads it back", async () => {
    await store.saveBreakerState("p", 7, 98765);
    const state = await store.loadBreakerState("p");
    expect(state.errors).toBe(7);
    expect(state.openSince).toBe(98765);
  });
});
