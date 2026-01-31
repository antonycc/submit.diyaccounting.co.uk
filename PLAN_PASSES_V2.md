I'll create a comprehensive schema and pass types configuration that integrates with your catalogue.

```toml
# submit_passes.toml
# Pass type definitions for DIY Accounting Submit
# These define templates for generating invite passes

version = "1.0.0"

[[passTypes]]
id = "test-access"
name = "Test Access"
description = "Access to HMRC Sandbox APIs for testing"
bundleId = "test"
defaultValidityPeriod = "P7D"
defaultMaxUses = 1
requiresEmailRestriction = false
# Typically issued to developers or testers

[[passTypes]]
id = "day-trial"
name = "Day Trial"
description = "Single-day access to production HMRC APIs"
bundleId = "day-guest"
defaultValidityPeriod = "P1D"
defaultMaxUses = 1
requiresEmailRestriction = false
# Self-service trial, one per user

[[passTypes]]
id = "invited-guest"
name = "Invited Guest"
description = "Month-long access for specific invited users"
bundleId = "invited-guest"
defaultValidityPeriod = "P1M"
defaultMaxUses = 1
requiresEmailRestriction = true
# Issued to known users, locked to their email

[[passTypes]]
id = "resident-guest"
name = "Resident Guest"
description = "Ongoing free access for specific users"
bundleId = "resident-guest"
# No defaultValidityPeriod = unlimited
defaultMaxUses = 1
requiresEmailRestriction = true
# Long-term free users (e.g. beta testers, partners)

[[passTypes]]
id = "resident-pro-comp"
name = "Resident Pro (Complimentary)"
description = "Complimentary pro subscription"
bundleId = "resident-pro"
defaultValidityPeriod = "P1Y"
defaultMaxUses = 1
requiresEmailRestriction = true
# Gifted pro access

[[passTypes]]
id = "group-invite"
name = "Group Invite"
description = "Shareable invite for multiple users"
bundleId = "invited-guest"
defaultValidityPeriod = "P1M"
defaultMaxUses = 10
requiresEmailRestriction = false
# Shareable link for events, workshops, etc.
```

