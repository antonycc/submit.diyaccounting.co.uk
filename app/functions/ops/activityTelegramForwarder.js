// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/functions/ops/activityTelegramForwarder.js
//
// EventBridge target Lambda: receives ActivityEvent events and forwards them
// to the appropriate Telegram group via the Telegram Bot API.
//
// Routing: EventBridge rules determine which group(s) receive each event.
// The target chat ID is passed via the rule's input transformer or the
// TELEGRAM_CHAT_ID environment variable set per-rule invocation.

import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import { createLogger } from "../../lib/logger.js";

const logger = createLogger({ source: "app/functions/ops/activityTelegramForwarder.js" });

const smClient = new SecretsManagerClient({ region: process.env.AWS_REGION || "eu-west-2" });

let cachedBotToken = null;
let cachedChatIds = null;

async function resolveBotToken() {
  if (cachedBotToken) return cachedBotToken;

  if (process.env.TELEGRAM_BOT_TOKEN) {
    cachedBotToken = process.env.TELEGRAM_BOT_TOKEN;
    return cachedBotToken;
  }

  const arn = process.env.TELEGRAM_BOT_TOKEN_ARN;
  if (!arn) throw new Error("Neither TELEGRAM_BOT_TOKEN nor TELEGRAM_BOT_TOKEN_ARN is set");

  const result = await smClient.send(new GetSecretValueCommand({ SecretId: arn }));
  cachedBotToken = result.SecretString;
  return cachedBotToken;
}

async function resolveChatIds() {
  if (cachedChatIds) return cachedChatIds;

  if (process.env.TELEGRAM_CHAT_IDS) {
    cachedChatIds = JSON.parse(process.env.TELEGRAM_CHAT_IDS);
    return cachedChatIds;
  }

  const arn = process.env.TELEGRAM_CHAT_IDS_ARN;
  if (arn) {
    const result = await smClient.send(new GetSecretValueCommand({ SecretId: arn }));
    cachedChatIds = JSON.parse(result.SecretString);
    return cachedChatIds;
  }

  throw new Error("Neither TELEGRAM_CHAT_IDS nor TELEGRAM_CHAT_IDS_ARN is set");
}

/**
 * Escape special characters for Telegram MarkdownV1.
 * Only escapes in dynamic content, not in our own formatting.
 */
