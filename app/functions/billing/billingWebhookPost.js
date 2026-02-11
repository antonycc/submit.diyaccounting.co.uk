// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/functions/billing/billingWebhookPost.js

import { createLogger } from "../../lib/logger.js";
import { extractRequest, http200OkResponse } from "../../lib/httpResponseHelper.js";
import { buildHttpResponseFromLambdaResult, buildLambdaEventFromHttpRequest } from "../../lib/httpServerToLambdaAdaptor.js";

const logger = createLogger({ source: "app/functions/billing/billingWebhookPost.js" });

/* v8 ignore start */
export function apiEndpoint(app) {
  app.post("/api/v1/billing/webhook", async (httpRequest, httpResponse) => {
    const lambdaEvent = buildLambdaEventFromHttpRequest(httpRequest);
    const lambdaResult = await ingestHandler(lambdaEvent);
    return buildHttpResponseFromLambdaResult(lambdaResult, httpResponse);
  });
}
/* v8 ignore stop */

export async function ingestHandler(event) {
  const { request } = extractRequest(event);
  logger.info({ message: "Billing webhook endpoint - not yet implemented" });

  return {
    statusCode: 501,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: "Not implemented" }),
  };
}