```javascript
// schema/passes.js
// DynamoDB schema and utilities for invite passes

import { createHmac, randomInt } from 'crypto';
import { readFileSync } from 'fs';

// -----------------------------------------------------------------------------
// DynamoDB Schema Documentation
// -----------------------------------------------------------------------------
//
// Table: Passes (or your existing table with pk prefix 'pass#')
//
// Primary Key:
//   pk (String) - Partition key: 'pass#<code>' e.g. 'pass#correct-horse-battery-staple'
//
// Attributes:
//   code              (String)  - The passphrase itself, for convenience
//   bundleId          (String)  - Bundle granted: 'test', 'day-guest', 'invited-guest', etc.
//   passTypeId        (String)  - Pass type from submit_passes.toml: 'invited-guest', etc.
//
//   validFrom         (String)  - ISO8601 timestamp: when pass becomes usable
//   validUntil        (String)  - ISO8601 timestamp: when pass expires (null = never)
//   ttl               (Number)  - Unix timestamp for DynamoDB auto-deletion
//                                 (validUntil + 30 days, or createdAt + 1 year if no validUntil)
//
//   createdAt         (String)  - ISO8601 timestamp
//   updatedAt         (String)  - ISO8601 timestamp
//
//   maxUses           (Number)  - Maximum redemptions allowed
//   useCount          (Number)  - Current redemption count
//   revokedAt         (String)  - ISO8601 timestamp if revoked, null otherwise
//
//   restrictedToEmailHash (String) - HMAC-SHA256 hash of permitted email, null = unrestricted
//
//   createdBy         (String)  - User ID of creator: 'user#abc123'
//   notes             (String)  - Optional admin notes
//
// GSI (optional, for admin listing):
//   GSI1PK: bundleId
//   GSI1SK: createdAt
//
// -----------------------------------------------------------------------------

const EMAIL_HASH_SECRET = process.env.EMAIL_HASH_SECRET;

// Load EFF wordlist
const words = readFileSync(new URL('./eff_large_wordlist.txt', import.meta.url), 'utf-8')
  .trim()
  .split('\n')
  .map(line => line.split('\t')[1]);

/**
 * Generate a memorable passphrase
 */
export function generatePassphrase(wordCount = 4) {
  return Array.from({ length: wordCount }, () =>
    words[randomInt(words.length)]
  ).join('-');
}

/**
 * Hash an email address for restricted passes
 */
export function hashEmail(email) {
  if (!EMAIL_HASH_SECRET) {
    throw new Error('EMAIL_HASH_SECRET not configured');
  }
  return createHmac('sha256', EMAIL_HASH_SECRET)
    .update(email.toLowerCase().trim())
    .digest('base64url');
}

/**
 * Parse ISO8601 duration and add to date
 * Supports: P1D, P7D, P1M, P1Y
 */
export function addDuration(date, duration) {
  const result = new Date(date);
  const match = duration.match(/^P(\d+)([DWMY])$/);
  if (!match) throw new Error(`Invalid duration: ${duration}`);

  const [, amount, unit] = match;
  const n = parseInt(amount, 10);

  switch (unit) {
    case 'D': result.setDate(result.getDate() + n); break;
    case 'W': result.setDate(result.getDate() + n * 7); break;
    case 'M': result.setMonth(result.getMonth() + n); break;
    case 'Y': result.setFullYear(result.getFullYear() + n); break;
  }
  return result;
}

/**
 * Calculate TTL timestamp (30 days after validUntil, or 1 year after creation if unlimited)
 */
export function calculateTtl(validUntil, createdAt, retentionDays = 30) {
  const baseDate = validUntil ? new Date(validUntil) : addDuration(new Date(createdAt), 'P1Y');
  baseDate.setDate(baseDate.getDate() + retentionDays);
  return Math.floor(baseDate.getTime() / 1000);
}

/**
 * Create a new pass record
 */
export function createPass({
  passTypeId,
  bundleId,
  validFrom = new Date().toISOString(),
  validUntil = null,
  validityPeriod = null,  // ISO8601 duration, alternative to validUntil
  maxUses = 1,
  restrictedToEmail = null,
  createdBy,
  notes = null
}) {
  const now = new Date().toISOString();
  const code = generatePassphrase(4);

  // Calculate validUntil from duration if not explicitly set
  let effectiveValidUntil = validUntil;
  if (!effectiveValidUntil && validityPeriod) {
    effectiveValidUntil = addDuration(new Date(validFrom), validityPeriod).toISOString();
  }

  return {
    pk: `pass#${code}`,
    code,
    bundleId,
    passTypeId,

    validFrom,
    validUntil: effectiveValidUntil,
    ttl: calculateTtl(effectiveValidUntil, now),

    createdAt: now,
    updatedAt: now,

    maxUses,
    useCount: 0,
    revokedAt: null,

    restrictedToEmailHash: restrictedToEmail ? hashEmail(restrictedToEmail) : null,

    createdBy,
    notes
  };
}

// -----------------------------------------------------------------------------
// Example pass records
// -----------------------------------------------------------------------------

