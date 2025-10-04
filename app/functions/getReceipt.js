// app/functions/getReceipt.js
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
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
  const { hostname } = new URL(homeUrl);
  let envPrefix = "";
  if (homeUrl === "https://submit.diyaccounting.co.uk/") {
    envPrefix = "prod.";
  }
  const dashedDomain = `${envPrefix}${hostname}`.split(".").join("-");
  const receiptsBucketFullName = `${dashedDomain}-receipts`;

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

    const key = event.queryStringParameters?.key || event.pathParameters?.key || null;
    if (!key || !key.startsWith(`receipts/${user.sub}/`)) {
      return {
        statusCode: 403,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "forbidden" }),
      };
    }

    const { Bucket, s3Client } = buildBucketAndClient();
    const got = await s3Client.send(new GetObjectCommand({ Bucket, Key: key }));

    const body = await streamToString(got.Body);
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body,
    };
  } catch (e) {
    logger.error({ message: "getReceipt error", error: e?.message || String(e) });
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "get_error", message: e?.message || String(e) }),
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
