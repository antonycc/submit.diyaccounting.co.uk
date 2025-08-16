// app/functions/listReceipts.js
import { ListObjectsV2Command, GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import dotenv from "dotenv";
import logger from "../lib/logger.js";

dotenv.config({ path: ".env" });

function decodeJwtNoVerify(token) {
  try {
    const parts = String(token || "").split(".");
    if (parts.length < 2) return null;
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = Buffer.from(payload, "base64").toString("utf8");
    return JSON.parse(json);
  } catch (_err) {
    return null;
  }
}

function userCtxFromEvent(event) {
  const auth = event.headers?.authorization || event.headers?.Authorization;
  if (!auth || !auth.startsWith("Bearer ")) return { sub: null, claims: {} };
  const token = auth.split(" ")[1];
  const claims = decodeJwtNoVerify(token) || {};
  return { sub: claims.sub || null, claims };
}

function buildBucketAndClient() {
  const homeUrl = process.env.DIY_SUBMIT_HOME_URL;
  const receiptsBucketPostfix = process.env.DIY_SUBMIT_RECEIPTS_BUCKET_POSTFIX;
  const { hostname } = new URL(homeUrl);
  let envPrefix = "";
  if (homeUrl === "https://submit.diyaccounting.co.uk/") {
    envPrefix = "prod.";
  }
  const dashedDomain = `${envPrefix}${hostname}`.split(".").join("-");
  const receiptsBucketFullName = `${dashedDomain}-${receiptsBucketPostfix}`;

  let s3Config = {};
  if (
    process.env.NODE_ENV !== "stubbed" &&
    process.env.DIY_SUBMIT_TEST_S3_ENDPOINT &&
    process.env.DIY_SUBMIT_TEST_S3_ENDPOINT !== "off"
  ) {
    s3Config = {
      endpoint: process.env.DIY_SUBMIT_TEST_S3_ENDPOINT,
      region: "us-east-1",
      credentials: {
        accessKeyId: process.env.DIY_SUBMIT_TEST_S3_ACCESS_KEY,
        secretAccessKey: process.env.DIY_SUBMIT_TEST_S3_SECRET_KEY,
      },
      forcePathStyle: true,
    };
  }
  const s3Client = new S3Client(s3Config);
  return { Bucket: receiptsBucketFullName, s3Client };
}

function parseItemFromKey(key) {
  // Expect keys like receipts/{sub}/{timestamp}-{bundleId}.json
  const parts = key.split("/");
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

export async function httpGet(event) {
  try {
    const user = userCtxFromEvent(event || {});
    if (!user.sub) {
      return {
        statusCode: 401,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "unauthorized" }),
      };
    }

    const { Bucket, s3Client } = buildBucketAndClient();
    const Prefix = `receipts/${user.sub}/`;

    const list = await s3Client.send(new ListObjectsV2Command({ Bucket, Prefix }));
    const contents = list.Contents || [];
    const items = [];

    for (const obj of contents) {
      if (!obj.Key) continue;
      const meta = parseItemFromKey(obj.Key);
      if (!meta) continue;

      // Attempt to enrich with minimal fields from JSON (optional)
      let period = null;
      let amount = null;
      try {
        const got = await s3Client.send(new GetObjectCommand({ Bucket, Key: obj.Key }));
        const body = await streamToString(got.Body);
        const json = JSON.parse(body);
        period = json?.periodKey || json?.period || null;
        amount = json?.vatDue || json?.amount || null;
      } catch (_e) {
        // ignore enrichment errors
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

    // Sort descending by timestamp
    items.sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ receipts: items }),
    };
  } catch (e) {
    logger.error({ message: "listReceipts error", error: e?.message || String(e) });
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "list_error", message: e?.message || String(e) }),
    };
  }
}

async function streamToString(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });
}
