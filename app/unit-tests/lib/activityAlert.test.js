// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/unit-tests/lib/activityAlert.test.js

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { classifyActor, classifyFlow, maskEmail, maskVrn, publishActivityEvent } from "@app/lib/activityAlert.js";

describe("lib/activityAlert", () => {
  describe("classifyActor", () => {
    test("returns 'customer' for normal email addresses", () => {
      expect(classifyActor("user@example.com")).toBe("customer");
      expect(classifyActor("alice@gmail.com")).toBe("customer");
    });

    test("returns 'test-user' for @test.diyaccounting.co.uk emails", () => {
      expect(classifyActor("test-123@test.diyaccounting.co.uk")).toBe("test-user");
    });

    test("returns 'test-user' for cognito-native auth method", () => {
      expect(classifyActor("user@example.com", "cognito-native")).toBe("test-user");
    });

    test("returns 'synthetic' for synthetic email patterns", () => {
      expect(classifyActor("synthetic-abc@example.com")).toBe("synthetic");
      expect(classifyActor("user+synthetic@example.com")).toBe("synthetic");
    });

    test("returns 'system' when email is not provided", () => {
      expect(classifyActor(null)).toBe("system");
      expect(classifyActor(undefined)).toBe("system");
      expect(classifyActor("")).toBe("system");
    });

    test("test-user domain takes priority over synthetic prefix", () => {
      expect(classifyActor("synthetic-abc@test.diyaccounting.co.uk")).toBe("test-user");
    });
  });

  describe("classifyFlow", () => {
    test("returns 'user-journey' by default", () => {
      expect(classifyFlow()).toBe("user-journey");
      expect(classifyFlow(null)).toBe("user-journey");
      expect(classifyFlow("browser")).toBe("user-journey");
    });

    test("returns 'ci-pipeline' for CI-related sources", () => {
      expect(classifyFlow("ci-test")).toBe("ci-pipeline");
      expect(classifyFlow("github-actions")).toBe("ci-pipeline");
      expect(classifyFlow("pipeline-deploy")).toBe("ci-pipeline");
    });

    test("returns 'infrastructure' for infrastructure sources", () => {
      expect(classifyFlow("cloudformation-event")).toBe("infrastructure");
      expect(classifyFlow("deploy-hook")).toBe("infrastructure");
    });

    test("returns 'operational' for operational sources", () => {
      expect(classifyFlow("schedule-rule")).toBe("operational");
      expect(classifyFlow("cron-job")).toBe("operational");
      expect(classifyFlow("reconcile-task")).toBe("operational");
    });
  });

  describe("maskEmail", () => {
    test("masks email correctly", () => {
      expect(maskEmail("user@example.com")).toBe("u***@example.com");
      expect(maskEmail("alice@gmail.com")).toBe("a***@gmail.com");
    });

    test("handles edge cases", () => {
      expect(maskEmail(null)).toBe("***");
      expect(maskEmail(undefined)).toBe("***");
      expect(maskEmail("")).toBe("***");
      expect(maskEmail("nodomain")).toBe("***");
      expect(maskEmail("@domain.com")).toBe("***");
    });
  });

  describe("maskVrn", () => {
    test("masks VRN correctly", () => {
      expect(maskVrn("123456789")).toBe("***6789");
      expect(maskVrn("GB123456789")).toBe("***6789");
    });

    test("handles short VRNs", () => {
      expect(maskVrn("1234")).toBe("***1234");
      expect(maskVrn("12")).toBe("***12");
    });

    test("handles edge cases", () => {
      expect(maskVrn(null)).toBe("***");
      expect(maskVrn(undefined)).toBe("***");
      expect(maskVrn("")).toBe("***");
    });
  });

  describe("publishActivityEvent", () => {
    const originalEnv = process.env.ACTIVITY_BUS_NAME;

    afterEach(() => {
      if (originalEnv === undefined) {
        delete process.env.ACTIVITY_BUS_NAME;
      } else {
        process.env.ACTIVITY_BUS_NAME = originalEnv;
      }
    });

    test("is a no-op when ACTIVITY_BUS_NAME is not set", async () => {
      delete process.env.ACTIVITY_BUS_NAME;
      // Should not throw
      await publishActivityEvent({ event: "test-event", summary: "Test" });
    });

    test("does not throw on EventBridge failure", async () => {
      process.env.ACTIVITY_BUS_NAME = "test-bus";
      // EventBridge client will fail (no real AWS), but should not throw
      await publishActivityEvent({ event: "test-event", summary: "Test" });
    });
  });
});
