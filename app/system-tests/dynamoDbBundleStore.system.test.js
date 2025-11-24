import { describe, it, expect, beforeAll, afterAll } from "vitest";
//import * as store from "../lib/dynamoDbBundleStore.js";

// We start a local Dynalite instance using the helper in app/bin/dynamodb.js,
// then set environment variables so that the AWS SDK v3 client in
// app/lib/dynamoDbBundleStore.js connects to that local endpoint via
// AWS_ENDPOINT_URL[_DYNAMODB]. Only after env is set we dynamically import the
// bundle store module to ensure it picks up the correct configuration.

let stopDynalite;
let store;
const tableName = "bundles-system-test";

beforeAll(async () => {
  const { startDynamoDB, ensureBundleTableExists } = await import("../bin/dynamodb.js");

  // Start local dynalite and configure environment for AWS SDK v3
  const started = await startDynamoDB();
  stopDynalite = started.stop;
  const endpoint = started.endpoint;

  // Minimal AWS SDK env for local usage with endpoint override
  process.env.AWS_REGION = process.env.AWS_REGION || "us-east-1";
  process.env.AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID || "dummy";
  process.env.AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY || "dummy";

  // Endpoint override for DynamoDB (SDK v3 respects these vars)
  process.env.AWS_ENDPOINT_URL = endpoint;
  process.env.AWS_ENDPOINT_URL_DYNAMODB = endpoint;

  // Enable DynamoDB usage in the bundle store
  process.env.BUNDLE_DYNAMODB_TABLE_NAME = tableName;

  // Ensure the table exists on the local endpoint
  await ensureBundleTableExists(tableName, endpoint);

  // Import the store AFTER environment is configured
  store = await import("../lib/dynamoDbBundleStore.js");
});

afterAll(async () => {
  try {
    await stopDynalite?.();
  } catch {
    // ignore
  }
});

describe("System: dynamoDbBundleStore with local dynalite", () => {
  it("should enable DynamoDB via env and perform put/get/delete operations", async () => {
    // Verify dynamo is enabled via env
    expect(store.isDynamoDbEnabled()).toBe(true);

    const bundleId = "bundle-1";
    const hashedSub = "8c10be81ac685c3c63cc4a4e5638445aaed87e83ab1a73e808cb54988735c120";
    const createdAt = new Date().toISOString();
    const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 hours from now
    const ttl_datestamp = new Date(Date.now() + 31 * 24 * 60 * 60 * 1000).toISOString();
    const ttl = Math.floor(new Date(ttl_datestamp).getTime() / 1000);

    const bundle = {
      hashedSub,
      bundleId,
      createdAt,
      expiry,
      ttl,
      ttl_datestamp,
    };

    // Put the bundle
    await store.putBundle(userId, bundle);

    // Read bundles for the user
    const afterPut = await store.getUserBundles(userId);
    expect(Array.isArray(afterPut)).toBe(true);
    const found = afterPut.find((b) => b.bundleId === bundle.bundleId);
    expect(found).toBeTruthy();

    // Delete the bundle and ensure it's gone
    await store.deleteBundle(userId, bundle.bundleId);
    const afterDelete = await store.getUserBundles(userId);
    expect(afterDelete.find((b) => b.bundleId === bundle.bundleId)).toBeUndefined();
  });
});
