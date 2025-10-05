// app/lib/env.js

import dotenv from "dotenv";
import fs from "fs";
import logger from "./logger.js";

export function dotenvConfigIfNotBlank({ path }) {
  if (!fs.existsSync(path)) {
    if (path !== ".env") {
      logger.warn(`dotenvConfigIfNotBlank: Environment config file not found: ${path}`);
    }
    return;
  }
  const parsed = dotenv.parse(fs.readFileSync(path));
  for (const [key, value] of Object.entries(parsed)) {
    const current = process.env[key];
    if (!current || !current.trim()) {
      process.env[key] = value;
    }
  }
}

export function validateEnv(requiredVars) {
  const bad = requiredVars.map((name) => [name, process.env[name]]).filter(([, value]) => !value || !value.trim());

  if (bad.length) {
    const details = bad.map(([key, value]) => `${key}=${value ?? "undefined"}`).join(", ");
    throw new Error(`Missing or blank environment variables: ${details}`);
  }
}
