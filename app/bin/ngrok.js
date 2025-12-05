#!/usr/bin/env node
// app/bin/ngrok.js

import { dotenvConfigIfNotBlank } from "../lib/env.js";
import ngrok from "@ngrok/ngrok";

dotenvConfigIfNotBlank({ path: ".env" });

import { createLogger } from "../lib/logger.js";

const logger = createLogger({ source: "app/bin/ngrok.js" });

/**
 * Extract domain from a URL string
 * @param {string} url - URL string (e.g., "https://example.com/path")
 * @returns {string} Domain without protocol or trailing slash (e.g., "example.com")
 */
export function extractDomainFromUrl(url) {
  if (!url) return undefined;
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

/**
 * Start ngrok tunnel
 * @param {Object} options - Configuration options
 * @param {string|number} options.addr - Local port or address to forward (e.g., 3000 or "localhost:3000")
 * @param {string} [options.domain] - Custom ngrok domain (e.g., "wanted-finally-anteater.ngrok-free.app")
 * @param {boolean} [options.poolingEnabled=true] - Enable connection pooling
 * @returns {Promise<Object>} Object with listener, endpoint (url), and stop function
 */
export async function startNgrok({ addr = 3000, domain, poolingEnabled = true } = {}) {
  logger.info(`[ngrok]: Starting ngrok tunnel for address: ${addr}, domain: ${domain || "auto"}, pooling: ${poolingEnabled}`);

  try {
    const config = {
      addr,
      authtoken_from_env: true,
    };

    // Add domain if specified
    if (domain) {
      config.domain = domain;
    }

    // Add pooling if enabled
    if (poolingEnabled) {
      config.pooling_enabled = poolingEnabled;
    }

    const listener = await ngrok.forward(config);
    const endpoint = listener.url();

    logger.info(`[ngrok]: ✅ Tunnel established at ${endpoint}`);

    const stop = async () => {
      try {
        logger.info(`[ngrok]: Closing tunnel...`);
        await listener.close();
        logger.info(`[ngrok]: ✅ Tunnel closed`);
      } catch (error) {
        logger.error("[ngrok]: Error closing tunnel:", error);
      }
    };

    return { listener, endpoint, stop };
  } catch (error) {
    logger.error("[ngrok]: Failed to start tunnel:", error);
    throw error;
  }
}

// Only start the tunnel if this file is being run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  // Get configuration from environment variables or command line arguments
  const port = process.argv[2] || process.env.TEST_SERVER_HTTP_PORT || 3000;
  const domain = process.env.NGROK_DOMAIN || extractDomainFromUrl(process.env.DIY_SUBMIT_BASE_URL);

  let stop;

  try {
    logger.info("[ngrok]: Starting ngrok tunnel...");
    const started = await startNgrok({
      addr: parseInt(port, 10),
      domain: domain,
      poolingEnabled: true,
    });
    stop = started.stop;
    const endpoint = started.endpoint;
    console.log(`Ngrok started url=${endpoint}`);

    logger.info("[ngrok]: Tunnel is running. Press CTRL-C to stop.");

    // Handle graceful shutdown
    let isShuttingDown = false;
    const gracefulShutdown = async (signal) => {
      if (isShuttingDown) return;
      isShuttingDown = true;

      logger.info(`\n[ngrok]: Received ${signal}. Shutting down tunnel...`);
      try {
        await stop?.();
        logger.info("[ngrok]: Tunnel stopped successfully.");
      } catch (error) {
        logger.error("[ngrok]: Error stopping tunnel:", error);
      }
      process.exit(0);
    };

    // Listen for termination signals
    process.on("SIGINT", () => gracefulShutdown("SIGINT"));
    process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

    // Keep the process alive
    const keepAlive = setInterval(() => {
      // This interval keeps the process running
    }, 1000);

    // Clean up interval on exit
    process.on("exit", () => {
      clearInterval(keepAlive);
    });
  } catch (error) {
    logger.error("[ngrok]: Failed to start tunnel:", error);
    process.exit(1);
  }
}
