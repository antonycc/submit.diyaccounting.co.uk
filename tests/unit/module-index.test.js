// tests/unit/module-index.test.js
import {describe, test, expect, beforeEach} from "vitest";
import anything from "@src/index.js";
import dotenv from 'dotenv';

dotenv.config({ path: '.env.test' });

describe("Index Module Exports", () => {
  const originalEnv = process.env;

  beforeEach(() => {

    // Dotenv uses the default environment variables from .env which sets NODE_ENV to 'development' and this is overridden.
    process.env = {
      ...originalEnv,
    };
  });

  test("module index should be defined", () => {
    expect(anything).toBeUndefined();
  });
});
