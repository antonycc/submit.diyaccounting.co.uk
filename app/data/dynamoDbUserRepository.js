// app/data/dynamoDbUserRepository.js
// Repository for managing user data and OAuth refresh tokens in DynamoDB

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, GetCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { createLogger } from "../lib/logger.js";

const logger = createLogger({ source: "app/data/dynamoDbUserRepository.js" });

// Initialize DynamoDB client
let dynamoDbClient = null;
let docClient = null;

/**
 * Gets or creates the DynamoDB document client
 * @returns {DynamoDBDocumentClient} The document client
 */
function getDocClient() {
  if (!docClient) {
    const config = {
      region: process.env.AWS_REGION || "eu-west-2",
    };

    // Use local endpoint if configured (for DynamoDB Local)
    if (process.env.DYNAMODB_ENDPOINT) {
      config.endpoint = process.env.DYNAMODB_ENDPOINT;
      config.credentials = {
        accessKeyId: "dummy",
        secretAccessKey: "dummy",
      };
    }

    dynamoDbClient = new DynamoDBClient(config);
    docClient = DynamoDBDocumentClient.from(dynamoDbClient);
  }
  return docClient;
}

/**
 * Gets the table name for user data.
 * We'll store user data in the bundles table with a special prefix.
 * @returns {string} The table name
 */
function getUserTableName() {
  // Store users in the bundles table with a special hashedSub prefix
  return process.env.BUNDLE_DYNAMODB_TABLE_NAME || "bundles";
}

/**
 * Stores or updates a user's OAuth refresh token in DynamoDB.
 *
 * @param {string} googleId - The user's Google ID
 * @param {string} refreshToken - The OAuth refresh token
 * @param {Object} profile - Optional user profile data
 * @returns {Promise<void>}
 */
export async function putUserRefreshToken(googleId, refreshToken, profile = {}) {
  const tableName = getUserTableName();
  const client = getDocClient();

  // Use a special prefix for user records
  const hashedSub = `user#${googleId}`;
  const bundleId = "oauth#google";

  const item = {
    hashedSub,
    bundleId,
    googleId,
    refreshToken,
    email: profile.email,
    displayName: profile.displayName,
    updatedAt: new Date().toISOString(),
  };

  try {
    logger.info(`Storing refresh token for user: ${googleId}`);
    await client.send(
      new PutCommand({
        TableName: tableName,
        Item: item,
      }),
    );
    logger.info(`Successfully stored refresh token for user: ${googleId}`);
  } catch (error) {
    logger.error(`Failed to store refresh token for user ${googleId}:`, error);
    throw error;
  }
}

/**
 * Retrieves a user by their Google ID.
 *
 * @param {string} googleId - The user's Google ID
 * @returns {Promise<Object|null>} The user object or null if not found
 */
export async function findUserByGoogleId(googleId) {
  const tableName = getUserTableName();
  const client = getDocClient();

  const hashedSub = `user#${googleId}`;
  const bundleId = "oauth#google";

  try {
    logger.debug(`Looking up user: ${googleId}`);
    const result = await client.send(
      new GetCommand({
        TableName: tableName,
        Key: {
          hashedSub,
          bundleId,
        },
      }),
    );

    if (result.Item) {
      logger.debug(`Found user: ${googleId}`);
      return {
        id: result.Item.googleId,
        googleId: result.Item.googleId,
        email: result.Item.email,
        displayName: result.Item.displayName,
        refreshToken: result.Item.refreshToken,
      };
    }

    logger.debug(`User not found: ${googleId}`);
    return null;
  } catch (error) {
    logger.error(`Failed to find user ${googleId}:`, error);
    throw error;
  }
}

/**
 * Retrieves a user's refresh token.
 *
 * @param {string} googleId - The user's Google ID
 * @returns {Promise<string|null>} The refresh token or null if not found
 */
export async function getUserRefreshToken(googleId) {
  const user = await findUserByGoogleId(googleId);
  return user ? user.refreshToken : null;
}

/**
 * Lists all users (for admin purposes).
 * Note: This uses a query with the user# prefix.
 *
 * @param {number} limit - Maximum number of users to return
 * @returns {Promise<Array>} Array of user objects
 */
export async function listUsers(limit = 100) {
  const tableName = getUserTableName();
  const client = getDocClient();

  try {
    logger.info("Listing users");
    const result = await client.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: "begins_with(hashedSub, :prefix)",
        ExpressionAttributeValues: {
          ":prefix": "user#",
        },
        Limit: limit,
      }),
    );

    const users = (result.Items || []).map((item) => ({
      id: item.googleId,
      googleId: item.googleId,
      email: item.email,
      displayName: item.displayName,
      updatedAt: item.updatedAt,
    }));

    logger.info(`Found ${users.length} users`);
    return users;
  } catch (error) {
    logger.error("Failed to list users:", error);
    throw error;
  }
}
