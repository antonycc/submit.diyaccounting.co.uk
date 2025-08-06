// app/unit-tests/main.test.js

import { describe, test, expect, beforeEach } from "vitest";
import dotenv from "dotenv";

import * as mainModule from "@app/bin/main.js";
import { main } from "@app/bin/main.js";

dotenv.config({ path: ".env.test" });

describe("Main Module Import", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
    };
  });

  test("should be non-null", () => {
    expect(mainModule).not.toBeNull();
  });
});

describe("Main Output", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
    };
  });

  test("should terminate without error", () => {
    process.argv = ["node", "app/bin/main.js"];
    main();
  });
});
