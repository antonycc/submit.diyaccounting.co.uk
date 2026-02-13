// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/functions/billing/billingCheckoutPost.js

import { createLogger } from "../../lib/logger.js";
import {
  extractRequest,
  http200OkResponse,
  http400BadRequestResponse,
  http401UnauthorizedResponse,
  http500ServerErrorResponse,
} from "../../lib/httpResponseHelper.js";
import { buildHttpResponseFromLambdaResult, buildLambdaEventFromHttpRequest } from "../../lib/httpServerToLambdaAdaptor.js";
import { decodeJwtToken } from "../../lib/jwtHelper.js";
import { initializeSalt, hashSub } from "../../services/subHasher.js";
import { getStripeClient } from "../../lib/stripeClient.js";
import { publishActivityEvent, classifyActor, maskEmail } from "../../lib/activityAlert.js";

const logger = createLogger({ source: "app/functions/billing/billingCheckoutPost.js" });

/* v8 ignore start */
export function apiEndpoint(app) {
  app.post("/api/v1/billing/checkout-session", async (httpRequest, httpResponse) => {
    const lambdaEvent = buildLambdaEventFromHttpRequest(httpRequest);
    const lambdaResult = await ingestHandler(lambdaEvent);
    return buildHttpResponseFromLambdaResult(lambdaResult, httpResponse);
  });
}
/* v8 ignore stop */

export async function ingestHandler(event) {
  const { request } = extractRequest(event);
  const responseHeaders = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" };

  // Decode JWT to get user identity
  let decodedToken;
  try {
    decodedToken = decodeJwtToken(event.headers);
  } catch (error) {
    return http401UnauthorizedResponse({
      request,
      headers: responseHeaders,
      message: "Authentication required",
    });
  }

  const userSub = decodedToken.sub;
  const userEmail = decodedToken.email || "";

  if (!userSub) {
    return http400BadRequestResponse({
      request,
      headers: responseHeaders,
      message: "Missing user identity",
    });
  }

  try {
    await initializeSalt();
    const hashedSub = hashSub(userSub);

    const baseUrl = process.env.DIY_SUBMIT_BASE_URL || "https://submit.diyaccounting.co.uk/";
    const priceId = process.env.STRIPE_PRICE_ID || process.env.STRIPE_TEST_PRICE_ID;

    if (!priceId) {
      logger.error({ message: "No Stripe price ID configured" });
      return http500ServerErrorResponse({
        request,
        headers: responseHeaders,
        message: "Payment configuration error",
      });
    }

    const stripe = await getStripeClient();

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer_email: userEmail,
      client_reference_id: hashedSub,
      metadata: { hashedSub, bundleId: "resident-pro" },
      subscription_data: {
        metadata: { hashedSub, bundleId: "resident-pro" },
      },
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${baseUrl}bundles.html?checkout=success`,
      cancel_url: `${baseUrl}bundles.html?checkout=canceled`,
    });

    logger.info({ message: "Checkout session created", sessionId: session.id, hashedSub });

    publishActivityEvent({
      event: "checkout-session-created",
      site: "submit",
      summary: `Checkout started: ${maskEmail(userEmail)}`,
      actor: classifyActor(userEmail, decodedToken["cognito:username"] ? "cognito-native" : undefined),
      flow: "user-journey",
    }).catch(() => {});

    return http200OkResponse({
      request,
      headers: responseHeaders,
      data: { checkoutUrl: session.url },
    });
  } catch (error) {
    logger.error({ message: "Failed to create checkout session", error: error.message });
    return http500ServerErrorResponse({
      request,
      headers: responseHeaders,
      message: "Failed to create checkout session",
    });
  }
}
