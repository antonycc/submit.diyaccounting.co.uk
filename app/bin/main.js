#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/bin/main.js

import { fileURLToPath } from "url";
import { dotenvConfigIfNotBlank } from "../lib/env.js";

dotenvConfigIfNotBlank({ path: ".env" });

export function main(args) {
  console.log(`Run with: ${JSON.stringify(args)}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  main(args);
}
