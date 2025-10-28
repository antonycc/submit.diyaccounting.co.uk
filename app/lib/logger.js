// app/lib/logger.js

import pino from "pino";
import { dotenvConfigIfNotBlank } from "./env.js";

dotenvConfigIfNotBlank({ path: ".env" });

// Create simple pino logger
const pinoLogger = pino({
  level: "info",
  timestamp: pino.stdTimeFunctions.isoTime,
});

export const winstonConsoleLogger = pinoLogger;
export default pinoLogger;