/*
// Test access pass (unrestricted, 7 days)
{
  pk: 'pass#crumble-widget-forest-anvil',
  code: 'crumble-widget-forest-anvil',
  bundleId: 'test',
  passTypeId: 'test-access',
  validFrom: '2026-01-31T00:00:00.000Z',
  validUntil: '2026-02-07T00:00:00.000Z',
  ttl: 1741564800,
  createdAt: '2026-01-31T12:00:00.000Z',
  updatedAt: '2026-01-31T12:00:00.000Z',
  maxUses: 1,
  useCount: 0,
  revokedAt: null,
  restrictedToEmailHash: null,
  createdBy: 'user#admin',
  notes: 'Developer testing'
}

// Invited guest pass (email-restricted, 1 month)
{
  pk: 'pass#correct-horse-battery-staple',
  code: 'correct-horse-battery-staple',
  bundleId: 'invited-guest',
  passTypeId: 'invited-guest',
  validFrom: '2026-02-01T00:00:00.000Z',
  validUntil: '2026-03-01T00:00:00.000Z',
  ttl: 1743465600,
  createdAt: '2026-01-31T12:00:00.000Z',
  updatedAt: '2026-01-31T12:00:00.000Z',
  maxUses: 1,
  useCount: 0,
  revokedAt: null,
  restrictedToEmailHash: 'Ks7d9fJ2mNpQrX8vY1bT...',
  createdBy: 'user#admin',
  notes: 'Beta tester invite'
}

// Resident guest pass (email-restricted, unlimited duration)
{
  pk: 'pass#purple-mountain-silver-dawn',
  code: 'purple-mountain-silver-dawn',
  bundleId: 'resident-guest',
  passTypeId: 'resident-guest',
  validFrom: '2026-02-01T00:00:00.000Z',
  validUntil: null,
  ttl: 1769817600,  // 1 year + 30 days from creation
  createdAt: '2026-01-31T12:00:00.000Z',
  updatedAt: '2026-01-31T12:00:00.000Z',
  maxUses: 1,
  useCount: 0,
  revokedAt: null,
  restrictedToEmailHash: 'Ab3xYz9qW2pLm...',
  createdBy: 'user#admin',
  notes: 'Partner access'
}

// Group invite pass (unrestricted email, multiple uses)
{
  pk: 'pass#happy-tiger-blue-ocean',
  code: 'happy-tiger-blue-ocean',
  bundleId: 'invited-guest',
  passTypeId: 'group-invite',
  validFrom: '2026-02-01T00:00:00.000Z',
  validUntil: '2026-02-28T23:59:59.000Z',
  ttl: 1743465600,
  createdAt: '2026-01-31T12:00:00.000Z',
  updatedAt: '2026-01-31T12:00:00.000Z',
  maxUses: 10,
  useCount: 3,
  revokedAt: null,
  restrictedToEmailHash: null,
  createdBy: 'user#admin',
  notes: 'Accountancy workshop Feb 2026'
}
*/
```

```javascript
// services/passService.js
// Pass redemption and management

