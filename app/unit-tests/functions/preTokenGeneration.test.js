// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

import { describe, it, expect } from "vitest";
import { handler } from "@app/functions/auth/preTokenGeneration/index.js";

function buildEvent(userAttributes, triggerSource = "TokenGeneration_HostedAuth") {
  return {
    version: "1",
    triggerSource,
    region: "eu-west-2",
    userPoolId: "eu-west-2_test",
    userName: "test-user-sub",
    request: {
      userAttributes: {
        sub: "test-user-sub",
        email: "test@test.diyaccounting.co.uk",
        ...userAttributes,
      },
      groupConfiguration: {},
    },
    response: {},
  };
}

describe("preTokenGeneration", () => {
  it("should add custom:mfa_method=TOTP when user has SOFTWARE_TOKEN_MFA configured", async () => {
    const event = buildEvent({
      "cognito:preferred_mfa_setting": "SOFTWARE_TOKEN_MFA",
    });

    const result = await handler(event);

    expect(result.response.claimsOverrideDetails.claimsToAddOrOverride).toEqual({
      "custom:mfa_method": "TOTP",
    });
  });

  it("should not add claims when user has no MFA configured", async () => {
    const event = buildEvent({});

    const result = await handler(event);

    expect(result.response).toEqual({});
  });

  it("should not add claims when MFA setting is SMS (not TOTP)", async () => {
    const event = buildEvent({
      "cognito:preferred_mfa_setting": "SMS_MFA",
    });

    const result = await handler(event);

    expect(result.response).toEqual({});
  });

  it("should add claim on token refresh if user has MFA configured", async () => {
    const event = buildEvent(
      { "cognito:preferred_mfa_setting": "SOFTWARE_TOKEN_MFA" },
      "TokenGeneration_RefreshTokens",
    );

    const result = await handler(event);

    expect(result.response.claimsOverrideDetails.claimsToAddOrOverride).toEqual({
      "custom:mfa_method": "TOTP",
    });
  });

  it("should detect MFA from custom:mfa_method attribute if preferred_mfa_setting is absent", async () => {
    const event = buildEvent({
      "custom:mfa_method": "SOFTWARE_TOKEN_MFA",
    });

    const result = await handler(event);

    expect(result.response.claimsOverrideDetails.claimsToAddOrOverride).toEqual({
      "custom:mfa_method": "TOTP",
    });
  });
});
