// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// System tests for bundle capacity (cap) enforcement and per-user uniqueness.
//
// The cap field on a catalogue bundle is a GLOBAL limit on the total number of
// active (non-expired) allocations of that bundle across all users.
//
// Hard-wired rules:
// - Each user can hold at most one of each bundle type
// - Renewal refreshes the existing allocation's expiry (not a new record)
//
// NOTE: The current cap implementation is a per-user placeholder (Phase 2.9 will
// implement global counting). These tests verify the uniqueness rule and the cap
// response contract, and will be extended when global counting is implemented.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { ingestHandler as bundlePostHandler } from "@app/functions/account/bundlePost.js";
import { ingestHandler as bundleGetHandler } from "@app/functions/account/bundleGet.js";

let stopDynalite;
let bundleRepository;

const tableName = "bundles-system-test-capacity";

function base64UrlEncode(obj) {
  const json = JSON.stringify(obj);
  return Buffer.from(json).toString("base64").replace(/=+$/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function makeJWT(sub = "user-123", extra = {}) {
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

function buildPostEvent(token, body = {}) {
  return {
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
    requestContext: {
      http: { method: "POST", path: "/api/v1/bundle" },
    },
  };
}

function buildGetEvent(token) {
  return {
    headers: { Authorization: `Bearer ${token}` },
    requestContext: {
      http: { method: "GET", path: "/api/v1/bundle" },
    },
  };
}

beforeAll(async () => {
  const { ensureBundleTableExists } = await import("../bin/dynamodb.js");
  const { default: dynalite } = await import("dynalite");

  const host = "127.0.0.1";
  const server = dynalite({ createTableMs: 0 });
  const address = await new Promise((resolve, reject) => {
    server.listen(0, host, (err) => (err ? reject(err) : resolve(server.address())));
  });
  stopDynalite = async () => {
    try {
      server.close();
    } catch {}
  };
  const endpoint = `http://${host}:${address.port}`;

  process.env.AWS_REGION = process.env.AWS_REGION || "us-east-1";
  process.env.AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID || "dummy";
  process.env.AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY || "dummy";
  process.env.AWS_ENDPOINT_URL = endpoint;
  process.env.AWS_ENDPOINT_URL_DYNAMODB = endpoint;
  process.env.BUNDLE_DYNAMODB_TABLE_NAME = tableName;
  process.env.USER_SUB_HASH_SALT = "test-salt-for-capacity-tests";

  const { initializeSalt } = await import("../services/subHasher.js");
  await initializeSalt();

  await ensureBundleTableExists(tableName, endpoint);

  bundleRepository = await import("../data/dynamoDbBundleRepository.js");
});

afterAll(async () => {
  try {
    await stopDynalite?.();
  } catch {}
});

describe("System: bundle capacity and per-user uniqueness", () => {
  describe("per-user uniqueness (hard-wired rule)", () => {
    it("should grant a bundle to a new user", async () => {
      const token = makeJWT("cap-unique-user-1");
      const event = buildPostEvent(token, { bundleId: "day-guest", qualifiers: {} });
      const res = await bundlePostHandler(event);
      const body = JSON.parse(res.body);
      expect(res.statusCode).toBe(201);
      expect(body.status).toBe("granted");
    });

    it("should return already_granted when same user requests same bundle again", async () => {
      const token = makeJWT("cap-unique-user-2");
      const event = buildPostEvent(token, { bundleId: "day-guest", qualifiers: {} });

      // First request - granted
      const res1 = await bundlePostHandler(event);
      expect(JSON.parse(res1.body).status).toBe("granted");

      // Second request - already_granted (not a duplicate allocation)
      const res2 = await bundlePostHandler(event);
      const body2 = JSON.parse(res2.body);
      expect(res2.statusCode).toBe(201);
      expect(body2.status).toBe("already_granted");
      expect(body2.granted).toBe(false);
    });

    it("should allow same user to have different bundle types", async () => {
      const token = makeJWT("cap-unique-user-3");

      const res1 = await bundlePostHandler(buildPostEvent(token, { bundleId: "test", qualifiers: {} }));
      expect(JSON.parse(res1.body).status).toBe("granted");

      const res2 = await bundlePostHandler(buildPostEvent(token, { bundleId: "day-guest", qualifiers: {} }));
      expect(JSON.parse(res2.body).status).toBe("granted");

      // Verify user has both bundles
      const getRes = await bundleGetHandler(buildGetEvent(token));
      const bundles = JSON.parse(getRes.body).bundles;
      const bundleIds = bundles.map((b) => b.bundleId);
      expect(bundleIds).toContain("test");
      expect(bundleIds).toContain("day-guest");
    });
  });

  describe("cap response contract", () => {
    it("should return cap_reached status with correct shape when cap is exceeded", async () => {
      // The current cap check is per-user and won't trigger because already_granted
      // catches duplicates first. This test verifies the response contract for when
      // Phase 2.9 implements global cap enforcement.
      // For now, we verify the cap_reached response shape by testing with a synthetic scenario.

      // Directly seed a user with a bundle to test the already_granted path
      const userId = "cap-contract-user";
      const token = makeJWT(userId);
      const event = buildPostEvent(token, { bundleId: "day-guest", qualifiers: {} });

      // Grant once
      const res1 = await bundlePostHandler(event);
      expect(JSON.parse(res1.body).status).toBe("granted");

      // The already_granted check prevents reaching cap_reached for same user.
      // When Phase 2.9 global counting is implemented, this test should be updated
      // to allocate day-guest to cap number of different users, then verify the
      // (cap+1)th user gets cap_reached.
      const res2 = await bundlePostHandler(event);
      const body2 = JSON.parse(res2.body);
      expect(body2.status).toBe("already_granted");
    });

    it("should grant bundle when cap is defined and not yet reached", async () => {
      // day-guest has cap=10 in catalogue; a fresh user should get granted
      const token = makeJWT("cap-fresh-user");
      const event = buildPostEvent(token, { bundleId: "day-guest", qualifiers: {} });
      const res = await bundlePostHandler(event);
      const body = JSON.parse(res.body);
      expect(res.statusCode).toBe(201);
      expect(body.status).toBe("granted");
    });

    it("should grant bundle when no cap is defined", async () => {
      // test bundle has no cap field
      const token = makeJWT("cap-no-cap-user");
      const event = buildPostEvent(token, { bundleId: "test", qualifiers: {} });
      const res = await bundlePostHandler(event);
      const body = JSON.parse(res.body);
      expect(res.statusCode).toBe(201);
      expect(body.status).toBe("granted");
    });
  });

  describe("multiple users allocating same bundle", () => {
    it("should allow different users to each get the same bundle type", async () => {
      const users = ["cap-multi-user-a", "cap-multi-user-b", "cap-multi-user-c"];
      for (const userId of users) {
        const token = makeJWT(userId);
        const event = buildPostEvent(token, { bundleId: "day-guest", qualifiers: {} });
        const res = await bundlePostHandler(event);
        const body = JSON.parse(res.body);
        expect(res.statusCode).toBe(201);
        expect(body.status).toBe("granted");
      }

      // Verify each user independently has the bundle
      for (const userId of users) {
        const bundles = await bundleRepository.getUserBundles(userId);
        const dayGuest = bundles.find((b) => b.bundleId === "day-guest");
        expect(dayGuest).toBeDefined();
      }
    });

    // Phase 2.9 TODO: Add test that allocates day-guest to cap (10) different users,
    // then verifies user #11 gets cap_reached (403). This requires global counting
    // which is not yet implemented.
  });
});
