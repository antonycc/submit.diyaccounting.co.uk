#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

/**
 * Build FAQs from TOML to JSON
 *
 * This script converts the FAQ data from TOML format to JSON
 * for use by the client-side FAQ search functionality.
 */

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import TOML from "@iarna/toml";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, "..");

const inputPath = join(projectRoot, "src", "data", "faqs.toml");
const outputDir = join(projectRoot, "web", "public", "data");
const outputPath = join(outputDir, "faqs.json");

function buildFaqs() {
  try {
    // Ensure output directory exists
    mkdirSync(outputDir, { recursive: true });

    // Read and parse TOML
    const tomlContent = readFileSync(inputPath, "utf-8");
    const data = TOML.parse(tomlContent);

    // Validate FAQ data
    if (!data.faq || !Array.isArray(data.faq)) {
      console.error("Error: No [[faq]] entries found in TOML file");
      process.exit(1);
    }

    // Validate each FAQ entry
    for (const faq of data.faq) {
      if (!faq.id || !faq.question || !faq.answer || !faq.category) {
        console.error(`Error: FAQ entry missing required fields: ${JSON.stringify(faq)}`);
        process.exit(1);
      }
      if (!faq.keywords || !Array.isArray(faq.keywords)) {
        console.warn(`Warning: FAQ "${faq.id}" has no keywords array`);
        faq.keywords = [];
      }
      if (typeof faq.priority !== "number") {
        console.warn(`Warning: FAQ "${faq.id}" has no priority, defaulting to 999`);
        faq.priority = 999;
      }
    }

    // Sort by priority for default display order
    data.faq.sort((a, b) => a.priority - b.priority);

    // Write JSON
    writeFileSync(outputPath, JSON.stringify(data, null, 2));
    console.log(`Built ${data.faq.length} FAQs to ${outputPath}`);
  } catch (error) {
    console.error("Error building FAQs:", error.message);
    process.exit(1);
  }
}

buildFaqs();
