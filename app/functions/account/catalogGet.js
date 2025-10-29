// app/functions/catalogGet.js
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { loadCatalogFromRoot } from "../../lib/productCatalogHelper.js";
import { extractRequest } from "../../lib/responses.js";

import logger from "../../lib/logger.js";

let cached = null; // { json, etag, lastModified, object, validated }

async function load() {
  const filePath = path.join(process.cwd(), "product-catalogue.toml");
  const stat = fs.statSync(filePath);
  const lastModified = stat.mtime.toUTCString();
  const object = loadCatalogFromRoot();
  const json = JSON.stringify(object);
  const etag = 'W/"' + crypto.createHash("sha256").update(json).digest("hex") + '"';
  cached = { json, etag, lastModified, object, validated: true };
}

async function ensureLoaded() {
  if (!cached) await load();
}

// GET /api/v1/catalog
export async function handler(event) {
  const request = extractRequest(event);
  logger.info({ message: "getCatalog entry", route: "/api/v1/catalog", request });
  try {
    await ensureLoaded();
    const ifNoneMatch = event.headers?.["if-none-match"] || event.headers?.["If-None-Match"];
    const ifModifiedSince = event.headers?.["if-modified-since"] || event.headers?.["If-Modified-Since"];

    if (ifNoneMatch && ifNoneMatch === cached.etag) {
      logger.info({
        message: "getCatalog exit",
        route: "/api/v1/catalog",
        status: 304,
        etag: cached.etag,
        request,
      });
      return {
        statusCode: 304,
        headers: {
          "ETag": cached.etag,
          "Last-Modified": cached.lastModified,
          "Cache-Control": "public, max-age=60",
          "X-Catalog-Validated": String(!!cached.validated),
        },
        body: "",
      };
    }
    if (ifModifiedSince && ifModifiedSince === cached.lastModified) {
      logger.info({
        message: "getCatalog exit",
        route: "/api/v1/catalog",
        status: 304,
        lastModified: cached.lastModified,
        request,
      });
      return {
        statusCode: 304,
        headers: {
          "ETag": cached.etag,
          "Last-Modified": cached.lastModified,
          "Cache-Control": "public, max-age=60",
          "X-Catalog-Validated": String(!!cached.validated),
        },
        body: "",
      };
    }

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
        "ETag": cached.etag,
        "Last-Modified": cached.lastModified,
        "Cache-Control": "public, max-age=60",
        "X-Catalog-Validated": String(!!cached.validated),
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
