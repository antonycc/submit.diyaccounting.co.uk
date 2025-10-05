// app/functions/myReceipts.js
import { ListObjectsV2Command, GetObjectCommand } from "@aws-sdk/client-s3";
import logger from "../lib/logger.js";
import { extractRequest, httpOkResponse, httpBadRequestResponse, httpServerErrorResponse } from "../lib/responses.js";
import { getUserSub } from "../lib/auth.js";
import { makeReceiptsS3 } from "../lib/s3Env.js";
import { streamToString } from "../lib/streams.js";
import { validateEnv } from "@app/lib/env.js";

function parseReceiptKey(key) {
  // receipts/{sub}/{timestamp}-{bundle}.json
  const parts = String(key || "").split("/");
  if (parts.length < 3) return { ok: false };
  const name = parts[parts.length - 1];
  const sub = parts[1];
  if (!name.endsWith(".json")) return { ok: false };
  const base = name.slice(0, -5);
  const dashIdx = base.lastIndexOf("-");
  if (dashIdx === -1) return { ok: false };
  const timestamp = base.substring(0, dashIdx);
  const formBundleNumber = base.substring(dashIdx + 1);
  return { ok: true, name, sub, timestamp, formBundleNumber };
}

// GET /api/my/receipts
export async function httpGet(event) {
  validateEnv(["DIY_SUBMIT_RECEIPTS_BUCKET_FULL_NAME"]);

  const request = extractRequest(event);
  logger.info({ message: "myReceipts list entry", route: "/api/my/receipts" });

  const userSub = getUserSub(event || {});
  if (!userSub) {
    return {
      statusCode: 401,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: "unauthorized", message: "Authentication required" }),
    };
  }

  const { s3, Bucket } = makeReceiptsS3(process.env);
  const Prefix = `receipts/${userSub}/`;

  let ContinuationToken = undefined;
  const items = [];
  try {
    do {
      const resp = await s3.send(new ListObjectsV2Command({ Bucket, Prefix, ContinuationToken, MaxKeys: 1000 }));
      (resp.Contents || []).forEach((o) => {
        const meta = parseReceiptKey(o.Key);
        if (meta.ok) {
          items.push({
            key: o.Key,
            name: meta.name,
            timestamp: meta.timestamp,
            formBundleNumber: meta.formBundleNumber,
            size: o.Size,
            lastModified: o.LastModified ? new Date(o.LastModified).toISOString() : undefined,
          });
        }
      });
      ContinuationToken = resp.IsTruncated ? resp.NextContinuationToken : undefined;
    } while (ContinuationToken);

    items.sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));

    logger.info({ message: "myReceipts list exit", route: "/api/my/receipts", count: items.length });

    return httpOkResponse({
      request,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      data: { receipts: items },
    });
  } catch (e) {
    logger.error({ message: "Failed to list receipts", error: e?.message || String(e) });
    return httpServerErrorResponse({
      request,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      message: "list_failed",
      error: { detail: e?.message || String(e) },
    });
  }
}

// GET /api/my/receipts/{name} or ?name= or ?key=
export async function httpGetByName(event) {
  validateEnv(["DIY_SUBMIT_RECEIPTS_BUCKET_FULL_NAME"]);

  const request = extractRequest(event);
  logger.info({ message: "myReceipts get entry", route: "/api/my/receipts/{name}" });

  const userSub = getUserSub(event || {});
  if (!userSub) {
    return {
      statusCode: 401,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: "unauthorized", message: "Authentication required" }),
    };
  }
  const providedKey = event.pathParameters?.key || event.queryStringParameters?.key;
  const name = event.pathParameters?.name || event.queryStringParameters?.name;

  let Key;
  if (providedKey) {
    if (!providedKey.startsWith(`receipts/${userSub}/`) || providedKey.includes("..")) {
      return {
        statusCode: 403,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ error: "forbidden" }),
      };
    }
    Key = providedKey;
  } else if (name) {
    if (!/^[^/]+\.json$/.test(name)) {
      return httpBadRequestResponse({
        request,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        message: "bad_request",
      });
    }
    Key = `receipts/${userSub}/${name}`;
  } else {
    return httpBadRequestResponse({
      request,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      message: "Missing name or key",
    });
  }

  const { s3, Bucket } = makeReceiptsS3(process.env);

  try {
    const resp = await s3.send(new GetObjectCommand({ Bucket, Key }));
    const bodyString = await streamToString(resp.Body);

    logger.info({ message: "myReceipts get exit", route: "/api/my/receipts/{name}", key: Key });

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: bodyString,
    };
  } catch (e) {
    const statusCode = e?.$metadata?.httpStatusCode || 500;
    if (statusCode === 404) {
      return httpBadRequestResponse({
        request,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        message: "not_found",
      });
    }
    logger.error({ message: "Failed to get receipt", error: e?.message || String(e) });
    return httpServerErrorResponse({
      request,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      message: "get_failed",
      error: { detail: e?.message || String(e) },
    });
  }
}
