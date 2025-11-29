// behaviour-tests/helpers/dynamodb-assertions.js

import fs from "node:fs";
import path from "node:path";
import { expect } from "@playwright/test";
import logger from "../../app/lib/logger.js";

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
 */
export function assertConsistentHashedSub(exportFilePath, description = "") {
  const records = readDynamoDbExport(exportFilePath);

  if (records.length === 0) {
    logger.warn(`No HMRC API request records found in ${exportFilePath}`);
    return;
  }

  const hashedSubs = [...new Set(records.map((r) => r.hashedSub).filter((h) => h))];
  const desc = description ? ` (${description})` : "";

  expect(
    hashedSubs.length,
    `Expected all HMRC API requests to have the same hashedSub${desc}, but found ${hashedSubs.length} different values: ${hashedSubs.join(", ")}`,
  ).toBeLessThanOrEqual(2); // Allow up to 2: one for OAuth (no userSub) and one for authenticated requests

  logger.info(`Found ${records.length} HMRC API requests with ${hashedSubs.length} unique hashedSub value(s)`);

  return hashedSubs;
}
