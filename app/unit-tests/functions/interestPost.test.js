// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/unit-tests/functions/interestPost.test.js

import { describe, test, beforeEach, expect, vi } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { buildLambdaEvent, buildHeadEvent } from "@app/test-helpers/eventBuilders.js";
import { setupTestEnv, parseResponseBody } from "@app/test-helpers/mockHelpers.js";

const mockSnsSend = vi.fn();
vi.mock("@aws-sdk/client-sns", () => {
  class SNSClient {
    constructor(_config) {}
    send(cmd) {
      return mockSnsSend(cmd);
    }
  }
  class PublishCommand {
    constructor(input) {
      this.input = input;
    }
  }
  return { SNSClient, PublishCommand };
});

import { ingestHandler } from "@app/functions/account/interestPost.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

describe("interestPost ingestHandler", () => {
  beforeEach(() => {
    Object.assign(process.env, setupTestEnv());
    process.env.WAITLIST_TOPIC_ARN = "arn:aws:sns:eu-west-2:123456789012:test-waitlist";
    vi.clearAllMocks();
    mockSnsSend.mockResolvedValue({});
  });

  test("HEAD request returns 200 OK", async () => {
    const event = buildHeadEvent();
    const response = await ingestHandler(event);
    expect(response.statusCode).toBe(200);
  });

  test("returns 200 and publishes to SNS when email is present", async () => {
    const event = buildLambdaEvent({
      method: "POST",
    });
    const response = await ingestHandler(event);
    expect(response.statusCode).toBe(200);
    const body = parseResponseBody(response);
    expect(body.registered).toBe(true);

    // Verify SNS publish was called
    expect(mockSnsSend).toHaveBeenCalledTimes(1);
    const publishCommand = mockSnsSend.mock.calls[0][0];
    expect(publishCommand.input.TopicArn).toBe("arn:aws:sns:eu-west-2:123456789012:test-waitlist");
    expect(publishCommand.input.Subject).toBe("Waitlist registration");
    expect(publishCommand.input.Message).toContain("Email: test@test.submit.diyaccounting.co.uk");
    expect(publishCommand.input.Message).toContain("Timestamp:");
  });

  test("returns 400 when email is missing from authorizer context", async () => {
    const event = buildLambdaEvent({
      method: "POST",
      authorizer: {
        authorizer: {
          lambda: {
            "sub": "test-sub",
            "cognito:username": "test",
            "scope": "read write",
          },
        },
      },
    });
    const response = await ingestHandler(event);
    expect(response.statusCode).toBe(400);
    const body = parseResponseBody(response);
    expect(body.message).toContain("Email not found");
  });

  test("returns 500 when WAITLIST_TOPIC_ARN is not set", async () => {
    delete process.env.WAITLIST_TOPIC_ARN;
    const event = buildLambdaEvent({ method: "POST" });
    const response = await ingestHandler(event);
    expect(response.statusCode).toBe(500);
    const body = parseResponseBody(response);
    expect(body.message).toContain("not configured");
  });

  test("returns 500 when SNS publish fails", async () => {
    mockSnsSend.mockRejectedValue(new Error("SNS publish failed"));
    const event = buildLambdaEvent({ method: "POST" });
    const response = await ingestHandler(event);
    expect(response.statusCode).toBe(500);
    const body = parseResponseBody(response);
    expect(body.message).toContain("Failed to register interest");
  });
});
