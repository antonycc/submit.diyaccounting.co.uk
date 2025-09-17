// app/unit-tests/validation.test.js

import { describe, it, expect } from "vitest";
import { 
  validateVrn, 
  validatePeriodKey, 
  validateVatAmount, 
  validateSubmissionParams 
} from "@app/lib/validation.js";

describe("validateVrn", () => {
  it("should validate correct VRN with valid checksum", () => {
    const result = validateVrn("193054638"); // Valid VRN with correct checksum
    expect(result.isValid).toBe(true);
    expect(result.message).toBe("Valid VRN");
  });

  it("should reject VRN with invalid checksum", () => {
    const result = validateVrn("193054661"); // Invalid checksum
    expect(result.isValid).toBe(false);
    expect(result.message).toContain("checksum validation failed");
  });

  it("should reject VRN that is too short", () => {
    const result = validateVrn("12345678");
    expect(result.isValid).toBe(false);
    expect(result.message).toContain("must be exactly 9 digits");
  });

  it("should reject VRN that is too long", () => {
    const result = validateVrn("1234567890");
    expect(result.isValid).toBe(false);
    expect(result.message).toContain("must be exactly 9 digits");
  });

  it("should reject VRN with non-numeric characters", () => {
    const result = validateVrn("19305466A");
    expect(result.isValid).toBe(false);
    expect(result.message).toContain("must be exactly 9 digits");
  });

  it("should reject empty VRN", () => {
    const result = validateVrn("");
    expect(result.isValid).toBe(false);
    expect(result.message).toBe("VRN is required");
  });

  it("should reject null VRN", () => {
    const result = validateVrn(null);
    expect(result.isValid).toBe(false);
    expect(result.message).toBe("VRN is required");
  });

  it("should handle VRN with spaces", () => {
    const result = validateVrn("193 054 638"); // Valid VRN with spaces
    expect(result.isValid).toBe(true);
    expect(result.message).toBe("Valid VRN");
  });
});

describe("validatePeriodKey", () => {
  it("should validate quarterly period keys", () => {
    expect(validatePeriodKey("24A1").isValid).toBe(true);
    expect(validatePeriodKey("24A2").isValid).toBe(true);
    expect(validatePeriodKey("24A3").isValid).toBe(true);
    expect(validatePeriodKey("24A4").isValid).toBe(true);
  });

  it("should validate annual period key", () => {
    expect(validatePeriodKey("24AA").isValid).toBe(true);
  });

  it("should handle lowercase input", () => {
    const result = validatePeriodKey("24a1");
    expect(result.isValid).toBe(true);
  });

  it("should reject invalid quarter numbers", () => {
    const result = validatePeriodKey("24A5");
    expect(result.isValid).toBe(false);
    expect(result.message).toContain("must be A1, A2, A3, or A4");
  });

  it("should reject invalid format", () => {
    const result = validatePeriodKey("2024A1");
    expect(result.isValid).toBe(false);
    expect(result.message).toContain("must be in format like");
  });

  it("should reject unreasonable years", () => {
    const result = validatePeriodKey("05A1"); // Too old
    expect(result.isValid).toBe(false);
    expect(result.message).toContain("year 5 seems invalid");
  });

  it("should reject empty period key", () => {
    const result = validatePeriodKey("");
    expect(result.isValid).toBe(false);
    expect(result.message).toBe("Period key is required");
  });

  it("should accept current and near-future years", () => {
    const currentYear = new Date().getFullYear() % 100;
    expect(validatePeriodKey(`${currentYear}A1`).isValid).toBe(true);
    expect(validatePeriodKey(`${currentYear + 1}A1`).isValid).toBe(true);
  });
});

