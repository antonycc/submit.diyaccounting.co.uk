// app/lib/hmrcVatApi.js

import logger from "./logger.js";

export function shouldUseStub(stubEnvVar) {
  const stubData = process.env[stubEnvVar];
  if (!stubData) {
    return false;
  }
  try {
    const parsedData = JSON.parse(stubData);
    return parsedData["source"] === "stub";
  } catch (e) {
    // If parsing fails, assume it's not stub data
    logger.warn({
      message: `Failed to parse stub data from ${stubEnvVar} when checking for stub usage`,
      error: e.message,
    });
    return false;
  }
}

export function getStubData(stubEnvVar, defaultData = {}) {
  const stubData = process.env[stubEnvVar];
  if (stubData) {
    try {
      return JSON.parse(stubData);
    } catch (e) {
      logger.warn({
        message: `Failed to parse stub data from ${stubEnvVar}`,
        error: e.message,
      });
    }
  }
  return defaultData;
}
