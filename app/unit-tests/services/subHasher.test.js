// app/unit-tests/services/subHasher.test.js

import { describe, test, expect } from "vitest";
import { hashSub } from "@app/services/subHasher.js";

describe("subHasher.js", () => {
  test("should hash a sub claim to a hex string", () => {
    const sub = "user-12345";
    const hashed = hashSub(sub);

    expect(hashed).toBeDefined();
    expect(typeof hashed).toBe("string");
    expect(hashed).toMatch(/^[a-f0-9]{64}$/); // SHA-256 produces 64 hex characters
  });

  test("should produce consistent hashes for the same input", () => {
    const sub = "user-12345";
    const hash1 = hashSub(sub);
    const hash2 = hashSub(sub);

    expect(hash1).toBe(hash2);
  });

  test("should produce different hashes for different inputs", () => {
    const sub1 = "user-12345";
    const sub2 = "user-67890";
    const hash1 = hashSub(sub1);
    const hash2 = hashSub(sub2);

    expect(hash1).not.toBe(hash2);
  });

  test("should throw error for empty string", () => {
    expect(() => hashSub("")).toThrow("Invalid sub");
  });

  test("should throw error for null", () => {
    expect(() => hashSub(null)).toThrow("Invalid sub");
  });

  test("should throw error for undefined", () => {
    expect(() => hashSub(undefined)).toThrow("Invalid sub");
  });

  test("should throw error for non-string", () => {
    expect(() => hashSub(12345)).toThrow("Invalid sub");
  });
});
