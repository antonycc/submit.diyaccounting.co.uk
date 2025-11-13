// app/lib/packageInfo.js
// Package information utilities for Gov-Vendor headers

import { readFile } from "fs/promises";
import { createHash } from "crypto";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

let cachedPackageInfo = null;

/**
 * Load package.json and compute derived values
 * Caches result for performance
 */
export async function getPackageInfo() {
  if (cachedPackageInfo) {
    return cachedPackageInfo;
  }

  try {
    // Get path to package.json relative to this file
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const packageJsonPath = join(__dirname, "../../package.json");

    // Read package.json
    const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));

    // Compute license hash (SHA-256 of "name=version")
    // HMRC requires: "A unique key (e.g., a name) for each licensed piece of software, followed by its SHA-256 hash"
    const licenseString = `${packageJson.name}=${packageJson.version}`;
    const licenseHash = createHash("sha256").update(licenseString).digest("hex").toUpperCase();

    cachedPackageInfo = {
      name: packageJson.name,
      version: packageJson.version,
      description: packageJson.description,
      license: packageJson.license,
      licenseId: `${packageJson.name}=${licenseHash}`,
      productName: "DIY Accounting Submit",
      vendorVersion: `${packageJson.name}-${packageJson.version}`,
    };

    return cachedPackageInfo;
  } catch (error) {
    // Fallback to hardcoded values if package.json cannot be read
    // This ensures the code works even in unusual deployment scenarios
    return {
      name: "web-submit-diyaccounting-co-uk",
      version: "0.0.2-4",
      description: "Submit UK tax information to HMRC",
      license: "GPL-3.0",
      licenseId: "web-submit-diyaccounting-co-uk=8D7963490527D33716835EE7C195516D5E562E03B224E9B359836466EE40CDE1",
      productName: "DIY Accounting Submit",
      vendorVersion: "web-submit-diyaccounting-co-uk-0.0.2-4",
    };
  }
}

/**
 * Clear the cache - useful for testing
 */
export function clearPackageInfoCache() {
  cachedPackageInfo = null;
}
