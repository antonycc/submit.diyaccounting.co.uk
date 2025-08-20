// app/integration-tests/requireActivity.integration.test.js
import { describe, test, beforeEach, expect } from "vitest";
import express from "express";
import request from "supertest";
import { requireActivity } from "@app/lib/entitlementsService.js";
import { httpPost as requestBundle } from "@app/functions/bundle.js";

function base64UrlEncode(obj) {
  const json = JSON.stringify(obj);
  return Buffer.from(json).toString("base64").replace(/=+$/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function makeIdToken(sub = "guard-user-1", extra = {}) {
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

describe("Integration – requireActivity middleware", () => {
  let app;

  beforeEach(() => {
    process.env.DIY_SUBMIT_BUNDLE_MOCK = "true";
    app = express();
    app.use(express.json());

    app.post("/protected", requireActivity("submit-vat-sandbox"), (req, res) => {
      res.status(200).json({ ok: true });
    });

    app.post("/api/request-bundle", async (req, res) => {
      const event = {
        path: req.path,
        headers: { authorization: req.headers.authorization },
        body: JSON.stringify(req.body),
      };
      const { statusCode, body } = await requestBundle(event);
      res.status(statusCode).send(body || "{}");
    });
  });

  test("403 before grant, 200 after test grant", async () => {
    const token = makeIdToken("guard-user-guest");

    const resForbidden = await request(app).post("/protected").set("Authorization", `Bearer ${token}`).send({});
    expect(resForbidden.status).toBe(403);
    const bodyForbidden = JSON.parse(resForbidden.text || "{}");
    expect(bodyForbidden.error).toBe("not_allowed");
    expect(Array.isArray(bodyForbidden.bundles)).toBe(true);

    const resGrant = await request(app)
      .post("/api/request-bundle")
      .set("Authorization", `Bearer ${token}`)
      .send({ bundleId: "test" });
    expect(resGrant.status).toBe(200);

    const resAllowed = await request(app).post("/protected").set("Authorization", `Bearer ${token}`).send({});
    expect(resAllowed.status).toBe(200);
    const bodyAllowed = JSON.parse(resAllowed.text || "{}");
    expect(bodyAllowed.ok).toBe(true);
  });
});
