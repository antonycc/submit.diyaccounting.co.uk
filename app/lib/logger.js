// app/lib/logger.js

import winston from "winston";
import dotenv from "dotenv";

dotenv.config({ path: '.env' });

const { createLogger, format, transports } = winston;
const logTransports = [];

// Add Console transport if DIY_SUBMIT_LOG_TO_CONSOLE is enabled (default on)
if (process.env.DIY_SUBMIT_LOG_TO_CONSOLE != "false") {
  logTransports.push(new transports.Console());
}

// Add File transport only when DIY_SUBMIT_LOG_TO_FILE is enabled (default off)
if (process.env.DIY_SUBMIT_LOG_TO_FILE === "true") {
  const timestamp = new Date().toISOString().replace(/:/g, "-");
  const logFilePath =
    process.env.LOG_FILE_PATH || `./submit-${timestamp}.log`;
  logTransports.push(new transports.File({ filename: logFilePath }));
}

export const winstonConsoleLogger = createLogger({
  level: "info",
  format: format.combine(format.timestamp(), format.json()),
  transports: logTransports,
});

export default winstonConsoleLogger;
