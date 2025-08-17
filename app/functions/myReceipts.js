// app/functions/myReceipts.js
import { S3Client, ListObjectsV2Command, GetObjectCommand } from "@aws-sdk/client-s3";
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

function userSubFromEvent(event) {
  const auth = event.headers?.authorization || event.headers?.Authorization;
  if (!auth || !auth.startsWith("Bearer ")) return null;
  const token = auth.split(" ")[1];
  const claims = decodeJwtNoVerify(token) || {};
  return claims.sub || null;
}

function buildReceiptsBucketFullName() {
  const homeUrl = process.env.DIY_SUBMIT_HOME_URL;
  const receiptsBucketPostfix = process.env.DIY_SUBMIT_RECEIPTS_BUCKET_POSTFIX;
  const { hostname } = new URL(homeUrl);
  let envPrefix = "";
  if (homeUrl === "https://submit.diyaccounting.co.uk/") {
    envPrefix = "prod.";
  }
  const dashedDomain = `${envPrefix}${hostname}`.split(".").join("-");
  return `${dashedDomain}-${receiptsBucketPostfix}`;
}

function buildTestS3ConfigIfNeeded() {
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
  return s3Config;
}

function parseReceiptKey(key) {
  // Expect: receipts/{sub}/{timestamp}-{bundle}.json
  const parts = String(key || "").split("/");
  if (parts.length < 3) return { ok: false };
  const name = parts[parts.length - 1];
  const sub = parts[1];
  const m = name.match(/^(.*)-(.*)\.json$/);
  if (!m) return { ok: false };
  const timestamp = m[1];
  const formBundleNumber = m[2];
  return { ok: true, name, sub, timestamp, formBundleNumber };
}

export async function httpGet(event) {
  // List receipts for authenticated user
  const userSub = userSubFromEvent(event || {});
  if (!userSub) {
    return {
      statusCode: 401,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "unauthorized", message: "Authentication required" }),
    };
  }
  if (!process.env.DIY_SUBMIT_RECEIPTS_BUCKET_POSTFIX) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "config_error", message: "DIY_SUBMIT_RECEIPTS_BUCKET_POSTFIX not set" }),
    };
  }

  const Bucket = buildReceiptsBucketFullName();
  const Prefix = `receipts/${userSub}/`;
  const s3 = new S3Client(buildTestS3ConfigIfNeeded());

  let ContinuationToken = undefined;
  const items = [];
  try {
    do {
      const resp = await s3.send(
        new ListObjectsV2Command({ Bucket, Prefix, ContinuationToken, MaxKeys: 1000 }),
      );
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

    // Sort by timestamp desc
    items.sort((a, b) => (a.timestamp > b.timestamp ? -1 : a.timestamp < b.timestamp ? 1 : 0));

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ receipts: items }),
    };
  } catch (e) {
    logger.error({ message: "Failed to list receipts", error: e });
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "list_failed", message: e?.message || String(e) }),
    };
  }
}

export async function httpGetByName(event) {
  // Retrieve a single receipt either by object name (timestamp-bundle.json) or full key
  const userSub = userSubFromEvent(event || {});
  if (!userSub) {
    return {
      statusCode: 401,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "unauthorized", message: "Authentication required" }),
    };
  }
  const providedKey = event.pathParameters?.key || event.queryStringParameters?.key;
  const name = event.pathParameters?.name || event.queryStringParameters?.name;

  let Key;
  if (providedKey) {
    // Security: must be under user's own prefix
    if (!providedKey.startsWith(`receipts/${userSub}/`) || providedKey.includes("..")) {
      return {
        statusCode: 403,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "forbidden", message: "Access to requested key is not allowed" }),
      };
    }
    Key = providedKey;
  } else if (name) {
    if (!/^[^/]+\.json$/.test(name)) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "bad_request", message: "Invalid name format" }),
      };
    }
    Key = `receipts/${userSub}/${name}`;
  } else {
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "bad_request", message: "Missing name or key parameter" }),
    };
  }

  const Bucket = buildReceiptsBucketFullName();
  const s3 = new S3Client(buildTestS3ConfigIfNeeded());

  try {
    const resp = await s3.send(new GetObjectCommand({ Bucket, Key }));
    // resp.Body is a stream; convert to string
    const bodyString = await streamToString(resp.Body);
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: bodyString,
    };
  } catch (e) {
    const statusCode = e?.$metadata?.httpStatusCode || 500;
    if (statusCode === 404) {
      return {
        statusCode: 404,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "not_found", message: "Receipt not found" }),
      };
    }
    logger.error({ message: "Failed to get receipt", error: e });
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "get_failed", message: e?.message || String(e) }),
    };
  }
}

function streamToString(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    stream.on("error", (err) => reject(err));
    stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
  });
}
