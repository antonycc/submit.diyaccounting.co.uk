// app/integration-tests/bundleRoute.integration.test.js
import { describe, test, beforeEach, expect } from "vitest";
import express from "express";
import request from "supertest";
import path from "path";
import { fileURLToPath } from "url";

import { handler as requestBundle } from "@app/functions/bundlePost.js";

function base64UrlEncode(obj) {
  const json = JSON.stringify(obj);
  return Buffer.from(json).toString("base64").replace(/=+$/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function makeIdToken(sub = "route-user-1") {
  const header = { alg: "none", typ: "JWT" };
  const payload = {
    sub,
    email: `${sub}@example.com`,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
  };
  return `${base64UrlEncode(header)}.${base64UrlEncode(payload)}.`;
}

describe("Integration – /api/v1/bundle route (MOCK)", () => {
  let app;
  const __dirname = path.dirname(fileURLToPath(import.meta.url));

  beforeEach(() => {
    process.env.TEST_BUNDLE_MOCK = "true";
    process.env.TEST_BUNDLE_EXPIRY_DATE = "2025-12-31";
    process.env.TEST_BUNDLE_USER_LIMIT = "1000";

    app = express();
    app.use(express.json());
    app.use(express.static(path.join(__dirname, "../../web/public")));

    const routePath = "/api/v1/bundle";
    app.post(routePath, async (req, res) => {
      const event = {
        path: req.path,
        headers: { host: req.get("host") || "localhost:3000", authorization: req.headers.authorization },
        queryStringParameters: req.query || {},
        body: JSON.stringify(req.body),
      };
      const { statusCode, body } = await requestBundle(event);
      res.status(statusCode).send(body || "{}");
    });
  });

  test("should grant HMRC_TEST_API bundle", async () => {
    const token = makeIdToken("integration-bundle-user");
    const res = await request(app).post("/api/v1/bundle").set("Authorization", `Bearer ${token}`).send({ bundleId: "HMRC_TEST_API" });

    expect(res.status).toBe(200);
    const body = JSON.parse(res.text || "{}");
    expect(["granted", "already_granted"]).toContain(body.status);
    expect(Array.isArray(body.bundles)).toBe(true);
  });
});
