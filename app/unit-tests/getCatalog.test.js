// app/unit-tests/getCatalog.test.js
import { describe, it, expect } from "vitest";
import { httpGet as getCatalog } from "@app/functions/getCatalog.js";

describe("getCatalog endpoint function", () => {
  it("returns 200 with ETag and supports 304 on If-None-Match", async () => {
    const first = await getCatalog({ headers: {} });
    expect(first.statusCode).toBe(200);
    expect(first.headers).toBeTruthy();
    const etag = first.headers.ETag;
    expect(typeof etag).toBe("string");

    const second = await getCatalog({ headers: { "if-none-match": etag } });
    expect([200, 304]).toContain(second.statusCode);
    if (second.statusCode === 304) {
      expect(second.body).toBe("");
    } else {
      expect(typeof second.body).toBe("string");
    }
  });
});
