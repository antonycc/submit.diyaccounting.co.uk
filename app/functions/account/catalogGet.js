// app/functions/account/catalogGet.js

import { loadCatalogFromRoot } from "../../lib/productCatalogHelper.js";
import { extractRequest, http200OkResponse, http500ServerErrorResponse } from "../../lib/responses.js";
import { createLogger } from "../../lib/logger.js";
import { buildHttpResponseFromLambdaResult, buildLambdaEventFromHttpRequest } from "../../lib/httpHelper.js";
import { enforceBundles } from "../../lib/bundleManagement.js";
import { http403ForbiddenFromBundleEnforcement } from "../../lib/hmrcHelper.js";

const logger = createLogger({ source: "app/functions/account/catalogGet.js" });

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
  const { request } = extractRequest(event);
  const responseHeaders = { "Content-Type": "application/json" };

  // No bundle enforcement

  // If HEAD request, return 200 OK immediately
  if (event?.requestContext?.http?.method === "HEAD") {
    return http200OkResponse({
      request,
      headers: { "Content-Type": "application/json" },
      data: {},
    });
  }

  logger.info({ message: "Retrieving product catalog" });

  try {
    const catalogData = await loadCatalog();
    // loadCatalog currently returns a JSON string; convert to object for http200OkResponse
    const catalogObject = typeof catalogData === "string" ? JSON.parse(catalogData) : catalogData;

    logger.info({ message: "Successfully retrieved catalog", size: catalogData.length });

    return http200OkResponse({
      request,
      headers: { ...responseHeaders },
      data: catalogObject,
    });
  } catch (error) {
    logger.error({ message: "Error loading catalog", error: error.message, stack: error.stack });
    return http500ServerErrorResponse({
      request,
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
