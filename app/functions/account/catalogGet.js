// app/functions/catalogGet.js
import { loadCatalogFromRoot } from "../../lib/productCatalogHelper.js";
import { extractRequest } from "../../lib/responses.js";
import logger from "../../lib/logger.js";
import { buildHttpResponseFromLambdaResult, buildLambdaEventFromHttpRequest } from "../../lib/httpHelper.js";

let cached = null; // { json, etag, lastModified, object, validated }

async function load() {
  const object = loadCatalogFromRoot();
  const json = JSON.stringify(object);
  cached = { json, object, validated: true };
}

async function ensureLoaded() {
  if (!cached) await load();
}

export function apiEndpoint(app) {
  app.get("/api/v1/catalog", async (httpRequest, httpResponse) => {
    const lambdaEvent = buildLambdaEventFromHttpRequest(httpRequest);
    const lambdaResult = await handler(lambdaEvent);
    return buildHttpResponseFromLambdaResult(lambdaResult, httpResponse);
  });
}

export async function handler(event) {
  const { request, requestId } = extractRequest(event);
  logger.info({ message: "getCatalog entry", route: "/api/v1/catalog", request });
  try {
    await ensureLoaded();

    logger.info({
      message: "getCatalog exit",
      route: "/api/v1/catalog",
      status: 200,
      size: cached.json.length,
      etag: cached.etag,
      lastModified: cached.lastModified,
      request,
    });

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
      },
      body: cached.json,
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "failed_to_load_catalog", message: err?.message || String(err) }),
    };
  }
}
