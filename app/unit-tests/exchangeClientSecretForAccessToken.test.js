// app/unit-tests/exchangeClientSecretForAccessToken.test.js

import { describe, beforeEach, afterEach, test, expect, vi } from "vitest";
import { mockClient } from "aws-sdk-client-mock";
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";

import { exchangeToken, resetCachedSecret } from "@app/functions/mockTokenPost.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);
