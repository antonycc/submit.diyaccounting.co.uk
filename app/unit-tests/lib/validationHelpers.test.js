// app/unit-tests/lib/validationHelpers.test.js

import { describe, test, expect } from "vitest";
import {
  isValidPeriodKey,
  isValidVRN,
  validateISODate,
  validateDateRange,
  PERIOD_KEY_PATTERN,
  VRN_PATTERN,
  ISO_DATE_PATTERN,
} from "@app/lib/validationHelpers.js";

describe("validationHelpers", () => {
  describe("Period Key Validation", () => {
    test("accepts valid quarterly format #001", () => {
      expect(isValidPeriodKey("#001")).toBe(true);
      expect(isValidPeriodKey("#002")).toBe(true);
      expect(isValidPeriodKey("#003")).toBe(true);
      expect(isValidPeriodKey("#004")).toBe(true);
    });

    test("accepts valid YYAD format 24A1", () => {
      expect(isValidPeriodKey("24A1")).toBe(true);
      expect(isValidPeriodKey("24A2")).toBe(true);
      expect(isValidPeriodKey("25B1")).toBe(true);
      expect(isValidPeriodKey("23C4")).toBe(true);
    });

    test("is case insensitive", () => {
      expect(isValidPeriodKey("24a1")).toBe(true);
      expect(isValidPeriodKey("24A1")).toBe(true);
    });

    test("rejects invalid formats", () => {
      expect(isValidPeriodKey("INVALID")).toBe(false);
      expect(isValidPeriodKey("2024A1")).toBe(false);
      expect(isValidPeriodKey("24")).toBe(false);
      expect(isValidPeriodKey("A1")).toBe(false);
      expect(isValidPeriodKey("#1")).toBe(false);
      expect(isValidPeriodKey("#12")).toBe(false);
      expect(isValidPeriodKey("24AA")).toBe(false);
    });

    test("handles null, undefined, empty string", () => {
      expect(isValidPeriodKey(null)).toBe(false);
      expect(isValidPeriodKey(undefined)).toBe(false);
      expect(isValidPeriodKey("")).toBe(false);
    });
  });

  describe("VRN Validation", () => {
    test("accepts valid 9-digit VRN", () => {
      expect(isValidVRN("123456789")).toBe(true);
      expect(isValidVRN("111222333")).toBe(true);
      expect(isValidVRN("987654321")).toBe(true);
    });

    test("rejects non-9-digit VRN", () => {
      expect(isValidVRN("12345678")).toBe(false);
      expect(isValidVRN("1234567890")).toBe(false);
      expect(isValidVRN("12345")).toBe(false);
    });

    test("rejects VRN with letters", () => {
      expect(isValidVRN("12345678A")).toBe(false);
      expect(isValidVRN("A12345678")).toBe(false);
      expect(isValidVRN("12345A789")).toBe(false);
    });

    test("handles null, undefined, empty string", () => {
      expect(isValidVRN(null)).toBe(false);
      expect(isValidVRN(undefined)).toBe(false);
      expect(isValidVRN("")).toBe(false);
    });

    test("handles numeric input", () => {
      expect(isValidVRN(123456789)).toBe(true);
    });
  });

  describe("ISO Date Validation", () => {
    test("accepts valid dates", () => {
      const result = validateISODate("2024-01-01");
      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    test("accepts leap year dates", () => {
      const result = validateISODate("2024-02-29");
      expect(result.isValid).toBe(true);
    });

    test("rejects invalid format", () => {
      const result = validateISODate("2024/01/01");
      expect(result.isValid).toBe(false);
      expect(result.error).toContain("format");
    });

    test("rejects invalid dates like Feb 30", () => {
      const result = validateISODate("2024-02-30");
      expect(result.isValid).toBe(false);
      expect(result.error).toContain("does not exist");
    });

    test("rejects invalid dates like 13th month", () => {
      const result = validateISODate("2024-13-01");
      expect(result.isValid).toBe(false);
      expect(result.error).toContain("does not exist");
    });

    test("rejects non-leap year Feb 29", () => {
      const result = validateISODate("2023-02-29");
      expect(result.isValid).toBe(false);
      expect(result.error).toContain("does not exist");
    });

    test("handles null, undefined, empty string", () => {
      expect(validateISODate(null).isValid).toBe(false);
      expect(validateISODate(undefined).isValid).toBe(false);
      expect(validateISODate("").isValid).toBe(false);
    });
  });

  describe("Date Range Validation", () => {
    test("accepts valid date range", () => {
      const result = validateDateRange("2024-01-01", "2024-12-31");
      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    test("accepts same from and to dates", () => {
      const result = validateDateRange("2024-01-01", "2024-01-01");
      expect(result.isValid).toBe(true);
    });

    test("rejects from > to", () => {
      const result = validateDateRange("2024-12-31", "2024-01-01");
      expect(result.isValid).toBe(false);
      expect(result.error).toContain("cannot be after");
    });

    test("rejects invalid from date", () => {
      const result = validateDateRange("2024-02-30", "2024-12-31");
      expect(result.isValid).toBe(false);
      expect(result.error).toContain("from date");
    });

    test("rejects invalid to date", () => {
      const result = validateDateRange("2024-01-01", "2024-13-01");
      expect(result.isValid).toBe(false);
      expect(result.error).toContain("to date");
    });
  });

  describe("Pattern Exports", () => {
    test("PERIOD_KEY_PATTERN is defined and is a RegExp", () => {
      expect(PERIOD_KEY_PATTERN).toBeInstanceOf(RegExp);
    });

    test("VRN_PATTERN is defined and is a RegExp", () => {
      expect(VRN_PATTERN).toBeInstanceOf(RegExp);
    });

    test("ISO_DATE_PATTERN is defined and is a RegExp", () => {
      expect(ISO_DATE_PATTERN).toBeInstanceOf(RegExp);
    });
  });
});