import { DynamoDBDocumentClient, GetCommand, UpdateCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { createPass, hashEmail } from '../schema/passes.js';

export class PassService {
  constructor(docClient, tableName = 'Passes') {
    this.docClient = docClient;
    this.tableName = tableName;
  }

  /**
   * Redeem a pass for a user
   */
  async redeem(code, userEmail) {
    const now = new Date().toISOString();
    const emailHash = hashEmail(userEmail);

    try {
      const result = await this.docClient.send(new UpdateCommand({
        TableName: this.tableName,
        Key: { pk: `pass#${code}` },
        UpdateExpression: 'SET useCount = useCount + :inc, updatedAt = :now',
        ConditionExpression: [
          'attribute_exists(pk)',
          'revokedAt = :null',
          'useCount < maxUses',
          'validFrom <= :now',
          '(validUntil = :null OR validUntil >= :now)',
          '(restrictedToEmailHash = :null OR restrictedToEmailHash = :emailHash)'
        ].join(' AND '),
        ExpressionAttributeValues: {
          ':inc': 1,
          ':now': now,
          ':null': null,
          ':emailHash': emailHash
        },
        ReturnValues: 'ALL_NEW'
      }));

      return {
        valid: true,
        pass: result.Attributes,
        bundleId: result.Attributes.bundleId
      };
    } catch (err) {
      if (err.name === 'ConditionalCheckFailedException') {
        const reason = await this.diagnoseFailure(code, emailHash);
        return { valid: false, reason };
      }
      throw err;
    }
  }

  /**
   * Diagnose why a pass redemption failed
   */
  async diagnoseFailure(code, emailHash) {
    const result = await this.docClient.send(new GetCommand({
      TableName: this.tableName,
      Key: { pk: `pass#${code}` }
    }));

    if (!result.Item) return 'not_found';

    const pass = result.Item;
    const now = new Date().toISOString();

    if (pass.revokedAt) return 'revoked';
    if (pass.useCount >= pass.maxUses) return 'exhausted';
    if (now < pass.validFrom) return 'not_yet_valid';
    if (pass.validUntil && now > pass.validUntil) return 'expired';
    if (pass.restrictedToEmailHash && pass.restrictedToEmailHash !== emailHash) {
      return 'wrong_email';
    }
    return 'unknown';
  }

  /**
   * Check pass validity without redeeming
   */
  async check(code, userEmail = null) {
    const result = await this.docClient.send(new GetCommand({
      TableName: this.tableName,
      Key: { pk: `pass#${code}` }
    }));

    if (!result.Item) {
      return { valid: false, reason: 'not_found' };
    }

    const pass = result.Item;
    const now = new Date().toISOString();
    const emailHash = userEmail ? hashEmail(userEmail) : null;

    if (pass.revokedAt) return { valid: false, reason: 'revoked', pass };
    if (pass.useCount >= pass.maxUses) return { valid: false, reason: 'exhausted', pass };
    if (now < pass.validFrom) return { valid: false, reason: 'not_yet_valid', pass };
    if (pass.validUntil && now > pass.validUntil) return { valid: false, reason: 'expired', pass };

    // Check email restriction
    const emailRequired = !!pass.restrictedToEmailHash;
    const emailMatches = !emailRequired || (emailHash && pass.restrictedToEmailHash === emailHash);

    if (emailRequired && !userEmail) {
      return { valid: false, reason: 'email_required', pass };
    }
    if (emailRequired && !emailMatches) {
      return { valid: false, reason: 'wrong_email', pass };
    }

    return {
      valid: true,
      pass,
      bundleId: pass.bundleId,
      usesRemaining: pass.maxUses - pass.useCount
    };
  }

  /**
   * Create and store a new pass
   */
  async create(params) {
    const pass = createPass(params);

    await this.docClient.send(new PutCommand({
      TableName: this.tableName,
      Item: pass,
      ConditionExpression: 'attribute_not_exists(pk)'  // Prevent collision
    }));

    return pass;
  }

  /**
   * Revoke a pass
   */
  async revoke(code) {
    const now = new Date().toISOString();

    const result = await this.docClient.send(new UpdateCommand({
      TableName: this.tableName,
      Key: { pk: `pass#${code}` },
      UpdateExpression: 'SET revokedAt = :now, updatedAt = :now',
      ConditionExpression: 'attribute_exists(pk) AND revokedAt = :null',
      ExpressionAttributeValues: {
        ':now': now,
        ':null': null
      },
      ReturnValues: 'ALL_NEW'
    }));

    return result.Attributes;
  }

  /**
   * Get a pass by code (admin view)
   */
  async get(code) {
    const result = await this.docClient.send(new GetCommand({
      TableName: this.tableName,
      Key: { pk: `pass#${code}` }
    }));
    return result.Item || null;
  }
}
```

**Key design decisions:**

1. **`passTypeId` links to `submit_passes.toml`** — the pass record stores which template it was created from, useful for admin views and defaults

2. **`bundleId` is denormalised** — stored directly on the pass so redemption doesn't need to look up the pass type

3. **`validUntil` can be null** — for unlimited passes like `resident-guest`, TTL is calculated as 1 year + 30 days from creation instead

4. **Failure diagnosis returns machine-readable codes** — `not_found`, `revoked`, `exhausted`, `not_yet_valid`, `expired`, `wrong_email`, `email_required` — your UI can map these to friendly messages

5. **`check()` vs `redeem()`** — `check()` is idempotent for the bundles.html validation, `redeem()` atomically increments useCount

6. **Pass URL format** — your bundles.html can accept `?pass=correct-horse-battery-staple` and call the check/redeem API
