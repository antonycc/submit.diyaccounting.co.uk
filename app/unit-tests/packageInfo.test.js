// app/unit-tests/packageInfo.test.js

import { describe, it, expect, beforeEach } from "vitest";
import { getPackageInfo, clearPackageInfoCache } from "../lib/packageInfo.js";

describe("packageInfo", () => {
  beforeEach(() => {
    clearPackageInfoCache();
  });

  it("should load package.json information", async () => {
    const packageInfo = await getPackageInfo();

    expect(packageInfo).toBeDefined();
    expect(packageInfo.name).toBe("web-submit-diyaccounting-co-uk");
    expect(packageInfo.version).toMatch(/^\d+\.\d+\.\d+/); // Semantic version pattern
    expect(packageInfo.description).toBe("Submit UK tax information to HMRC");
    expect(packageInfo.license).toBe("GPL-3.0");
  });

  it("should compute license ID hash", async () => {
    const packageInfo = await getPackageInfo();

    expect(packageInfo.licenseId).toBeDefined();
    expect(packageInfo.licenseId).toMatch(/^web-submit-diyaccounting-co-uk=[A-F0-9]{64}$/);
  });

  it("should include product name and vendor version", async () => {
    const packageInfo = await getPackageInfo();

    expect(packageInfo.productName).toBe("DIY Accounting Submit");
    expect(packageInfo.vendorVersion).toMatch(/^web-submit-diyaccounting-co-uk-\d+\.\d+\.\d+/);
  });

  it("should cache package info on subsequent calls", async () => {
    const packageInfo1 = await getPackageInfo();
    const packageInfo2 = await getPackageInfo();

    // Should be the same object reference (cached)
    expect(packageInfo1).toBe(packageInfo2);
  });

  it("should clear cache when requested", async () => {
    const packageInfo1 = await getPackageInfo();
    clearPackageInfoCache();
    const packageInfo2 = await getPackageInfo();

    // Should be different object references after cache clear
    expect(packageInfo1).not.toBe(packageInfo2);
    // But should have the same values
    expect(packageInfo1.name).toBe(packageInfo2.name);
    expect(packageInfo1.version).toBe(packageInfo2.version);
  });

  it("should compute consistent hash for same input", async () => {
    const packageInfo1 = await getPackageInfo();
    clearPackageInfoCache();
    const packageInfo2 = await getPackageInfo();

    // License ID should be identical across multiple loads
    expect(packageInfo1.licenseId).toBe(packageInfo2.licenseId);
  });
});
