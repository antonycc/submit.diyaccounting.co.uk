// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// Shared helper to read configurable values from the catalogue.
// System tests should use these instead of hardcoding values like tokensGranted,
// tokenCost, cap, maxUses, etc. so tests don't break when the config changes.

import { loadCatalogFromRoot } from "@app/services/productCatalog.js";

let _catalog = null;

export function getCatalog() {
  if (!_catalog) _catalog = loadCatalogFromRoot();
  return _catalog;
}

export function getBundle(bundleId) {
  const catalog = getCatalog();
  const bundle = catalog.bundles.find((b) => b.id === bundleId);
  if (!bundle) throw new Error(`Bundle '${bundleId}' not found in catalogue`);
  return bundle;
}

export function getActivity(activityId) {
  const catalog = getCatalog();
  const activity = catalog.activities.find((a) => a.id === activityId);
  if (!activity) throw new Error(`Activity '${activityId}' not found in catalogue`);
  return activity;
}
