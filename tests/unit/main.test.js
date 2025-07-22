import {describe, test, expect, beforeEach} from "vitest";
import * as mainModule from "@src/lib/main.js";
import { main } from "@src/lib/main.js";
import dotenv from 'dotenv';

dotenv.config({ path: '.env.test' });

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
    process.argv = ["node", "src/lib/main.js"];
    main();
  });
});
