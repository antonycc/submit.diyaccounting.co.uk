// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import {
  escapeTelegramMarkdown,
  formatMessage,
  resolveTargetChatIds,
  synthesizeFromCloudFormation,
  synthesizeFromCloudWatchAlarm,
  resolveEventDetail,
  handler,
} from "@app/functions/ops/activityTelegramForwarder.js";

const CHAT_IDS = {
  "ci-test": "-5250521947",
  "ci-live": "-5278650420",
  "prod-test": "-5144319944",
  "prod-live": "-5177256260",
};

describe("activityTelegramForwarder", () => {
  describe("escapeTelegramMarkdown", () => {
    test("escapes underscore, asterisk, backtick, bracket", () => {
      expect(escapeTelegramMarkdown("hello_world")).toBe("hello\\_world");
      expect(escapeTelegramMarkdown("*bold*")).toBe("\\*bold\\*");
      expect(escapeTelegramMarkdown("`code`")).toBe("\\`code\\`");
      expect(escapeTelegramMarkdown("[link]")).toBe("\\[link]");
    });

    test("handles empty and null input", () => {
      expect(escapeTelegramMarkdown("")).toBe("");
      expect(escapeTelegramMarkdown(null)).toBe("");
      expect(escapeTelegramMarkdown(undefined)).toBe("");
    });

    test("leaves plain text unchanged", () => {
      expect(escapeTelegramMarkdown("Login: u***@example.com")).toBe(
        "Login: u\\*\\*\\*@example.com",
      );
    });
  });

  describe("formatMessage", () => {
    test("formats a standard activity event", () => {
      const detail = { site: "submit", env: "prod", summary: "Login: u***@example.com" };
      expect(formatMessage(detail)).toBe("*[submit/prod]* Login: u\\*\\*\\*@example.com");
    });

    test("handles missing fields", () => {
      // env falls back to ENVIRONMENT_NAME env var (set to "test" by .env.test)
      const envName = process.env.ENVIRONMENT_NAME || "unknown";
      expect(formatMessage({})).toBe(`*[unknown/${envName}]* unknown event`);
    });

    test("uses event name when summary is missing", () => {
      const detail = { site: "submit", env: "ci", event: "login" };
      expect(formatMessage(detail)).toBe("*[submit/ci]* login");
    });
  });

  describe("resolveTargetChatIds", () => {
    // CI environment routing
    test("routes CI test-user events to ci-test", () => {
      const detail = { env: "ci", actor: "test-user", flow: "user-journey" };
      expect(resolveTargetChatIds(detail, CHAT_IDS)).toEqual(["-5250521947"]);
    });

    test("routes CI synthetic events to ci-test", () => {
      const detail = { env: "ci", actor: "synthetic", flow: "user-journey" };
      expect(resolveTargetChatIds(detail, CHAT_IDS)).toEqual(["-5250521947"]);
    });

    test("routes CI customer events to ci-live", () => {
      const detail = { env: "ci", actor: "customer", flow: "user-journey" };
      expect(resolveTargetChatIds(detail, CHAT_IDS)).toEqual(["-5278650420"]);
    });

    test("routes CI visitor events to ci-live", () => {
      const detail = { env: "ci", actor: "visitor", flow: "user-journey" };
      expect(resolveTargetChatIds(detail, CHAT_IDS)).toEqual(["-5278650420"]);
    });

    test("routes CI infrastructure events to both ci groups", () => {
      const detail = { env: "ci", actor: "ci-pipeline", flow: "infrastructure" };
      expect(resolveTargetChatIds(detail, CHAT_IDS)).toEqual(["-5250521947", "-5278650420"]);
    });

    test("routes CI operational events to both ci groups", () => {
      const detail = { env: "ci", actor: "system", flow: "operational" };
      expect(resolveTargetChatIds(detail, CHAT_IDS)).toEqual(["-5250521947", "-5278650420"]);
    });

    // Prod environment routing
    test("routes prod customer events to prod-live", () => {
      const detail = { env: "prod", actor: "customer", flow: "user-journey" };
      expect(resolveTargetChatIds(detail, CHAT_IDS)).toEqual(["-5177256260"]);
    });

    test("routes prod visitor events to prod-live", () => {
      const detail = { env: "prod", actor: "visitor", flow: "user-journey" };
      expect(resolveTargetChatIds(detail, CHAT_IDS)).toEqual(["-5177256260"]);
    });

    test("routes prod test-user events to prod-test", () => {
      const detail = { env: "prod", actor: "test-user", flow: "user-journey" };
      expect(resolveTargetChatIds(detail, CHAT_IDS)).toEqual(["-5144319944"]);
    });

    test("routes prod synthetic events to prod-test", () => {
      const detail = { env: "prod", actor: "synthetic", flow: "user-journey" };
      expect(resolveTargetChatIds(detail, CHAT_IDS)).toEqual(["-5144319944"]);
    });

    test("routes prod infrastructure events to both prod groups", () => {
      const detail = { env: "prod", actor: "ci-pipeline", flow: "infrastructure" };
      expect(resolveTargetChatIds(detail, CHAT_IDS)).toEqual(["-5144319944", "-5177256260"]);
    });

    test("routes prod operational events to both prod groups", () => {
      const detail = { env: "prod", actor: "system", flow: "operational" };
      expect(resolveTargetChatIds(detail, CHAT_IDS)).toEqual(["-5144319944", "-5177256260"]);
    });

    // Edge cases
    test("returns empty for unknown environment", () => {
      const detail = { env: "dev", actor: "customer", flow: "user-journey" };
      expect(resolveTargetChatIds(detail, CHAT_IDS)).toEqual([]);
    });

    test("returns empty for empty detail", () => {
      expect(resolveTargetChatIds({}, CHAT_IDS)).toEqual([]);
    });
  });

  describe("handler", () => {
    const originalEnv = { ...process.env };

    beforeEach(() => {
      process.env.TELEGRAM_BOT_TOKEN = "test-bot-token";
      process.env.TELEGRAM_CHAT_IDS = JSON.stringify(CHAT_IDS);
      process.env.ENVIRONMENT_NAME = "test";
      global.fetch = vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve("{}") });
    });

    afterEach(() => {
      process.env = { ...originalEnv };
      vi.restoreAllMocks();
    });

    test("sends message to correct group for prod customer event", async () => {
      await handler({
        detail: {
          event: "login",
          site: "submit",
          env: "prod",
          actor: "customer",
          flow: "user-journey",
          summary: "Login: u***@example.com",
        },
      });

      expect(global.fetch).toHaveBeenCalledTimes(1);
      const [url, options] = global.fetch.mock.calls[0];
      expect(url).toBe("https://api.telegram.org/bottest-bot-token/sendMessage");
      const body = JSON.parse(options.body);
      expect(body.chat_id).toBe("-5177256260"); // prod-live
      expect(body.text).toContain("submit/prod");
      expect(body.parse_mode).toBe("Markdown");
    });

    test("sends to both groups for infrastructure events", async () => {
      await handler({
        detail: {
          event: "deployment",
          site: "submit",
          env: "ci",
          actor: "ci-pipeline",
          flow: "infrastructure",
          summary: "Deployed: ci-app-ApiStack",
        },
      });

      expect(global.fetch).toHaveBeenCalledTimes(2);
      const chatIds = global.fetch.mock.calls.map((call) => JSON.parse(call[1].body).chat_id);
      expect(chatIds).toContain("-5250521947"); // ci-test
      expect(chatIds).toContain("-5278650420"); // ci-live
    });

    test("does not send when no targets match", async () => {
      await handler({
        detail: {
          event: "test",
          site: "submit",
          env: "dev",
          actor: "customer",
          flow: "user-journey",
          summary: "Test",
        },
      });

      expect(global.fetch).not.toHaveBeenCalled();
    });

    test("handles missing detail gracefully", async () => {
      await handler({});
      expect(global.fetch).not.toHaveBeenCalled();
    });

    test("logs warning on Telegram API error but does not throw", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: () => Promise.resolve('{"ok":false,"description":"Bad Request"}'),
      });

      await handler({
        detail: {
          event: "login",
          site: "submit",
          env: "prod",
          actor: "customer",
          flow: "user-journey",
          summary: "Login",
        },
      });

      // Should not throw
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    test("handles CloudFormation Stack Status Change events", async () => {
      await handler({
        source: "aws.cloudformation",
        "detail-type": "CloudFormation Stack Status Change",
        detail: {
          "stack-id": "arn:aws:cloudformation:eu-west-2:887764105431:stack/ci-app-ApiStack/uuid-123",
          "status-details": { status: "UPDATE_COMPLETE" },
        },
      });

      expect(global.fetch).toHaveBeenCalledTimes(2); // infrastructure → both ci groups
      const bodies = global.fetch.mock.calls.map((call) => JSON.parse(call[1].body));
      expect(bodies[0].text).toContain("ci-app-ApiStack");
      expect(bodies[0].text).toContain("UPDATE\\_COMPLETE");
    });

    test("handles CloudWatch Alarm State Change events", async () => {
      await handler({
        source: "aws.cloudwatch",
        "detail-type": "CloudWatch Alarm State Change",
        detail: {
          alarmName: "prod-app-health-failed",
          state: { value: "ALARM", reason: "Threshold crossed" },
          previousState: { value: "OK" },
        },
      });

      expect(global.fetch).toHaveBeenCalledTimes(2); // operational → both prod groups
      const bodies = global.fetch.mock.calls.map((call) => JSON.parse(call[1].body));
      expect(bodies[0].text).toContain("prod-app-health-failed");
      expect(bodies[0].text).toContain("OK");
      expect(bodies[0].text).toContain("ALARM");
    });
  });

  describe("synthesizeFromCloudFormation", () => {
    test("extracts stack name from ARN", () => {
      const event = {
        source: "aws.cloudformation",
        detail: {
          "stack-id": "arn:aws:cloudformation:eu-west-2:887764105431:stack/ci-app-ApiStack/uuid",
          "status-details": { status: "UPDATE_COMPLETE" },
        },
      };
      const detail = synthesizeFromCloudFormation(event);
      expect(detail.summary).toBe("Stack ci-app-ApiStack: UPDATE_COMPLETE");
      expect(detail.env).toBe("ci");
      expect(detail.actor).toBe("ci-pipeline");
      expect(detail.flow).toBe("infrastructure");
      expect(detail.site).toBe("submit");
    });

    test("extracts prod env from stack name", () => {
      const event = {
        source: "aws.cloudformation",
        detail: {
          "stack-id": "arn:aws:cloudformation:eu-west-2:887764105431:stack/prod-env-DataStack/uuid",
          "status-details": { status: "CREATE_COMPLETE" },
        },
      };
      const detail = synthesizeFromCloudFormation(event);
      expect(detail.env).toBe("prod");
      expect(detail.summary).toBe("Stack prod-env-DataStack: CREATE_COMPLETE");
    });

    test("handles missing detail gracefully", () => {
      const detail = synthesizeFromCloudFormation({ detail: {} });
      expect(detail.summary).toBe("Stack : UNKNOWN");
      expect(detail.actor).toBe("ci-pipeline");
    });
  });

  describe("synthesizeFromCloudWatchAlarm", () => {
    test("extracts alarm name and state transition", () => {
      const event = {
        source: "aws.cloudwatch",
        detail: {
          alarmName: "ci-app-health-failed",
          state: { value: "ALARM" },
          previousState: { value: "OK" },
        },
      };
      const detail = synthesizeFromCloudWatchAlarm(event);
      expect(detail.summary).toBe("Alarm ci-app-health-failed: OK \u2192 ALARM");
      expect(detail.env).toBe("ci");
      expect(detail.actor).toBe("system");
      expect(detail.flow).toBe("operational");
    });

    test("extracts prod env from alarm name", () => {
      const event = {
        source: "aws.cloudwatch",
        detail: {
          alarmName: "prod-app-github-synthetic-failed",
          state: { value: "OK" },
          previousState: { value: "ALARM" },
        },
      };
      const detail = synthesizeFromCloudWatchAlarm(event);
      expect(detail.env).toBe("prod");
      expect(detail.summary).toContain("ALARM \u2192 OK");
    });

    test("handles missing detail gracefully", () => {
      const detail = synthesizeFromCloudWatchAlarm({ detail: {} });
      expect(detail.summary).toBe("Alarm unknown: UNKNOWN \u2192 UNKNOWN");
    });
  });

  describe("resolveEventDetail", () => {
    test("dispatches CloudFormation events", () => {
      const event = {
        source: "aws.cloudformation",
        detail: {
          "stack-id": "arn:aws:cloudformation:eu-west-2:887764105431:stack/ci-app-ApiStack/uuid",
          "status-details": { status: "UPDATE_COMPLETE" },
        },
      };
      const detail = resolveEventDetail(event);
      expect(detail.actor).toBe("ci-pipeline");
      expect(detail.flow).toBe("infrastructure");
    });

    test("dispatches CloudWatch alarm events", () => {
      const event = {
        source: "aws.cloudwatch",
        detail: {
          alarmName: "prod-app-health-failed",
          state: { value: "ALARM" },
          previousState: { value: "OK" },
        },
      };
      const detail = resolveEventDetail(event);
      expect(detail.actor).toBe("system");
      expect(detail.flow).toBe("operational");
    });

    test("passes through standard ActivityEvent detail", () => {
      const event = {
        source: "submit.diyaccounting.co.uk/auth",
        detail: { actor: "customer", flow: "user-journey", env: "prod" },
      };
      const detail = resolveEventDetail(event);
      expect(detail.actor).toBe("customer");
      expect(detail.flow).toBe("user-journey");
    });
  });
});
