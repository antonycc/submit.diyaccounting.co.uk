import { describe, it, expect } from "vitest";
import { loadCatalogFromRoot, bundlesForActivity, activitiesForBundle } from "../src/lib/productCatalogHelper.js";

describe("System: product-catalogue.toml", () => {
  const catalog = loadCatalogFromRoot();

  it("should load version and key sections", () => {
    expect(catalog.version).toBe("1.1.0");
    expect(Array.isArray(catalog.bundles)).toBe(true);
    expect(Array.isArray(catalog.activities)).toBe(true);
  });

  // it("should have Submit VAT available for guest and not for default", () => {
  //  expect(bundlesForActivity(catalog, "submit-vat")).toContain("guest");
  //  expect(bundlesForActivity(catalog, "submit-vat")).not.toContain("default");
  // });

  // it("should list legacy activities containing diy-limited-company-upload", () => {
  //  const legacy = activitiesForBundle(catalog, "legacy");
  //  expect(legacy).toContain("diy-limited-company-upload");
  // });
});
