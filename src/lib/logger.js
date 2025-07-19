// src/lib/logger.js
import winston from "winston";

const { createLogger, format, transports } = winston;

import "dotenv/config"; // use dotenv to load environment variables

export const winstonConsoleLogger = createLogger({
  format: format.json(),
  transports: [new transports.Console()],
});

export default winstonConsoleLogger;
