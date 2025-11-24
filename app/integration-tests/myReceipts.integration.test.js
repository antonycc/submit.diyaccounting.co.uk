// app/integration-tests/myReceipts.integration.test.js
import { describe, test, beforeEach, expect } from "vitest";
import express from "express";
import request from "supertest";
import path from "path";
import { fileURLToPath } from "url";
import { mockClient } from "aws-sdk-client-mock";
import { DynamoDBDocumentClient, QueryCommand, GetCommand } from "@aws-sdk/lib-dynamodb";

import { handler as listFn, handler as getFn } from "@app/functions/hmrc/hmrcReceiptGet.js";

function base64UrlEncode(obj) {
  const json = JSON.stringify(obj);
  // eslint-disable-next-line sonarjs/slow-regex
  return Buffer.from(json).toString("base64").replace(/=+$/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function makeIdToken(sub = "mr-user-1", extra = {}) {
  const header = { alg: "none", typ: "JWT" };
  const payload = { sub, ...extra };
  return `${base64UrlEncode(header)}.${base64UrlEncode(payload)}.`;
}

describe("Integration – /api/v1/hmrc/receipt", () => {
  let app;
  const dynamoDbMock = mockClient(DynamoDBDocumentClient);
  const __dirname = path.dirname(fileURLToPath(import.meta.url));

  beforeEach(() => {
    dynamoDbMock.reset();
    process.env.DIY_SUBMIT_BASE_URL = "https://hmrc-test-redirect/";
    process.env.RECEIPTS_DYNAMODB_TABLE_NAME = "integration-test-receipts-table";

    app = express();
    app.use(express.json());
    app.use(express.static(path.join(__dirname, "../../web/public")));

    app.get("/api/v1/hmrc/receipt", async (req, res) => {
      const event = {
        requestContext: {
          requestId: "test-request-id",
          authorizer: {
            lambda: {
              jwt: {
                claims: {
                  "sub": "test-sub",
                  "cognito:username": "test",
                  "email": "test@test.submit.diyaccunting.co.uk",
                  "scope": "read write",
                },
              },
            },
          },
        },
        path: req.path,
        headers: { host: req.get("host") || "localhost:3000", authorization: req.headers.authorization },
        queryStringParameters: req.query || {},
      };
      const { statusCode, body } = await listFn(event);
      res.status(statusCode).send(body || "{}");
    });

    app.get("/api/v1/hmrc/receipt/:name", async (req, res) => {
      const event = {
        requestContext: {
          requestId: "test-request-id",
          authorizer: {
            lambda: {
              jwt: {
                claims: {
                  "sub": "test-sub",
                  "cognito:username": "test",
                  "email": "test@test.submit.diyaccunting.co.uk",
                  "scope": "read write",
                },
              },
            },
          },
        },
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
    const receiptId = "2025-08-01T10:00:00.000Z-XYZ";

    // Mock the Query command for listing receipts
    dynamoDbMock.on(QueryCommand).resolves({
      Items: [
        {
          receiptId: receiptId,
          receipt: { formBundleNumber: "XYZ", amount: 123 },
          createdAt: "2025-08-01T10:00:00.000Z",
        },
      ],
      Count: 1,
    });

    // Mock the Get command for fetching a specific receipt
    dynamoDbMock.on(GetCommand).resolves({
      Item: {
        receiptId: receiptId,
        receipt: { formBundleNumber: "XYZ", amount: 123 },
        createdAt: "2025-08-01T10:00:00.000Z",
      },
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
