// web/unit-tests/entitlement-status.test.js

import { describe, it, expect } from "vitest";

describe("Entitlement Status Widget", () => {
  describe("Helper Functions", () => {
    it("should identify automatic bundles from catalog", () => {
      const catalog = {
        bundles: [
          { id: "default", allocation: "automatic" },
          { id: "test", allocation: "on-request" },
          { id: "premium", allocation: "automatic" },
        ],
      };

      const getAutomaticBundles = (catalog) => {
        if (!catalog?.bundles) return [];
        return catalog.bundles.filter((bundle) => bundle.allocation === "automatic").map((bundle) => bundle.id);
      };

      const result = getAutomaticBundles(catalog);
      expect(result).toEqual(["default", "premium"]);
    });

    it("should match simple path correctly", () => {
      const matchesSimplePath = (path, normalizedPath) => {
        const normalizedActivityPath = path.replace(/^\//, "");
        return normalizedPath === normalizedActivityPath || normalizedPath.endsWith("/" + normalizedActivityPath);
      };

      expect(matchesSimplePath("account/bundles.html", "account/bundles.html")).toBe(true);
      expect(matchesSimplePath("/account/bundles.html", "account/bundles.html")).toBe(true);
      expect(matchesSimplePath("account/bundles.html", "activities/submitVat.html")).toBe(false);
    });

    it("should match regex pattern correctly", () => {
      const matchesRegexPattern = (pattern, normalizedPath) => {
        try {
          const regex = new RegExp(pattern);
          return regex.test(normalizedPath) || regex.test("/" + normalizedPath);
        } catch (err) {
          return false;
        }
      };

      expect(matchesRegexPattern("^/api/v1/bundle.*", "api/v1/bundle")).toBe(true);
      expect(matchesRegexPattern("^/api/v1/bundle.*", "/api/v1/bundle?test=1")).toBe(true);
      expect(matchesRegexPattern("^/api/v1/hmrc.*", "api/v1/catalog")).toBe(false);
    });

    it("should find matching activity for a given path", () => {
      const catalog = {
        activities: [
          {
            id: "bundles",
            name: "Manage Bundles",
            bundles: ["default"],
            paths: ["account/bundles.html", "^/api/v1/bundle.*"],
          },
          {
            id: "receipts",
            name: "View Receipts",
            bundles: ["default"],
            path: "account/receipts.html",
          },
          {
            id: "submit-vat",
            name: "Submit VAT",
            bundles: ["test"],
            paths: ["activities/submitVat.html", "^/api/v1/hmrc/vat.*"],
          },
        ],
      };

      const matchesSimplePath = (path, normalizedPath) => {
        const normalizedActivityPath = path.replace(/^\//, "");
        return normalizedPath === normalizedActivityPath || normalizedPath.endsWith("/" + normalizedActivityPath);
      };

      const matchesRegexPattern = (pattern, normalizedPath) => {
        try {
          const regex = new RegExp(pattern);
          return regex.test(normalizedPath) || regex.test("/" + normalizedPath);
        } catch (err) {
          return false;
        }
      };

      const findMatchingActivity = (catalog, currentPath) => {
        if (!catalog?.activities) return null;
        const normalizedPath = currentPath.replace(/^\//, "").split("?")[0];

        for (const activity of catalog.activities) {
          const paths = activity.paths || (activity.path ? [activity.path] : []);
          for (const path of paths) {
            const isMatch = path.startsWith("^") ? matchesRegexPattern(path, normalizedPath) : matchesSimplePath(path, normalizedPath);
            if (isMatch) return activity;
          }
        }
        return null;
      };

      expect(findMatchingActivity(catalog, "/account/bundles.html")?.id).toBe("bundles");
      expect(findMatchingActivity(catalog, "account/receipts.html")?.id).toBe("receipts");
      expect(findMatchingActivity(catalog, "/activities/submitVat.html")?.id).toBe("submit-vat");
      expect(findMatchingActivity(catalog, "/api/v1/bundle")?.id).toBe("bundles");
      expect(findMatchingActivity(catalog, "/api/v1/hmrc/vat/return")?.id).toBe("submit-vat");
      expect(findMatchingActivity(catalog, "/unknown/path.html")).toBeNull();
    });

    it("should get bundle names from catalog", () => {
      const catalog = {
        bundles: [
          { id: "default", name: "Default Bundle" },
          { id: "test", name: "Test API Bundle" },
          { id: "premium", name: "Premium Features" },
        ],
      };

      const getBundleNames = (catalog, bundleIds) => {
        if (!catalog?.bundles || !bundleIds?.length) return [];
        const bundleMap = new Map(catalog.bundles.map((b) => [b.id, b.name || b.id]));
        return bundleIds.map((id) => bundleMap.get(id) || id);
      };

      expect(getBundleNames(catalog, ["default", "test"])).toEqual(["Default Bundle", "Test API Bundle"]);
      expect(getBundleNames(catalog, ["unknown"])).toEqual(["unknown"]);
      expect(getBundleNames(catalog, [])).toEqual([]);
    });
  });

  describe("Entitlement Status Determination", () => {
    it("should return 'Activity: unrestricted' for pages not in catalog", async () => {
      const catalog = {
        bundles: [{ id: "default", allocation: "automatic" }],
        activities: [
          {
            id: "bundles",
            name: "Manage Bundles",
            bundles: ["default"],
            paths: ["account/bundles.html"],
          },
        ],
      };

      const determineStatus = (catalog, currentPath, userBundles) => {
        const matchesSimplePath = (path, normalizedPath) => {
          const normalizedActivityPath = path.replace(/^\//, "");
          return normalizedPath === normalizedActivityPath || normalizedPath.endsWith("/" + normalizedActivityPath);
        };

        const findMatchingActivity = (catalog, currentPath) => {
          if (!catalog?.activities) return null;
          const normalizedPath = currentPath.replace(/^\//, "").split("?")[0];
          for (const activity of catalog.activities) {
            const paths = activity.paths || (activity.path ? [activity.path] : []);
            for (const path of paths) {
              if (matchesSimplePath(path, normalizedPath)) return activity;
            }
          }
          return null;
        };

        const matchingActivity = findMatchingActivity(catalog, currentPath);
        if (!matchingActivity) return { text: "Activity: unrestricted", style: "unrestricted" };

        const automaticBundles = catalog.bundles.filter((b) => b.allocation === "automatic").map((b) => b.id);
        const allUserBundles = [...new Set([...automaticBundles, ...userBundles])];
        const requiredBundles = matchingActivity.bundles || [];
        const hasAccess = requiredBundles.some((bundleId) => allUserBundles.includes(bundleId));

        if (hasAccess) return { text: "Activity: access granted", style: "granted" };

        const bundleMap = new Map(catalog.bundles.map((b) => [b.id, b.name || b.id]));
        const bundleNames = requiredBundles.map((id) => bundleMap.get(id) || id);
        const activityList = bundleNames.join(", ");

        return { text: `Activity: requires ${activityList}`, style: "requires" };
      };

      const status = determineStatus(catalog, "/privacy.html", []);
      expect(status.text).toBe("Activity: unrestricted");
      expect(status.style).toBe("unrestricted");
    });

    it("should return 'Activity: access granted' when user has access", async () => {
      const catalog = {
        bundles: [{ id: "default", name: "Default Bundle", allocation: "automatic" }],
        activities: [
          {
            id: "bundles",
            name: "Manage Bundles",
            bundles: ["default"],
            paths: ["account/bundles.html"],
          },
        ],
      };

      const determineStatus = (catalog, currentPath, userBundles) => {
        const matchesSimplePath = (path, normalizedPath) => {
          const normalizedActivityPath = path.replace(/^\//, "");
          return normalizedPath === normalizedActivityPath || normalizedPath.endsWith("/" + normalizedActivityPath);
        };

        const findMatchingActivity = (catalog, currentPath) => {
          if (!catalog?.activities) return null;
          const normalizedPath = currentPath.replace(/^\//, "").split("?")[0];
          for (const activity of catalog.activities) {
            const paths = activity.paths || (activity.path ? [activity.path] : []);
            for (const path of paths) {
              if (matchesSimplePath(path, normalizedPath)) return activity;
            }
          }
          return null;
        };

        const matchingActivity = findMatchingActivity(catalog, currentPath);
        if (!matchingActivity) return { text: "Activity: unrestricted", style: "unrestricted" };

        const automaticBundles = catalog.bundles.filter((b) => b.allocation === "automatic").map((b) => b.id);
        const allUserBundles = [...new Set([...automaticBundles, ...userBundles])];
        const requiredBundles = matchingActivity.bundles || [];
        const hasAccess = requiredBundles.some((bundleId) => allUserBundles.includes(bundleId));

        if (hasAccess) return { text: "Activity: access granted", style: "granted" };

        const bundleMap = new Map(catalog.bundles.map((b) => [b.id, b.name || b.id]));
        const bundleNames = requiredBundles.map((id) => bundleMap.get(id) || id);
        const activityList = bundleNames.join(", ");

        return { text: `Activity: requires ${activityList}`, style: "requires" };
      };

      // Automatic bundle grants access
      const status = determineStatus(catalog, "/account/bundles.html", []);
      expect(status.text).toBe("Activity: access granted");
      expect(status.style).toBe("granted");
    });

    it("should return 'Activity: requires <bundle names>' when user lacks access", async () => {
      const catalog = {
        bundles: [
          { id: "default", name: "Default Bundle", allocation: "automatic" },
          { id: "test", name: "Test API Bundle", allocation: "on-request" },
        ],
        activities: [
          {
            id: "submit-vat",
            name: "Submit VAT",
            bundles: ["test"],
            paths: ["activities/submitVat.html"],
          },
        ],
      };

      const determineStatus = (catalog, currentPath, userBundles) => {
        const matchesSimplePath = (path, normalizedPath) => {
          const normalizedActivityPath = path.replace(/^\//, "");
          return normalizedPath === normalizedActivityPath || normalizedPath.endsWith("/" + normalizedActivityPath);
        };

        const findMatchingActivity = (catalog, currentPath) => {
          if (!catalog?.activities) return null;
          const normalizedPath = currentPath.replace(/^\//, "").split("?")[0];
          for (const activity of catalog.activities) {
            const paths = activity.paths || (activity.path ? [activity.path] : []);
            for (const path of paths) {
              if (matchesSimplePath(path, normalizedPath)) return activity;
            }
          }
          return null;
        };

        const matchingActivity = findMatchingActivity(catalog, currentPath);
        if (!matchingActivity) return { text: "Activity: unrestricted", style: "unrestricted" };

        const automaticBundles = catalog.bundles.filter((b) => b.allocation === "automatic").map((b) => b.id);
        const allUserBundles = [...new Set([...automaticBundles, ...userBundles])];
        const requiredBundles = matchingActivity.bundles || [];
        const hasAccess = requiredBundles.some((bundleId) => allUserBundles.includes(bundleId));

        if (hasAccess) return { text: "Activity: access granted", style: "granted" };

        const bundleMap = new Map(catalog.bundles.map((b) => [b.id, b.name || b.id]));
        const bundleNames = requiredBundles.map((id) => bundleMap.get(id) || id);
        const activityList = bundleNames.join(", ");

        return { text: `Activity: requires ${activityList}`, style: "requires" };
      };

      const status = determineStatus(catalog, "/activities/submitVat.html", []);
      expect(status.text).toBe("Activity: requires Test API Bundle");
      expect(status.style).toBe("requires");
    });

    it("should handle multiple required bundles", async () => {
      const catalog = {
        bundles: [
          { id: "bundle1", name: "Bundle One", allocation: "on-request" },
          { id: "bundle2", name: "Bundle Two", allocation: "on-request" },
        ],
        activities: [
          {
            id: "special-activity",
            name: "Special Activity",
            bundles: ["bundle1", "bundle2"],
            paths: ["special/activity.html"],
          },
        ],
      };

      const determineStatus = (catalog, currentPath, userBundles) => {
        const matchesSimplePath = (path, normalizedPath) => {
          const normalizedActivityPath = path.replace(/^\//, "");
          return normalizedPath === normalizedActivityPath || normalizedPath.endsWith("/" + normalizedActivityPath);
        };

        const findMatchingActivity = (catalog, currentPath) => {
          if (!catalog?.activities) return null;
          const normalizedPath = currentPath.replace(/^\//, "").split("?")[0];
          for (const activity of catalog.activities) {
            const paths = activity.paths || (activity.path ? [activity.path] : []);
            for (const path of paths) {
              if (matchesSimplePath(path, normalizedPath)) return activity;
            }
          }
          return null;
        };

        const matchingActivity = findMatchingActivity(catalog, currentPath);
        if (!matchingActivity) return { text: "Activity: unrestricted", style: "unrestricted" };

        const automaticBundles = catalog.bundles.filter((b) => b.allocation === "automatic").map((b) => b.id);
        const allUserBundles = [...new Set([...automaticBundles, ...userBundles])];
        const requiredBundles = matchingActivity.bundles || [];
        const hasAccess = requiredBundles.some((bundleId) => allUserBundles.includes(bundleId));

        if (hasAccess) return { text: "Activity: access granted", style: "granted" };

        const bundleMap = new Map(catalog.bundles.map((b) => [b.id, b.name || b.id]));
        const bundleNames = requiredBundles.map((id) => bundleMap.get(id) || id);
        const activityList = bundleNames.join(", ");

        return { text: `Activity: requires ${activityList}`, style: "requires" };
      };

      const status = determineStatus(catalog, "/special/activity.html", []);
      expect(status.text).toBe("Activity: requires Bundle One, Bundle Two");
      expect(status.style).toBe("requires");
    });
  });
});
