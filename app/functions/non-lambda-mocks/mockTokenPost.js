// app/functions/mockTokenPost.js

// import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";

import logger from "../../lib/logger.js";
// import { extractRequest, httpBadRequestResponse, httpOkResponse, httpServerErrorResponse } from "../../lib/responses.js";
// import { validateEnv } from "../../lib/env.js";

// const secretsClient = new SecretsManagerClient();

// caching via module-level variables
// let cachedHmrcClientSecret;

export function apiEndpoint(app) {
  // Proxy to local mock OAuth2 server token endpoint to avoid browser PNA/CORS
  app.post("/api/v1/mock/token", async (req, res) => {
    try {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(req.body || {})) {
        if (Array.isArray(value)) {
          for (const v of value) params.append(key, v);
        } else if (value !== undefined && value !== null) {
          params.append(key, String(value));
        }
      }
      const base = process.env.TEST_MOCK_OAUTH2_BASE || "http://127.0.0.1:8080";
      const resp = await fetch(`${base}/default/token`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      });

      const contentType = resp.headers.get("content-type") || "application/json";
      const text = await resp.text();
      res.status(resp.status).set("content-type", contentType).send(text);
    } catch (e) {
      logger.error(`Mock token proxy error: ${e?.stack || e}`);
      res.status(500).json({ message: "Mock token proxy failed", error: String(e) });
    }
  });
}
