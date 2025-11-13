// app/functions/account/catalogGet.js

import { loadCatalogFromRoot } from "../../lib/productCatalogHelper.js";
import { extractRequest, http200OkResponse, http500ServerErrorResponse } from "../../lib/responses.js";
import logger from "../../lib/logger.js";
import { buildHttpResponseFromLambdaResult, buildLambdaEventFromHttpRequest } from "../../lib/httpHelper.js";

let cached = null; // { json, etag, lastModified, object, validated }

// Server hook for Express app, and construction of a Lambda-like event from HTTP request)
export function apiEndpoint(app) {
  app.get("/api/v1/catalog", async (httpRequest, httpResponse) => {
    const lambdaEvent = buildLambdaEventFromHttpRequest(httpRequest);
    const lambdaResult = await handler(lambdaEvent);
    return buildHttpResponseFromLambdaResult(lambdaResult, httpResponse);
  });
}

// HTTP request/response, aware Lambda handler function
export async function handler(event) {
  const { request, requestId } = extractRequest(event);
  const responseHeaders = { "Content-Type": "application/json", "x-request-id": requestId };

  logger.info({ requestId, message: "Retrieving product catalog" });

  try {
    const catalogData = await loadCatalog();
    // loadCatalog currently returns a JSON string; convert to object for http200OkResponse
    const catalogObject = typeof catalogData === "string" ? JSON.parse(catalogData) : catalogData;

    logger.info({ requestId, message: "Successfully retrieved catalog", size: catalogData.length });

    return http200OkResponse({
      request,
      requestId,
      headers: { ...responseHeaders },
      data: catalogObject,
    });
  } catch (error) {
    logger.error({ requestId, message: "Error loading catalog", error: error.message, stack: error.stack });
    return http500ServerErrorResponse({
      request,
      requestId,
      headers: { ...responseHeaders },
      message: "Failed to load catalog",
      error: error.message,
    });
  }
}

// Service adaptor aware of the downstream service but not the consuming Lambda's incoming/outgoing HTTP request/response
export async function loadCatalog() {
  if (!cached) {
    const object = loadCatalogFromRoot();
    const json = JSON.stringify(object);
    cached = { json, object, validated: true };
  }

  return cached.json;
}
