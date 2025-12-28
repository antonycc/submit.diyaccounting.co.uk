// test-data-generator.test.js
// Unit tests for test data generation functions

import { describe, test, expect, beforeEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Load the test data generator script
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const testDataGeneratorPath = path.join(__dirname, "../public/lib/test-data-generator.js");
const testDataGeneratorContent = fs.readFileSync(testDataGeneratorPath, "utf-8");

describe("test-data-generator", () => {
  let testDataGenerator;

  // Helper to create testDataGenerator with a custom document
  const createTestDataGenerator = (customDocument = {}) => {
    const context = {
      window: {},
      document: customDocument,
      console: { log: vi.fn() },
    };

    // Execute the script in our context (it assigns to window.testDataGenerator)
    const scriptFn = new Function("window", "document", "console", testDataGeneratorContent);
    scriptFn(context.window, context.document, context.console);

    return context.window.testDataGenerator;
  };

  beforeEach(() => {
    // For generation functions that don't need document
    testDataGenerator = createTestDataGenerator();
  });

  describe("generateTestVrn", () => {
    test("returns the standard placeholder VRN", () => {
      const vrn = testDataGenerator.generateTestVrn();
      expect(vrn).toBe("176540158");
    });

    test("returns a 9-digit string", () => {
      const vrn = testDataGenerator.generateTestVrn();
      expect(vrn).toHaveLength(9);
      expect(/^\d{9}$/.test(vrn)).toBe(true);
    });

    test("returns consistent value on multiple calls", () => {
      const vrn1 = testDataGenerator.generateTestVrn();
      const vrn2 = testDataGenerator.generateTestVrn();
      expect(vrn1).toBe(vrn2);
    });
  });

  describe("generateTestPeriodKey", () => {
    test("generates period key in YYXN format", () => {
      const periodKey = testDataGenerator.generateTestPeriodKey();
      // Format: 2-digit year + letter + digit (e.g., 24A1)
      expect(/^\d{2}[A-Z]\d$/.test(periodKey)).toBe(true);
    });

    test("generates year 24 or 25", () => {
      // Run multiple times to test randomness
      const years = new Set();
      for (let i = 0; i < 50; i++) {
        const periodKey = testDataGenerator.generateTestPeriodKey();
        const year = periodKey.substring(0, 2);
        years.add(year);
      }
      // Should only generate years 24 or 25
      expect(years.size).toBeGreaterThan(0);
      for (const year of years) {
        expect(["24", "25"]).toContain(year);
      }
    });

    test("generates different period keys on multiple calls", () => {
      const periodKeys = new Set();
      for (let i = 0; i < 10; i++) {
        periodKeys.add(testDataGenerator.generateTestPeriodKey());
      }
      // Should generate at least some different values
      expect(periodKeys.size).toBeGreaterThan(1);
    });

    test("generates valid letter A-Z", () => {
      for (let i = 0; i < 10; i++) {
        const periodKey = testDataGenerator.generateTestPeriodKey();
        const letter = periodKey.charAt(2);
        expect(/[A-Z]/.test(letter)).toBe(true);
      }
    });

    test("generates valid number 1-9", () => {
      for (let i = 0; i < 10; i++) {
        const periodKey = testDataGenerator.generateTestPeriodKey();
        const number = periodKey.charAt(3);
        expect(/[1-9]/.test(number)).toBe(true);
      }
    });
  });

  describe("generateTestVatAmount", () => {
    test("generates amount with two decimal places", () => {
      const amount = testDataGenerator.generateTestVatAmount();
      expect(/^\d+\.\d{2}$/.test(amount)).toBe(true);
    });

    test("generates amount between 100 and 10000", () => {
      for (let i = 0; i < 10; i++) {
        const amount = testDataGenerator.generateTestVatAmount();
        const numAmount = parseFloat(amount);
        expect(numAmount).toBeGreaterThanOrEqual(100);
        expect(numAmount).toBeLessThan(10000);
      }
    });

    test("generates different amounts on multiple calls", () => {
      const amounts = new Set();
      for (let i = 0; i < 10; i++) {
        amounts.add(testDataGenerator.generateTestVatAmount());
      }
      // Should generate at least some different values
      expect(amounts.size).toBeGreaterThan(1);
    });
  });

  describe("generateTestDate", () => {
    test("generates valid ISO date format", () => {
      const date = testDataGenerator.generateTestDate();
      expect(/^\d{4}-\d{2}-\d{2}$/.test(date)).toBe(true);
    });

    test("generates date in current year", () => {
      const date = testDataGenerator.generateTestDate();
      const year = date.substring(0, 4);
      const currentYear = new Date().getFullYear().toString();
      expect(year).toBe(currentYear);
    });

    test("generates valid month (01-12)", () => {
      for (let i = 0; i < 10; i++) {
        const date = testDataGenerator.generateTestDate();
        const month = parseInt(date.substring(5, 7));
        expect(month).toBeGreaterThanOrEqual(1);
        expect(month).toBeLessThanOrEqual(12);
      }
    });

    test("generates valid day (01-28)", () => {
      for (let i = 0; i < 10; i++) {
        const date = testDataGenerator.generateTestDate();
        const day = parseInt(date.substring(8, 10));
        expect(day).toBeGreaterThanOrEqual(1);
        expect(day).toBeLessThanOrEqual(28);
      }
    });

    test("generates parseable date", () => {
      const date = testDataGenerator.generateTestDate();
      const dateObj = new Date(date);
      expect(dateObj.toString()).not.toBe("Invalid Date");
    });
  });

  describe("generateTestDateRange", () => {
    test("returns object with from and to properties", () => {
      const range = testDataGenerator.generateTestDateRange();
      expect(range).toHaveProperty("from");
      expect(range).toHaveProperty("to");
    });

    test("from date is start of current year", () => {
      const range = testDataGenerator.generateTestDateRange();
      const currentYear = new Date().getFullYear();
      expect(range.from).toBe(`${currentYear}-01-01`);
    });

    test("to date is current date", () => {
      const range = testDataGenerator.generateTestDateRange();
      const today = new Date().toISOString().split("T")[0];
      expect(range.to).toBe(today);
    });

    test("from date is before to date", () => {
      const range = testDataGenerator.generateTestDateRange();
      const fromDate = new Date(range.from);
      const toDate = new Date(range.to);
      expect(fromDate.getTime()).toBeLessThanOrEqual(toDate.getTime());
    });
  });

  describe("populateSubmitVatForm", () => {
    let mockElements;
    let localTestDataGenerator;

    beforeEach(() => {
      // Create mock input elements
      mockElements = {
        vatNumber: { value: "" },
        periodKey: { value: "" },
        vatDue: { value: "" },
      };

      // Create a mock document with getElementById
      const mockDocument = {
        getElementById: vi.fn((id) => {
          if (id === "vatNumber") return mockElements.vatNumber;
          if (id === "periodKey") return mockElements.periodKey;
          if (id === "vatDue") return mockElements.vatDue;
          return null;
        }),
      };

      // Create testDataGenerator with the mock document
      localTestDataGenerator = createTestDataGenerator(mockDocument);
    });

    test("populates VAT number field", () => {
      localTestDataGenerator.populateSubmitVatForm();
      expect(mockElements.vatNumber.value).toBe("176540158");
    });

    test("populates period key field", () => {
      localTestDataGenerator.populateSubmitVatForm();
      expect(/^\d{2}[A-Z]\d$/.test(mockElements.periodKey.value)).toBe(true);
    });

    test("populates VAT due field", () => {
      localTestDataGenerator.populateSubmitVatForm();
      expect(/^\d+\.\d{2}$/.test(mockElements.vatDue.value)).toBe(true);
    });

    test("handles missing elements gracefully", () => {
      // Create a new generator with document that returns null
      const nullDocGenerator = createTestDataGenerator({
        getElementById: vi.fn(() => null),
      });
      expect(() => nullDocGenerator.populateSubmitVatForm()).not.toThrow();
    });
  });

  describe("populateViewVatReturnForm", () => {
    let mockElements;
    let localTestDataGenerator;

    beforeEach(() => {
      mockElements = {
        vrn: { value: "" },
        periodKey: { value: "" },
      };

      const mockDocument = {
        getElementById: vi.fn((id) => {
          if (id === "vrn") return mockElements.vrn;
          if (id === "periodKey") return mockElements.periodKey;
          return null;
        }),
      };

      localTestDataGenerator = createTestDataGenerator(mockDocument);
    });

    test("populates VRN field", () => {
      localTestDataGenerator.populateViewVatReturnForm();
      expect(mockElements.vrn.value).toBe("176540158");
    });

    test("populates period key field", () => {
      localTestDataGenerator.populateViewVatReturnForm();
      expect(/^\d{2}[A-Z]\d$/.test(mockElements.periodKey.value)).toBe(true);
    });

    test("handles missing elements gracefully", () => {
      const nullDocGenerator = createTestDataGenerator({
        getElementById: vi.fn(() => null),
      });
      expect(() => nullDocGenerator.populateViewVatReturnForm()).not.toThrow();
    });
  });

  describe("populateVatObligationsForm", () => {
    let mockElements;
    let localTestDataGenerator;

    beforeEach(() => {
      mockElements = {
        vrn: { value: "" },
        fromDate: { value: "" },
        toDate: { value: "" },
      };

      const mockDocument = {
        getElementById: vi.fn((id) => {
          if (id === "vrn") return mockElements.vrn;
          if (id === "fromDate") return mockElements.fromDate;
          if (id === "toDate") return mockElements.toDate;
          return null;
        }),
      };

      localTestDataGenerator = createTestDataGenerator(mockDocument);
    });

    test("populates VRN field", () => {
      localTestDataGenerator.populateVatObligationsForm();
      expect(mockElements.vrn.value).toBe("176540158");
    });

    test("populates from date field", () => {
      localTestDataGenerator.populateVatObligationsForm();
      const currentYear = new Date().getFullYear();
      expect(mockElements.fromDate.value).toBe(`${currentYear}-01-01`);
    });

    test("populates to date field", () => {
      localTestDataGenerator.populateVatObligationsForm();
      const today = new Date().toISOString().split("T")[0];
      expect(mockElements.toDate.value).toBe(today);
    });

    test("handles missing elements gracefully", () => {
      const nullDocGenerator = createTestDataGenerator({
        getElementById: vi.fn(() => null),
      });
      expect(() => nullDocGenerator.populateVatObligationsForm()).not.toThrow();
    });
  });
});
