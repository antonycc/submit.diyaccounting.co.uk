#!/usr/bin/env node
// app/bin/main.js

import {fileURLToPath} from "url";
import dotenv from 'dotenv';

dotenv.config({ path: '.env' });

export function main(args) {
  console.log(`Run with: ${JSON.stringify(args)}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  main(args);
}
