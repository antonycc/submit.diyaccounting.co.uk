// app/unit-tests/services/httpProxy.test.js
import { describe, test, beforeEach, afterEach, expect, vi } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

// Simple DynamoDB client mocks used by helper library
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

describe("proxyHelper lib", () => {
  let helper;
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    mockState = {};
    process.env.STATE_TABLE_NAME = "test-proxy-state-table";
    process.env.NODE_ENV = "test";
    delete process.env.PROXY_RATE_LIMIT_STORE;
    helper = await import("@app/services/httpProxy.js");
  });

  //afterEach(() => {
  //vi.useRealTimers();
  //});

  function makeRequestImpl(callsArray, responses) {
    let i = 0;
    return async (url, options, body) => {
      callsArray.push({ url: new URL(url.toString()), options: { ...options, headers: { ...(options.headers || {}) } }, body });
      const resp = responses[i] || responses[responses.length - 1];
      i += 1;
      return resp;
    };
  }

  test("proxyRequestWithRedirects follows 301 absolute and strips auth when origin changes", async () => {
    const calls = [];
    const responses = [
      { statusCode: 301, headers: { location: "https://other.example.com/final" }, body: "" },
      { statusCode: 200, headers: { "content-type": "application/json" }, body: '{"ok":true}' },
    ];
    const requestImpl = makeRequestImpl(calls, responses);

    const url = new URL("https://up.example.com/redirect");
    const options = { method: "GET", headers: { authorization: "Bearer X", host: "up.example.com" } };
    const resp = await helper.proxyRequestWithRedirects(url, options, undefined, requestImpl);
    expect(resp.statusCode).toBe(200);

    // Verify second call had Host updated and no Authorization header
    expect(calls.length).toBe(2);
    const [, secondCall] = calls;
    expect(secondCall.url.toString()).toBe("https://other.example.com/final");
    expect(secondCall.options.headers.host).toBe("other.example.com");
    expect(secondCall.options.headers.authorization).toBeUndefined();
  });

  test("proxyRequestWithRedirects converts 303 to GET and drops body", async () => {
    const calls = [];
    const responses = [
      { statusCode: 303, headers: { location: "/final" }, body: "" },
      { statusCode: 200, headers: {}, body: "done" },
    ];
    const requestImpl = makeRequestImpl(calls, responses);

    const url = new URL("https://ex.example.com/start");
    const options = { method: "POST", headers: { "host": "ex.example.com", "content-length": "10", "content-type": "application/json" } };
    const resp = await helper.proxyRequestWithRedirects(url, options, '{"a":1}', requestImpl);
    expect(resp.statusCode).toBe(200);
    // Second hop should be GET with no body
    const [, second] = calls;
    expect(second.url.toString()).toBe("https://ex.example.com/final");
    expect((second.options.method || "").toUpperCase()).toBe("GET");
    expect(second.body).toBeUndefined();
  });

  test("returns 508 after too many redirects", async () => {
    const calls = [];
    const responses = [];
    for (let i = 0; i < 7; i++) {
      responses.push({ statusCode: i % 2 === 0 ? 301 : 302, headers: { location: "/next" }, body: "" });
    }
    const requestImpl = makeRequestImpl(calls, responses);
    const resp = await helper.proxyRequestWithRedirects(
      new URL("https://l.example.com/loop"),
      { method: "GET", headers: { host: "l.example.com" } },
      undefined,
      requestImpl,
    );
    expect(resp.statusCode).toBe(508);
  });
});