describe("validateVatAmount", () => {
  it("should validate positive decimal amounts", () => {
    const result = validateVatAmount("1000.50");
    expect(result.isValid).toBe(true);
    expect(result.parsedValue).toBe(1000.50);
  });

  it("should validate zero amount", () => {
    const result = validateVatAmount("0");
    expect(result.isValid).toBe(true);
    expect(result.parsedValue).toBe(0);
  });

  it("should validate whole numbers", () => {
    const result = validateVatAmount("1000");
    expect(result.isValid).toBe(true);
    expect(result.parsedValue).toBe(1000);
  });

  it("should accept numeric input", () => {
    const result = validateVatAmount(1000.50);
    expect(result.isValid).toBe(true);
    expect(result.parsedValue).toBe(1000.50);
  });

  it("should reject negative amounts", () => {
    const result = validateVatAmount("-100");
    expect(result.isValid).toBe(false);
    expect(result.message).toContain("cannot be negative");
  });

  it("should reject non-numeric input", () => {
    const result = validateVatAmount("abc");
    expect(result.isValid).toBe(false);
    expect(result.message).toContain("must be a valid number");
  });

  it("should reject excessive decimal places", () => {
    const result = validateVatAmount("1000.123");
    expect(result.isValid).toBe(false);
    expect(result.message).toContain("cannot have more than 2 decimal places");
  });

  it("should reject amounts that are too large", () => {
    const result = validateVatAmount("20000000");
    expect(result.isValid).toBe(false);
    expect(result.message).toContain("exceeds reasonable limit");
  });

  it("should reject empty amount", () => {
    const result = validateVatAmount("");
    expect(result.isValid).toBe(false);
    expect(result.message).toBe("VAT amount is required");
  });

  it("should reject null amount", () => {
    const result = validateVatAmount(null);
    expect(result.isValid).toBe(false);
    expect(result.message).toBe("VAT amount is required");
  });

  it("should round to 2 decimal places", () => {
    const result = validateVatAmount("1000.129");
    expect(result.isValid).toBe(false); // Should be rejected due to 3 decimal places
    
    const result2 = validateVatAmount("1000.12");
    expect(result2.isValid).toBe(true);
    expect(result2.parsedValue).toBe(1000.12);
  });
});

describe("validateSubmissionParams", () => {
  it("should validate all correct parameters", () => {
    const result = validateSubmissionParams({
      vatNumber: "193054638", // Valid VRN
      periodKey: "24A1",
      vatDue: "1000.50"
    });
    
    expect(result.isValid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.validatedData).toEqual({
      vatNumber: "193054638",
      periodKey: "24A1",
      vatDue: 1000.50
    });
  });

  it("should collect multiple validation errors", () => {
    const result = validateSubmissionParams({
      vatNumber: "123456789", // Invalid checksum
      periodKey: "24A5", // Invalid quarter
      vatDue: "-100" // Negative amount
    });
    
    expect(result.isValid).toBe(false);
    expect(result.errors).toHaveLength(3);
    expect(result.errors[0]).toContain("VRN:");
    expect(result.errors[1]).toContain("Period:");
    expect(result.errors[2]).toContain("VAT Amount:");
  });

  it("should normalize period key to uppercase", () => {
    const result = validateSubmissionParams({
      vatNumber: "193054638", // Valid VRN
      periodKey: "24a1",
      vatDue: "1000"
    });
    
    expect(result.isValid).toBe(true);
    expect(result.validatedData.periodKey).toBe("24A1");
  });

  it("should handle missing parameters", () => {
    const result = validateSubmissionParams({});
    
    expect(result.isValid).toBe(false);
    expect(result.errors).toHaveLength(3);
  });

  it("should return partial validated data on mixed validation results", () => {
    const result = validateSubmissionParams({
      vatNumber: "193054638", // Valid VRN
      periodKey: "invalid", // Invalid
      vatDue: "1000.50" // Valid
    });
    
    expect(result.isValid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.validatedData).toEqual({
      vatNumber: "193054638",
      vatDue: 1000.50
    });
    expect(result.validatedData.periodKey).toBeUndefined();
  });
});

describe("Edge cases and boundary conditions", () => {
  it("should handle very small VAT amounts", () => {
    const result = validateVatAmount("0.01");
    expect(result.isValid).toBe(true);
    expect(result.parsedValue).toBe(0.01);
  });

  it("should handle maximum reasonable VAT amount", () => {
    const result = validateVatAmount("9999999.99");
    expect(result.isValid).toBe(true);
    expect(result.parsedValue).toBe(9999999.99);
  });

  it("should handle VRN edge case - all zeros", () => {
    const result = validateVrn("000000000");
    expect(result.isValid).toBe(false); // Should fail checksum
  });

  it("should handle VRN edge case - maximum valid number", () => {
    // Use a valid 9-digit VRN with proper checksum
    const result = validateVrn("999999966"); // Valid checksum
    expect(result.isValid).toBe(true);
  });

  it("should handle period key edge cases", () => {
    // Test current year
    const currentYear = new Date().getFullYear() % 100;
    const currentYearKey = `${currentYear.toString().padStart(2, '0')}A1`;
    expect(validatePeriodKey(currentYearKey).isValid).toBe(true);
  });
});