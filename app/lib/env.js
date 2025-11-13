// app/lib/env.js

import dotenv from "dotenv";
import fs from "fs";

/**
 * Loads environment variables from a .env file, only setting variables that are blank or missing.
 * Existing non-blank environment variables are preserved.
 *
 * @param {Object} params - Configuration parameters
 * @param {string} params.path - Path to the .env file to load
 *
 * @example
 * dotenvConfigIfNotBlank({ path: '.env.test' })
 */
export function dotenvConfigIfNotBlank({ path }) {
  if (!fs.existsSync(path)) {
    if (path !== ".env") {
      `dotenvConfigIfNotBlank: Environment config file not found: ${path}`;
    }
    return;
  }
  console.log(`dotenvConfigIfNotBlank: Loading environment config from ${path}`);
  const parsed = dotenv.parse(fs.readFileSync(path));
  for (const [key, value] of Object.entries(parsed)) {
    const current = process.env[key];
    if (!current || !current.trim()) {
      process.env[key] = value;
    }
  }
}

/**
 * Validates that required environment variables are set and non-blank.
 * Throws an error if any required variables are missing or blank.
 *
 * @param {Array<string>} requiredVars - Array of required environment variable names
 * @throws {Error} When any required variable is missing or blank, with details of all missing variables
 *
 * @example
 * validateEnv(['HMRC_CLIENT_ID', 'HMRC_CLIENT_SECRET'])
 */
export function validateEnv(requiredVars) {
  const bad = requiredVars.map((name) => [name, process.env[name]]).filter(([, value]) => !value || !value.trim());

  if (bad.length) {
    const details = bad.map(([key, value]) => `${key}=${value ?? "undefined"}`).join(", ");
    throw new Error(`Missing or blank environment variables: ${details}`);
  }
}
