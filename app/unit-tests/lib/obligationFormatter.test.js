// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/unit-tests/lib/obligationFormatter.test.js

import { describe, test, expect } from "vitest";
import {
  formatObligationForDisplay,
  formatObligationsForSelection,
  filterOpenObligations,
  getPeriodKeyFromSelection,
} from "@app/lib/obligationFormatter.js";

describe("obligationFormatter", () => {
  const sampleObligation = {
    start: "2024-01-01",
    end: "2024-03-31",
    due: "2024-05-07",
    status: "O",
    periodKey: "24A1",
    received: null,
  };

  const fulfilledObligation = {
    start: "2023-10-01",
    end: "2023-12-31",
    due: "2024-02-07",
    status: "F",
    periodKey: "23D1",
    received: "2024-01-15",
  };

  describe("formatObligationForDisplay", () => {
    test("formats obligation with hidden period key", () => {
      const result = formatObligationForDisplay(sampleObligation);

      expect(result._periodKey).toBe("24A1");
      expect(result.id).toBe("24A1");
      expect(result.displayName).toContain("Jan");
      expect(result.displayName).toContain("Mar");
      expect(result.displayName).toContain("2024");
      expect(result.startDate).toBe("2024-01-01");
      expect(result.endDate).toBe("2024-03-31");
      expect(result.dueDate).toBe("2024-05-07");
      expect(result.status).toBe("O");
      expect(result.statusDisplay).toBe("Open");
    });

    test("formats fulfilled obligation", () => {
      const result = formatObligationForDisplay(fulfilledObligation);

      expect(result.status).toBe("F");
      expect(result.statusDisplay).toBe("Submitted");
      expect(result.receivedDate).toBe("2024-01-15");
    });

    test("handles missing due date", () => {
      const obligation = { ...sampleObligation, due: null };
      const result = formatObligationForDisplay(obligation);

      expect(result.dueDate).toBeNull();
      expect(result.dueDateFormatted).toBeNull();
    });
  });

  describe("formatObligationsForSelection", () => {
    test("formats and sorts obligations by end date descending", () => {
      const obligations = [fulfilledObligation, sampleObligation];
      const result = formatObligationsForSelection(obligations);

      expect(result).toHaveLength(2);
      // More recent obligation (2024 Q1) should be first
      expect(result[0]._periodKey).toBe("24A1");
      expect(result[1]._periodKey).toBe("23D1");
    });

    test("returns empty array for non-array input", () => {
      expect(formatObligationsForSelection(null)).toEqual([]);
      expect(formatObligationsForSelection(undefined)).toEqual([]);
      expect(formatObligationsForSelection("invalid")).toEqual([]);
    });

    test("handles empty array", () => {
      expect(formatObligationsForSelection([])).toEqual([]);
    });
  });

  describe("filterOpenObligations", () => {
    test("filters to only open obligations", () => {
      const formatted = formatObligationsForSelection([sampleObligation, fulfilledObligation]);
      const result = filterOpenObligations(formatted);

      expect(result).toHaveLength(1);
      expect(result[0]._periodKey).toBe("24A1");
      expect(result[0].status).toBe("O");
    });

    test("returns empty array when no open obligations", () => {
      const formatted = formatObligationsForSelection([fulfilledObligation]);
      const result = filterOpenObligations(formatted);

      expect(result).toHaveLength(0);
    });
  });

  describe("getPeriodKeyFromSelection", () => {
    test("extracts hidden period key", () => {
      const formatted = formatObligationForDisplay(sampleObligation);
      const periodKey = getPeriodKeyFromSelection(formatted);

      expect(periodKey).toBe("24A1");
    });
  });
});
