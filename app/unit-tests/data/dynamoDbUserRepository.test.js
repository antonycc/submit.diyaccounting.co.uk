// app/unit-tests/data/dynamoDbUserRepository.test.js
// Tests for DynamoDB user repository

import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockClient } from "aws-sdk-client-mock";
import { DynamoDBDocumentClient, PutCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import { putUserRefreshToken, findUserByGoogleId, getUserRefreshToken } from "../../data/dynamoDbUserRepository.js";

const ddbMock = mockClient(DynamoDBDocumentClient);

describe("DynamoDB User Repository", () => {
  beforeEach(() => {
    ddbMock.reset();
    process.env.BUNDLE_DYNAMODB_TABLE_NAME = "test-bundles-table";
  });

  it("should store user refresh token", async () => {
    ddbMock.on(PutCommand).resolves({});

    const googleId = "test-google-id-123";
    const refreshToken = "test-refresh-token";
    const profile = {
      email: "test@example.com",
      displayName: "Test User",
    };

    await putUserRefreshToken(googleId, refreshToken, profile);

    // Verify the PutCommand was called with correct parameters
    expect(ddbMock.calls()).toHaveLength(1);
    const call = ddbMock.call(0);
    expect(call.args[0].input.TableName).toBe("test-bundles-table");
    expect(call.args[0].input.Item.hashedSub).toBe(`user#${googleId}`);
    expect(call.args[0].input.Item.bundleId).toBe("oauth#google");
    expect(call.args[0].input.Item.refreshToken).toBe(refreshToken);
    expect(call.args[0].input.Item.email).toBe(profile.email);
  });

  it("should retrieve user by Google ID", async () => {
    const googleId = "test-google-id-456";
    const mockUser = {
      hashedSub: `user#${googleId}`,
      bundleId: "oauth#google",
      googleId,
      email: "user@example.com",
      displayName: "Test User",
      refreshToken: "stored-refresh-token",
    };

    ddbMock.on(GetCommand).resolves({
      Item: mockUser,
    });

    const result = await findUserByGoogleId(googleId);

    expect(result).toBeDefined();
    expect(result.id).toBe(googleId);
    expect(result.googleId).toBe(googleId);
    expect(result.email).toBe(mockUser.email);
    expect(result.refreshToken).toBe(mockUser.refreshToken);
  });

  it("should return null if user not found", async () => {
    ddbMock.on(GetCommand).resolves({
      Item: undefined,
    });

    const result = await findUserByGoogleId("nonexistent-id");
    expect(result).toBeNull();
  });

  it("should retrieve user refresh token", async () => {
    const googleId = "test-google-id-789";
    const refreshToken = "test-refresh-token-789";

    ddbMock.on(GetCommand).resolves({
      Item: {
        googleId,
        refreshToken,
        email: "test@example.com",
      },
    });

    const result = await getUserRefreshToken(googleId);
    expect(result).toBe(refreshToken);
  });

  it("should return null if refresh token not found", async () => {
    ddbMock.on(GetCommand).resolves({
      Item: undefined,
    });

    const result = await getUserRefreshToken("nonexistent-id");
    expect(result).toBeNull();
  });
});
