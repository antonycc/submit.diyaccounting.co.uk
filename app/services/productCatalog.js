// app/services/productCatalog.js
import fs from "node:fs";
import path from "node:path";
import TOML from "@iarna/toml";

export function parseCatalog(tomlString) {
  if (typeof tomlString !== "string") throw new TypeError("tomlString must be a string");
  const catalog = TOML.parse(tomlString);
  return catalog;
}

export function loadCatalogFromRoot() {
  const filePath = path.join(process.cwd(), "web/public/product-catalogue.toml");
  const raw = fs.readFileSync(filePath, "utf-8");
  return parseCatalog(raw);
}

export function bundlesForActivity(catalog, activityId) {
  const activity = catalog?.activities?.find((a) => a.id === activityId);
  return activity?.bundles ?? [];
}

export function activitiesForBundle(catalog, bundleId) {
  if (!catalog?.activities) return [];
  return catalog.activities.filter((a) => Array.isArray(a.bundles) && a.bundles.includes(bundleId)).map((a) => a.id);
}

export function isActivityAvailable(catalog, activityId, bundleId) {
  const bundles = bundlesForActivity(catalog, activityId);
  return bundles.includes(bundleId);
}
