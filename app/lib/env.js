// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/lib/env.js

import dotenv from "dotenv";
import fs from "fs";

export function dotenvConfigIfNotBlank({ path }) {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- path is from trusted .env file config
  if (!fs.existsSync(path)) {
    if (path !== ".env") {
      `dotenvConfigIfNotBlank: Environment config file not found: ${path}`;
    }
    return;
  }
  console.log(`dotenvConfigIfNotBlank: Loading environment config from ${path}`);
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- path is from trusted .env file config
  const parsed = dotenv.parse(fs.readFileSync(path));
  /* eslint-disable security/detect-object-injection -- key/value come from Object.entries over parsed env vars */
  for (const [key, value] of Object.entries(parsed)) {
    const current = process.env[key];
    if (!current || !current.trim()) {
      process.env[key] = value;
    }
  }
  /* eslint-enable security/detect-object-injection */
}

export function validateEnv(requiredVars) {
  // eslint-disable-next-line security/detect-object-injection -- name comes from trusted requiredVars array
  const bad = requiredVars.map((name) => [name, process.env[name]]).filter(([, value]) => !value || !value.trim());

  if (bad.length) {
    const details = bad.map(([key, value]) => `${key}=${value ?? "undefined"}`).join(", ");
    throw new Error(`Missing or blank environment variables: ${details}`);
  }
}
