// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

import { describe, it, expect } from "vitest";
import { loadCatalogFromRoot, bundlesForActivity, activitiesForBundle } from "../services/productCatalog.js";

describe("System: web/public/submit.catalogue.toml", () => {
  const catalog = loadCatalogFromRoot();

  it("should load version and key sections", () => {
    expect(catalog.version).toBe("1.1.0");
    expect(Array.isArray(catalog.bundles)).toBe(true);
    expect(Array.isArray(catalog.activities)).toBe(true);
  });
});