export function escapeTelegramMarkdown(text) {
  if (!text) return "";
  return text.replace(/([_*`\[])/g, "\\$1");
}

/**
 * Format an ActivityEvent into a Telegram message.
 */
export function formatMessage(detail) {
  const site = escapeTelegramMarkdown(detail.site || "unknown");
  const env = escapeTelegramMarkdown(detail.env || process.env.ENVIRONMENT_NAME || "unknown");
  const summary = escapeTelegramMarkdown(detail.summary || detail.event || "unknown event");
  return `*[${site}/${env}]* ${summary}`;
}

/**
 * Determine which chat IDs to send to based on event attributes.
 * Returns an array of chat IDs (may be multiple for "both" routing).
 */
export function resolveTargetChatIds(detail, chatIds) {
  const env = detail.env || process.env.ENVIRONMENT_NAME || "";
  const actor = detail.actor || "";
  const flow = detail.flow || "";
  const targets = [];

  if (env === "ci") {
    // Infrastructure and operational events go to both CI groups
    if (flow === "infrastructure" || flow === "operational") {
      if (chatIds["ci-test"]) targets.push(chatIds["ci-test"]);
      if (chatIds["ci-live"]) targets.push(chatIds["ci-live"]);
    } else if (actor === "customer" || actor === "visitor") {
      if (chatIds["ci-live"]) targets.push(chatIds["ci-live"]);
    } else {
      // test-user, synthetic, ci-pipeline, system
      if (chatIds["ci-test"]) targets.push(chatIds["ci-test"]);
    }
  } else if (env === "prod") {
    // Infrastructure and operational events go to both prod groups
    if (flow === "infrastructure" || flow === "operational") {
      if (chatIds["prod-test"]) targets.push(chatIds["prod-test"]);
      if (chatIds["prod-live"]) targets.push(chatIds["prod-live"]);
    } else if (actor === "customer" || actor === "visitor") {
      if (chatIds["prod-live"]) targets.push(chatIds["prod-live"]);
    } else {
      // test-user, synthetic
      if (chatIds["prod-test"]) targets.push(chatIds["prod-test"]);
    }
  }

  return targets;
}

/**
 * Send a message to a Telegram chat via the Bot API.
 */
export async function sendTelegramMessage(botToken, chatId, text) {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "Markdown",
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    logger.warn({ message: "Telegram API error", statusCode: response.status, body, chatId });
  }

  return response;
}

/**
 * Synthesize an ActivityEvent detail from a CloudFormation Stack Status Change event.
 * Extracts stack name and status from the raw AWS event.
 */
export function synthesizeFromCloudFormation(event) {
  const cfnDetail = event.detail || {};
  const stackId = cfnDetail["stack-id"] || "";
  // Extract stack name from ARN: arn:aws:cloudformation:region:account:stack/STACK-NAME/uuid
  const stackName = stackId.includes("/") ? stackId.split("/")[1] : stackId;
  const status = cfnDetail["status-details"]?.status || "UNKNOWN";

  // Extract env from stack name prefix (e.g., "ci-app-ApiStack" → "ci")
  const envMatch = stackName.match(/^(ci|prod)-/);
  const env = envMatch ? envMatch[1] : process.env.ENVIRONMENT_NAME || "unknown";

  return {
    actor: "ci-pipeline",
    flow: "infrastructure",
    env,
    event: "stack-status-change",
    site: "submit",
    summary: `Stack ${stackName}: ${status}`,
  };
}

/**
 * Synthesize an ActivityEvent detail from a CloudWatch Alarm State Change event.
 * Extracts alarm name and state transition from the raw AWS event.
 */
export function synthesizeFromCloudWatchAlarm(event) {
  const alarmDetail = event.detail || {};
  const alarmName = alarmDetail.alarmName || "unknown";
  const state = alarmDetail.state?.value || "UNKNOWN";
  const previousState = alarmDetail.previousState?.value || "UNKNOWN";

  // Extract env from alarm name prefix
  const envMatch = alarmName.match(/^(ci|prod)-/);
  const env = envMatch ? envMatch[1] : process.env.ENVIRONMENT_NAME || "unknown";

  return {
    actor: "system",
    flow: "operational",
    env,
    event: "alarm-state-change",
    site: "submit",
    summary: `Alarm ${alarmName}: ${previousState} \u2192 ${state}`,
  };
}

/**
 * Resolve the event detail, handling both custom ActivityEvents and raw AWS service events.
 */
export function resolveEventDetail(event) {
  if (event.source === "aws.cloudformation") {
    return synthesizeFromCloudFormation(event);
  }
  if (event.source === "aws.cloudwatch") {
    return synthesizeFromCloudWatchAlarm(event);
  }
  return event.detail || {};
}

/**
 * EventBridge target handler.
 * Handles both custom ActivityEvent events (from custom bus) and
 * raw AWS service events (CloudFormation, CloudWatch from default bus).
 */
export async function handler(event) {
  const detail = resolveEventDetail(event);

  logger.info({
    message: "Processing activity event for Telegram",
    source: event.source,
    eventType: detail.event,
    actor: detail.actor,
    flow: detail.flow,
    env: detail.env,
  });

  const botToken = await resolveBotToken();
  const chatIds = await resolveChatIds();
  const targets = resolveTargetChatIds(detail, chatIds);

  if (targets.length === 0) {
    logger.info({ message: "No target chat IDs matched for event", detail });
    return;
  }

  const message = formatMessage(detail);

  const results = await Promise.allSettled(
    targets.map((chatId) => sendTelegramMessage(botToken, chatId, message)),
  );

  for (const result of results) {
    if (result.status === "rejected") {
      logger.warn({ message: "Failed to send Telegram message", error: result.reason?.message });
    }
  }
}
