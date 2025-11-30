// behaviour-tests/helpers/dynamodb-assertions.js

import fs from "node:fs";
import { expect } from "@playwright/test";
import { createLogger } from "@app/lib/logger.js";

const logger = createLogger({ source: "behaviour-tests/helpers/dynamodb-assertions.js" });

/**
 * Read and parse a JSONL file exported from DynamoDB
 * @param {string} filePath - Path to the .jsonl file
 * @returns {Array<Object>} Array of parsed JSON objects
 */
export function readDynamoDbExport(filePath) {
  if (!fs.existsSync(filePath)) {
    logger.warn(`DynamoDB export file not found: ${filePath}`);
    return [];
  }

  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  return lines
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        logger.error(`Failed to parse line in ${filePath}: ${line}`, error);
        return null;
      }
    })
    .filter((item) => item !== null);
}

/**
 * Find HMRC API request records by URL pattern
 * @param {string} exportFilePath - Path to hmrc-api-requests.jsonl
 * @param {string|RegExp} urlPattern - URL pattern to match (string for contains, RegExp for pattern)
 * @returns {Array<Object>} Matching request records
 */
export function findHmrcApiRequestsByUrl(exportFilePath, urlPattern) {
  const records = readDynamoDbExport(exportFilePath);

  if (typeof urlPattern === "string") {
    return records.filter((record) => record.url && record.url.includes(urlPattern));
  } else if (urlPattern instanceof RegExp) {
    return records.filter((record) => record.url && urlPattern.test(record.url));
  }

  return [];
}

/**
 * Find HMRC API request records by method and URL pattern
 * @param {string} exportFilePath - Path to hmrc-api-requests.jsonl
 * @param {string} method - HTTP method (GET, POST, etc.)
 * @param {string|RegExp} urlPattern - URL pattern to match
 * @returns {Array<Object>} Matching request records
 */
export function findHmrcApiRequestsByMethodAndUrl(exportFilePath, method, urlPattern) {
  const allMatches = findHmrcApiRequestsByUrl(exportFilePath, urlPattern);
  return allMatches.filter((record) => record.method === method);
}

/**
 * Assert that at least one HMRC API request exists for the given URL pattern
 * @param {string} exportFilePath - Path to hmrc-api-requests.jsonl
 * @param {string} method - HTTP method
 * @param {string|RegExp} urlPattern - URL pattern to match
 * @param {string} description - Description for error messages
 */
export function assertHmrcApiRequestExists(exportFilePath, method, urlPattern, description = "") {
  console.log(`Asserting HMRC API request exists: ${method} ${urlPattern}`);
  const matches = findHmrcApiRequestsByMethodAndUrl(exportFilePath, method, urlPattern);
  const desc = description ? ` (${description})` : "";
  expect(matches.length, `Expected at least one ${method} request to ${urlPattern}${desc}`).toBeGreaterThan(0);
  return matches;
}

/**
 * Assert specific values in an HMRC API request record
 * @param {Object} record - The HMRC API request record
 * @param {Object} expectedValues - Object with expected field values
 */
export function assertHmrcApiRequestValues(record, expectedValues) {
  for (const [key, expectedValue] of Object.entries(expectedValues)) {
    const actualValue = getNestedValue(record, key);
    expect(actualValue, `Expected ${key} to be ${expectedValue}, but got ${actualValue}`).toBe(expectedValue);
  }
}

/**
 * Get a nested value from an object using dot notation
 * @param {Object} obj - The object to search
 * @param {string} path - Dot-notation path (e.g., "httpRequest.method")
 * @returns {*} The value at the path, or undefined if not found
 */
function getNestedValue(obj, path) {
  const parts = path.split(".");
  let current = obj;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }
    current = current[part];
  }

  return current;
}

/**
 * Assert that all HMRC API requests have the same hashedSub
 * @param {string} exportFilePath - Path to hmrc-api-requests.jsonl
 * @param {string} description - Description for error messages
 * @param {Object} options - Options for validation
 * @param {number} options.maxHashedSubs - Maximum allowed unique hashedSub values (default: 2)
 * @param {boolean} options.allowOAuthDifference - Allow different hashedSub for OAuth requests (default: true)
 */
export function assertConsistentHashedSub(exportFilePath, description = "", options = {}) {
  const { maxHashedSubs = 2, allowOAuthDifference = true } = options;

  const records = readDynamoDbExport(exportFilePath);

  if (records.length === 0) {
    logger.warn(`No HMRC API request records found in ${exportFilePath}`);
    return;
  }

  const hashedSubs = [...new Set(records.map((r) => r.hashedSub).filter((h) => h))];
  const desc = description ? ` (${description})` : "";

  // If allowing OAuth difference, validate that we have at most 2 hashedSubs: one for OAuth, one for authenticated
  if (allowOAuthDifference && hashedSubs.length === 2) {
    const oauthRequests = records.filter((r) => r.url && r.url.includes("/oauth/token"));
    const authenticatedRequests = records.filter((r) => r.url && !r.url.includes("/oauth/token"));

    const oauthHashedSubs = [...new Set(oauthRequests.map((r) => r.hashedSub))];
    const authenticatedHashedSubs = [...new Set(authenticatedRequests.map((r) => r.hashedSub))];

    // Verify OAuth requests use one hashedSub and authenticated requests use another
    expect(oauthHashedSubs.length, `Expected OAuth requests to have a single hashedSub${desc}, but found ${oauthHashedSubs.length}`).toBe(
      1,
    );

    expect(
      authenticatedHashedSubs.length,
      `Expected authenticated requests to have a single hashedSub${desc}, but found ${authenticatedHashedSubs.length}`,
    ).toBe(1);

    logger.info(
      `Found ${records.length} HMRC API requests: OAuth (${oauthRequests.length}) with hashedSub ${oauthHashedSubs[0]}, ` +
        `authenticated (${authenticatedRequests.length}) with hashedSub ${authenticatedHashedSubs[0]}`,
    );
  } else {
    expect(
      hashedSubs.length,
      `Expected all HMRC API requests to have the same hashedSub${desc}, but found ${hashedSubs.length} different values: ${hashedSubs.join(", ")}`,
    ).toBeLessThanOrEqual(maxHashedSubs);

    logger.info(`Found ${records.length} HMRC API requests with ${hashedSubs.length} unique hashedSub value(s)`);
  }

  return hashedSubs;
}
