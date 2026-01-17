// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/lib/envSchema.js
// Zod-based environment variable validation

import { z } from "zod";

/**
 * Schema for common environment variables
 */
const commonEnvSchema = z.object({
  // AWS Configuration
  AWS_REGION: z.string().default("eu-west-2"),
  AWS_ENDPOINT_URL: z.string().url().optional(),
  AWS_ENDPOINT_URL_DYNAMODB: z.string().url().optional(),

  // DynamoDB Tables
  BUNDLE_DYNAMODB_TABLE_NAME: z.string().optional(),
  RECEIPTS_DYNAMODB_TABLE_NAME: z.string().optional(),
  HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME: z.string().optional(),
  ASYNC_REQUESTS_DYNAMODB_TABLE_NAME: z.string().optional(),

  // Logging Configuration
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).default("info"),
  LOG_TO_CONSOLE: z.enum(["true", "false"]).default("true"),
  LOG_TO_FILE: z.enum(["true", "false"]).default("false"),
  LOG_FILE_PATH: z.string().optional(),

  // Application Environment
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  ENVIRONMENT_NAME: z.string().optional(),
});

/**
 * Schema for HMRC OAuth configuration
 */
const hmrcOAuthSchema = z.object({
  HMRC_CLIENT_ID: z.string().min(1),
  HMRC_CLIENT_SECRET: z.string().min(1),
  HMRC_REDIRECT_URI: z.string().url(),
  HMRC_API_BASE_URL: z.string().url().default("https://api.service.hmrc.gov.uk"),
  HMRC_AUTH_BASE_URL: z.string().url().default("https://www.tax.service.gov.uk"),
});

/**
 * Schema for Cognito configuration
 */
const cognitoSchema = z.object({
  COGNITO_USER_POOL_ID: z.string().min(1),
  COGNITO_CLIENT_ID: z.string().min(1),
  COGNITO_CLIENT_SECRET: z.string().min(1).optional(),
});

/**
 * Validate environment variables against a schema
 * @param {z.ZodSchema} schema - The Zod schema to validate against
 * @param {object} env - The environment object (defaults to process.env)
 * @returns {object} The validated and typed environment object
 * @throws {Error} If validation fails
 */
export function validateEnvWithSchema(schema, env = process.env) {
  const result = schema.safeParse(env);

  if (!result.success) {
    const errors = result.error.issues.map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`).join("\n");
    throw new Error(`Environment validation failed:\n${errors}`);
  }

  return result.data;
}

/**
 * Parse a boolean environment variable
 * @param {string|undefined} value - The environment variable value
 * @param {boolean} defaultValue - The default value if not set
 * @returns {boolean} The parsed boolean value
 */
export function parseEnvBoolean(value, defaultValue = false) {
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }
  return value.toLowerCase() === "true";
}

/**
 * Parse an integer environment variable
 * @param {string|undefined} value - The environment variable value
 * @param {number} defaultValue - The default value if not set
 * @returns {number} The parsed integer value
 */
export function parseEnvInt(value, defaultValue) {
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Get a required environment variable
 * @param {string} name - The environment variable name
 * @returns {string} The environment variable value
 * @throws {Error} If the variable is not set or empty
 */
export function requireEnv(name) {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Required environment variable ${name} is not set`);
  }
  return value;
}

/**
 * Get an optional environment variable with a default
 * @param {string} name - The environment variable name
 * @param {string} defaultValue - The default value if not set
 * @returns {string} The environment variable value or default
 */
export function getEnv(name, defaultValue = "") {
  const value = process.env[name];
  return value && value.trim() ? value : defaultValue;
}

export { commonEnvSchema, hmrcOAuthSchema, cognitoSchema };
