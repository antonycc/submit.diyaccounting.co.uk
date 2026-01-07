// app/unit-tests/services/subHasher.test.js

import { describe, test, expect, beforeAll, afterAll, beforeEach } from "vitest";
import crypto from "crypto";
import { hashSub, _setTestSalt, _clearSalt, initializeSalt, isSaltInitialized } from "@app/services/subHasher.js";

const TEST_SALT = "test-salt-for-unit-tests";

describe("subHasher.js", () => {
  beforeAll(() => {
    process.env.NODE_ENV = "test";
    _setTestSalt(TEST_SALT);
  });

  afterAll(() => {
    _clearSalt();
  });

  test("should hash a sub claim to a 64-character hex string", () => {
    const sub = "user-12345";
    const hashed = hashSub(sub);

    expect(hashed).toBeDefined();
    expect(typeof hashed).toBe("string");
    expect(hashed).toMatch(/^[a-f0-9]{64}$/); // HMAC-SHA256 produces 64 hex characters
  });

  test("should produce consistent hashes for the same input with same salt", () => {
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

  test("should produce different hash than unsalted SHA-256", () => {
    const sub = "user-12345";
    const saltedHash = hashSub(sub);
    const unsaltedHash = crypto.createHash("sha256").update(sub).digest("hex");

    expect(saltedHash).not.toBe(unsaltedHash);
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

  test("should throw error if salt not initialized", () => {
    _clearSalt();
    expect(() => hashSub("test")).toThrow("Salt not initialized");
    _setTestSalt(TEST_SALT); // restore for other tests
  });

  test("should report salt initialization status correctly", () => {
    expect(isSaltInitialized()).toBe(true);
    _clearSalt();
    expect(isSaltInitialized()).toBe(false);
    _setTestSalt(TEST_SALT);
    expect(isSaltInitialized()).toBe(true);
  });
});

describe("subHasher.js - initializeSalt", () => {
  beforeEach(() => {
    process.env.NODE_ENV = "test";
    _clearSalt();
  });

  afterAll(() => {
    _setTestSalt(TEST_SALT);
  });

  test("should initialize salt from USER_SUB_HASH_SALT environment variable", async () => {
    const envSalt = "env-var-salt-value";
    process.env.USER_SUB_HASH_SALT = envSalt;

    await initializeSalt();

    expect(isSaltInitialized()).toBe(true);
    // Verify the salt was used by checking hash is deterministic
    const hash1 = hashSub("test-sub");
    const hash2 = hashSub("test-sub");
    expect(hash1).toBe(hash2);

    delete process.env.USER_SUB_HASH_SALT;
  });

  test("should not reinitialize if salt already set", async () => {
    process.env.USER_SUB_HASH_SALT = "first-salt";
    await initializeSalt();
    const hash1 = hashSub("test-sub");

    process.env.USER_SUB_HASH_SALT = "second-salt";
    await initializeSalt(); // Should be no-op
    const hash2 = hashSub("test-sub");

    // Hash should be same because salt wasn't re-initialized
    expect(hash1).toBe(hash2);

    delete process.env.USER_SUB_HASH_SALT;
  });
});

describe("subHasher.js - test helpers", () => {
  beforeAll(() => {
    process.env.NODE_ENV = "test";
  });

  test("_setTestSalt should only work in test environment", () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";

    expect(() => _setTestSalt("test")).toThrow("_setTestSalt can only be used in test environment");

    process.env.NODE_ENV = originalEnv;
  });

  test("_clearSalt should only work in test environment", () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";

    expect(() => _clearSalt()).toThrow("_clearSalt can only be used in test environment");

    process.env.NODE_ENV = originalEnv;
  });
});
