// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// Pre Token Generation Lambda trigger for Cognito User Pool.
// Injects custom:mfa_method claim into ID tokens when the user has TOTP MFA configured.
// This is needed because Cognito does not populate the amr claim for native TOTP auth.

export const handler = async (event) => {
  console.log("Pre Token Generation trigger invoked for user:", event.userName);
  console.log("Trigger source:", event.triggerSource);
  console.log("User attributes:", JSON.stringify(event.request.userAttributes));

  const mfaSetting =
    event.request.userAttributes["custom:mfa_method"] ||
    event.request.userAttributes["cognito:preferred_mfa_setting"];

  console.log("Resolved mfaSetting:", mfaSetting);

  if (mfaSetting === "SOFTWARE_TOKEN_MFA") {
    event.response = {
      claimsOverrideDetails: {
        claimsToAddOrOverride: {
          "custom:mfa_method": "TOTP",
        },
      },
    };
    console.log("Added custom:mfa_method=TOTP claim for user:", event.userName);
  }

  return event;
};
