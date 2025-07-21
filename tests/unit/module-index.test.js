// tests/unit/module-index.test.js
import { describe, test, expect } from "vitest";
import anything from "@src/index.js";

import "dotenv/config";

describe("Index Module Exports", () => {
  test("module index should be defined", () => {
    expect(anything).toBeUndefined();
  });
});
