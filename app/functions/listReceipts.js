// app/functions/listReceipts.js
import { ListObjectsV2Command, GetObjectCommand } from "@aws-sdk/client-s3";
import logger from "../lib/logger.js";
import { extractRequest, httpOkResponse, httpServerErrorResponse } from "../lib/responses.js";
import { getUserSub } from "../lib/auth.js";
import { makeReceiptsS3 } from "../lib/s3Env.js";
import { streamToString } from "../lib/streams.js";
import { validateEnv } from "../lib/env.js";

function parseItemFromKey(key) {
  // receipts/{sub}/{timestamp}-{bundleId}.json
  const parts = String(key || "").split("/");
  if (parts.length < 3) return null;
  const filename = parts[parts.length - 1];
  if (!filename.endsWith(".json")) return null;
  const basename = filename.slice(0, -5);
  const dashIdx = basename.indexOf("-");
  if (dashIdx === -1) return null;
  const timestamp = basename.substring(0, dashIdx);
  const bundleId = basename.substring(dashIdx + 1);
  const userSub = parts[1];
  return { key, userSub, timestamp, bundleId };
}

// GET /api/receipts
export async function httpGet(event) {
  validateEnv(["DIY_SUBMIT_RECEIPTS_BUCKET_FULL_NAME"]);

  const request = extractRequest(event);
  logger.info({ message: "listReceipts entry", route: "/api/receipts" });
  try {
    const sub = getUserSub(event || {});
    if (!sub) {
      return {
        statusCode: 401,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ error: "unauthorized" }),
      };
    }

    const { s3, Bucket } = makeReceiptsS3(process.env);
    const Prefix = `receipts/${sub}/`;

    const list = await s3.send(new ListObjectsV2Command({ Bucket, Prefix }));
    const contents = list.Contents || [];
    const items = [];

    for (const obj of contents) {
      if (!obj.Key) continue;
      const meta = parseItemFromKey(obj.Key);
      if (!meta) continue;

      let period = null;
      let amount = null;
      try {
        const got = await s3.send(new GetObjectCommand({ Bucket, Key: obj.Key }));
        const body = await streamToString(got.Body);
        const json = JSON.parse(body);
        period = json?.periodKey || json?.period || null;
        amount = json?.vatDue || json?.amount || null;
      } catch (e) {
        logger.warn({ message: "receipt_enrichment_failed", key: obj.Key, error: e?.message || String(e) });
      }

      items.push({
        key: obj.Key,
        timestamp: meta.timestamp,
        bundleId: meta.bundleId,
        size: obj.Size || null,
        lastModified: obj.LastModified ? new Date(obj.LastModified).toISOString() : null,
        period,
        amount,
      });
    }

    items.sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));

    logger.info({ message: "listReceipts exit", route: "/api/receipts", count: items.length });

    return httpOkResponse({
      request,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      data: { receipts: items },
    });
  } catch (e) {
    logger.error({ message: "listReceipts error", error: e?.message || String(e) });
    return httpServerErrorResponse({
      request,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      message: "Failed to list receipts",
      error: { detail: e?.message || String(e) },
    });
  }
}
