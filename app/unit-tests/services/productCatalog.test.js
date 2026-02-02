// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { parseCatalog, loadCatalogFromRoot, bundlesForActivity, isActivityAvailable } from "../../services/productCatalog.js";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

describe("productCatalogHelper", () => {
  const tomlPath = path.join(process.cwd(), "web/public/submit.catalogue.toml");
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
    expect(bundlesForActivity(catalog, "submit-vat")).toEqual([
      "day-guest",
      "invited-guest",
      "resident-guest",
      "resident-pro-comp",
      "resident-pro",
    ]);
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
    expect(isActivityAvailable(catalog, "submit-vat", "day-guest")).toBe(true);
    expect(isActivityAvailable(catalog, "submit-vat", "default")).toBe(false);
  });
});
