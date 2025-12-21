// app/unit-tests/lib/hmrcValidation.test.js

import { describe, test, expect } from "vitest";
import {
  isValidVrn,
  isValidPeriodKey,
  isValidIsoDate,
  isValidDateRange,
  maskIpAddress,
  maskDeviceId,
  maskSensitiveHeaders,
  getHmrcErrorMessage,
  extractHmrcErrorCode,
} from "@app/lib/hmrcValidation.js";

describe("hmrcValidation", () => {
  describe("isValidVrn", () => {
    test("accepts valid 9-digit VRN", () => {
      expect(isValidVrn("123456789")).toBe(true);
      expect(isValidVrn("111222333")).toBe(true);
      expect(isValidVrn(123456789)).toBe(true);
    });

    test("rejects VRN with wrong length", () => {
      expect(isValidVrn("12345678")).toBe(false); // 8 digits
      expect(isValidVrn("1234567890")).toBe(false); // 10 digits
      expect(isValidVrn("")).toBe(false); // empty
    });

    test("rejects VRN with non-numeric characters", () => {
      expect(isValidVrn("12345678A")).toBe(false);
      expect(isValidVrn("ABC123456")).toBe(false);
      expect(isValidVrn("123-456-789")).toBe(false);
    });
  });

  describe("isValidPeriodKey", () => {
    test("accepts valid YYXN format period keys", () => {
      expect(isValidPeriodKey("24A1")).toBe(true);
      expect(isValidPeriodKey("25A1")).toBe(true);
      expect(isValidPeriodKey("24B1")).toBe(true);
      expect(isValidPeriodKey("24A4")).toBe(true);
      expect(isValidPeriodKey("18A1")).toBe(true);
    });

    test("accepts valid #NNN format period keys", () => {
      expect(isValidPeriodKey("#001")).toBe(true);
      expect(isValidPeriodKey("#012")).toBe(true);
      expect(isValidPeriodKey("#999")).toBe(true);
    });

    test("accepts lowercase and converts to uppercase", () => {
      expect(isValidPeriodKey("24a1")).toBe(true);
      expect(isValidPeriodKey("25b2")).toBe(true);
    });

    test("rejects invalid period key formats", () => {
      expect(isValidPeriodKey("123")).toBe(false); // just numbers
      expect(isValidPeriodKey("ABCD")).toBe(false); // just letters
      expect(isValidPeriodKey("24AB")).toBe(false); // two letters
      expect(isValidPeriodKey("2A11")).toBe(false); // wrong format
      expect(isValidPeriodKey("24A12")).toBe(false); // too long
      expect(isValidPeriodKey("#AB1")).toBe(false); // letters after #
      expect(isValidPeriodKey("")).toBe(false); // empty
    });
  });

  describe("isValidIsoDate", () => {
    test("accepts valid ISO date format", () => {
      expect(isValidIsoDate("2024-01-01")).toBe(true);
      expect(isValidIsoDate("2025-12-31")).toBe(true);
      expect(isValidIsoDate("2023-06-15")).toBe(true);
    });

    test("rejects invalid date formats", () => {
      expect(isValidIsoDate("2024/01/01")).toBe(false); // wrong separator
      expect(isValidIsoDate("01-01-2024")).toBe(false); // wrong order
      expect(isValidIsoDate("2024-1-1")).toBe(false); // missing zero padding
      expect(isValidIsoDate("2024-13-01")).toBe(false); // invalid month
      expect(isValidIsoDate("2024-01-32")).toBe(false); // invalid day
      expect(isValidIsoDate("")).toBe(false); // empty
      expect(isValidIsoDate("not-a-date")).toBe(false);
    });
    
    test("rejects invalid dates that match format", () => {
      expect(isValidIsoDate("2024-02-30")).toBe(false); // Feb 30th doesn't exist
      expect(isValidIsoDate("2023-02-29")).toBe(false); // Not a leap year
      expect(isValidIsoDate("2024-04-31")).toBe(false); // April only has 30 days
    });
    
    test("accepts leap year dates", () => {
      expect(isValidIsoDate("2024-02-29")).toBe(true); // 2024 is a leap year
      expect(isValidIsoDate("2000-02-29")).toBe(true); // 2000 is a leap year
    });
  });

  describe("isValidDateRange", () => {
    test("accepts valid date ranges", () => {
      expect(isValidDateRange("2024-01-01", "2024-12-31")).toBe(true);
      expect(isValidDateRange("2024-01-01", "2024-01-01")).toBe(true); // same date
      expect(isValidDateRange("2023-01-01", "2024-12-31")).toBe(true);
    });

    test("rejects invalid date ranges", () => {
      expect(isValidDateRange("2024-12-31", "2024-01-01")).toBe(false); // from > to
      expect(isValidDateRange("2025-01-01", "2024-01-01")).toBe(false);
    });
  });

  describe("maskIpAddress", () => {
    test("masks IPv4 addresses", () => {
      expect(maskIpAddress("192.168.1.100")).toBe("192.168.1.xxx");
      expect(maskIpAddress("10.0.0.1")).toBe("10.0.0.xxx");
      expect(maskIpAddress("172.16.254.1")).toBe("172.16.254.xxx");
    });

    test("masks IPv6 addresses", () => {
      expect(maskIpAddress("2001:db8::1")).toBe("2001:db8::xxx");
      expect(maskIpAddress("fe80::1")).toBe("fe80::xxx");
      expect(maskIpAddress("2001:0db8:85a3:0000:0000:8a2e:0370:7334")).toBe("2001:0db8:85a3:0000:0000:8a2e:0370:xxx");
    });
    
    test("masks compressed IPv6 addresses", () => {
      expect(maskIpAddress("::1")).toBe("::xxx");
      expect(maskIpAddress("::ffff:192.0.2.1")).toBe("::xxx");
    });

    test("handles edge cases", () => {
      expect(maskIpAddress("")).toBe("unknown");
      expect(maskIpAddress(null)).toBe("unknown");
      expect(maskIpAddress(undefined)).toBe("unknown");
      expect(maskIpAddress("invalid-ip")).toBe("xxx.xxx.xxx.xxx");
    });
  });

  describe("maskDeviceId", () => {
    test("masks device IDs longer than 8 characters", () => {
      expect(maskDeviceId("abcdefgh1234567890")).toBe("abcdefgh...");
      expect(maskDeviceId("device-id-12345")).toBe("device-i...");
    });

    test("masks short device IDs completely", () => {
      expect(maskDeviceId("short")).toBe("***");
      expect(maskDeviceId("1234567")).toBe("***");
      expect(maskDeviceId("12345678")).toBe("***");
    });

    test("handles edge cases", () => {
      expect(maskDeviceId("")).toBe("unknown");
      expect(maskDeviceId(null)).toBe("unknown");
      expect(maskDeviceId(undefined)).toBe("unknown");
    });
  });

  describe("maskSensitiveHeaders", () => {
    test("masks IP addresses in headers", () => {
      const headers = {
        "Gov-Client-Public-IP": "192.168.1.100",
        "Gov-Vendor-Public-IP": "10.0.0.1",
        "Gov-Client-Device-ID": "device-12345678",
      };

      const masked = maskSensitiveHeaders(headers);

      expect(masked["Gov-Client-Public-IP"]).toBe("192.168.1.xxx");
      expect(masked["Gov-Vendor-Public-IP"]).toBe("10.0.0.xxx");
      expect(masked["Gov-Client-Device-ID"]).toBe("device-1...");
    });

    test("preserves non-sensitive headers", () => {
      const headers = {
        "Gov-Client-Public-IP": "192.168.1.100",
        "Gov-Client-Timezone": "UTC+00:00",
        "Gov-Client-User-IDs": "server=test",
      };

      const masked = maskSensitiveHeaders(headers);

      expect(masked["Gov-Client-Timezone"]).toBe("UTC+00:00");
      expect(masked["Gov-Client-User-IDs"]).toBe("server=test");
    });

    test("handles missing headers", () => {
      expect(maskSensitiveHeaders({})).toEqual({});
      expect(maskSensitiveHeaders(null)).toEqual({});
      expect(maskSensitiveHeaders(undefined)).toEqual({});
    });
  });

  describe("getHmrcErrorMessage", () => {
    test("returns appropriate message for known error codes", () => {
      const invalidVrn = getHmrcErrorMessage("INVALID_VRN");
      expect(invalidVrn.userMessage).toContain("VAT registration number");
      expect(invalidVrn.actionAdvice).toContain("check");

      const insolvent = getHmrcErrorMessage("INSOLVENT_TRADER");
      expect(insolvent.userMessage).toContain("insolvent");
      expect(insolvent.actionAdvice).toContain("contact HMRC");

      const duplicate = getHmrcErrorMessage("DUPLICATE_SUBMISSION");
      expect(duplicate.userMessage).toContain("already been submitted");
      expect(duplicate.actionAdvice).toBeTruthy();
    });

    test("returns default message for unknown error codes", () => {
      const unknown = getHmrcErrorMessage("UNKNOWN_ERROR_CODE");
      expect(unknown.userMessage).toContain("unexpected error");
      expect(unknown.actionAdvice).toBeTruthy();
    });

    test("handles various HMRC error codes", () => {
      const codes = [
        "VRN_NOT_FOUND",
        "INVALID_PERIODKEY",
        "DATE_RANGE_TOO_LARGE",
        "DUPLICATE_SUBMISSION",
        "TAX_PERIOD_NOT_ENDED",
        "INVALID_CREDENTIALS",
        "SERVER_ERROR",
      ];

      codes.forEach((code) => {
        const result = getHmrcErrorMessage(code);
        expect(result).toHaveProperty("userMessage");
        expect(result).toHaveProperty("actionAdvice");
        expect(result.userMessage).toBeTruthy();
        expect(result.actionAdvice).toBeTruthy();
      });
    });
  });

  describe("extractHmrcErrorCode", () => {
    test("extracts code from direct field", () => {
      const response = { code: "INVALID_VRN", message: "Invalid VRN" };
      expect(extractHmrcErrorCode(response)).toBe("INVALID_VRN");
    });

    test("extracts code from errors array", () => {
      const response = {
        errors: [{ code: "DUPLICATE_SUBMISSION", message: "Duplicate" }],
      };
      expect(extractHmrcErrorCode(response)).toBe("DUPLICATE_SUBMISSION");
    });

    test("returns null for responses without error code", () => {
      expect(extractHmrcErrorCode({})).toBeNull();
      expect(extractHmrcErrorCode({ message: "Error" })).toBeNull();
      expect(extractHmrcErrorCode(null)).toBeNull();
      expect(extractHmrcErrorCode(undefined)).toBeNull();
    });

    test("returns first error code from multiple errors", () => {
      const response = {
        errors: [{ code: "ERROR_1" }, { code: "ERROR_2" }],
      };
      expect(extractHmrcErrorCode(response)).toBe("ERROR_1");
    });
  });
});
