// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

import { describe, it, expect, vi, beforeEach } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

// Mock the bundle repository
vi.mock("@app/data/dynamoDbBundleRepository.js", () => ({
  getUserBundles: vi.fn().mockResolvedValue([]),
  consumeToken: vi.fn().mockResolvedValue({ consumed: true, tokensRemaining: 2 }),
  putBundle: vi.fn(),
  deleteBundle: vi.fn(),
  deleteAllBundles: vi.fn(),
  resetTokens: vi.fn(),
}));

const { getUserBundles, consumeToken } = await import("@app/data/dynamoDbBundleRepository.js");
const { consumeTokenForActivity } = await import("../../services/tokenEnforcement.js");

const baseCatalog = {
  bundles: [
    { id: "day-guest", tokens: 3 },
    { id: "test", tokens: 3 },
  ],
  activities: [
    {
      id: "submit-vat",
      tokens: 1,
      bundles: ["day-guest", "invited-guest", "resident-guest", "resident-pro-comp", "resident-pro"],
      paths: ["^/api/v1/hmrc/vat.*"],
    },
    {
      id: "submit-vat-sandbox",
      tokens: 1,
      bundles: ["test"],
      paths: ["^/api/v1/hmrc/vat.*"],
    },
    {
      id: "vat-obligations",
      tokens: 0,
      bundles: ["day-guest"],
      paths: ["^/api/v1/hmrc/vat.*"],
    },
    {
      id: "free-activity",
      bundles: ["day-guest"],
      paths: ["/free"],
    },
  ],
};

describe("tokenEnforcement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("consumeTokenForActivity", () => {
    it("should consume a token for a costed activity", async () => {
      getUserBundles.mockResolvedValueOnce([{ bundleId: "day-guest", tokensGranted: 3, tokensConsumed: 0 }]);
      consumeToken.mockResolvedValueOnce({ consumed: true, tokensRemaining: 2 });

      const result = await consumeTokenForActivity("user-1", "submit-vat", baseCatalog);

      expect(result.consumed).toBe(true);
      expect(result.tokensRemaining).toBe(2);
      expect(result.cost).toBe(1);
      expect(consumeToken).toHaveBeenCalledWith("user-1", "day-guest");
    });

    it("should return tokens_exhausted when no qualifying bundle has tokens", async () => {
      getUserBundles.mockResolvedValueOnce([{ bundleId: "day-guest", tokensGranted: 3, tokensConsumed: 3 }]);

      const result = await consumeTokenForActivity("user-1", "submit-vat", baseCatalog);

      expect(result.consumed).toBe(false);
      expect(result.reason).toBe("tokens_exhausted");
      expect(result.tokensRemaining).toBe(0);
      expect(consumeToken).not.toHaveBeenCalled();
    });

    it("should return tokens_exhausted when user has no matching bundles", async () => {
      getUserBundles.mockResolvedValueOnce([{ bundleId: "unrelated-bundle", tokensGranted: 10, tokensConsumed: 0 }]);

      const result = await consumeTokenForActivity("user-1", "submit-vat", baseCatalog);

      expect(result.consumed).toBe(false);
      expect(result.reason).toBe("tokens_exhausted");
    });

    it("should treat unknown activity as free", async () => {
      const result = await consumeTokenForActivity("user-1", "nonexistent-activity", baseCatalog);

      expect(result.consumed).toBe(true);
      expect(result.cost).toBe(0);
      expect(getUserBundles).not.toHaveBeenCalled();
      expect(consumeToken).not.toHaveBeenCalled();
    });

    it("should treat activity with tokens=0 as free", async () => {
      const result = await consumeTokenForActivity("user-1", "vat-obligations", baseCatalog);

      expect(result.consumed).toBe(true);
      expect(result.cost).toBe(0);
      expect(getUserBundles).not.toHaveBeenCalled();
    });

    it("should treat activity without tokens field as free", async () => {
      const result = await consumeTokenForActivity("user-1", "free-activity", baseCatalog);

      expect(result.consumed).toBe(true);
      expect(result.cost).toBe(0);
    });

    it("should skip bundles without tokensGranted field", async () => {
      getUserBundles.mockResolvedValueOnce([
        { bundleId: "day-guest" }, // no tokensGranted — e.g. legacy bundle record
      ]);

      const result = await consumeTokenForActivity("user-1", "submit-vat", baseCatalog);

      expect(result.consumed).toBe(false);
      expect(result.reason).toBe("tokens_exhausted");
    });

    it("should consume from sandbox bundle for sandbox activity", async () => {
      getUserBundles.mockResolvedValueOnce([{ bundleId: "test", tokensGranted: 3, tokensConsumed: 1 }]);
      consumeToken.mockResolvedValueOnce({ consumed: true, tokensRemaining: 1 });

      const result = await consumeTokenForActivity("user-1", "submit-vat-sandbox", baseCatalog);

      expect(result.consumed).toBe(true);
      expect(consumeToken).toHaveBeenCalledWith("user-1", "test");
    });

    it("should propagate atomic failure from consumeToken", async () => {
      getUserBundles.mockResolvedValueOnce([{ bundleId: "day-guest", tokensGranted: 3, tokensConsumed: 2 }]);
      // The pre-check sees 1 remaining, but atomic update fails (race condition)
      consumeToken.mockResolvedValueOnce({ consumed: false, reason: "tokens_exhausted", tokensRemaining: 0 });

      const result = await consumeTokenForActivity("user-1", "submit-vat", baseCatalog);

      expect(result.consumed).toBe(false);
      expect(result.reason).toBe("tokens_exhausted");
    });
  });
});
