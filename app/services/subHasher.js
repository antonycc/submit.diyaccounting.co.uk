// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/services/subHasher.js

import crypto from "crypto";
import { createLogger } from "../lib/logger.js";

const logger = createLogger({ source: "app/services/subHasher.js" });

let __cachedSalt = null;
let __initPromise = null;

/**
 * Initialize the salt from environment variable or AWS Secrets Manager.
 * Call this at the top of your Lambda handler before using hashSub().
 *
 * Features:
 * - One-time fetch per Lambda container (cold start), then cached
 * - Concurrent initialization protection (prevents race conditions)
 * - Clear error messages for troubleshooting
 *
 * @returns {Promise<void>}
 */
export async function initializeSalt() {
  if (__cachedSalt) {
    logger.debug({ message: "Salt already initialized (warm start)" });
    return;
  }

  // Prevent concurrent initialization during cold start
  if (__initPromise) {
    logger.debug({ message: "Salt initialization in progress, waiting..." });
    return __initPromise;
  }

  __initPromise = (async () => {
    try {
      // For local development/testing, allow env var override
      if (process.env.USER_SUB_HASH_SALT) {
        logger.info({ message: "Using USER_SUB_HASH_SALT from environment (local dev/test)" });
        __cachedSalt = process.env.USER_SUB_HASH_SALT;
        return;
      }

      // For deployed environments, fetch from Secrets Manager
      const envName = process.env.ENVIRONMENT_NAME || "ci";
      const secretName = `${envName}/submit/user-sub-hash-salt`;

      logger.info({ message: "Fetching salt from Secrets Manager", secretName });

      const { SecretsManagerClient, GetSecretValueCommand } = await import("@aws-sdk/client-secrets-manager");
      const client = new SecretsManagerClient({
        region: process.env.AWS_REGION || "eu-west-2",
      });

      const response = await client.send(new GetSecretValueCommand({ SecretId: secretName }));

      if (!response.SecretString) {
        throw new Error(`Secret ${secretName} exists but has no SecretString value`);
      }

      __cachedSalt = response.SecretString;
      logger.info({ message: "Salt successfully fetched and cached" });
    } catch (error) {
      logger.error({ message: "Failed to fetch salt", error: error.message });
      __initPromise = null; // Clear promise so next call will retry
      throw new Error(
        `Failed to initialize salt: ${error.message}. ` + `Ensure secret exists and Lambda has secretsmanager:GetSecretValue permission.`,
      );
    }
  })();

  return __initPromise;
}

/**
 * Check if salt has been initialized.
 * @returns {boolean}
 */
export function isSaltInitialized() {
  return __cachedSalt !== null;
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

  if (!__cachedSalt) {
    throw new Error(
      "Salt not initialized. Call initializeSalt() in your Lambda handler before using hashSub(). " +
        "For local dev, set USER_SUB_HASH_SALT in .env file.",
    );
  }

  return crypto.createHmac("sha256", __cachedSalt).update(sub).digest("hex");
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
  __cachedSalt = salt;
  __initPromise = null;
}

/**
 * Clear the cached salt. Only works in test environment.
 */
export function _clearSalt() {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("_clearSalt can only be used in test environment");
  }
  __cachedSalt = null;
  __initPromise = null;
}
