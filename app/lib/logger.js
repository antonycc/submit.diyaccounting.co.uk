// app/lib/logger.js

import winston from "winston";
import { dotenvConfigIfNotBlank } from "./env.js";

dotenvConfigIfNotBlank({ path: ".env" });

const { createLogger, format, transports } = winston;
const logTransports = [];

// Add Console transport if LOG_TO_CONSOLE is enabled (default on)
if (process.env.LOG_TO_CONSOLE != "false") {
  logTransports.push(new transports.Console());
}

// Add File transport only when LOG_TO_FILE is enabled (default off)
if (process.env.LOG_TO_FILE === "true") {
  const timestamp = new Date().toISOString().replace(/:/g, "-");
  const logFilePath = process.env.LOG_FILE_PATH || `./target/submit-${timestamp}.log`;
  logTransports.push(new transports.File({ filename: logFilePath }));
}

export const winstonConsoleLogger = createLogger({
  level: "info",
  format: format.combine(format.timestamp(), format.json()),
  transports: logTransports,
});

export default winstonConsoleLogger;
