// app/lib/parameterStore.js
// Utility for fetching and caching secrets from AWS Systems Manager Parameter Store

import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";
import { createLogger } from "./logger.js";

const logger = createLogger({ source: "app/lib/parameterStore.js" });

// Initialize SSM client with region from environment
const region = process.env.AWS_REGION || "eu-west-2";
const ssm = new SSMClient({ region });

// In-memory cache for parameter values
const cache = new Map();

// Default cache TTL in milliseconds (1 hour)
const DEFAULT_CACHE_TTL_MS = 60 * 60 * 1000;

/**
 * Retrieves a parameter value from AWS Systems Manager Parameter Store.
 * Values are cached in memory for subsequent requests.
 *
 * @param {string} name - The parameter name (e.g., '/prod/submit/google/client_secret')
 * @param {Object} options - Options for retrieving the parameter
 * @param {number} options.cacheTtlMs - Cache TTL in milliseconds (default: 1 hour)
 * @param {boolean} options.forceRefresh - Force refresh from Parameter Store, bypassing cache
 * @returns {Promise<string>} The parameter value
 * @throws {Error} If the parameter cannot be retrieved
 */
export async function getParameter(name, options = {}) {
  const { cacheTtlMs = DEFAULT_CACHE_TTL_MS, forceRefresh = false } = options;

  // Check cache first (unless force refresh)
  if (!forceRefresh && cache.has(name)) {
    const cached = cache.get(name);
    const now = Date.now();
    if (now - cached.timestamp < cacheTtlMs) {
      logger.debug(`Parameter '${name}' retrieved from cache`);
      return cached.value;
    }
    logger.debug(`Parameter '${name}' cache expired, refreshing`);
  }

  // Fetch from Parameter Store
  try {
    logger.info(`Fetching parameter '${name}' from Parameter Store`);
    const command = new GetParameterCommand({
      Name: name,
      WithDecryption: true,
    });
    const result = await ssm.send(command);

    if (!result.Parameter || !result.Parameter.Value) {
      throw new Error(`Parameter '${name}' not found or has no value`);
    }

    const value = result.Parameter.Value;

    // Store in cache
    cache.set(name, {
      value,
      timestamp: Date.now(),
    });

    logger.info(`Parameter '${name}' fetched and cached successfully`);
    return value;
  } catch (error) {
    logger.error(`Failed to fetch parameter '${name}':`, error);
    throw new Error(`Failed to fetch parameter '${name}': ${error.message}`);
  }
}

/**
 * Alias for getParameter that retrieves a secret value.
 * This provides a clearer API for secret retrieval.
 *
 * @param {string} name - The parameter name
 * @param {Object} options - Options for retrieving the parameter
 * @returns {Promise<string>} The secret value
 */
export async function getSecret(name, options = {}) {
  return getParameter(name, options);
}

/**
 * Clears the parameter cache for a specific parameter or all parameters.
 *
 * @param {string} [name] - The parameter name to clear, or undefined to clear all
 */
export function clearCache(name) {
  if (name) {
    cache.delete(name);
    logger.debug(`Cache cleared for parameter '${name}'`);
  } else {
    cache.clear();
    logger.debug("Cache cleared for all parameters");
  }
}

/**
 * Gets cache statistics for monitoring purposes.
 *
 * @returns {Object} Cache statistics
 */
export function getCacheStats() {
  return {
    size: cache.size,
    keys: Array.from(cache.keys()),
  };
}
