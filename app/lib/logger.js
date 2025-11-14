// app/lib/logger.js

import fs from "fs";
import path from "path";
import pino from "pino";
import { dotenvConfigIfNotBlank } from "./env.js";

dotenvConfigIfNotBlank({ path: ".env" });

// Configure pino logger to mimic previous Winston behaviours controlled by env vars:
// - LOG_TO_CONSOLE: enable console logging when not set to "false" (default on)
// - LOG_TO_FILE: enable file logging only when set to "true" (default off)
// - LOG_FILE_PATH: optional explicit file path; otherwise default to ./target/submit-<ISO>.log

const logToConsole = process.env.LOG_TO_CONSOLE !== "false"; // default on
const logToFile = process.env.LOG_TO_FILE === "true"; // default off

let destinationStream;

if (logToConsole && logToFile) {
  // Both console and file
  const timestamp = new Date().toISOString().replace(/:/g, "-");
  const defaultPath = `./target/submit-${timestamp}.log`;
  const logFilePath = process.env.LOG_FILE_PATH || defaultPath;

  // Ensure directory exists
  const dir = path.dirname(logFilePath);
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {
    // ignore mkdir errors; pino will throw on write if truly unusable
  }

  const streams = [{ stream: process.stdout }, { stream: pino.destination({ dest: logFilePath, sync: false }) }];
  destinationStream = pino.multistream(streams);
} else if (logToConsole) {
  // Console only (default)
  destinationStream = process.stdout;
} else if (logToFile) {
  // File only
  const timestamp = new Date().toISOString().replace(/:/g, "-");
  const defaultPath = `./target/submit-${timestamp}.log`;
  const logFilePath = process.env.LOG_FILE_PATH || defaultPath;

  const dir = path.dirname(logFilePath);
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (error) {
    console.error(`Failed to create log directory ${dir}:`, error);
  }

  destinationStream = pino.destination({ dest: logFilePath, sync: false });
}

// If neither console nor file are enabled, produce a disabled logger (no output)
export const logger = pino(
  {
    level: "info",
    // timestamp: pino.stdTimeFunctions.isoTime,
    enabled: Boolean(destinationStream),
    base: null, // removes pid and hostname
    timestamp: false, // Avoid Pino’s comma-prefixed timestamp chunk
    // Add an ISO time field as a normal JSON property
    mixin() {
      return { time: new Date().toISOString() };
    },
    // formatters: {
    // remove the level key entirely
    //  level: () => ({}),
    // },
    // transport: { target: "pino-pretty", options: { translateTime: "SYS:standard" } },
  },
  destinationStream,
);

// Store for contextual information such as a request ID
export const context = new Map();

export default logger;
