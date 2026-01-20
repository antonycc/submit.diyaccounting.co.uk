# Implementation Plan: Full 9-Box VAT Return & HMRC Compliance

**Date**: 20 January 2026 (Updated)
**Approach**: Inside-out by testable component (data layer → service → API → UI)
**Backward Compatibility**: Not required (no live users)

---

## Compliance Requirements Summary

### HMRC MTD Requirements

From [HMRC VAT MTD End-to-End Service Guide](https://developer.service.hmrc.gov.uk/guides/vat-mtd-end-to-end-service-guide/):

| Requirement | Current State | Target State |
|-------------|---------------|--------------|
| **Period Key Visibility** | ❌ Shown to user (manual entry) | ✅ Hidden - show date ranges only |
| **Legal Declaration** | ❌ Not displayed | ✅ Must confirm before submission |
| **9-Box VAT Entry** | ❌ Single field (server fills zeros) | ✅ Full 9-box entry |
| **Box 3/5 Calculation** | ⚠️ Server calculates | ✅ Validated calculations |

**Key HMRC Quote on Period Keys:**
> "Period keys should not be shown to the business or agent, these are for software use to ensure the return is recorded against the correct obligation."

### WCAG 2.1 AA Accessibility Requirements

From COMPLIANCE_REPORT.md (19 January 2026) - axe-core detected 13 violations:

| Requirement | Current State | Target State |
|-------------|---------------|--------------|
| **document-title** | ❌ 2 pages missing titles | ✅ All pages have descriptive `<title>` |
| **link-in-text-block** | ❌ 9 pages with links distinguished only by color | ✅ Links have underline or non-color distinction |
| **landmark-one-main** | ❌ Pages missing `<main>` landmark | ✅ All pages have `<main>` element |
| **page-has-heading-one** | ❌ Pages missing `<h1>` | ✅ All pages have `<h1>` heading |

### Security Header Requirements

From OWASP ZAP scan (19 January 2026) - 6 medium, 5 low severity findings:

| Requirement | Current State | Severity | Target State |
|-------------|---------------|----------|--------------|
| **Content-Security-Policy** | ❌ Not set | Medium | ✅ CSP header configured |
| **Strict-Transport-Security** | ❌ Not set | Low | ✅ HSTS header with max-age |
| **Permissions-Policy** | ❌ Not set | Low | ✅ Permissions-Policy header |
| **Subresource Integrity** | ❌ External resources lack SRI | Medium | ✅ SRI attributes on external scripts/links |

### ESLint Security Warnings (54 total)

From eslint-security scan - all warnings, no errors:

| Category | Count | Priority |
|----------|-------|----------|
| Generic Object Injection Sink | 47 | Low (review for user input paths) |
| Non-literal fs filename | 4 | Low (server-side, controlled paths) |
| Variable Assigned to Object Injection Sink | 6 | Low (review for user input paths) |
| Non-literal RegExp Constructor | 1 | Low (review input source) |

> Note: These are mostly false positives in internal code paths. Review for any that process untrusted user input.

---

## Component 1: VAT Data Types & Validation Library

**New file**: `app/lib/vatReturnTypes.js`

### 1.1 Define VAT Return Data Structure

```javascript
// app/lib/vatReturnTypes.js

/**
 * VAT Return 9-box data structure
 * Per HMRC API spec: hmrc-mtd-vat-api-1.0.yaml lines 5723-5813
 */
export const VAT_BOX_CONFIG = {
  vatDueSales: { box: 1, type: 'decimal', decimals: 2, min: -9999999999999.99, max: 9999999999999.99 },
  vatDueAcquisitions: { box: 2, type: 'decimal', decimals: 2, min: -9999999999999.99, max: 9999999999999.99 },
  totalVatDue: { box: 3, type: 'decimal', decimals: 2, calculated: true }, // Box1 + Box2
  vatReclaimedCurrPeriod: { box: 4, type: 'decimal', decimals: 2, min: -9999999999999.99, max: 9999999999999.99 },
  netVatDue: { box: 5, type: 'decimal', decimals: 2, min: 0, max: 99999999999.99, calculated: true }, // |Box3 - Box4|
  totalValueSalesExVAT: { box: 6, type: 'integer', min: -9999999999999, max: 9999999999999 },
  totalValuePurchasesExVAT: { box: 7, type: 'integer', min: -9999999999999, max: 9999999999999 },
  totalValueGoodsSuppliedExVAT: { box: 8, type: 'integer', min: -9999999999999, max: 9999999999999 },
  totalAcquisitionsExVAT: { box: 9, type: 'integer', min: -9999999999999, max: 9999999999999 },
};

/**
 * Calculate Box 3: totalVatDue = vatDueSales + vatDueAcquisitions
 */
export function calculateTotalVatDue(vatDueSales, vatDueAcquisitions) {
  return roundToDecimals(vatDueSales + vatDueAcquisitions, 2);
}

/**
 * Calculate Box 5: netVatDue = |totalVatDue - vatReclaimedCurrPeriod|
 * Must always be positive per HMRC spec
 */
export function calculateNetVatDue(totalVatDue, vatReclaimedCurrPeriod) {
  return roundToDecimals(Math.abs(totalVatDue - vatReclaimedCurrPeriod), 2);
}

/**
 * Round to specified decimal places
 */
export function roundToDecimals(value, decimals) {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

/**
 * Parse and validate a single VAT box value
 */
export function parseVatBoxValue(fieldName, value) {
  const config = VAT_BOX_CONFIG[fieldName];
  if (!config) throw new Error(`Unknown VAT field: ${fieldName}`);

  let parsed;
  if (config.type === 'integer') {
    parsed = parseInt(value, 10);
    if (!Number.isInteger(parsed)) {
      throw new Error(`${fieldName} (Box ${config.box}) must be a whole number`);
    }
  } else {
    parsed = parseFloat(value);
    if (Number.isNaN(parsed)) {
      throw new Error(`${fieldName} (Box ${config.box}) must be a number`);
    }
    parsed = roundToDecimals(parsed, config.decimals);
  }

  if (config.min !== undefined && parsed < config.min) {
    throw new Error(`${fieldName} (Box ${config.box}) cannot be less than ${config.min}`);
  }
  if (config.max !== undefined && parsed > config.max) {
    throw new Error(`${fieldName} (Box ${config.box}) cannot exceed ${config.max}`);
  }

  return parsed;
}

/**
 * Build complete VAT return request body from user inputs
 * Calculates Box 3 and Box 5 automatically
 */
export function buildVatReturnBody(periodKey, userInputs) {
  const vatDueSales = parseVatBoxValue('vatDueSales', userInputs.vatDueSales);
  const vatDueAcquisitions = parseVatBoxValue('vatDueAcquisitions', userInputs.vatDueAcquisitions);
  const vatReclaimedCurrPeriod = parseVatBoxValue('vatReclaimedCurrPeriod', userInputs.vatReclaimedCurrPeriod);
  const totalValueSalesExVAT = parseVatBoxValue('totalValueSalesExVAT', userInputs.totalValueSalesExVAT);
  const totalValuePurchasesExVAT = parseVatBoxValue('totalValuePurchasesExVAT', userInputs.totalValuePurchasesExVAT);
  const totalValueGoodsSuppliedExVAT = parseVatBoxValue('totalValueGoodsSuppliedExVAT', userInputs.totalValueGoodsSuppliedExVAT);
  const totalAcquisitionsExVAT = parseVatBoxValue('totalAcquisitionsExVAT', userInputs.totalAcquisitionsExVAT);

  // Calculate derived fields
  const totalVatDue = calculateTotalVatDue(vatDueSales, vatDueAcquisitions);
  const netVatDue = calculateNetVatDue(totalVatDue, vatReclaimedCurrPeriod);

  return {
    periodKey,
    vatDueSales,
    vatDueAcquisitions,
    totalVatDue,
    vatReclaimedCurrPeriod,
    netVatDue,
    totalValueSalesExVAT,
    totalValuePurchasesExVAT,
    totalValueGoodsSuppliedExVAT,
    totalAcquisitionsExVAT,
    finalised: true,
  };
}

/**
 * Encode period key for URL (handles # prefix)
 * Per HMRC: "Period keys that include a # symbol must be encoded"
 */
export function encodePeriodKey(periodKey) {
  if (periodKey.startsWith('#')) {
    return encodeURIComponent(periodKey);
  }
  return periodKey;
}
```

### 1.2 Unit Tests for VAT Types

**New file**: `app/unit-tests/lib/vatReturnTypes.test.js`

```javascript
// app/unit-tests/lib/vatReturnTypes.test.js

import { describe, it, expect } from 'vitest';
import {
  calculateTotalVatDue,
  calculateNetVatDue,
  parseVatBoxValue,
  buildVatReturnBody,
  encodePeriodKey,
} from '../../lib/vatReturnTypes.js';

describe('vatReturnTypes', () => {
  describe('calculateTotalVatDue', () => {
    it('calculates Box 3 = Box 1 + Box 2', () => {
      expect(calculateTotalVatDue(1000.50, 200.25)).toBe(1200.75);
    });

    it('handles negative values', () => {
      expect(calculateTotalVatDue(-500, 200)).toBe(-300);
    });

    it('rounds to 2 decimal places', () => {
      expect(calculateTotalVatDue(100.555, 100.555)).toBe(201.11);
    });
  });

  describe('calculateNetVatDue', () => {
    it('calculates Box 5 = |Box 3 - Box 4| when Box 3 > Box 4', () => {
      expect(calculateNetVatDue(1000, 300)).toBe(700);
    });

    it('returns positive value when Box 4 > Box 3 (refund scenario)', () => {
      expect(calculateNetVatDue(300, 1000)).toBe(700);
    });

    it('returns 0 when equal', () => {
      expect(calculateNetVatDue(500, 500)).toBe(0);
    });
  });

  describe('parseVatBoxValue', () => {
    it('parses decimal fields with 2 decimal places', () => {
      expect(parseVatBoxValue('vatDueSales', '1234.567')).toBe(1234.57);
    });

    it('parses integer fields as whole numbers', () => {
      expect(parseVatBoxValue('totalValueSalesExVAT', '5000')).toBe(5000);
    });

    it('rejects non-integer for integer fields', () => {
      expect(() => parseVatBoxValue('totalValueSalesExVAT', '5000.50'))
        .toThrow('must be a whole number');
    });

    it('enforces minimum for netVatDue (Box 5)', () => {
      expect(() => parseVatBoxValue('netVatDue', '-100'))
        .toThrow('cannot be less than 0');
    });

    it('enforces maximum values', () => {
      expect(() => parseVatBoxValue('vatDueSales', '99999999999999'))
        .toThrow('cannot exceed');
    });
  });

  describe('buildVatReturnBody', () => {
    it('builds complete request with calculated fields', () => {
      const result = buildVatReturnBody('24A1', {
        vatDueSales: 1000,
        vatDueAcquisitions: 0,
        vatReclaimedCurrPeriod: 200,
        totalValueSalesExVAT: 5000,
        totalValuePurchasesExVAT: 1000,
        totalValueGoodsSuppliedExVAT: 0,
        totalAcquisitionsExVAT: 0,
      });

      expect(result.periodKey).toBe('24A1');
      expect(result.vatDueSales).toBe(1000);
      expect(result.totalVatDue).toBe(1000); // 1000 + 0
      expect(result.netVatDue).toBe(800); // |1000 - 200|
      expect(result.finalised).toBe(true);
    });

    it('handles refund scenario (Box 4 > Box 3)', () => {
      const result = buildVatReturnBody('24A1', {
        vatDueSales: 500,
        vatDueAcquisitions: 0,
        vatReclaimedCurrPeriod: 1200,
        totalValueSalesExVAT: 2500,
        totalValuePurchasesExVAT: 6000,
        totalValueGoodsSuppliedExVAT: 0,
        totalAcquisitionsExVAT: 0,
      });

      expect(result.totalVatDue).toBe(500);
      expect(result.netVatDue).toBe(700); // |500 - 1200| = 700 (refund)
    });
  });

  describe('encodePeriodKey', () => {
    it('encodes period keys with # prefix', () => {
      expect(encodePeriodKey('#001')).toBe('%23001');
    });

    it('leaves normal period keys unchanged', () => {
      expect(encodePeriodKey('24A1')).toBe('24A1');
    });

    it('leaves numeric period keys unchanged', () => {
      expect(encodePeriodKey('0418')).toBe('0418');
    });
  });
});
```

### 1.3 Run Tests

```bash
npm run test:unit -- app/unit-tests/lib/vatReturnTypes.test.js
```

---

## Component 2: Backend API - VAT Return POST

**Modify**: `app/functions/hmrc/hmrcVatReturnPost.js`

### 2.1 Update Parameter Extraction

Replace current `extractAndValidateParameters` to accept 9-box inputs:

```javascript
// In app/functions/hmrc/hmrcVatReturnPost.js

import { buildVatReturnBody, encodePeriodKey } from '../../lib/vatReturnTypes.js';

export function extractAndValidateParameters(event, errorMessages) {
  const parsedBody = parseRequestBody(event);
  const {
    vatNumber,
    periodKey,
    // 9-box fields (user inputs 7, we calculate 2)
    vatDueSales,
    vatDueAcquisitions,
    vatReclaimedCurrPeriod,
    totalValueSalesExVAT,
    totalValuePurchasesExVAT,
    totalValueGoodsSuppliedExVAT,
    totalAcquisitionsExVAT,
    accessToken,
    runFraudPreventionHeaderValidation,
  } = parsedBody || {};

  const hmrcAccessToken = accessToken;

  // Required field validation
  if (!vatNumber) errorMessages.push('Missing vatNumber parameter');
  if (!periodKey) errorMessages.push('Missing periodKey parameter');
  if (vatDueSales === undefined) errorMessages.push('Missing vatDueSales (Box 1)');
  if (vatDueAcquisitions === undefined) errorMessages.push('Missing vatDueAcquisitions (Box 2)');
  if (vatReclaimedCurrPeriod === undefined) errorMessages.push('Missing vatReclaimedCurrPeriod (Box 4)');
  if (totalValueSalesExVAT === undefined) errorMessages.push('Missing totalValueSalesExVAT (Box 6)');
  if (totalValuePurchasesExVAT === undefined) errorMessages.push('Missing totalValuePurchasesExVAT (Box 7)');
  if (totalValueGoodsSuppliedExVAT === undefined) errorMessages.push('Missing totalValueGoodsSuppliedExVAT (Box 8)');
  if (totalAcquisitionsExVAT === undefined) errorMessages.push('Missing totalAcquisitionsExVAT (Box 9)');

  // VRN format validation
  if (vatNumber && !isValidVrn(vatNumber)) {
    errorMessages.push('Invalid vatNumber format - must be 9 digits');
  }
  if (periodKey && !isValidPeriodKey(periodKey)) {
    errorMessages.push('Invalid periodKey format');
  }

  // HMRC account header
  const hmrcAccountHeader = (event.headers && event.headers.hmrcaccount) || '';
  const hmrcAccount = hmrcAccountHeader.toLowerCase();
  if (hmrcAccount && hmrcAccount !== 'sandbox' && hmrcAccount !== 'live') {
    errorMessages.push("Invalid hmrcAccount header. Must be 'sandbox' or 'live'");
  }

  const runFraudPreventionHeaderValidationBool =
    runFraudPreventionHeaderValidation === true || runFraudPreventionHeaderValidation === 'true';

  return {
    vatNumber,
    periodKey,
    hmrcAccessToken,
    vatInputs: {
      vatDueSales,
      vatDueAcquisitions,
      vatReclaimedCurrPeriod,
      totalValueSalesExVAT,
      totalValuePurchasesExVAT,
      totalValueGoodsSuppliedExVAT,
      totalAcquisitionsExVAT,
    },
    hmrcAccount,
    runFraudPreventionHeaderValidation: runFraudPreventionHeaderValidationBool,
  };
}
```

### 2.2 Update submitVat Function

Replace current hardcoded body building with the new type-safe builder:

```javascript
// In app/functions/hmrc/hmrcVatReturnPost.js - submitVat function

export async function submitVat(
  periodKey,
  vatInputs,  // Changed from vatDue
  vatNumber,
  hmrcAccount,
  hmrcAccessToken,
  govClientHeaders,
  auditForUserSub,
  govTestScenarioHeader,
  runFraudPreventionHeaderValidation = false,
  requestId = undefined,
  traceparent = undefined,
  correlationId = undefined,
) {
  // Fraud prevention validation unchanged...

  // Build HMRC request body using validated types
  let hmrcRequestBody;
  try {
    hmrcRequestBody = buildVatReturnBody(periodKey, vatInputs);
  } catch (validationError) {
    throw new Error(`VAT return validation failed: ${validationError.message}`);
  }

  // Build URL with encoded period key
  const hmrcBase = hmrcAccount === 'sandbox' ? process.env.HMRC_SANDBOX_BASE_URI : process.env.HMRC_BASE_URI;
  const hmrcRequestUrl = `${hmrcBase}/organisations/vat/${vatNumber}/returns`;

  // Rest of function unchanged (HTTP call, response handling)...
}
```

### 2.3 Update Caller Sites

Update the payload construction in `ingestHandler` and `workerHandler` to pass `vatInputs` object instead of `numVatDue`.

### 2.4 Unit Tests for Updated API

**Modify**: `app/unit-tests/functions/hmrcVatReturnPost.test.js`

```javascript
describe('extractAndValidateParameters', () => {
  it('extracts all 9-box fields', () => {
    const event = {
      body: JSON.stringify({
        vatNumber: '123456789',
        periodKey: '24A1',
        vatDueSales: 1000,
        vatDueAcquisitions: 0,
        vatReclaimedCurrPeriod: 200,
        totalValueSalesExVAT: 5000,
        totalValuePurchasesExVAT: 1000,
        totalValueGoodsSuppliedExVAT: 0,
        totalAcquisitionsExVAT: 0,
        accessToken: 'test-token',
      }),
    };

    const errors = [];
    const result = extractAndValidateParameters(event, errors);

    expect(errors).toHaveLength(0);
    expect(result.vatInputs.vatDueSales).toBe(1000);
    expect(result.vatInputs.vatReclaimedCurrPeriod).toBe(200);
  });

  it('validates missing required fields', () => {
    const event = {
      body: JSON.stringify({
        vatNumber: '123456789',
        periodKey: '24A1',
        vatDueSales: 1000,
        // Missing other boxes
        accessToken: 'test-token',
      }),
    };

    const errors = [];
    extractAndValidateParameters(event, errors);

    expect(errors).toContain('Missing vatDueAcquisitions (Box 2)');
    expect(errors).toContain('Missing vatReclaimedCurrPeriod (Box 4)');
  });
});

describe('submitVat', () => {
  it('builds correct HMRC request body with calculated fields', async () => {
    // Mock HMRC API call
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ processingDate: '2024-01-19', formBundleNumber: '123' }),
    });

    const result = await submitVat(
      '24A1',
      {
        vatDueSales: 1000,
        vatDueAcquisitions: 50,
        vatReclaimedCurrPeriod: 200,
        totalValueSalesExVAT: 5000,
        totalValuePurchasesExVAT: 1000,
        totalValueGoodsSuppliedExVAT: 0,
        totalAcquisitionsExVAT: 0,
      },
      '123456789',
      'sandbox',
      'test-token',
      {},
      'user-123',
    );

    // Verify the request body sent to HMRC
    const sentBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(sentBody.totalVatDue).toBe(1050); // 1000 + 50
    expect(sentBody.netVatDue).toBe(850); // |1050 - 200|
    expect(sentBody.finalised).toBe(true);
  });
});
```

---

## Component 3: HMRC Validation Library Update

**Modify**: `app/lib/hmrcValidation.js`

### 3.1 Update Period Key Validation

```javascript
// app/lib/hmrcValidation.js

/**
 * Validate period key format
 * Formats: YYXN (e.g., 24A1), #NNN (e.g., #001), NNNN (e.g., 0418)
 * Special: 0000 (no period), 9999 (ceased trading)
 */
export function isValidPeriodKey(periodKey) {
  if (!periodKey || typeof periodKey !== 'string') return false;

  // Standard quarterly/monthly format: YYXN where X is A-L and N is 1-4 or A-L
  const standardFormat = /^\d{2}[A-L][1-4A-L]$/i;

  // Hash format: #NNN
  const hashFormat = /^#\d{3}$/;

  // Pure numeric format: NNNN (includes special 0000 and 9999)
  const numericFormat = /^\d{4}$/;

  return standardFormat.test(periodKey) ||
         hashFormat.test(periodKey) ||
         numericFormat.test(periodKey);
}
```

### 3.2 Unit Test Update

**Modify**: `app/unit-tests/lib/hmrcValidation.test.js`

```javascript
describe('isValidPeriodKey', () => {
  it('accepts standard quarterly format (24A1)', () => {
    expect(isValidPeriodKey('24A1')).toBe(true);
    expect(isValidPeriodKey('25B3')).toBe(true);
  });

  it('accepts monthly format (18AD)', () => {
    expect(isValidPeriodKey('18AD')).toBe(true);
    expect(isValidPeriodKey('18AF')).toBe(true);
  });

  it('accepts hash format (#001)', () => {
    expect(isValidPeriodKey('#001')).toBe(true);
    expect(isValidPeriodKey('#999')).toBe(true);
  });

  it('accepts numeric format (0418)', () => {
    expect(isValidPeriodKey('0418')).toBe(true);
    expect(isValidPeriodKey('1218')).toBe(true);
  });

  it('accepts special period keys', () => {
    expect(isValidPeriodKey('0000')).toBe(true); // No specific period
    expect(isValidPeriodKey('9999')).toBe(true); // Ceased trading
  });

  it('rejects invalid formats', () => {
    expect(isValidPeriodKey('ABC')).toBe(false);
    expect(isValidPeriodKey('24A')).toBe(false);
    expect(isValidPeriodKey('24A12')).toBe(false);
  });
});
```

---

## Component 4: Obligations Data Formatting

**New file**: `app/lib/obligationFormatter.js`

### 4.1 Format Obligations for UI (Hide Period Key)

```javascript
// app/lib/obligationFormatter.js

/**
 * Format obligation for display to user
 * HMRC requirement: Period keys must NOT be shown to users
 */
export function formatObligationForDisplay(obligation) {
  const startDate = new Date(obligation.start);
  const endDate = new Date(obligation.end);
  const dueDate = obligation.due ? new Date(obligation.due) : null;

  const dateOptions = { day: 'numeric', month: 'short', year: 'numeric' };

  return {
    // Internal use only - NOT for display
    _periodKey: obligation.periodKey,

    // User-visible fields
    id: obligation.periodKey, // Used as key, but displayed as date range
    displayName: `${startDate.toLocaleDateString('en-GB', dateOptions)} to ${endDate.toLocaleDateString('en-GB', dateOptions)}`,
    startDate: obligation.start,
    endDate: obligation.end,
    dueDate: obligation.due,
    dueDateFormatted: dueDate ? dueDate.toLocaleDateString('en-GB', dateOptions) : null,
    status: obligation.status, // 'O' (open) or 'F' (fulfilled)
    statusDisplay: obligation.status === 'O' ? 'Open' : 'Submitted',
    receivedDate: obligation.received,
  };
}

/**
 * Format list of obligations for UI dropdown/selection
 * Returns array sorted by end date (most recent first)
 */
export function formatObligationsForSelection(obligations) {
  return obligations
    .map(formatObligationForDisplay)
    .sort((a, b) => new Date(b.endDate) - new Date(a.endDate));
}

/**
 * Get period key from formatted obligation (for API submission)
 * This extracts the hidden period key when user selects an obligation
 */
export function getPeriodKeyFromSelection(formattedObligation) {
  return formattedObligation._periodKey;
}
```

### 4.2 Unit Tests

**New file**: `app/unit-tests/lib/obligationFormatter.test.js`

```javascript
import { describe, it, expect } from 'vitest';
import {
  formatObligationForDisplay,
  formatObligationsForSelection,
  getPeriodKeyFromSelection,
} from '../../lib/obligationFormatter.js';

describe('obligationFormatter', () => {
  const sampleObligation = {
    periodKey: '24A1',
    start: '2024-01-01',
    end: '2024-03-31',
    due: '2024-05-07',
    status: 'O',
  };

  describe('formatObligationForDisplay', () => {
    it('formats dates for user display', () => {
      const result = formatObligationForDisplay(sampleObligation);

      expect(result.displayName).toBe('1 Jan 2024 to 31 Mar 2024');
      expect(result.statusDisplay).toBe('Open');
    });

    it('hides period key in internal field', () => {
      const result = formatObligationForDisplay(sampleObligation);

      expect(result._periodKey).toBe('24A1');
      expect(result.periodKey).toBeUndefined(); // Not exposed
    });

    it('handles fulfilled status', () => {
      const fulfilled = { ...sampleObligation, status: 'F', received: '2024-04-15' };
      const result = formatObligationForDisplay(fulfilled);

      expect(result.statusDisplay).toBe('Submitted');
      expect(result.receivedDate).toBe('2024-04-15');
    });
  });

  describe('formatObligationsForSelection', () => {
    it('sorts by end date descending', () => {
      const obligations = [
        { periodKey: '24A1', start: '2024-01-01', end: '2024-03-31', status: 'O' },
        { periodKey: '24A2', start: '2024-04-01', end: '2024-06-30', status: 'O' },
      ];

      const result = formatObligationsForSelection(obligations);

      expect(result[0]._periodKey).toBe('24A2'); // Later period first
      expect(result[1]._periodKey).toBe('24A1');
    });
  });

  describe('getPeriodKeyFromSelection', () => {
    it('extracts hidden period key for API submission', () => {
      const formatted = formatObligationForDisplay(sampleObligation);
      const periodKey = getPeriodKeyFromSelection(formatted);

      expect(periodKey).toBe('24A1');
    });
  });
});
```

---

## Component 5: Update VAT Obligations API Response

**Modify**: `app/functions/hmrc/hmrcVatObligationGet.js`

### 5.1 Add Formatted Response Option

```javascript
// Add to hmrcVatObligationGet.js

import { formatObligationsForSelection } from '../../lib/obligationFormatter.js';

// In the response building section, add formatted obligations:
const formattedObligations = formatObligationsForSelection(obligations);

return http200OkResponse({
  request,
  headers: responseHeaders,
  data: {
    obligations: obligations, // Raw for backward compat
    formattedObligations: formattedObligations, // UI-ready (period keys hidden)
  },
});
```

---

## Component 6: Frontend - VAT Submission Form

**Modify**: `web/public/hmrc/vat/submitVat.html`

### 6.1 Replace Form Fields

Remove:
- Single `vatDue` field
- Manual `periodKey` text input

Add:
- Obligation selector dropdown (shows date ranges, not period keys)
- 9-box VAT entry fields
- Legal declaration checkbox

```html
<!-- Period Selection (replaces manual periodKey input) -->
<div class="form-group">
  <label for="obligationSelect">VAT Period</label>
  <select id="obligationSelect" name="obligationSelect" required>
    <option value="">-- Load obligations first --</option>
  </select>
  <button type="button" id="loadObligationsBtn" class="secondary-button">
    Load Open Periods
  </button>
  <div class="help-text">Select the VAT period to submit a return for</div>
  <!-- Hidden field to store actual period key -->
  <input type="hidden" id="periodKey" name="periodKey" />
</div>

<!-- VAT Boxes Section -->
<fieldset class="form-section">
  <legend>VAT Amounts</legend>

  <div class="form-row">
    <div class="form-group">
      <label for="vatDueSales">Box 1: VAT due on sales (£)</label>
      <input type="number" id="vatDueSales" name="vatDueSales"
             required step="0.01" value="0.00" />
    </div>
    <div class="form-group">
      <label for="vatDueAcquisitions">Box 2: VAT due on acquisitions (£)</label>
      <input type="number" id="vatDueAcquisitions" name="vatDueAcquisitions"
             required step="0.01" value="0.00" />
    </div>
  </div>

  <div class="form-row">
    <div class="form-group calculated">
      <label for="totalVatDue">Box 3: Total VAT due (£)</label>
      <input type="number" id="totalVatDue" name="totalVatDue"
             readonly step="0.01" value="0.00" />
      <div class="help-text">Calculated: Box 1 + Box 2</div>
    </div>
    <div class="form-group">
      <label for="vatReclaimedCurrPeriod">Box 4: VAT reclaimed (£)</label>
      <input type="number" id="vatReclaimedCurrPeriod" name="vatReclaimedCurrPeriod"
             required step="0.01" value="0.00" />
    </div>
  </div>

  <div class="form-group calculated highlight">
    <label for="netVatDue">Box 5: Net VAT to pay/reclaim (£)</label>
    <input type="number" id="netVatDue" name="netVatDue"
           readonly step="0.01" value="0.00" />
    <div class="help-text">Calculated: |Box 3 - Box 4|</div>
  </div>
</fieldset>

<fieldset class="form-section">
  <legend>Turnover (whole pounds)</legend>

  <div class="form-row">
    <div class="form-group">
      <label for="totalValueSalesExVAT">Box 6: Total sales excl. VAT (£)</label>
      <input type="number" id="totalValueSalesExVAT" name="totalValueSalesExVAT"
             required step="1" value="0" />
    </div>
    <div class="form-group">
      <label for="totalValuePurchasesExVAT">Box 7: Total purchases excl. VAT (£)</label>
      <input type="number" id="totalValuePurchasesExVAT" name="totalValuePurchasesExVAT"
             required step="1" value="0" />
    </div>
  </div>

  <div class="form-row">
    <div class="form-group">
      <label for="totalValueGoodsSuppliedExVAT">Box 8: Goods supplied to EU excl. VAT (£)</label>
      <input type="number" id="totalValueGoodsSuppliedExVAT" name="totalValueGoodsSuppliedExVAT"
             required step="1" value="0" />
    </div>
    <div class="form-group">
      <label for="totalAcquisitionsExVAT">Box 9: Acquisitions from EU excl. VAT (£)</label>
      <input type="number" id="totalAcquisitionsExVAT" name="totalAcquisitionsExVAT"
             required step="1" value="0" />
    </div>
  </div>
</fieldset>

<!-- Legal Declaration (MANDATORY per HMRC) -->
<div class="declaration-section">
  <h3>Declaration</h3>
  <div class="declaration-box">
    <input type="checkbox" id="declarationCheckbox" name="declarationCheckbox" required />
    <label for="declarationCheckbox">
      When you submit this VAT information you are making a legal declaration that
      the information is true and complete. A false declaration can result in prosecution.
    </label>
  </div>
</div>

<button type="submit" class="btn" id="submitBtn">Submit VAT Return</button>
```

### 6.2 JavaScript Updates

```javascript
// Auto-calculation
function recalculate() {
  const box1 = parseFloat(document.getElementById('vatDueSales').value) || 0;
  const box2 = parseFloat(document.getElementById('vatDueAcquisitions').value) || 0;
  const box4 = parseFloat(document.getElementById('vatReclaimedCurrPeriod').value) || 0;

  const box3 = box1 + box2;
  const box5 = Math.abs(box3 - box4);

  document.getElementById('totalVatDue').value = box3.toFixed(2);
  document.getElementById('netVatDue').value = box5.toFixed(2);
}

['vatDueSales', 'vatDueAcquisitions', 'vatReclaimedCurrPeriod'].forEach(id => {
  document.getElementById(id).addEventListener('input', recalculate);
});

// Obligation loading
async function loadObligations() {
  const vrn = document.getElementById('vatNumber').value;
  if (!vrn || !/^\d{9}$/.test(vrn)) {
    showStatus('Enter a valid VRN first', 'error');
    return;
  }

  // ... OAuth check and fetch ...

  const data = await response.json();
  const select = document.getElementById('obligationSelect');
  select.innerHTML = '<option value="">-- Select period --</option>';

  // Use formattedObligations which hide period keys
  data.formattedObligations
    .filter(ob => ob.status === 'O') // Only open obligations
    .forEach(ob => {
      const option = document.createElement('option');
      option.value = ob._periodKey; // Hidden from display
      option.textContent = `${ob.displayName} (due ${ob.dueDateFormatted})`;
      select.appendChild(option);
    });
}

// Update hidden periodKey when selection changes
document.getElementById('obligationSelect').addEventListener('change', (e) => {
  document.getElementById('periodKey').value = e.target.value;
});

// Form submission validation
function handleFormSubmission(event) {
  event.preventDefault();

  // Check declaration
  if (!document.getElementById('declarationCheckbox').checked) {
    showStatus('You must confirm the declaration before submitting.', 'error');
    return;
  }

  // Collect all 9-box data
  const formData = new FormData(event.target);
  submissionData = {
    vatNumber: formData.get('vatNumber'),
    periodKey: formData.get('periodKey'),
    vatDueSales: parseFloat(formData.get('vatDueSales')),
    vatDueAcquisitions: parseFloat(formData.get('vatDueAcquisitions')),
    vatReclaimedCurrPeriod: parseFloat(formData.get('vatReclaimedCurrPeriod')),
    totalValueSalesExVAT: parseInt(formData.get('totalValueSalesExVAT')),
    totalValuePurchasesExVAT: parseInt(formData.get('totalValuePurchasesExVAT')),
    totalValueGoodsSuppliedExVAT: parseInt(formData.get('totalValueGoodsSuppliedExVAT')),
    totalAcquisitionsExVAT: parseInt(formData.get('totalAcquisitionsExVAT')),
  };

  // Continue with OAuth flow...
}
```

---

## Component 7: Frontend - View VAT Return

**Modify**: `web/public/hmrc/vat/viewVatReturn.html`

### 7.1 Update Period Selection

Replace manual period key input with obligation-based selection (similar to submit form), or accept navigation from obligations page with period key pre-filled (hidden from user).

### 7.2 Display Already Correct

The current `displayReturn` function already shows all 9 boxes - no changes needed to the display logic.

---

## Component 8: Frontend - VAT Obligations Page

**Modify**: `web/public/hmrc/vat/vatObligations.html`

### 8.1 Update Table Display

Remove period key column, show date ranges instead:

```javascript
function displayObligations(data) {
  // Use formattedObligations from API
  const obligations = data.formattedObligations || [];

  const tableHtml = `
    <table>
      <thead>
        <tr>
          <th>Period</th>
          <th>Due Date</th>
          <th>Status</th>
          <th>Received</th>
          <th>Action</th>
        </tr>
      </thead>
      <tbody>
        ${obligations.map(ob => `
          <tr>
            <td>${ob.displayName}</td>
            <td>${ob.dueDateFormatted || '-'}</td>
            <td class="status-${ob.status.toLowerCase()}">${ob.statusDisplay}</td>
            <td>${ob.receivedDate || '-'}</td>
            <td>
              ${ob.status === 'O'
                ? `<a href="submitVat.html?vrn=${vrn}&periodKey=${ob._periodKey}">Submit</a>`
                : `<a href="viewVatReturn.html?vrn=${vrn}&periodKey=${ob._periodKey}">View</a>`
              }
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}
```

Note: The `periodKey` is passed in URL params but users only see the date range in the UI.

---

## Component 9: Behaviour Tests Update

**Modify**: `behaviour-tests/steps/behaviour-hmrc-vat-steps.js`

### 9.1 Update Form Filling Steps

```javascript
When('I fill in the VAT return form with test data', async function() {
  // VRN
  await this.page.fill('#vatNumber', this.testData.vrn);

  // Load obligations and select first open period
  await this.page.click('#loadObligationsBtn');
  await this.page.waitForSelector('#obligationSelect option:not([value=""])');
  await this.page.selectOption('#obligationSelect', { index: 1 });

  // 9-box data
  await this.page.fill('#vatDueSales', '1000.00');
  await this.page.fill('#vatDueAcquisitions', '0.00');
  await this.page.fill('#vatReclaimedCurrPeriod', '200.00');
  await this.page.fill('#totalValueSalesExVAT', '5000');
  await this.page.fill('#totalValuePurchasesExVAT', '1000');
  await this.page.fill('#totalValueGoodsSuppliedExVAT', '0');
  await this.page.fill('#totalAcquisitionsExVAT', '0');

  // Verify auto-calculated fields
  const box3 = await this.page.inputValue('#totalVatDue');
  expect(box3).toBe('1000.00');
  const box5 = await this.page.inputValue('#netVatDue');
  expect(box5).toBe('800.00');

  // Declaration (MANDATORY)
  await this.page.check('#declarationCheckbox');
});

Then('I should see the submission receipt', async function() {
  await this.page.waitForSelector('#receiptDisplay');
  const formBundle = await this.page.textContent('#formBundleNumber');
  expect(formBundle).toBeTruthy();
});
```

---

## Component 10: Test Data Generator

**Modify**: `web/public/lib/test-data-generator.js`

```javascript
populateSubmitVatForm() {
  // VRN
  this.setInputValue('vatNumber', '176540158');

  // Generate realistic 9-box test data
  const salesVat = this.randomBetween(500, 5000);
  const purchaseVat = this.randomBetween(100, salesVat * 0.4);
  const salesValue = this.randomBetween(2500, 25000);
  const purchaseValue = this.randomBetween(1000, salesValue * 0.5);

  this.setInputValue('vatDueSales', salesVat.toFixed(2));
  this.setInputValue('vatDueAcquisitions', '0.00');
  this.setInputValue('vatReclaimedCurrPeriod', purchaseVat.toFixed(2));
  this.setInputValue('totalValueSalesExVAT', Math.round(salesValue).toString());
  this.setInputValue('totalValuePurchasesExVAT', Math.round(purchaseValue).toString());
  this.setInputValue('totalValueGoodsSuppliedExVAT', '0');
  this.setInputValue('totalAcquisitionsExVAT', '0');

  // Trigger recalculation
  document.getElementById('vatDueSales').dispatchEvent(new Event('input'));

  // Check declaration
  document.getElementById('declarationCheckbox').checked = true;
}

randomBetween(min, max) {
  return Math.random() * (max - min) + min;
}
```

---

## Component 11: CSS Updates (Including WCAG Link Fix)

**Modify**: `web/public/submit.css`

### 11.1 Fix link-in-text-block Accessibility Violation

axe-core reports 9 instances of links not distinguished from surrounding text. Links in text blocks must have a non-color distinction (underline).

```css
/* WCAG 2.1 AA: Links in text blocks must be distinguishable by more than color */
/* Fix for axe-core "link-in-text-block" violation */
p a, li a, td a, .help-text a, .footer-content a, article a {
  text-decoration: underline;
}

/* Remove underline only for clearly navigational links (menus, buttons) */
nav a, .menu-dropdown a, .btn, button {
  text-decoration: none;
}

/* Ensure focus states are visible */
a:focus {
  outline: 2px solid #005fcc;
  outline-offset: 2px;
}
```

### 11.2 Form Section Styles

```css
/* Form sections */
.form-section {
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 20px;
  background: #fafafa;
}

.form-section legend {
  font-weight: bold;
  padding: 0 10px;
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}

@media (max-width: 768px) {
  .form-row {
    grid-template-columns: 1fr;
  }
}

/* Calculated fields */
.form-group.calculated input {
  background-color: #e9ecef;
  cursor: not-allowed;
}

.form-group.calculated.highlight input {
  background-color: #d4edda;
  font-weight: bold;
  font-size: 1.1em;
}

/* Declaration */
.declaration-section {
  margin: 30px 0;
  padding: 20px;
  border: 2px solid #ffc107;
  border-radius: 8px;
  background: #fff3cd;
}

.declaration-box {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.declaration-box input[type="checkbox"] {
  margin-top: 4px;
  width: 20px;
  height: 20px;
  flex-shrink: 0;
}

.declaration-box label {
  font-weight: normal;
  line-height: 1.6;
}
```

---

## Component 12: HTML Structure Fixes (WCAG Landmarks & Headings)

**Modify**: All HTML pages in `web/public/`

### 12.1 Add Main Landmark to All Pages

axe-core reports "landmark-one-main" violation. All pages must have a `<main>` element.

**Current structure** (typical page):
```html
<body>
  <header>...</header>
  <div id="mainContent">...</div>
  <footer>...</footer>
</body>
```

**Updated structure**:
```html
<body>
  <header>...</header>
  <main id="mainContent">...</main>  <!-- Change div to main -->
  <footer>...</footer>
</body>
```

### 12.2 Ensure H1 Heading on All Pages

axe-core reports "page-has-heading-one" violation. All pages must have an `<h1>` element.

**Pages to check**:
- Verify all pages have `<h1>` (most have `<h1>DIY Accounting Submit</h1>` in header)
- Error pages may be missing h1

### 12.3 Fix Document Titles

axe-core reports "document-title" violation on 2 pages. All pages must have non-empty, descriptive `<title>`.

**Files to update** (verify all have unique, descriptive titles):

| File | Current Title | Recommended Title |
|------|---------------|-------------------|
| `index.html` | DIY Accounting Submit | DIY Accounting Submit - Home |
| `submitVat.html` | DIY Accounting Submit | Submit VAT Return - DIY Accounting |
| `vatObligations.html` | ? | VAT Obligations - DIY Accounting |
| `viewVatReturn.html` | ? | View VAT Return - DIY Accounting |
| `receipts.html` | ? | VAT Receipts - DIY Accounting |
| Error pages | ? | Error - DIY Accounting |

### 12.4 Unit Test for HTML Structure

**New file**: `web/browser-tests/html-structure.test.js`

```javascript
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { JSDOM } from 'jsdom';

const HTML_DIR = 'web/public';

describe('HTML Structure (WCAG)', () => {
  const htmlFiles = findHtmlFiles(HTML_DIR);

  htmlFiles.forEach(file => {
    describe(file, () => {
      let dom;
      beforeAll(() => {
        const html = readFileSync(file, 'utf-8');
        dom = new JSDOM(html);
      });

      it('has a non-empty <title> element', () => {
        const title = dom.window.document.querySelector('title');
        expect(title).not.toBeNull();
        expect(title.textContent.trim()).not.toBe('');
      });

      it('has a <main> landmark', () => {
        const main = dom.window.document.querySelector('main');
        expect(main).not.toBeNull();
      });

      it('has an <h1> heading', () => {
        const h1 = dom.window.document.querySelector('h1');
        expect(h1).not.toBeNull();
      });
    });
  });
});

function findHtmlFiles(dir) {
  // Recursively find all .html files
  const files = [];
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...findHtmlFiles(fullPath));
    } else if (entry.name.endsWith('.html')) {
      files.push(fullPath);
    }
  }
  return files;
}
```

---

## Component 13: Security Headers (CloudFront Response Headers Policy)

**Modify**: CDK infrastructure to add security headers via CloudFront

### 13.1 Create Response Headers Policy

**Modify**: `cdk/lib/stacks/CloudFrontStack.java` (or equivalent)

```java
// Create Response Headers Policy for security headers
ResponseHeadersPolicy securityHeadersPolicy = ResponseHeadersPolicy.Builder.create(this, "SecurityHeadersPolicy")
    .responseHeadersPolicyName(envName + "-submit-security-headers")
    .securityHeadersBehavior(ResponseSecurityHeadersBehavior.builder()
        // Content-Security-Policy
        .contentSecurityPolicy(ResponseHeadersContentSecurityPolicy.builder()
            .contentSecurityPolicy(
                "default-src 'self'; " +
                "script-src 'self' 'unsafe-inline'; " +  // Needed for inline scripts
                "style-src 'self' 'unsafe-inline'; " +
                "img-src 'self' data: https:; " +
                "font-src 'self'; " +
                "connect-src 'self' https://*.amazonaws.com https://*.hmrc.gov.uk; " +
                "frame-ancestors 'none'; " +
                "form-action 'self'"
            )
            .override(true)
            .build())
        // Strict-Transport-Security
        .strictTransportSecurity(ResponseHeadersStrictTransportSecurity.builder()
            .accessControlMaxAge(Duration.days(365))
            .includeSubdomains(true)
            .preload(true)
            .override(true)
            .build())
        // X-Content-Type-Options
        .contentTypeOptions(ResponseHeadersContentTypeOptions.builder()
            .override(true)
            .build())
        // X-Frame-Options
        .frameOptions(ResponseHeadersFrameOptions.builder()
            .frameOption(HeadersFrameOption.DENY)
            .override(true)
            .build())
        // Referrer-Policy
        .referrerPolicy(ResponseHeadersReferrerPolicy.builder()
            .referrerPolicy(HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN)
            .override(true)
            .build())
        .build())
    // Custom headers for Permissions-Policy
    .customHeadersBehavior(ResponseCustomHeadersBehavior.builder()
        .customHeaders(List.of(
            ResponseCustomHeader.builder()
                .header("Permissions-Policy")
                .value("camera=(), microphone=(), geolocation=()")
                .override(true)
                .build()
        ))
        .build())
    .build();

// Apply to distribution
Distribution.Builder.create(this, "Distribution")
    .defaultBehavior(BehaviorOptions.builder()
        .origin(origin)
        .responseHeadersPolicy(securityHeadersPolicy)
        // ... other config
        .build())
    .build();
```

### 13.2 Alternative: Lambda@Edge for Headers

If CloudFront Response Headers Policy isn't available, use Lambda@Edge:

**New file**: `app/functions/edge/securityHeaders.js`

```javascript
// Lambda@Edge for adding security headers
export const handler = async (event) => {
  const response = event.Records[0].cf.response;
  const headers = response.headers;

  // Content-Security-Policy
  headers['content-security-policy'] = [{
    key: 'Content-Security-Policy',
    value: "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https://*.amazonaws.com https://*.hmrc.gov.uk; frame-ancestors 'none';"
  }];

  // Strict-Transport-Security
  headers['strict-transport-security'] = [{
    key: 'Strict-Transport-Security',
    value: 'max-age=31536000; includeSubdomains; preload'
  }];

  // Permissions-Policy
  headers['permissions-policy'] = [{
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=()'
  }];

  // X-Content-Type-Options
  headers['x-content-type-options'] = [{
    key: 'X-Content-Type-Options',
    value: 'nosniff'
  }];

  // X-Frame-Options
  headers['x-frame-options'] = [{
    key: 'X-Frame-Options',
    value: 'DENY'
  }];

  // Referrer-Policy
  headers['referrer-policy'] = [{
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin'
  }];

  return response;
};
```

### 13.3 Test Security Headers

```bash
# After deployment, verify headers
curl -I https://submit.diyaccounting.co.uk/ | grep -E "(content-security-policy|strict-transport-security|permissions-policy)"
```

---

## Component 14: Subresource Integrity (SRI) for External Resources

If the application loads any external scripts or stylesheets, add SRI attributes.

### 14.1 Audit External Resources

Check all HTML files for external `<script>` and `<link>` tags:

```bash
grep -rn 'src="https://' web/public/*.html
grep -rn 'href="https://' web/public/*.html
```

### 14.2 Add SRI Attributes

For any external resources found, add integrity and crossorigin attributes:

```html
<!-- Example with SRI -->
<script src="https://cdn.example.com/library.js"
        integrity="sha384-abc123..."
        crossorigin="anonymous"></script>
```

> Note: ZAP flagged ngrok assets during testing. These are ngrok's tunnel page resources, not our application resources. In production (CloudFront), this won't be present.

---

## Implementation Order (Inside-Out)

### Phase 1: Data Layer (Components 1-4)

| Step | Component | Files | Test Command |
|------|-----------|-------|--------------|
| 1 | VAT Types Library | `app/lib/vatReturnTypes.js` | `npm run test:unit -- vatReturnTypes` |
| 2 | VAT Types Tests | `app/unit-tests/lib/vatReturnTypes.test.js` | `npm run test:unit -- vatReturnTypes` |
| 3 | HMRC Validation Update | `app/lib/hmrcValidation.js` | `npm run test:unit -- hmrcValidation` |
| 4 | Obligation Formatter | `app/lib/obligationFormatter.js` | `npm run test:unit -- obligationFormatter` |

### Phase 2: Backend API (Components 5-7)

| Step | Component | Files | Test Command |
|------|-----------|-------|--------------|
| 5 | Backend POST Handler | `app/functions/hmrc/hmrcVatReturnPost.js` | `npm run test:unit -- hmrcVatReturnPost` |
| 6 | Backend POST Tests | `app/unit-tests/functions/hmrcVatReturnPost.test.js` | `npm run test:unit -- hmrcVatReturnPost` |
| 7 | Obligations API Update | `app/functions/hmrc/hmrcVatObligationGet.js` | `npm run test:unit -- hmrcVatObligationGet` |

### Phase 3: Frontend (Components 8-11)

| Step | Component | Files | Test Command |
|------|-----------|-------|--------------|
| 8 | CSS Styles + Link Fix | `web/public/submit.css` | `npm run test:accessibility` |
| 9 | Submit Form UI | `web/public/hmrc/vat/submitVat.html` | Browser test |
| 10 | Obligations UI | `web/public/hmrc/vat/vatObligations.html` | Browser test |
| 11 | View Return UI | `web/public/hmrc/vat/viewVatReturn.html` | Browser test |

### Phase 4: WCAG Structure Fixes (Component 12)

| Step | Component | Files | Test Command |
|------|-----------|-------|--------------|
| 12 | HTML Structure (main, h1, title) | All `web/public/**/*.html` | `npm run test:browser -- html-structure` |

### Phase 5: Infrastructure Security (Components 13-14)

| Step | Component | Files | Test Command |
|------|-----------|-------|--------------|
| 13 | Security Headers | `cdk/lib/stacks/*.java` | `curl -I` after deploy |
| 14 | SRI Attributes | `web/public/**/*.html` | Manual audit |

### Phase 6: Testing & Validation (Component 15)

| Step | Component | Files | Test Command |
|------|-----------|-------|--------------|
| 15 | Test Data Generator | `web/public/lib/test-data-generator.js` | Manual test |
| 16 | Behaviour Tests | `behaviour-tests/steps/*.js` | `npm run test:submitVatBehaviour-proxy` |
| 17 | Re-run Compliance Scans | N/A | `npm run test:accessibility && npm run test:security` |

---

## Files Summary

### Application Code

| File | Action | Component |
|------|--------|-----------|
| `app/lib/vatReturnTypes.js` | **CREATE** | 1 |
| `app/unit-tests/lib/vatReturnTypes.test.js` | **CREATE** | 2 |
| `app/lib/hmrcValidation.js` | MODIFY | 3 |
| `app/unit-tests/lib/hmrcValidation.test.js` | MODIFY | 3 |
| `app/lib/obligationFormatter.js` | **CREATE** | 4 |
| `app/unit-tests/lib/obligationFormatter.test.js` | **CREATE** | 4 |
| `app/functions/hmrc/hmrcVatReturnPost.js` | MODIFY | 5 |
| `app/unit-tests/functions/hmrcVatReturnPost.test.js` | MODIFY | 6 |
| `app/functions/hmrc/hmrcVatObligationGet.js` | MODIFY | 7 |

### Frontend

| File | Action | Component |
|------|--------|-----------|
| `web/public/submit.css` | MODIFY | 11 (link-in-text-block fix) |
| `web/public/hmrc/vat/submitVat.html` | MODIFY | 6, 12 (form + structure) |
| `web/public/hmrc/vat/vatObligations.html` | MODIFY | 8, 12 |
| `web/public/hmrc/vat/viewVatReturn.html` | MODIFY | 7, 12 |
| `web/public/index.html` | MODIFY | 12 (structure fixes) |
| `web/public/**/*.html` | MODIFY | 12 (main landmark, h1, title) |
| `web/public/lib/test-data-generator.js` | MODIFY | 10 |

### Tests

| File | Action | Component |
|------|--------|-----------|
| `behaviour-tests/steps/behaviour-hmrc-vat-steps.js` | MODIFY | 9 |
| `web/browser-tests/html-structure.test.js` | **CREATE** | 12 |

### Infrastructure

| File | Action | Component |
|------|--------|-----------|
| `cdk/lib/stacks/CloudFrontStack.java` | MODIFY | 13 (security headers) |
| `app/functions/edge/securityHeaders.js` | **CREATE** (optional) | 13 |

---

## Success Criteria

### HMRC MTD Compliance

- [ ] Period key never visible to users in any UI (Q9)
- [ ] Legal declaration required before submission (Q10)
- [ ] All 9 VAT boxes can be entered
- [ ] Box 3 and Box 5 auto-calculated correctly
- [ ] Box 5 always non-negative (absolute value)
- [ ] Boxes 6-9 accept integers only (whole pounds)

### WCAG 2.1 AA Accessibility

- [ ] axe-core: 0 violations (currently 13)
- [ ] All pages have descriptive `<title>` elements (document-title)
- [ ] All pages have `<main>` landmark (landmark-one-main)
- [ ] All pages have `<h1>` heading (page-has-heading-one)
- [ ] Links in text blocks are underlined (link-in-text-block)
- [ ] Pa11y: All pages pass WCAG 2.1 AA (currently ✅)

### Security Headers (OWASP ZAP)

- [ ] Content-Security-Policy header configured
- [ ] Strict-Transport-Security header with max-age
- [ ] Permissions-Policy header set
- [ ] No high-severity ZAP findings (currently ✅)

### Test Suite

- [ ] All unit tests pass: `npm run test:unit`
- [ ] All browser tests pass: `npm run test:browser`
- [ ] Behaviour tests pass: `npm run test:submitVatBehaviour-proxy`
- [ ] CDK synth succeeds: `./mvnw clean verify`

### Compliance Report

- [ ] Re-run `npm run test:compliance` after all changes
- [ ] Update questionnaires to Version 2.0 with passing status
- [ ] All criteria in Questionnaire 1 answered "Yes" or "Supports"
- [ ] All criteria in Questionnaire 2 show "Supports"

---

## Sources

### HMRC MTD

- [HMRC VAT MTD End-to-End Service Guide](https://developer.service.hmrc.gov.uk/guides/vat-mtd-end-to-end-service-guide/)
- [Obligations and Returns](https://developer.service.hmrc.gov.uk/guides/vat-mtd-end-to-end-service-guide/documentation/obligations.html)
- [VAT Notice 700/22](https://www.gov.uk/government/publications/vat-notice-70022-making-tax-digital-for-vat)

### Accessibility

- [WCAG 2.1 Quick Reference](https://www.w3.org/WAI/WCAG21/quickref/)
- [axe-core Rules](https://dequeuniversity.com/rules/axe/)
- [MDN: ARIA Main Role](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Roles/main_role)

### Security

- [MDN: Content-Security-Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP)
- [MDN: Strict-Transport-Security](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Strict-Transport-Security)
- [MDN: Permissions-Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Permissions-Policy)
- [MDN: Subresource Integrity](https://developer.mozilla.org/en-US/docs/Web/Security/Subresource_Integrity)
- [OWASP Security Headers](https://owasp.org/www-project-secure-headers/)

### Internal

- `COMPLIANCE_REPORT.md` - Consolidated compliance scan results
- `_developers/hmrc/hmrc_questionnaire_1_software_developer_checklist_diy_accounting_limited_v1.md`
- `_developers/hmrc/hmrc_questionnaire_2_WCAG_2.1_AA_diy_accounting_limited_v1.md`
- `target/accessibility/axe-results.json` - axe-core detailed violations
- `target/penetration/zap-report.json` - OWASP ZAP scan results
- `target/penetration/eslint-security.txt` - ESLint security warnings

---

**End of Plan**
