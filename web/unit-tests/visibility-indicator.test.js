// web/unit-tests/visibility-indicator.test.js

import { describe, it, expect } from "vitest";

describe("Visibility Indicator Widget", () => {
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
  });

  describe("Visibility Status Determination", () => {
    it("should return 'Public' for pages not in catalog", async () => {
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

      const determineStatus = (catalog, currentPath, isLoggedIn, userBundles) => {
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
        if (!matchingActivity) return { type: "Public", link: null };

        const automaticBundles = catalog.bundles.filter((b) => b.allocation === "automatic").map((b) => b.id);
        const allUserBundles = [...new Set([...automaticBundles, ...userBundles])];
        const requiredBundles = matchingActivity.bundles || [];
        const hasAccess = requiredBundles.some((bundleId) => allUserBundles.includes(bundleId));

        if (hasAccess) return { type: "Activity available", link: null };
        if (!isLoggedIn) return { type: "Needs login", link: "/auth/login.html" };
        return { type: "Needs activity", link: "/account/bundles.html" };
      };

      const status = determineStatus(catalog, "/privacy.html", false, []);
      expect(status.type).toBe("Public");
      expect(status.link).toBeNull();
    });

    it("should return 'Activity available' when user has access", async () => {
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

      const determineStatus = (catalog, currentPath, isLoggedIn, userBundles) => {
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
        if (!matchingActivity) return { type: "Public", link: null };

        const automaticBundles = catalog.bundles.filter((b) => b.allocation === "automatic").map((b) => b.id);
        const allUserBundles = [...new Set([...automaticBundles, ...userBundles])];
        const requiredBundles = matchingActivity.bundles || [];
        const hasAccess = requiredBundles.some((bundleId) => allUserBundles.includes(bundleId));

        if (hasAccess) return { type: "Activity available", link: null };
        if (!isLoggedIn) return { type: "Needs login", link: "/auth/login.html" };
        return { type: "Needs activity", link: "/account/bundles.html" };
      };

      // Automatic bundle grants access
      const status = determineStatus(catalog, "/account/bundles.html", true, []);
      expect(status.type).toBe("Activity available");
      expect(status.link).toBeNull();
    });

    it("should return 'Needs login' when not logged in and activity requires auth", async () => {
      const catalog = {
        bundles: [{ id: "test", allocation: "on-request" }],
        activities: [
          {
            id: "submit-vat",
            name: "Submit VAT",
            bundles: ["test"],
            paths: ["activities/submitVat.html"],
          },
        ],
      };

      const determineStatus = (catalog, currentPath, isLoggedIn, userBundles) => {
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
        if (!matchingActivity) return { type: "Public", link: null };

        const automaticBundles = catalog.bundles.filter((b) => b.allocation === "automatic").map((b) => b.id);
        const allUserBundles = [...new Set([...automaticBundles, ...userBundles])];
        const requiredBundles = matchingActivity.bundles || [];
        const hasAccess = requiredBundles.some((bundleId) => allUserBundles.includes(bundleId));

        if (hasAccess) return { type: "Activity available", link: null };
        if (!isLoggedIn) return { type: "Needs login", link: "/auth/login.html" };
        return { type: "Needs activity", link: "/account/bundles.html" };
      };

      const status = determineStatus(catalog, "/activities/submitVat.html", false, []);
      expect(status.type).toBe("Needs login");
      expect(status.link).toBe("/auth/login.html");
    });

    it("should return 'Needs activity' when logged in but missing bundle", async () => {
      const catalog = {
        bundles: [{ id: "test", allocation: "on-request" }],
        activities: [
          {
            id: "submit-vat",
            name: "Submit VAT",
            bundles: ["test"],
            paths: ["activities/submitVat.html"],
          },
        ],
      };

      const determineStatus = (catalog, currentPath, isLoggedIn, userBundles) => {
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
        if (!matchingActivity) return { type: "Public", link: null };

        const automaticBundles = catalog.bundles.filter((b) => b.allocation === "automatic").map((b) => b.id);
        const allUserBundles = [...new Set([...automaticBundles, ...userBundles])];
        const requiredBundles = matchingActivity.bundles || [];
        const hasAccess = requiredBundles.some((bundleId) => allUserBundles.includes(bundleId));

        if (hasAccess) return { type: "Activity available", link: null };
        if (!isLoggedIn) return { type: "Needs login", link: "/auth/login.html" };
        return { type: "Needs activity", link: "/account/bundles.html" };
      };

      const status = determineStatus(catalog, "/activities/submitVat.html", true, []);
      expect(status.type).toBe("Needs activity");
      expect(status.link).toBe("/account/bundles.html");
    });
  });
});
