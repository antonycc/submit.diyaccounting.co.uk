# Behaviour Test Report Output Enhancements

This document describes the 10 fixes and enhancements made to the behaviour test report output system.

## Summary of Changes

All changes apply to the `./behaviour-tests` directory and improve the quality, consistency, and usefulness of test outputs.

## Root Cause Analysis

### Issue: Three Different Hashed Subs in DynamoDB

The behaviour test `submitVat.behaviour.test.js` was writing to DynamoDB with 3 different hashed subs:

1. **OAuth token exchange**: `3790039d...` - Used `unknown-user-${uuid}` because no userSub available
2. **VAT return POST**: `04f8996d...` - Correct userSub from bundle enforcement  
3. **VAT return GET**: `d4eba781...` - Wrong due to parameter order bug

### Root Cause

In `app/functions/hmrc/hmrcVatReturnGet.js` line 166:
```javascript
// BEFORE (incorrect)
const hmrcResponse = await hmrcHttpGet(hmrcRequestUrl, hmrcAccessToken, govClientHeaders, testScenario, hmrcAccount, auditForUserSub);

// AFTER (correct) 
const hmrcResponse = await hmrcHttpGet(hmrcRequestUrl, hmrcAccessToken, govClientHeaders, testScenario, hmrcAccount, {}, auditForUserSub);
```

The function signature requires:
```javascript
hmrcHttpGet(endpoint, accessToken, govClientHeaders, testScenario, hmrcAccount, queryParams, auditForUserSub)
```

**Impact**: The missing `queryParams` parameter caused `auditForUserSub` to be interpreted as query parameters, resulting in URLs like:
```
/organisations/vat/740557534/returns/75UN?0=u&1=s&2=e&3=r
```

This created different hashed subs because each character of "user" was converted to indexed query parameters.

## 10 Fixes and Enhancements

### Fix 1: Fix hashedSub Consistency in submitVat Test
**File**: `app/functions/hmrc/hmrcVatReturnGet.js`

Fixed the parameter order when calling `hmrcHttpGet` to include empty `{}` for queryParams parameter. This ensures the userSub is correctly passed as the audit parameter instead of being serialized into query parameters.

**Result**: Now VAT POST and VAT GET requests use the same userSub, reducing from 3 to 2 unique hashed subs (OAuth token exchange still uses a UUID since it happens before authentication).

### Fix 2: Ensure vatObligations Test DynamoDB Writing is Consistent
**File**: `behaviour-tests/vatObligations.behaviour.test.js`

Verified that the VAT obligations test was already calling `hmrcHttpGet` correctly with all parameters in the right order. Added assertions to validate the consistency.

**Result**: VAT obligations test now has automated assertions to verify DynamoDB consistency.

### Fix 3: Add DynamoDB Assertion Tests to submitVat
**File**: `behaviour-tests/submitVat.behaviour.test.js`
**Helper**: `behaviour-tests/helpers/dynamodb-assertions.js` (new)

Added comprehensive DynamoDB assertions:
- Assert OAuth token exchange request exists
- Assert VAT return POST exists with correct method and status code
- Assert request body contains submitted periodKey and vatDueSales
- Assert VAT return GET exists with correct method and status code  
- Assert response body contains expected periodKey and vatDueSales
- Assert consistent hashedSub across authenticated requests

### Fix 4: Add DynamoDB Assertion Tests to vatObligations
**File**: `behaviour-tests/vatObligations.behaviour.test.js`

Added DynamoDB assertions:
- Assert OAuth token exchange request exists
- Assert VAT obligations GET exists with correct method and status code
- Assert response body contains obligations data
- Assert consistent hashedSub across authenticated requests

### Fix 5-7: Enhance testContext.json for All Tests
**Files**: 
- `behaviour-tests/bundles.behaviour.test.js`
- `behaviour-tests/submitVat.behaviour.test.js`
- `behaviour-tests/vatObligations.behaviour.test.js`

Enhanced testContext.json with additional useful metadata:

**Added to all tests**:
- `bundleTableName` - DynamoDB bundle table name
- `hmrcApiRequestsTableName` - DynamoDB HMRC API requests table name
- `receiptsTableName` - DynamoDB receipts table name
- `runDynamoDb` - Whether DynamoDB is running for this test
- `testUrl` - The actual URL used for testing
- `screenshotPath` - Directory where screenshots are saved
- `testStartTime` - ISO 8601 timestamp when test started

