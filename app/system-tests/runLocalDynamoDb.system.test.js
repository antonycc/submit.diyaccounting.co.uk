// app/system-tests/runLocalDynamoDb.system.test.js

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { DynamoDBClient, DescribeTableCommand, PutItemCommand, GetItemCommand } from "@aws-sdk/client-dynamodb";
import { runLocalDynamoDb } from "../../behaviour-tests/helpers/behaviour-helpers.js";

describe("System: runLocalDynamoDb() helper", () => {
  const bundlesTableName = "system-test-runner-bundles";
  const hmrcReqsTableName = "system-test-runner-requests";
  const receiptsTableName = "system-test-runner-receipts";

  /** @type {{ stop?: () => Promise<void>, endpoint?: string }} */
  let dynamoControl;
  /** @type {DynamoDBClient} */
  let ddb;

  beforeAll(async () => {
    // Ask helper to allocate a random free port for dynalite
    process.env.DYNAMODB_PORT = "0";
    try {
      dynamoControl = await runLocalDynamoDb("run", bundlesTableName, hmrcReqsTableName, receiptsTableName);
    } catch (e) {
      // If port 9000 is already in use by another dynalite, reuse it
      if (e && /EADDRINUSE/.test(String(e.message))) {
        dynamoControl = { endpoint: "http://127.0.0.1:9000", stop: undefined };
      } else {
        throw e;
      }
    }
    expect(dynamoControl.endpoint).toBeTruthy();
    ddb = new DynamoDBClient({
      region: process.env.AWS_REGION || "us-east-1",
      endpoint: dynamoControl.endpoint,
      credentials: { accessKeyId: "dummy", secretAccessKey: "dummy" },
    });
  }, 60_000);

  afterAll(async () => {
    if (dynamoControl?.stop) await dynamoControl.stop();
  });

  it("starts dynalite and creates expected tables", async () => {
    for (const table of [bundlesTableName, hmrcReqsTableName, receiptsTableName, process.env.STATE_TABLE_NAME]) {
      // Some environments may not set STATE_TABLE_NAME via helper; fall back
      const name = table || "behaviour-proxy-state";
      const resp = await ddb.send(new DescribeTableCommand({ TableName: name }));
      expect(resp?.Table?.TableName).toBe(name);
    }
  });

  it("allows basic read/write operations on created tables", async () => {
    const pk = { S: "test-sub" };
    // Receipts table uses composite key: hashedSub (PK) + receiptId (SK).
    await ddb.send(
      new PutItemCommand({
        TableName: receiptsTableName,
        Item: { hashedSub: pk, receiptId: { S: "r1" }, createdAt: { N: String(Date.now()) } },
      }),
    );
    const got = await ddb.send(
      new GetItemCommand({ TableName: receiptsTableName, Key: { hashedSub: pk, receiptId: { S: "r1" } } }),
    );
    expect(got.Item?.hashedSub?.S).toBe("test-sub");
  });
});
