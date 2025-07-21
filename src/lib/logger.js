// src/lib/logger.js
import winston from "winston";

const { createLogger, format, transports } = winston;

import "dotenv/config"; // use dotenv to load environment variables

const timestamp = new Date().toISOString().replace(/:/g, "-");
const logFilePath = process.env.LOG_FILE_PATH || `./submit-${timestamp}.log`;

export const winstonConsoleLogger = createLogger({
  level: "info",
  format: format.combine(format.timestamp(), format.json()),
  transports: [
    new transports.Console(),
    new transports.File({ filename: logFilePath })
  ]
});

export default winstonConsoleLogger;
