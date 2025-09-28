import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  parseCatalog,
  loadCatalogFromRoot,
  bundlesForActivity,
  activitiesForBundle,
  isActivityAvailable,
} from "../lib/productCatalogHelper.js";

describe("productCatalogHelper", () => {
  const tomlPath = path.join(process.cwd(), "product-catalogue.toml");
  const tomlText = fs.readFileSync(tomlPath, "utf-8");

  it("parseCatalog should parse TOML into object", () => {
    const catalog = parseCatalog(tomlText);
    expect(catalog).toBeTruthy();
    expect(catalog.version).toBeTypeOf("string");
    expect(Array.isArray(catalog.bundles)).toBe(true);
    expect(Array.isArray(catalog.activities)).toBe(true);
  });

  it("loadCatalogFromRoot should load and parse file from root", () => {
    const catalog = loadCatalogFromRoot();
    expect(catalog.version).toBe("1.1.0");
  });

  it("bundlesForActivity should return expected bundles", () => {
    const catalog = parseCatalog(tomlText);
    expect(bundlesForActivity(catalog, "submit-vat")).toEqual(["guest", "basic", "legacy"]);
    // expect(bundlesForActivity(catalog, "vat-obligations")).toEqual(["default"]);
  });

  // it("activitiesForBundle should return expected activity ids", () => {
  //  const catalog = parseCatalog(tomlText);
  //  const legacyActivities = activitiesForBundle(catalog, "legacy");
  //  expect(legacyActivities).toContain("submit-vat");
  //  expect(legacyActivities).toContain("diy-limited-company-upload");
  // });

  it("isActivityAvailable should work for positive and negative cases", () => {
    const catalog = parseCatalog(tomlText);
    expect(isActivityAvailable(catalog, "submit-vat", "guest")).toBe(true);
    expect(isActivityAvailable(catalog, "submit-vat", "default")).toBe(false);
  });
});
