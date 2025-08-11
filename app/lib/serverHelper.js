// app/lib/serverHelper.js

import logger from "./logger.js";
import { setTimeout } from "timers/promises";

export async function checkIfServerIsRunning(url, delay = 500) {
  let serverReady = false;
  let attempts = 0;
  logger.info(`Checking server readiness for...`, url);
  while (!serverReady && attempts < 15) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        serverReady = true;
        // Log the body of the response for debugging
        const responseBody = await response.text();
        logger.info("Response body", responseBody, url);
        logger.info("Server is ready!", url);
      }
    } catch (error) {
      attempts++;
      logger.error(`Server check attempt ${attempts}/15 failed: ${error.message}`);
      await setTimeout(delay);
    }
  }

  if (!serverReady) {
    throw new Error(`Server failed to start after ${attempts} attempts`);
  }
}