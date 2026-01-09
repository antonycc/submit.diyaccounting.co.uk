// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/unit-tests/lib/govClientTestHeader.js

import { dotenvConfigIfNotBlank } from "@app/lib/env.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

export function buildGovClientTestHeaders() {
  const govClientBrowserJSUserAgentHeader = "test-browser-js-user-agent";
  const govClientDeviceIDHeader = "test-device-id";
  const govClientMultiFactorHeader = "test-multi-factor";
  const govClientPublicIPHeader = "test-public-ip";
  const govClientPublicIPTimestampHeader = "test-public-ip-timestamp";
  const govClientPublicPortHeader = "test-public-port";
  const govClientScreensHeader = "test-screens";
  const govClientTimezoneHeader = "test-timezone";
  const govClientUserIDsHeader = "test-user-ids";
  const govClientWindowSizeHeader = "test-window-size";
  const govVendorForwardedHeader = "test-vendor-forwarded";
  const govVendorPublicIPHeader = "test-vendor-public-ip";
  const headers = {
    "Gov-Client-Browser-JS-User-Agent": govClientBrowserJSUserAgentHeader,
    "Gov-Client-Device-ID": govClientDeviceIDHeader,
    "Gov-Client-Multi-Factor": govClientMultiFactorHeader,
    "Gov-Client-Public-IP": govClientPublicIPHeader,
    "Gov-Client-Public-IP-Timestamp": govClientPublicIPTimestampHeader,
    "Gov-Client-Public-Port": govClientPublicPortHeader,
    "Gov-Client-Screens": govClientScreensHeader,
    "Gov-Client-Timezone": govClientTimezoneHeader,
    "Gov-Client-User-IDs": govClientUserIDsHeader,
    "Gov-Client-Window-Size": govClientWindowSizeHeader,
    "Gov-Vendor-Forwarded": govVendorForwardedHeader,
    "Gov-Vendor-Public-IP": govVendorPublicIPHeader,
  };
  return headers;
}