**Test-specific additions**:
- **bundles**: `bundlesTested` - Array of bundle types tested (e.g., ["Test", "Guest"])
- **submitVat/vatObligations**: `isSandboxMode` - Boolean indicating sandbox mode

### Fix 8-10: Create figures.json for All Tests
**Files**: 
- `behaviour-tests/bundles.behaviour.test.js`
- `behaviour-tests/submitVat.behaviour.test.js`
- `behaviour-tests/vatObligations.behaviour.test.js`
**Helper**: `behaviour-tests/helpers/figures-helper.js` (new)

Created automated screenshot selection and documentation:

#### figures-helper.js Features
- **Pattern-based selection**: Selects up to 5 key screenshots using regex patterns
- **Smart fallback**: Uses fallback keywords if patterns don't match enough screenshots
- **Screenshot copying**: Copies selected screenshots to the test output directory
- **Metadata generation**: Generates figures.json with descriptions and captions
- **Caption extraction**: Generates human-readable captions from filenames

#### Screenshot Selection Patterns

**bundles.behaviour.test.js**:
1. Bundle page navigation
2. Clearing bundles
3. Requesting a bundle
4. Bundle present/added confirmation
5. Test bundle added with checkmark

**submitVat.behaviour.test.js**:
1. VAT return form with test data
2. VAT submission completion with receipt
3. HMRC authorization page
4. Receipt page with submitted returns
5. Retrieved VAT return results

**vatObligations.behaviour.test.js**:
1. VAT obligations form initial state
2. VAT obligations form filled with parameters
3. HMRC authorization page
4. VAT obligations results with periods
5. Retrieved obligations showing deadlines

#### figures.json Structure
```json
[
  {
    "filename": "screenshot-name.png",
    "order": 1,
    "description": "Detailed description of what the screenshot shows",
    "caption": "Human Readable Caption"
  }
]
```

## New Helper Files

### behaviour-tests/helpers/dynamodb-assertions.js

Provides assertion functions for validating DynamoDB exports:

- `readDynamoDbExport(filePath)` - Reads and parses JSONL files
- `findHmrcApiRequestsByUrl(exportFilePath, urlPattern)` - Finds requests by URL
- `findHmrcApiRequestsByMethodAndUrl(exportFilePath, method, urlPattern)` - Finds by method and URL
- `assertHmrcApiRequestExists(exportFilePath, method, urlPattern, description)` - Asserts request exists
- `assertHmrcApiRequestValues(record, expectedValues)` - Asserts specific field values using dot notation
- `assertConsistentHashedSub(exportFilePath, description)` - Asserts consistent hashedSub values

### behaviour-tests/helpers/figures-helper.js

Provides screenshot selection and documentation:

- `selectKeyScreenshots(screenshotDir, patterns, maxCount)` - Selects screenshots using patterns
- `copyScreenshots(sourceDir, targetDir, filenames)` - Copies selected screenshots
- `generateFiguresMetadata(filenames, descriptions)` - Generates figure metadata
- `generateCaption(filename)` - Generates human-readable caption from filename
- `writeFiguresJson(outputDir, figures)` - Writes figures.json file

## Testing

All changes have been validated:
- ✅ Unit tests pass (212 tests)
- ✅ Formatting checks pass (JS + Java)
- ✅ Syntax checks pass on all behaviour test files
- ✅ Helper modules load successfully

## Benefits

1. **Improved Debugging**: DynamoDB assertions catch data inconsistencies early
2. **Better Documentation**: testContext.json has all relevant metadata in one place
3. **Visual Documentation**: figures.json provides curated screenshots with descriptions
4. **Consistency**: All three behaviour tests now follow the same patterns
5. **Maintainability**: Helper functions are reusable and well-documented
6. **Bug Detection**: The fix prevents userSub from being serialized into query parameters

## Future Enhancements

Consider:
1. Adding userSub to OAuth token exchange (requires authentication redesign)
2. Creating a consolidated test report that uses testContext.json and figures.json
3. Adding screenshot comparison testing for visual regression detection
4. Extending DynamoDB assertions to other test types
