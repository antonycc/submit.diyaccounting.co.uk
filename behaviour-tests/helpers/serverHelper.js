// behaviour-tests/helpers/serverHelper.js

import logger from "@app/lib/logger.js";
import { setTimeout } from "timers/promises";

export async function checkIfServerIsRunning(url, delay = 500, runServer = undefined, label = "") {
  let serverReady = false;
  let attempts = 0;
  logger.info(`[${label}]: Checking server readiness for... ${url}`, url);
  try {
    const response = await fetch(url);
    if (response.ok) {
      logger.info(`[${label}]: Server is ready! at ${url}`, url);
      serverReady = true;
    } else if (runServer) {
      logger.info(`[${label}]: Starting server at ${url}`, url);
      runServer();
    }
  } catch (error) {
    logger.info(`[${label}]: Starting server at ${url} after error ${error}`, url, error);
    if (runServer) {
      runServer();
    }
  }
  while (!serverReady && attempts < 15) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        serverReady = true;
        // Log the body of the response for debugging
        const responseBody = await response.text();
        logger.info(`[${label}]: Response body`, responseBody, url);
        logger.info(`[${label}]: Server is ready! at ${url}`, url);
      }
    } catch (error) {
      attempts++;
      logger.error(`[${label}]: Server check attempt ${attempts}/15 failed: ${error.message} from ${url}`);
      await setTimeout(delay);
    }
  }

  if (!serverReady) {
    throw new Error(`[${label}]: Server failed to start after ${attempts} attempts`);
  }
}
