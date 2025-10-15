// behaviour-tests/helpers/serverHelper.js

import logger from "@app/lib/logger.js";
import { setTimeout } from "timers/promises";

export async function checkIfServerIsRunning(url, delay = 500, runServer = undefined) {
  let serverReady = false;
  let attempts = 0;
  logger.info(`Checking server readiness for... ${url}`, url);

  // First, check if server is already running
  try {
    const response = await fetch(url);
    if (response.ok) {
      logger.info(`Server is already ready! at ${url}`, url);
      return;
    }
  } catch (error) {
    logger.info(`Server check failed initially at ${url}, will start server`, url, error);
  }

  // If server is not ready and we have a function to start it, call it
  if (runServer) {
    logger.info(`Starting server at ${url}`, url);
    await runServer();
  }

  // Now wait for the server to become ready
  while (!serverReady && attempts < 15) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        serverReady = true;
        // Log the body of the response for debugging
        const responseBody = await response.text();
        logger.info("Response body", responseBody, url);
        logger.info(`Server is ready! at ${url}`, url);
      }
    } catch (error) {
      attempts++;
      logger.error(`Server check attempt ${attempts}/15 failed: ${error.message} from ${url}`);
      await setTimeout(delay);
    }
  }

  if (!serverReady) {
    throw new Error(`Server failed to start after ${attempts} attempts`);
  }
}
