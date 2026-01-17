// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// web/public/lib/env-loader.js
(function () {
  "use strict";

  async function loadEnv() {
    const response = await fetch("/submit.env", { cache: "no-store" });
    if (!response.ok) {
      throw new Error("Failed to load /submit.env");
    }

    const text = await response.text();
    const env = {};

    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx === -1) continue;
      const key = trimmed.slice(0, idx).trim();
      const value = trimmed.slice(idx + 1).trim();

      env[key] = value;
    }

    window.__env = env;
  }

  window.loadEnv = loadEnv;
})();
