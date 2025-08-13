// app/functions/getCatalog.js
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { loadCatalogFromRoot } from "@app/src/lib/productCatalogHelper.js";

let cached = null; // { json, etag, lastModified, object }

function load() {
  const filePath = path.join(process.cwd(), "product-catalog.toml");
  const stat = fs.statSync(filePath);
  const lastModified = stat.mtime.toUTCString();
  const object = loadCatalogFromRoot();
  const json = JSON.stringify(object);
  const etag = 'W/"' + crypto.createHash("sha1").update(json).digest("hex") + '"';
  cached = { json, etag, lastModified, object };
}

function ensureLoaded() {
  if (!cached) load();
}

export async function httpGet(event) {
  try {
    ensureLoaded();
    const ifNoneMatch = event.headers?.["if-none-match"] || event.headers?.["If-None-Match"];
    const ifModifiedSince = event.headers?.["if-modified-since"] || event.headers?.["If-Modified-Since"];

    if (ifNoneMatch && ifNoneMatch === cached.etag) {
      return {
        statusCode: 304,
        headers: {
          ETag: cached.etag,
          "Last-Modified": cached.lastModified,
          "Cache-Control": "public, max-age=60",
        },
        body: "",
      };
    }
    if (ifModifiedSince && ifModifiedSince === cached.lastModified) {
      return {
        statusCode: 304,
        headers: {
          ETag: cached.etag,
          "Last-Modified": cached.lastModified,
          "Cache-Control": "public, max-age=60",
        },
        body: "",
      };
    }

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        ETag: cached.etag,
        "Last-Modified": cached.lastModified,
        "Cache-Control": "public, max-age=60",
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
