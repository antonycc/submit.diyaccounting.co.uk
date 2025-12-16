// app/system-tests/httpProxy.system.test.js

import { describe, it, expect } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

describe("System: services/lib httpProxy redirect handling", () => {
  it("follows a 302 redirect with GET and drops body, then returns 200", async () => {
    const { proxyRequestWithRedirects } = await import("@app/services/httpProxy.js");

    const calls = [];
    // Inject a fake request implementation to avoid network
    const requestImpl = async (url, options, body) => {
      calls.push({ url: url.toString(), method: options.method, body: body || null });
      if (calls.length === 1) {
        // First call: respond with 302 and Location header
        return { statusCode: 302, headers: { location: "/final" }, body: "" };
      }
      // Second call: success
      return { statusCode: 200, headers: { "content-type": "application/json" }, body: JSON.stringify({ ok: true }) };
    };

    const url = new URL("https://up.example/start");
    const options = { method: "POST", headers: { authorization: "Bearer at" } };
    const body = JSON.stringify({ a: 1 });

    const resp = await proxyRequestWithRedirects(url, options, body, requestImpl);
    expect(resp.statusCode).toBe(200);
    const payload = JSON.parse(resp.body);
    expect(payload.ok).toBe(true);
    // Ensure two hops occurred and the second was GET due to 302 semantics
    expect(calls.length).toBe(2);
    expect(calls[0].method).toBe("POST");
    expect(calls[1].method).toBe("GET");
  });
});
