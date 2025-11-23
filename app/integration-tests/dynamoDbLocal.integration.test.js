// app/integration-tests/dynamoDbLocal.integration.test.js
import { describe, test, beforeAll, afterAll, expect } from "vitest";
import { GenericContainer } from "testcontainers";
import { CreateTableCommand, DescribeTableCommand, DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, QueryCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";

describe("Integration – DynamoDB Local", () => {
  let container;
  let endpoint;
  let dynamoClient;
  let docClient;
  const tableName = "test-integration-bundle-table";

  beforeAll(async () => {
    // Start DynamoDB Local container
    container = await new GenericContainer("amazon/dynamodb-local:latest")
      .withExposedPorts(8000)
      .withCommand(["-jar", "DynamoDBLocal.jar", "-sharedDb", "-inMemory"])
      .start();

    endpoint = `http://${container.getHost()}:${container.getMappedPort(8000)}`;
    
    const clientConfig = {
      endpoint,
      region: "us-east-1",
      credentials: {
        accessKeyId: "dummy",
        secretAccessKey: "dummy",
      },
    };
    
    dynamoClient = new DynamoDBClient(clientConfig);
    docClient = DynamoDBDocumentClient.from(dynamoClient);

    // Create test table
    await dynamoClient.send(
      new CreateTableCommand({
        TableName: tableName,
        KeySchema: [
          { AttributeName: "hashedSub", KeyType: "HASH" },
          { AttributeName: "bundleId", KeyType: "RANGE" },
        ],
        AttributeDefinitions: [
          { AttributeName: "hashedSub", AttributeType: "S" },
          { AttributeName: "bundleId", AttributeType: "S" },
        ],
        BillingMode: "PAY_PER_REQUEST",
      }),
    );
  }, 60000); // 60 second timeout for container startup

  afterAll(async () => {
    if (container) {
      await container.stop();
    }
  });

  test("should be able to create table and verify it exists", async () => {
    const result = await dynamoClient.send(new DescribeTableCommand({ TableName: tableName }));
    expect(result.Table.TableName).toBe(tableName);
    expect(result.Table.TableStatus).toBe("ACTIVE");
  });

  test("should be able to put and query items", async () => {
    const testItem = {
      hashedSub: "test-user-hash",
      bundleId: "test-bundle-1",
      createdAt: new Date().toISOString(),
      expiry: "2025-12-31",
    };

    // Put item
    await docClient.send(
      new PutCommand({
        TableName: tableName,
        Item: testItem,
      }),
    );

    // Query items
    const queryResult = await docClient.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: "hashedSub = :hashedSub",
        ExpressionAttributeValues: {
          ":hashedSub": "test-user-hash",
        },
      }),
    );

    expect(queryResult.Items).toBeDefined();
    expect(queryResult.Items.length).toBe(1);
    expect(queryResult.Items[0].bundleId).toBe("test-bundle-1");
    expect(queryResult.Items[0].expiry).toBe("2025-12-31");
  });

  test("should be able to delete items", async () => {
    // Delete item
    await docClient.send(
      new DeleteCommand({
        TableName: tableName,
        Key: {
          hashedSub: "test-user-hash",
          bundleId: "test-bundle-1",
        },
      }),
    );

    // Query to verify deletion
    const queryResult = await docClient.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: "hashedSub = :hashedSub",
        ExpressionAttributeValues: {
          ":hashedSub": "test-user-hash",
        },
      }),
    );

    expect(queryResult.Items.length).toBe(0);
  });
});
