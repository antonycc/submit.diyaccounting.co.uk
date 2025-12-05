// app/unit-tests/dynamoDbHmrcApiRequestStore.test.js

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";

// Mocks for AWS SDK clients used via dynamic import in the implementation
const mockSend = vi.fn();

vi.mock("@aws-sdk/lib-dynamodb", () => {
  class PutCommand {
    constructor(input) {
      this.input = input;
    }
  }
  return {
    DynamoDBDocumentClient: { from: () => ({ send: mockSend }) },
    PutCommand,
  };
});

vi.mock("@aws-sdk/client-dynamodb", () => {
  class DynamoDBClient {
    constructor(_config) {
      // no-op for tests
    }
  }
  return { DynamoDBClient };
});

describe("dynamoDbHmrcApiRequestStore", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  test("skips put when HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME is not set", async () => {
    // Arrange
    process.env.HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME = ""; // disabled
    const { putHmrcApiRequest } = await import("@app/data/dynamoDbHmrcApiRequestRepository.js");

    // Act
    await expect(
      putHmrcApiRequest("user-sub", {
        url: "https://example.test",
        httpRequest: { method: "POST", headers: {}, body: {} },
        httpResponse: { statusCode: 200, headers: {}, body: {} },
        duration: 10,
      }),
    ).resolves.toBeUndefined();
  });

  test("writes PutCommand when table name is configured", async () => {
    // Arrange
    process.env.HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME = "unit-test-hmrc-requests";
    process.env.AWS_REGION = process.env.AWS_REGION || "eu-west-2";
    const { putHmrcApiRequest } = await import("@app/data/dynamoDbHmrcApiRequestRepository.js");
    const { context } = await import("@app/lib/logger.js");
    const { hashSub } = await import("@app/services/subHasher.js");

    // add request correlation data
    context.set("requestId", "req-123");
    context.set("amznTraceId", "Root=1-abc");
    context.set("traceparent", "00-8f3c...-01");

    const input = {
      url: "https://hmrc.example/api",
      httpRequest: { method: "POST", headers: { a: "b" }, body: { x: 1 } },
      httpResponse: { statusCode: 201, headers: { c: "d" }, body: { ok: true } },
      duration: 42,
    };

    // Capture the PutCommand input passed via mock send
    mockSend.mockImplementation(async (cmd) => {
      // mimic AWS client behaviour
      expect(cmd).toBeInstanceOf((await import("@aws-sdk/lib-dynamodb")).PutCommand);
      const expectedHashedSub = hashSub("user-sub");
      expect(cmd.input.TableName).toBe("unit-test-hmrc-requests");
      expect(cmd.input.Item.hashedSub).toBe(expectedHashedSub);
      expect(cmd.input.Item.requestId).toBe("req-123");
      expect(cmd.input.Item.url).toBe(input.url);
      expect(cmd.input.Item.method).toBe("POST");
      // duration and ttl should be numbers
      expect(typeof cmd.input.Item.duration).toBe("number");
      expect(typeof cmd.input.Item.ttl).toBe("number");
      return {};
    });

    // Act
    await putHmrcApiRequest("user-sub", input);

    // Assert
    expect(mockSend).toHaveBeenCalledTimes(1);
  });
});
