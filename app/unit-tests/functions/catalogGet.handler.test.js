// app/unit-tests/catalogGet.handler.test.js
import { describe, test, expect } from "vitest";
import { handler as catalogGet } from "@app/functions/account/catalogGet.js";

function buildEvent() {
  return {
    headers: { host: "localhost" },
  };
}

describe("catalogGet.handler", () => {
  test("returns 200 with bundles array including 'test' bundle", async () => {
    const res = await catalogGet(buildEvent());
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(Array.isArray(body.bundles)).toBe(true);
    expect(body.bundles.some((b) => b.id === "test")).toBe(true);
  });
});
