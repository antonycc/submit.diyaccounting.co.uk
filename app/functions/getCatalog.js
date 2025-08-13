// app/functions/getCatalog.js
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { loadCatalogFromRoot } from "@app/src/lib/productCatalogHelper.js";

let cached = null; // { json, etag, lastModified, object, validated }

async function validateCatalog(object) {
  try {
    // Lazy load AJV if present; if missing, skip validation
    const { default: Ajv } = await import("ajv").catch(() => ({ default: null }));
    if (!Ajv) return { ok: true, validated: false };
    const ajv = new Ajv({ allErrors: true, strict: false });
    const schemaPath = path.join(process.cwd(), "_developers/schemas/product-catalog.schema.json");
    const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
    const validate = ajv.compile(schema);
    const ok = validate(object);
    if (!ok) {
      const errors = (validate.errors || []).map((e) => `${e.instancePath} ${e.message}`).join("; ");
      return { ok: false, errors };
    }
    return { ok: true, validated: true };
  } catch (_e) {
    // On any error, skip validation
    return { ok: true, validated: false };
  }
}

async function load() {
  const filePath = path.join(process.cwd(), "product-catalog.toml");
  const stat = fs.statSync(filePath);
  const lastModified = stat.mtime.toUTCString();
  const object = loadCatalogFromRoot();
  const validation = await validateCatalog(object);
  if (!validation.ok) {
    throw new Error(`Catalog validation failed: ${validation.errors}`);
  }
  const json = JSON.stringify(object);
  const etag = 'W/"' + crypto.createHash("sha1").update(json).digest("hex") + '"';
  cached = { json, etag, lastModified, object, validated: !!validation.validated };
}

async function ensureLoaded() {
  if (!cached) await load();
}

export async function httpGet(event) {
  try {
    await ensureLoaded();
    const ifNoneMatch = event.headers?.["if-none-match"] || event.headers?.["If-None-Match"];
    const ifModifiedSince = event.headers?.["if-modified-since"] || event.headers?.["If-Modified-Since"];

    if (ifNoneMatch && ifNoneMatch === cached.etag) {
      return {
        statusCode: 304,
        headers: {
          ETag: cached.etag,
          "Last-Modified": cached.lastModified,
          "Cache-Control": "public, max-age=60",
          "X-Catalog-Validated": String(!!cached.validated),
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
          "X-Catalog-Validated": String(!!cached.validated),
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
