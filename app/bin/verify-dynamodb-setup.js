#!/usr/bin/env node
// app/bin/verify-dynamodb-setup.js
// Simple script to verify DynamoDB Local setup works correctly

import { dotenvConfigIfNotBlank } from "../lib/env.js";
import * as dynamoDbBundleStore from "../lib/dynamoDbBundleStore.js";
import logger from "../lib/logger.js";

dotenvConfigIfNotBlank({ path: ".env" });
dotenvConfigIfNotBlank({ path: ".env.proxy" });

const testUserId = "test-user-12345";
const testBundles = ["guest|EXPIRY=2025-12-31", "business|EXPIRY=2026-01-31"];

async function runVerification() {
  try {
    console.log("\n=== DynamoDB Local Verification ===\n");
    
    console.log("Configuration:");
    console.log("- TEST_BUNDLE_MOCK:", process.env.TEST_BUNDLE_MOCK);
    console.log("- BUNDLE_DYNAMODB_TABLE_NAME:", process.env.BUNDLE_DYNAMODB_TABLE_NAME);
    console.log("- TEST_DYNAMODB_ENDPOINT:", process.env.TEST_DYNAMODB_ENDPOINT);
    console.log("- isDynamoDbEnabled:", dynamoDbBundleStore.isDynamoDbEnabled());
    console.log();

    if (!dynamoDbBundleStore.isDynamoDbEnabled()) {
      console.error("❌ DynamoDB is not enabled! Check environment configuration.");
      process.exit(1);
    }

    // Test 1: Get bundles (should be empty initially)
    console.log("Test 1: Get bundles (should be empty)");
    let bundles = await dynamoDbBundleStore.getUserBundles(testUserId);
    console.log("✓ Retrieved bundles:", bundles);
    if (bundles.length > 0) {
      console.log("  (Cleaning up existing bundles from previous run)");
      for (const bundle of bundles) {
        const bundleId = bundle.split("|")[0];
        await dynamoDbBundleStore.deleteBundle(testUserId, bundleId);
      }
      bundles = await dynamoDbBundleStore.getUserBundles(testUserId);
      console.log("  After cleanup:", bundles);
    }
    console.log();

    // Test 2: Put bundles
    console.log("Test 2: Put bundles");
    for (const bundle of testBundles) {
      await dynamoDbBundleStore.putBundle(testUserId, bundle);
      console.log("✓ Put bundle:", bundle);
    }
    console.log();

    // Test 3: Get bundles (should return the added bundles)
    console.log("Test 3: Get bundles (should return added bundles)");
    bundles = await dynamoDbBundleStore.getUserBundles(testUserId);
    console.log("✓ Retrieved bundles:", bundles);
    if (bundles.length !== testBundles.length) {
      throw new Error(`Expected ${testBundles.length} bundles, got ${bundles.length}`);
    }
    console.log();

    // Test 4: Delete one bundle
    console.log("Test 4: Delete one bundle");
    const bundleToDelete = testBundles[0].split("|")[0];
    await dynamoDbBundleStore.deleteBundle(testUserId, bundleToDelete);
    console.log("✓ Deleted bundle:", bundleToDelete);
    console.log();

    // Test 5: Verify deletion
    console.log("Test 5: Verify deletion");
    bundles = await dynamoDbBundleStore.getUserBundles(testUserId);
    console.log("✓ Retrieved bundles:", bundles);
    if (bundles.length !== testBundles.length - 1) {
      throw new Error(`Expected ${testBundles.length - 1} bundles after deletion, got ${bundles.length}`);
    }
    console.log();

    // Test 6: Delete all bundles
    console.log("Test 6: Delete all remaining bundles");
    await dynamoDbBundleStore.deleteAllBundles(testUserId);
    console.log("✓ Deleted all bundles");
    console.log();

    // Test 7: Verify all deleted
    console.log("Test 7: Verify all bundles deleted");
    bundles = await dynamoDbBundleStore.getUserBundles(testUserId);
    console.log("✓ Retrieved bundles:", bundles);
    if (bundles.length !== 0) {
      throw new Error(`Expected 0 bundles after deleteAll, got ${bundles.length}`);
    }
    console.log();

    console.log("=== ✅ All tests passed! DynamoDB Local is working correctly ===\n");
    process.exit(0);
  } catch (error) {
    console.error("\n❌ Verification failed:", error);
    logger.error("Verification failed:", error);
    process.exit(1);
  }
}

// Only run if this file is being executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runVerification();
}
