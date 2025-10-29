// app/integration-tests/myReceipts.integration.test.js
import { describe, test, beforeEach, expect } from "vitest";
import express from "express";
import request from "supertest";
import path from "path";
import { fileURLToPath } from "url";
import { mockClient } from "aws-sdk-client-mock";
import { S3Client, ListObjectsV2Command, GetObjectCommand } from "@aws-sdk/client-s3";

import { handler as listFn, httpGetByName as getFn } from "@app/functions/hmrc/hmrcReceiptGet.js";

function base64UrlEncode(obj) {
  const json = JSON.stringify(obj);
  return Buffer.from(json).toString("base64").replace(/=+$/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function makeIdToken(sub = "mr-user-1", extra = {}) {
  const header = { alg: "none", typ: "JWT" };
  const payload = { sub, ...extra };
  return `${base64UrlEncode(header)}.${base64UrlEncode(payload)}.`;
}

describe("Integration – /api/v1/hmrc/receipt", () => {
  let app;
  const s3Mock = mockClient(S3Client);
  const __dirname = path.dirname(fileURLToPath(import.meta.url));

  beforeEach(() => {
    s3Mock.reset();
    process.env.DIY_SUBMIT_BASE_URL = "https://hmrc-test-redirect/";
    process.env.DIY_SUBMIT_RECEIPTS_BUCKET_NAME = "integration-test-bucket";
    process.env.TEST_S3_ENDPOINT = "http://localhost:9000";

    app = express();
    app.use(express.json());
    app.use(express.static(path.join(__dirname, "../../web/public")));

    app.get("/api/v1/hmrc/receipt", async (req, res) => {
      const event = {
        path: req.path,
        headers: { host: req.get("host") || "localhost:3000", authorization: req.headers.authorization },
        queryStringParameters: req.query || {},
      };
      const { statusCode, body } = await listFn(event);
      res.status(statusCode).send(body || "{}");
    });

    app.get("/api/v1/hmrc/receipt/:name", async (req, res) => {
      const event = {
        path: req.path,
        headers: { host: req.get("host") || "localhost:3000", authorization: req.headers.authorization },
        pathParameters: { name: req.params.name },
        queryStringParameters: req.query || {},
      };
      const { statusCode, body } = await getFn(event);
      res.status(statusCode).send(body || "{}");
    });
  });

  test("authorized user can list and fetch own receipts", async () => {
    const sub = "mr-user-2";
    const token = makeIdToken(sub);
    s3Mock.on(ListObjectsV2Command).resolves({
      Contents: [{ Key: `receipts/${sub}/2025-08-01T10:00:00.000Z-XYZ.json`, Size: 42 }],
      IsTruncated: false,
    });
    const bodyText = JSON.stringify({ formBundleNumber: "XYZ", amount: 123 });
    s3Mock.on(GetObjectCommand).resolves({
      Body: new ReadableStreamMock(bodyText),
    });

    const resList = await request(app).get("/api/v1/hmrc/receipt").set("Authorization", `Bearer ${token}`);
    expect(resList.status).toBe(200);
    const list = JSON.parse(resList.text || "{}");
    expect(Array.isArray(list.receipts)).toBe(true);
    expect(list.receipts.length).toBe(1);
    expect(list.receipts[0].formBundleNumber).toBe("XYZ");

    const resGet = await request(app).get("/api/v1/hmrc/receipt/2025-08-01T10:00:00.000Z-XYZ.json").set("Authorization", `Bearer ${token}`);
    expect(resGet.status).toBe(200);
    const rec = JSON.parse(resGet.text || "{}");
    expect(rec.formBundleNumber).toBe("XYZ");
  });

  test("unauthorized returns 401", async () => {
    const res = await request(app).get("/api/v1/hmrc/receipt");
    expect(res.status).toBe(401);
  });
});

class ReadableStreamMock {
  constructor(text) {
    this._text = text;
    this.readable = true;
  }
  on(event, handler) {
    if (event === "data") {
      handler(Buffer.from(this._text));
    } else if (event === "end") {
      setTimeout(handler, 0);
    } else if (event === "error") {
      // no-op
    }
  }
}
