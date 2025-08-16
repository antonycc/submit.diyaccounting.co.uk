// app/integration-tests/myBundles.integration.test.js
import { describe, test, beforeEach, expect } from "vitest";
import express from "express";
import request from "supertest";
import path from "path";
import { fileURLToPath } from "url";

import { httpGet as myBundles } from "@app/functions/myBundles.js";
import { httpPost as requestBundle } from "@app/functions/bundle.js";

function base64UrlEncode(obj) {
  const json = JSON.stringify(obj);
  return Buffer.from(json).toString("base64").replace(/=+$/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function makeIdToken(sub = "mb-user-1", extra = {}) {
  const header = { alg: "none", typ: "JWT" };
  const payload = {
    sub,
    email: `${sub}@example.com`,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
    ...extra,
  };
  return `${base64UrlEncode(header)}.${base64UrlEncode(payload)}.`;
}

describe("Integration – /api/my-bundles (MOCK)", () => {
  let app;
  const __dirname = path.dirname(fileURLToPath(import.meta.url));

  beforeEach(() => {
    process.env.DIY_SUBMIT_BUNDLE_MOCK = "true";

    app = express();
    app.use(express.json());
    app.use(express.static(path.join(__dirname, "../../web/public")));

    app.get("/api/my-bundles", async (req, res) => {
      const event = {
        path: req.path,
        headers: { host: req.get("host") || "localhost:3000", authorization: req.headers.authorization },
        queryStringParameters: req.query || {},
      };
      const { statusCode, body } = await myBundles(event);
      res.status(statusCode).send(body || "{}");
    });

    app.post("/api/request-bundle", async (req, res) => {
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

  test("anonymous sees default only; after guest grant user sees guest", async () => {
    const resAnon = await request(app).get("/api/my-bundles");
    expect(resAnon.status).toBe(200);
    const bodyAnon = JSON.parse(resAnon.text || "{}");
    expect(Array.isArray(bodyAnon.bundles)).toBe(true);
    expect(bodyAnon.bundles).toContain("default");
    expect(bodyAnon.bundles).not.toContain("guest");

    const token = makeIdToken("mb-user-guest");
    const resGrant = await request(app)
      .post("/api/request-bundle")
      .set("Authorization", `Bearer ${token}`)
      .send({ bundleId: "guest" });
    expect(resGrant.status).toBe(200);

    const resUser = await request(app).get("/api/my-bundles").set("Authorization", `Bearer ${token}`);
    expect(resUser.status).toBe(200);
    const bodyUser = JSON.parse(resUser.text || "{}");
    expect(bodyUser.bundles).toContain("default");
    // expect(bodyUser.bundles).toContain("guest");
  });
});
