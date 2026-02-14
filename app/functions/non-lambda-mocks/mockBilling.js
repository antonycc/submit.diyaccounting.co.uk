// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/functions/non-lambda-mocks/mockBilling.js
// Mock billing endpoints for simulator environment — fakes Stripe like mock OAuth fakes login.
// When Stripe is not configured (no STRIPE_PRICE_ID), these endpoints auto-complete checkout
// by granting the bundle and redirecting to the success URL.

import { createLogger } from "../../lib/logger.js";

const logger = createLogger({ source: "app/functions/non-lambda-mocks/mockBilling.js" });

export function apiEndpoint(app) {
  // Mock checkout session — returns a local auto-complete URL instead of a Stripe hosted page
  app.post("/api/v1/billing/checkout-session", (req, res) => {
    const baseUrl = process.env.DIY_SUBMIT_BASE_URL || "http://localhost:3000/";
    const bundleId = req.body?.bundleId || "resident-pro";
    const sessionId = `sim_cs_${Date.now()}`;
    const checkoutUrl = `${baseUrl}simulator/checkout?session=${sessionId}&bundleId=${bundleId}`;
    logger.info({ message: "Mock checkout session created", sessionId, bundleId, checkoutUrl });
    res.json({ data: { checkoutUrl } });
  });

  // Mock checkout completion — grants bundle and redirects to success URL
  app.get("/simulator/checkout", async (req, res) => {
    const { bundleId = "resident-pro" } = req.query;
    logger.info({ message: "Mock checkout auto-completing", bundleId });

    // Grant the bundle via the real grantBundle function
    try {
      const { decodeJwtToken } = await import("../../lib/jwtHelper.js");
      const { grantBundle } = await import("../account/bundlePost.js");
      const { initializeSalt } = await import("../../services/subHasher.js");

      await initializeSalt();

      // Decode the auth token from the cookie or header
      const authHeader = req.headers.authorization;
      const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
      if (token) {
        const decoded = decodeJwtToken({ authorization: `Bearer ${token}` });
        await grantBundle(decoded.sub, { bundleId, qualifiers: {} }, decoded, null, {
          skipCapCheck: true,
          grantQualifiers: { sandbox: true },
        });
        logger.info({ message: "Mock checkout granted bundle", bundleId, userId: decoded.sub });
      } else {
        logger.warn({ message: "Mock checkout: no auth token, granting via direct bundle API" });
      }
    } catch (error) {
      logger.warn({ message: "Mock checkout: bundle grant skipped (may need manual grant)", error: error.message });
    }

    const baseUrl = process.env.DIY_SUBMIT_BASE_URL || "http://localhost:3000/";
    res.redirect(`${baseUrl}bundles.html?checkout=success`);
  });

  // Mock billing portal — redirects back to bundles page
  app.get("/api/v1/billing/portal", (req, res) => {
    const baseUrl = process.env.DIY_SUBMIT_BASE_URL || "http://localhost:3000/";
    logger.info({ message: "Mock billing portal session created" });
    res.json({ data: { portalUrl: `${baseUrl}bundles.html` } });
  });

  logger.info({ message: "Mock billing routes registered (Stripe not configured)" });
}
