// app/system-tests/accountCatalog.system.test.js

import { describe, it, expect } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { buildLambdaEvent } from "@app/test-helpers/eventBuilders.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

describe("System: account/catalogGet", () => {
  it("returns the product catalog JSON", async () => {
    const { handler } = await import("@app/functions/account/catalogGet.js");
    const event = buildLambdaEvent({ method: "GET", path: "/api/v1/catalog" });
    const res = await handler(event);
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toHaveProperty("bundles");
  });

  it("HEAD returns 200 with empty body", async () => {
    const { handler } = await import("@app/functions/account/catalogGet.js");
    const event = buildLambdaEvent({ method: "HEAD", path: "/api/v1/catalog" });
    const res = await handler(event);
    expect(res.statusCode).toBe(200);
  });
});
