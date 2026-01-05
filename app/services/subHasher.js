// app/services/subHasher.js

import crypto from "crypto";

let cachedSalt = null;

/**
 * Initialize the salt from environment variable or AWS Secrets Manager.
 * Must be called during application startup before any hashSub calls.
 *
 * @returns {Promise<void>}
 */
export async function initializeSalt() {
  if (cachedSalt) return;

  // For local development/testing, allow env var override
  if (process.env.USER_SUB_HASH_SALT) {
    cachedSalt = process.env.USER_SUB_HASH_SALT;
    return;
  }

  // For deployed environments, fetch from Secrets Manager
  const { SecretsManagerClient, GetSecretValueCommand } = await import("@aws-sdk/client-secrets-manager");
  const client = new SecretsManagerClient({ region: process.env.AWS_REGION || "eu-west-2" });

  const envName = process.env.ENVIRONMENT_NAME || "ci";
  const secretName = `${envName}/submit/user-sub-hash-salt`;

  try {
    const response = await client.send(new GetSecretValueCommand({ SecretId: secretName }));
    cachedSalt = response.SecretString;

    if (!cachedSalt) {
      throw new Error(`Salt secret ${secretName} exists but has no value`);
    }
  } catch (error) {
    throw new Error(`Failed to retrieve salt from ${secretName}: ${error.message}`);
  }
}

/**
 * Check if salt has been initialized.
 * @returns {boolean}
 */
export function isSaltInitialized() {
  return cachedSalt !== null;
}

/**
 * Hash a user sub using HMAC-SHA256 with environment-specific salt.
 * The salt must be initialized via initializeSalt() before calling this function.
 *
 * @param {string} sub - The user's subject identifier from OAuth/Cognito
 * @returns {string} 64-character hexadecimal HMAC-SHA256 hash
 * @throws {Error} If sub is invalid or salt not initialized
 */
export function hashSub(sub) {
  if (!sub || typeof sub !== "string") {
    throw new Error("Invalid sub: must be a non-empty string");
  }

  if (!cachedSalt) {
    throw new Error("Salt not initialized. Call initializeSalt() during application startup.");
  }

  return crypto.createHmac("sha256", cachedSalt).update(sub).digest("hex");
}

// ============================================================================
// Test helpers - only available in test environment
// ============================================================================

/**
 * Set a test salt for unit testing. Only works in test environment.
 * @param {string} salt - The test salt to use
 */
export function _setTestSalt(salt) {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("_setTestSalt can only be used in test environment");
  }
  cachedSalt = salt;
}

/**
 * Clear the cached salt. Only works in test environment.
 */
export function _clearSalt() {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("_clearSalt can only be used in test environment");
  }
  cachedSalt = null;
}
