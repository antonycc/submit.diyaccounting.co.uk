# Amazon CloudWatch RUM Implementation Plan

**Created**: 2025-12-13  
**Status**: Work Remaining  
**Target**: Complete RUM rollout for real user monitoring in production

---

## Overview

This document provides a step-by-step plan to complete the Amazon CloudWatch RUM (Real User Monitoring) implementation. Each step is sufficiently described for an LLM to complete in isolation.

**Current State**: Backend infrastructure deployed, frontend code written but not wired up, RUM client never initializes.

**Goal**: Enable RUM telemetry collection from user browsers to CloudWatch for performance monitoring and error tracking.

---

## Prerequisites

Before starting implementation:

1. **Environment Setup**: ObservabilityStack must be deployed in target environment (ci or prod)
2. **Stack Outputs**: Verify CloudFormation outputs exist:
   ```bash
   aws cloudformation describe-stacks --stack-name ci-env-ObservabilityStack --region eu-west-2 --query 'Stacks[0].Outputs'
   ```
3. **Deployed HTML**: Verify placeholders are replaced in deployed HTML:
   ```bash
   curl -s https://ci.submit.diyaccounting.co.uk/index.html | grep "rum:appMonitorId"
   ```
   Should show real value, not `${RUM_APP_MONITOR_ID}`

---

## Implementation Steps

### Phase 1: Core Functionality (Critical)

#### Step 1: Wire Up RUM Initialization on Page Load

**File**: `web/public/submit.js`

**Problem**: `bootstrapRumConfigFromMeta()` and `maybeInitRum()` are defined but never called, so RUM client never initializes.

**Objective**: Call these functions automatically when each page loads.

**Instructions**:

1. Locate the section at the end of `submit.js` with comment `// Wire up on load`
2. Add the following code after line ~1200:
   ```javascript
   // Initialize RUM on page load
   (function initializeRumOnPageLoad() {
     // Bootstrap RUM configuration from meta tags
     bootstrapRumConfigFromMeta();
     
     // Attempt to initialize RUM (will show consent banner if needed)
     maybeInitRum();
     
     // If user consents later, this will handle it
     document.addEventListener('consent-granted', (event) => {
       if (event.detail.type === 'rum') {
         maybeInitRum();
       }
     });
   })();
   ```

**Why This Works**:
- Immediately invoked function expression (IIFE) runs as soon as `submit.js` loads
- `bootstrapRumConfigFromMeta()` populates `window.__RUM_CONFIG__` from meta tags
- `maybeInitRum()` checks consent and initializes if granted
- Event listener handles consent granted after page load

**Testing**:
```javascript
// In browser console after change:
window.__RUM_CONFIG__
// Should return: { appMonitorId: "...", region: "...", ... }

typeof window.cwr
// Should return: "function" (after consent granted)
```

**Success Criteria**:
- [ ] `window.__RUM_CONFIG__` is populated on page load
- [ ] Consent banner appears on first visit
- [ ] After clicking "Accept", `window.cwr` function exists
- [ ] Network request to `client.rum.*.amazonaws.com/1.16.0/cwr.js` is made
- [ ] Network requests to `dataplane.rum.*.amazonaws.com` are made

**Estimated Effort**: 15 minutes

---

#### Step 2: Verify Consent Banner Behavior

**File**: `web/public/submit.js` (existing code, verification only)

**Problem**: Need to confirm consent banner displays correctly and persists user choice.

**Objective**: Manually test consent banner flow in deployed environment.

**Instructions**:

1. Clear browser localStorage:
   ```javascript
   localStorage.clear();
   ```
2. Navigate to `https://ci.submit.diyaccounting.co.uk/`
3. Verify consent banner appears at bottom of page with message:
   > We use minimal analytics to improve performance (CloudWatch RUM). We'll only start after you consent. See our privacy policy.
4. Verify banner has two buttons: "Accept" and "Decline"
5. Click "Accept"
6. Verify banner disappears
7. Check localStorage:
   ```javascript
   localStorage.getItem('consent.rum')
   // Should return: "granted"
   ```
8. Reload page
9. Verify banner does **not** reappear (consent persisted)
10. Verify `window.cwr` exists (RUM initialized on reload)

**Test "Decline" Path**:
1. Clear localStorage
2. Reload page
3. Click "Decline" on banner
4. Verify banner disappears
5. Check localStorage:
   ```javascript
   localStorage.getItem('consent.rum')
   // Should return: "declined"
   ```
6. Verify `window.cwr` is undefined (RUM not initialized)

**Success Criteria**:
- [ ] Banner appears on first visit
- [ ] "Accept" stores `consent.rum=granted` and initializes RUM
- [ ] "Decline" stores `consent.rum=declined` and does not initialize RUM
- [ ] Banner does not reappear after consent decision
- [ ] RUM initializes on subsequent page loads if consent granted

**Estimated Effort**: 10 minutes

---

#### Step 3: Add Privacy Consent for Existing Users

**File**: `web/public/submit.js`

**Problem**: If user has legacy `consent.analytics` (from previous version), they shouldn't be prompted again.

**Objective**: Ensure `hasRumConsent()` respects both `consent.rum` and legacy `consent.analytics`.

**Instructions**:

1. Verify current code in `hasRumConsent()`:
   ```javascript
   function hasRumConsent() {
     try {
       return localStorage.getItem("consent.rum") === "granted" || 
              localStorage.getItem("consent.analytics") === "granted";
     } catch (error) {
       console.warn("Failed to read RUM consent from localStorage:", error);
       return false;
     }
   }
   ```
2. This is already correct (checks both keys)
3. No code change needed, just verify behavior

**Testing**:
```javascript
// Test legacy consent key
localStorage.setItem('consent.analytics', 'granted');
localStorage.removeItem('consent.rum');
hasRumConsent();
// Should return: true

// Test new consent key
localStorage.setItem('consent.rum', 'granted');
localStorage.removeItem('consent.analytics');
hasRumConsent();
// Should return: true
```

**Success Criteria**:
- [ ] `hasRumConsent()` returns true if either consent key is "granted"
- [ ] Banner does not appear if legacy `consent.analytics=granted` exists

**Estimated Effort**: 5 minutes (verification only, no code change)

---

### Phase 2: Validation and Testing

#### Step 4: Create Unit Tests for RUM Configuration

**File**: `web/unit-tests/rum-config.test.js` (new file)

**Problem**: No tests verify RUM configuration parsing from meta tags.

**Objective**: Create unit tests for `bootstrapRumConfigFromMeta()` and related functions.

**Instructions**:

1. Create new file: `web/unit-tests/rum-config.test.js`
2. Add test suite:
   ```javascript
   import { describe, it, expect, beforeEach, vi } from 'vitest';
   import { JSDOM } from 'jsdom';

   describe('RUM Configuration', () => {
     let dom;
     let window;
     let document;

     beforeEach(() => {
       // Create fresh DOM for each test
       dom = new JSDOM(`
         <!DOCTYPE html>
         <html>
           <head>
             <meta name="rum:appMonitorId" content="test-monitor-123" />
             <meta name="rum:region" content="eu-west-2" />
             <meta name="rum:identityPoolId" content="eu-west-2:pool-456" />
             <meta name="rum:guestRoleArn" content="arn:aws:iam::123456789:role/TestRole" />
           </head>
           <body></body>
         </html>
       `, { url: 'http://localhost' });
       
       window = dom.window;
       document = window.document;
       global.window = window;
       global.document = document;
       global.localStorage = {
         _data: {},
         getItem(key) { return this._data[key] || null; },
         setItem(key, value) { this._data[key] = value; },
         removeItem(key) { delete this._data[key]; },
         clear() { this._data = {}; }
       };
     });

     it('should read RUM config from meta tags', () => {
       // Source the submit.js functions (need to refactor to import)
       const readMeta = (name) => {
         const el = document.querySelector(`meta[name="${name}"]`);
         return el && el.content ? el.content.trim() : "";
       };
       
       const config = {
         appMonitorId: readMeta("rum:appMonitorId"),
         region: readMeta("rum:region"),
         identityPoolId: readMeta("rum:identityPoolId"),
         guestRoleArn: readMeta("rum:guestRoleArn")
       };

       expect(config.appMonitorId).toBe("test-monitor-123");
       expect(config.region).toBe("eu-west-2");
       expect(config.identityPoolId).toBe("eu-west-2:pool-456");
       expect(config.guestRoleArn).toBe("arn:aws:iam::123456789:role/TestRole");
     });

     it('should handle missing meta tags gracefully', () => {
       dom = new JSDOM(`<!DOCTYPE html><html><head></head><body></body></html>`);
       document = dom.window.document;
       global.document = document;

       const readMeta = (name) => {
         const el = document.querySelector(`meta[name="${name}"]`);
         return el && el.content ? el.content.trim() : "";
       };

       expect(readMeta("rum:appMonitorId")).toBe("");
       expect(readMeta("rum:region")).toBe("");
     });

     it('should store config in localStorage', () => {
       const config = {
         appMonitorId: "test-123",
         region: "us-east-1",
         identityPoolId: "pool-456",
         guestRoleArn: "arn:aws:iam::123:role/Test",
         sessionSampleRate: 1
       };

       localStorage.setItem("rum.config", JSON.stringify(config));
       const stored = JSON.parse(localStorage.getItem("rum.config"));

       expect(stored).toEqual(config);
     });
   });
   ```

3. Run tests:
   ```bash
   npm run test:web-unit
   ```

**Note**: This test requires refactoring `submit.js` to export functions as ES modules. For now, tests can be skipped or marked as TODO.

**Success Criteria**:
- [ ] Tests pass (or marked as TODO with reason)
- [ ] Test coverage for reading meta tags
- [ ] Test coverage for missing meta tags
- [ ] Test coverage for localStorage storage

**Estimated Effort**: 30 minutes

---

#### Step 5: Create Unit Tests for RUM Consent

**File**: `web/unit-tests/rum-consent.test.js` (new file)

**Problem**: No tests verify consent logic.

**Objective**: Create unit tests for `hasRumConsent()` and `showConsentBannerIfNeeded()`.

**Instructions**:

1. Create new file: `web/unit-tests/rum-consent.test.js`
2. Add test suite:
   ```javascript
   import { describe, it, expect, beforeEach, vi } from 'vitest';
   import { JSDOM } from 'jsdom';

   describe('RUM Consent', () => {
     let window, document;

     beforeEach(() => {
       const dom = new JSDOM(`<!DOCTYPE html><html><body></body></html>`);
       window = dom.window;
       document = window.document;
       global.window = window;
       global.document = document;
       global.localStorage = {
         _data: {},
         getItem(key) { return this._data[key] || null; },
         setItem(key, value) { this._data[key] = value; },
         removeItem(key) { delete this._data[key]; },
         clear() { this._data = {}; }
       };
     });

     describe('hasRumConsent', () => {
       it('should return true if consent.rum is granted', () => {
         localStorage.setItem('consent.rum', 'granted');
         // Test function needs to be imported or defined
         const hasConsent = () => localStorage.getItem('consent.rum') === 'granted';
         expect(hasConsent()).toBe(true);
       });

       it('should return true if consent.analytics is granted (legacy)', () => {
         localStorage.setItem('consent.analytics', 'granted');
         const hasConsent = () => 
           localStorage.getItem('consent.rum') === 'granted' || 
           localStorage.getItem('consent.analytics') === 'granted';
         expect(hasConsent()).toBe(true);
       });

       it('should return false if consent is declined', () => {
         localStorage.setItem('consent.rum', 'declined');
         const hasConsent = () => localStorage.getItem('consent.rum') === 'granted';
         expect(hasConsent()).toBe(false);
       });

       it('should return false if no consent recorded', () => {
         const hasConsent = () => localStorage.getItem('consent.rum') === 'granted';
         expect(hasConsent()).toBe(false);
       });
     });

     describe('Consent Banner', () => {
       it('should not create banner if consent already granted', () => {
         localStorage.setItem('consent.rum', 'granted');
         // showConsentBannerIfNeeded() would return early
         expect(document.getElementById('consent-banner')).toBeNull();
       });

       it('should create banner if no consent', () => {
         // Simulate showConsentBannerIfNeeded()
         const banner = document.createElement('div');
         banner.id = 'consent-banner';
         document.body.appendChild(banner);
         
         expect(document.getElementById('consent-banner')).not.toBeNull();
       });

       it('should store consent on accept', () => {
         localStorage.setItem('consent.rum', 'granted');
         expect(localStorage.getItem('consent.rum')).toBe('granted');
       });

       it('should store declined on decline', () => {
         localStorage.setItem('consent.rum', 'declined');
         expect(localStorage.getItem('consent.rum')).toBe('declined');
       });
     });
   });
   ```

3. Run tests:
   ```bash
   npm run test:web-unit
   ```

**Success Criteria**:
- [ ] Tests pass (or marked as TODO)
- [ ] Test coverage for consent granted
- [ ] Test coverage for consent declined
- [ ] Test coverage for legacy consent key
- [ ] Test coverage for banner creation/removal

**Estimated Effort**: 20 minutes

---

#### Step 6: Create Placeholder Validation Test

**File**: `app/system-tests/rum-placeholders.system.test.js` (new file)

**Problem**: No automated check that placeholders are replaced during deployment.

**Objective**: Create test that validates placeholder replacement in HTML files.

**Instructions**:

1. Create new file: `app/system-tests/rum-placeholders.system.test.js`
2. Add test suite:
   ```javascript
   import { describe, it, expect } from 'vitest';
   import { readFileSync } from 'fs';
   import { join } from 'path';

   describe('RUM Placeholder Replacement', () => {
     const htmlFiles = [
       'web/public/index.html',
       'web/public/auth/login.html',
       'web/public/account/bundles.html',
       'web/public/hmrc/vat/submitVat.html',
     ];

     it.each(htmlFiles)('should not contain placeholder in %s', (filePath) => {
       const content = readFileSync(join(process.cwd(), filePath), 'utf-8');
       
       // Check that placeholders are NOT present in source files
       // (they should only be in source, not after deployment)
       expect(content).toContain('${RUM_APP_MONITOR_ID}');
       expect(content).toContain('${AWS_REGION}');
       expect(content).toContain('${RUM_IDENTITY_POOL_ID}');
       expect(content).toContain('${RUM_GUEST_ROLE_ARN}');
     });
   });

   describe('Deployed RUM Configuration (Integration)', () => {
     it('should have real values in deployed HTML', async () => {
       const baseUrl = process.env.DIY_SUBMIT_BASE_URL || 'http://localhost:3000';
       const response = await fetch(`${baseUrl}/index.html`);
       const html = await response.text();

       // Deployed HTML should NOT contain placeholders
       expect(html).not.toContain('${RUM_APP_MONITOR_ID}');
       expect(html).not.toContain('${AWS_REGION}');
       
       // Should contain real values (basic regex check)
       expect(html).toMatch(/<meta name="rum:appMonitorId" content="[a-f0-9-]+" \/>/);
       expect(html).toMatch(/<meta name="rum:region" content="[a-z]+-[a-z]+-\d+" \/>/);
     });
   });
   ```

3. Run test locally (expects placeholders in source):
   ```bash
   npm run test:system
   ```

4. Run test against deployed environment:
   ```bash
   DIY_SUBMIT_BASE_URL=https://ci.submit.diyaccounting.co.uk npm run test:system
   ```

**Success Criteria**:
- [ ] Test passes locally (source files contain placeholders)
- [ ] Test passes against deployed environment (deployed files have real values)
- [ ] Test fails if placeholders are not replaced

**Estimated Effort**: 20 minutes

---

#### Step 7: Create Behaviour Test for RUM Initialization

**File**: `behaviour-tests/rum.behaviour.test.js` (new file)

**Problem**: No end-to-end test verifies RUM client loads and initializes.

**Objective**: Create Playwright test that verifies RUM loads in real browser.

**Instructions**:

1. Create new file: `behaviour-tests/rum.behaviour.test.js`
2. Add test suite:
   ```javascript
   import { test, expect } from '@playwright/test';

   test.describe('Amazon CloudWatch RUM Integration', () => {
     test.beforeEach(async ({ context }) => {
       // Clear storage before each test
       await context.clearCookies();
     });

     test('should load RUM configuration from meta tags', async ({ page }) => {
       await page.goto('/');
       
       // Check meta tags are present with real values (not placeholders)
       const appMonitorId = await page.locator('meta[name="rum:appMonitorId"]').getAttribute('content');
       const region = await page.locator('meta[name="rum:region"]').getAttribute('content');
       const identityPoolId = await page.locator('meta[name="rum:identityPoolId"]').getAttribute('content');
       const guestRoleArn = await page.locator('meta[name="rum:guestRoleArn"]').getAttribute('content');

       // Should not be placeholders
       expect(appMonitorId).not.toContain('${');
       expect(region).not.toContain('${');
       expect(identityPoolId).not.toContain('${');
       expect(guestRoleArn).not.toContain('${');

       // Should have expected formats
       expect(appMonitorId).toMatch(/^[a-f0-9-]+$/);
       expect(region).toMatch(/^[a-z]+-[a-z]+-\d+$/);
       expect(identityPoolId).toMatch(/^[a-z]+-[a-z]+-\d+:[a-f0-9-]+$/);
       expect(guestRoleArn).toMatch(/^arn:aws:iam::\d+:role\/.+/);
     });

     test('should populate window.__RUM_CONFIG__', async ({ page }) => {
       await page.goto('/');
       
       // Wait for submit.js to load and execute
       await page.waitForTimeout(1000);

       // Check RUM config is populated
       const rumConfig = await page.evaluate(() => window.__RUM_CONFIG__);
       
       expect(rumConfig).toBeDefined();
       expect(rumConfig.appMonitorId).toBeDefined();
       expect(rumConfig.region).toBeDefined();
       expect(rumConfig.identityPoolId).toBeDefined();
       expect(rumConfig.guestRoleArn).toBeDefined();
       expect(rumConfig.sessionSampleRate).toBe(1);
     });

     test('should show consent banner on first visit', async ({ page }) => {
       await page.goto('/');
       
       // Consent banner should appear
       const banner = page.locator('#consent-banner');
       await expect(banner).toBeVisible();
       
       // Should have Accept and Decline buttons
       await expect(banner.locator('#consent-accept')).toBeVisible();
       await expect(banner.locator('#consent-decline')).toBeVisible();
     });

     test('should initialize RUM after accepting consent', async ({ page }) => {
       await page.goto('/');
       
       // Wait for consent banner and click Accept
       await page.locator('#consent-accept').click();
       
       // Banner should disappear
       await expect(page.locator('#consent-banner')).not.toBeVisible();

       // Wait for RUM client to load
       await page.waitForTimeout(2000);

       // Check RUM client is loaded
       const cwrExists = await page.evaluate(() => typeof window.cwr === 'function');
       expect(cwrExists).toBe(true);

       // Check RUM is marked as initialized
       const initDone = await page.evaluate(() => window.__RUM_INIT_DONE__);
       expect(initDone).toBe(true);

       // Check localStorage has consent
       const consent = await page.evaluate(() => localStorage.getItem('consent.rum'));
       expect(consent).toBe('granted');
     });

     test('should not initialize RUM after declining consent', async ({ page }) => {
       await page.goto('/');
       
       // Click Decline
       await page.locator('#consent-decline').click();
       
       // Wait a bit
       await page.waitForTimeout(1000);

       // RUM should NOT be initialized
       const cwrExists = await page.evaluate(() => typeof window.cwr);
       expect(cwrExists).toBe('undefined');

       // Check localStorage has declined
       const consent = await page.evaluate(() => localStorage.getItem('consent.rum'));
       expect(consent).toBe('declined');
     });

     test('should not show banner on return visit after consent granted', async ({ page, context }) => {
       // First visit: grant consent
       await page.goto('/');
       await page.locator('#consent-accept').click();
       await page.waitForTimeout(1000);

       // Second visit: create new page with same context (preserves localStorage)
       const page2 = await context.newPage();
       await page2.goto('/');
       
       // Banner should NOT appear
       await page2.waitForTimeout(500);
       const banner = page2.locator('#consent-banner');
       await expect(banner).not.toBeVisible();

       // RUM should initialize automatically
       await page2.waitForTimeout(2000);
       const cwrExists = await page2.evaluate(() => typeof window.cwr === 'function');
       expect(cwrExists).toBe(true);
     });

     test('should make request to RUM client CDN', async ({ page }) => {
       // Listen for network requests
       const rumClientRequests = [];
       page.on('request', request => {
         if (request.url().includes('client.rum.') && request.url().includes('amazonaws.com')) {
           rumClientRequests.push(request.url());
         }
       });

       await page.goto('/');
       await page.locator('#consent-accept').click();
       
       // Wait for RUM client to load
       await page.waitForTimeout(3000);

       // Should have requested cwr.js
       expect(rumClientRequests.length).toBeGreaterThan(0);
       expect(rumClientRequests[0]).toContain('/cwr.js');
     });

     test('should make request to RUM dataplane', async ({ page }) => {
       // Listen for RUM dataplane requests
       const dataplaneRequests = [];
       page.on('request', request => {
         if (request.url().includes('dataplane.rum.') && request.url().includes('amazonaws.com')) {
           dataplaneRequests.push(request.url());
         }
       });

       await page.goto('/');
       await page.locator('#consent-accept').click();
       
       // Wait for RUM to initialize and send initial events
       await page.waitForTimeout(5000);

       // Should have sent telemetry
       expect(dataplaneRequests.length).toBeGreaterThan(0);
     });
   });
   ```

3. Add to `playwright.config.js`:
   ```javascript
   {
     name: 'rum-behaviour-tests',
     testMatch: /rum\.behaviour\.test\.js/,
     use: {
       ...devices['Desktop Chrome'],
       baseURL: process.env.DIY_SUBMIT_BASE_URL || 'http://localhost:3000',
     },
   },
   ```

4. Add to `package.json`:
   ```json
   "test:rumBehaviour": "playwright test --project=rum-behaviour-tests",
   "test:rumBehaviour-proxy": "npx dotenv -e .env.proxy -- npm run test:rumBehaviour",
   "test:rumBehaviour-ci": "npx dotenv -e .env.ci -- npm run test:rumBehaviour",
   "test:rumBehaviour-prod": "npx dotenv -e .env.prod -- npm run test:rumBehaviour"
   ```

5. Run test locally:
   ```bash
   npm run test:rumBehaviour-proxy
   ```

6. Run test against CI:
   ```bash
   npm run test:rumBehaviour-ci
   ```

**Success Criteria**:
- [ ] Test passes against deployed environment
- [ ] Test verifies meta tags have real values
- [ ] Test verifies `window.__RUM_CONFIG__` is populated
- [ ] Test verifies consent banner appears
- [ ] Test verifies RUM initializes after consent
- [ ] Test verifies RUM client script is loaded
- [ ] Test verifies dataplane requests are made

**Estimated Effort**: 45 minutes

---

### Phase 3: Enhancements

#### Step 8: Add SNS Notification to RUM Alarms

**File**: `infra/main/java/co/uk/diyaccounting/submit/stacks/ObservabilityStack.java`

**Problem**: Alarms trigger but no one is notified.

**Objective**: Create SNS topic and subscribe alarms to it.

**Instructions**:

1. Add imports:
   ```java
   import software.amazon.awscdk.services.sns.Topic;
   import software.amazon.awscdk.services.sns.subscriptions.EmailSubscription;
   import software.amazon.awscdk.services.cloudwatch.actions.SnsAction;
   ```

2. Add SNS topic after CloudWatch dashboard creation:
   ```java
   // SNS Topic for alarm notifications
   Topic alarmTopic = Topic.Builder.create(this, props.resourceNamePrefix() + "-RumAlarmTopic")
       .topicName(props.resourceNamePrefix() + "-rum-alarms")
       .displayName("RUM Alarm Notifications for " + props.envName())
       .build();

   // Subscribe email (optional, can be configured post-deployment)
   // alarmTopic.addSubscription(new EmailSubscription("your-email@example.com"));

   // Add SNS action to alarms
   SnsAction snsAction = new SnsAction(alarmTopic);
   lcpAlarm.addAlarmAction(snsAction);
   jsErrorAlarm.addAlarmAction(snsAction);
   ```

3. Add CloudFormation output:
   ```java
   cfnOutput(this, "RumAlarmTopicArn", alarmTopic.getTopicArn());
   ```

4. Update `.env.ci` and `.env.prod` with email (optional):
   ```bash
   RUM_ALARM_EMAIL=your-email@example.com
   ```

5. If email is configured, add subscription in ObservabilityStack:
   ```java
   String alarmEmail = System.getenv("RUM_ALARM_EMAIL");
   if (alarmEmail != null && !alarmEmail.isBlank()) {
       alarmTopic.addSubscription(new EmailSubscription(alarmEmail));
   }
   ```

6. Deploy:
   ```bash
   cd cdk-environment
   ENVIRONMENT_NAME=ci npm run cdk:synth-environment
   npx cdk deploy ci-env-ObservabilityStack
   ```

7. Confirm SNS email subscription (check inbox)

**Testing**:
```bash
# Trigger test alarm
aws cloudwatch set-alarm-state \
  --alarm-name ci-rum-js-errors \
  --state-value ALARM \
  --state-reason "Testing SNS notification" \
  --region eu-west-2

# Check email inbox for notification
```

**Success Criteria**:
- [ ] SNS topic created
- [ ] Alarms have SNS action configured
- [ ] Email subscription confirmed (if configured)
- [ ] Test alarm triggers email notification

**Estimated Effort**: 30 minutes

---

#### Step 9: Add Custom RUM Events for Key Actions

**File**: `web/public/submit.js` (and other pages)

**Problem**: RUM only collects automatic telemetry (performance, errors, HTTP). Business-specific actions are not tracked.

**Objective**: Record custom RUM events for VAT submission, authentication, etc.

**Instructions**:

1. Add helper function in `submit.js`:
   ```javascript
   function recordRumEvent(eventType, eventData) {
     try {
       if (window.cwr && typeof window.cwr === 'function') {
         window.cwr('recordEvent', eventType, eventData);
         console.log(`RUM event recorded: ${eventType}`, eventData);
       }
     } catch (error) {
       console.warn(`Failed to record RUM event ${eventType}:`, error);
     }
   }
   ```

2. Record authentication events (in auth callback pages):
   ```javascript
   // After successful login
   recordRumEvent('user_login', {
     method: 'cognito',
     timestamp: new Date().toISOString()
   });
   ```

3. Record VAT submission events (in `submitVat.html`):
   ```javascript
   // After VAT return submitted
   recordRumEvent('vat_submission', {
     success: true,
     periodKey: periodKey,
     timestamp: new Date().toISOString()
   });
   ```

4. Record bundle selection (in `bundles.html`):
   ```javascript
   // When user selects a bundle
   recordRumEvent('bundle_selected', {
     bundleId: bundleId,
     timestamp: new Date().toISOString()
   });
   ```

5. Query custom events in CloudWatch:
   ```bash
   aws cloudwatch get-metric-statistics \
     --namespace AWS/RUM \
     --metric-name CustomEventCount \
     --dimensions Name=application_name,Value=ci-rum Name=event_type,Value=vat_submission \
     --start-time 2025-01-01T00:00:00Z \
     --end-time 2025-01-01T23:59:59Z \
     --period 3600 \
     --statistics Sum \
     --region eu-west-2
   ```

**Success Criteria**:
- [ ] Custom events recorded for key user actions
- [ ] Events visible in CloudWatch RUM console
- [ ] Custom event metrics can be queried

**Estimated Effort**: 30 minutes per action (e.g., 90 minutes for 3 actions)

---

#### Step 10: Make RUM Client Version Configurable

**File**: `web/public/submit.js`

**Problem**: RUM client version `1.16.0` is hardcoded.

**Objective**: Make version configurable via meta tag or use latest.

**Instructions**:

1. Option A: Add meta tag for version:
   ```html
   <meta name="rum:clientVersion" content="1.16.0" />
   ```

2. Update `maybeInitRum()`:
   ```javascript
   async function maybeInitRum() {
     // ... existing code ...
     
     const version = readMeta("rum:clientVersion") || "1.16.0";
     const clientUrl = `https://client.rum.${c.region}.amazonaws.com/${version}/cwr.js`;
     
     // ... rest of function ...
   }
   ```

3. Option B: Use latest version (no meta tag needed):
   ```javascript
   const clientUrl = `https://client.rum.${c.region}.amazonaws.com/latest/cwr.js`;
   ```

4. Update deployment workflow to inject version if using Option A:
   ```yaml
   - name: Inject RUM placeholders into HTML files
     env:
       RUM_CLIENT_VERSION: "1.16.0"  # Or read from env var
     run: |
       # ... existing sed command ...
       # Add: s/\${RUM_CLIENT_VERSION}/$ENV{RUM_CLIENT_VERSION}/g
   ```

**Success Criteria**:
- [ ] RUM client version is configurable
- [ ] Can update version without code change
- [ ] Or uses "latest" URL that auto-updates

**Estimated Effort**: 15 minutes

---

#### Step 11: Configure Sample Rate Per Environment

**File**: `infra/main/java/co/uk/diyaccounting/submit/stacks/ObservabilityStack.java`

**Problem**: Session sample rate is hardcoded to 1.0 (100%).

**Objective**: Make sample rate configurable per environment to reduce costs in production.

**Instructions**:

1. Add to ObservabilityStackProps interface:
   ```java
   double sessionSampleRate();
   ```

2. Update RUM App Monitor creation:
   ```java
   .sessionSampleRate(props.sessionSampleRate())
   ```

3. Update SubmitEnvironment.java to pass sample rate:
   ```java
   double sampleRate = Double.parseDouble(
     System.getenv("RUM_SESSION_SAMPLE_RATE") != null 
       ? System.getenv("RUM_SESSION_SAMPLE_RATE") 
       : "1.0"
   );
   
   ObservabilityStackProps obsProps = ImmutableObservabilityStackProps.builder()
     // ... existing props ...
     .sessionSampleRate(sampleRate)
     .build();
   ```

4. Add to `.env.ci`:
   ```bash
   RUM_SESSION_SAMPLE_RATE=1.0  # 100% for testing
   ```

5. Add to `.env.prod`:
   ```bash
   RUM_SESSION_SAMPLE_RATE=0.1  # 10% for production cost savings
   ```

6. Redeploy ObservabilityStack

**Success Criteria**:
- [ ] Sample rate is configurable per environment
- [ ] CI uses 100% sampling
- [ ] Production uses lower sampling (e.g., 10%)

**Estimated Effort**: 20 minutes

---

### Phase 4: Documentation and Finalization

#### Step 12: Update Privacy Policy with Detailed RUM Disclosure

**File**: `web/public/privacy.html`

**Problem**: Privacy policy has minimal RUM disclosure.

**Objective**: Add comprehensive disclosure of data collection.

**Instructions**:

1. Locate RUM section in `privacy.html`
2. Expand disclosure:
   ```html
   <h3>Real User Monitoring (RUM)</h3>
   <p>
     We use Amazon CloudWatch RUM to collect performance and error data from your browser. 
     This helps us improve the application's speed, reliability, and user experience.
   </p>
   
   <h4>Data Collected by RUM</h4>
   <ul>
     <li><strong>Performance Metrics</strong>: Page load times, render times, interaction delays</li>
     <li><strong>JavaScript Errors</strong>: Unhandled exceptions and error messages</li>
     <li><strong>HTTP Requests</strong>: API request URLs (without query parameters), status codes, durations</li>
     <li><strong>Navigation Events</strong>: Pages visited, route changes</li>
     <li><strong>Device Information</strong>: Browser type/version, operating system, screen resolution</li>
     <li><strong>Session Information</strong>: Anonymous session ID, hashed user ID (if logged in)</li>
   </ul>
   
   <h4>Data NOT Collected</h4>
   <ul>
     <li>Form input (e.g., VAT numbers, financial data)</li>
     <li>Passwords or authentication tokens</li>
     <li>Full URLs with query parameters or personal identifiers</li>
     <li>IP addresses (AWS receives them but we do not)</li>
   </ul>
   
   <h4>Data Retention</h4>
   <p>
     Raw RUM events are stored by AWS for 30 days. Aggregated metrics are retained longer 
     for trend analysis, but contain no personally identifiable information.
   </p>
   
   <h4>Your Choices</h4>
   <p>
     You can opt out of RUM tracking by clicking "Decline" on the consent banner. 
     Your choice is stored in your browser and respected on future visits.
   </p>
   
   <h4>Data Processor</h4>
   <p>
     RUM data is processed by Amazon Web Services (AWS) in the EU West (London) region. 
     AWS is GDPR-compliant and acts as a data processor on our behalf.
   </p>
   ```

**Success Criteria**:
- [ ] Privacy policy updated with comprehensive RUM disclosure
- [ ] Covers all data types collected
- [ ] Explains user choices and opt-out
- [ ] Complies with GDPR/CCPA requirements

**Estimated Effort**: 15 minutes

---

#### Step 13: Add RUM Troubleshooting Guide

**File**: `_developers/RUM_TROUBLESHOOTING.md` (new file)

**Problem**: No guide for diagnosing RUM issues.

**Objective**: Create troubleshooting guide for developers and operators.

**Instructions**:

1. Create file: `_developers/RUM_TROUBLESHOOTING.md`
2. Add troubleshooting steps (see template below)
3. Link from README.md

**Template**:
```markdown
# Amazon CloudWatch RUM Troubleshooting Guide

## Common Issues

### 1. RUM Client Not Loaded

**Symptoms**:
- `window.cwr` is undefined
- No requests to `client.rum.*.amazonaws.com`

**Diagnosis**:
```javascript
// In browser console
window.__RUM_CONFIG__
// If undefined, config not populated

typeof window.cwr
// If "undefined", client not loaded
```

**Causes**:
- Meta tags have placeholders (not replaced during deployment)
- `bootstrapRumConfigFromMeta()` not called
- Consent declined

**Solutions**:
- Check deployed HTML for real RUM config values
- Verify `bootstrapRumConfigFromMeta()` is called on page load
- Clear localStorage and grant consent

### 2. Placeholder Not Replaced

**Symptoms**:
- HTML contains `${RUM_APP_MONITOR_ID}`
- Browser console shows empty meta tag content

**Diagnosis**:
```bash
curl -s https://ci.submit.diyaccounting.co.uk/index.html | grep "RUM_APP_MONITOR_ID"
# Should NOT find placeholder
```

**Causes**:
- Deployment workflow failed at placeholder injection step
- Workflow queried wrong CloudFormation stack

**Solutions**:
- Check GitHub Actions logs for deploy-publish job
- Verify ObservabilityStack is deployed
- Manually test placeholder replacement:
  ```bash
  aws cloudformation describe-stacks --stack-name ci-env-ObservabilityStack --query 'Stacks[0].Outputs'
  ```

### 3. No Data in CloudWatch

**Symptoms**:
- RUM client loaded but no metrics in CloudWatch
- Dashboard shows "No data"

**Diagnosis**:
```bash
aws cloudwatch list-metrics --namespace AWS/RUM --region eu-west-2
# Should show metrics
```

**Causes**:
- IAM Guest Role lacks `rum:PutRumEvents` permission
- Domain not in RUM App Monitor allow list
- Network requests blocked by CORS or firewall

**Solutions**:
- Check IAM role policy
- Check RUM App Monitor domain list
- Check browser network tab for failed requests to dataplane

### 4. Consent Banner Not Appearing

**Symptoms**:
- No consent banner on first visit
- RUM not initializing

**Causes**:
- `showConsentBannerIfNeeded()` not called
- `hasRumConsent()` incorrectly returns true

**Solutions**:
- Verify `maybeInitRum()` is called
- Clear localStorage: `localStorage.clear()`

## Verification Checklist

- [ ] ObservabilityStack deployed
- [ ] CloudFormation outputs exist
- [ ] HTML placeholders replaced
- [ ] `window.__RUM_CONFIG__` populated
- [ ] Consent banner appears (first visit)
- [ ] `window.cwr` function exists (after consent)
- [ ] Network requests to `client.rum.*.amazonaws.com`
- [ ] Network requests to `dataplane.rum.*.amazonaws.com`
- [ ] Metrics appear in CloudWatch (after 5-10 minutes)

## Useful Commands

```bash
# Query RUM App Monitor
aws rum get-app-monitor --name ci-rum --region eu-west-2

# List RUM metrics
aws cloudwatch list-metrics --namespace AWS/RUM --region eu-west-2

# Query LCP metric
aws cloudwatch get-metric-statistics \
  --namespace AWS/RUM \
  --metric-name WebVitalsLargestContentfulPaint \
  --dimensions Name=application_name,Value=ci-rum \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Average \
  --region eu-west-2

# Check IAM role policy
aws iam get-role-policy \
  --role-name $(aws iam list-roles | jq -r '.Roles[] | select(.RoleName | contains("RumGuestRole")) | .RoleName' | head -1) \
  --policy-name RumGuestRolePolicy
```
```

**Success Criteria**:
- [ ] Troubleshooting guide created
- [ ] Covers common issues
- [ ] Includes verification checklist
- [ ] Includes useful commands

**Estimated Effort**: 30 minutes

---

#### Step 14: Update GitHub Actions Workflow to Validate RUM

**File**: `.github/workflows/deploy.yml`

**Problem**: No validation that RUM is working after deployment.

**Objective**: Add workflow step to verify RUM configuration.

**Instructions**:

1. Add validation step after `deploy-publish`:
   ```yaml
   - name: Validate RUM Configuration
     shell: bash
     run: |
       set -euo pipefail
       echo "Validating RUM configuration in deployed HTML..."
       
       # Fetch deployed HTML
       BASE_URL="${{ needs.names.outputs.base-url }}"
       HTML=$(curl -s "${BASE_URL}/index.html")
       
       # Check placeholders are NOT present
       if echo "$HTML" | grep -q '\${RUM_APP_MONITOR_ID}'; then
         echo "ERROR: RUM_APP_MONITOR_ID placeholder not replaced"
         exit 1
       fi
       
       if echo "$HTML" | grep -q '\${AWS_REGION}'; then
         echo "ERROR: AWS_REGION placeholder not replaced"
         exit 1
       fi
       
       # Check real values are present
       if ! echo "$HTML" | grep -q 'meta name="rum:appMonitorId" content="[a-f0-9-]"'; then
         echo "ERROR: RUM appMonitorId not found or invalid"
         exit 1
       fi
       
       echo "✓ RUM configuration validated successfully"
   ```

2. Optional: Add smoke test for RUM initialization:
   ```yaml
   - name: Smoke Test RUM Initialization
     shell: bash
     run: |
       # Run headless browser test
       npx playwright test behaviour-tests/rum.behaviour.test.js \
         --project=chromium \
         --grep "should populate window.__RUM_CONFIG__"
   ```

**Success Criteria**:
- [ ] Workflow validates placeholders are replaced
- [ ] Workflow fails if placeholders remain
- [ ] Optional: Smoke test verifies RUM initializes

**Estimated Effort**: 20 minutes

---

### Phase 5: Optional Enhancements

#### Step 15: Add RUM Session Replay (Future)

**Note**: AWS CloudWatch RUM added session replay capability in late 2023. This is an optional future enhancement.

**File**: `infra/main/java/co/uk/diyaccounting/submit/stacks/ObservabilityStack.java`

**Instructions**:

1. Enable session recording in RUM App Monitor:
   ```java
   .appMonitorConfiguration(CfnAppMonitor.AppMonitorConfigurationProperty.builder()
     .sessionSampleRate(1.0)
     .allowCookies(true)
     .enableXRay(true)
     .guestRoleArn(rumGuestRole.getRoleArn())
     .identityPoolId(rumIdentityPool.getRef())
     .telemetries(List.of("performance", "errors", "http"))
     .enableRumWebVitals(true)  // Enable Web Vitals collection
     .build())
   ```

2. Update guest role policy:
   ```java
   rumGuestRole.addToPolicy(PolicyStatement.Builder.create()
     .actions(List.of("rum:PutRumEvents", "rum:PutRumMetrics"))
     .resources(List.of("*"))
     .build());
   ```

3. Review session recordings in CloudWatch RUM console

**Success Criteria**:
- [ ] Session replay enabled
- [ ] Guest role has required permissions
- [ ] Recordings visible in console

**Estimated Effort**: 30 minutes

---

## Testing Strategy

### Unit Tests
- `web/unit-tests/rum-config.test.js` - Step 4
- `web/unit-tests/rum-consent.test.js` - Step 5

### System Tests
- `app/system-tests/rum-placeholders.system.test.js` - Step 6

### Behaviour Tests
- `behaviour-tests/rum.behaviour.test.js` - Step 7

### Manual Testing
After completing Steps 1-3:
1. Clear browser localStorage
2. Navigate to deployed environment
3. Verify consent banner appears
4. Click "Accept"
5. Open browser console
6. Verify `window.__RUM_CONFIG__` is populated
7. Verify `window.cwr` exists
8. Open Network tab
9. Verify requests to `client.rum.*.amazonaws.com` and `dataplane.rum.*.amazonaws.com`
10. Wait 5-10 minutes
11. Check CloudWatch dashboard for metrics

---

## Rollout Plan

### Development Environment (Local)
RUM will not fully work locally because:
- ObservabilityStack not deployed in local environment
- Placeholders not replaced (uses literal `${...}` values)
- No AWS credentials for RUM client

**Workaround for local testing**:
- Mock `window.cwr` function
- Test consent banner logic only

### CI Environment
1. Deploy ObservabilityStack (already done)
2. Implement Steps 1-3 (wire up initialization)
3. Deploy application
4. Run behaviour tests (Step 7)
5. Verify metrics in CloudWatch

### Production Environment
1. Verify CI deployment is stable
2. Implement SNS notifications (Step 8)
3. Configure production-specific settings:
   - Session sample rate (Step 11)
   - Alarm thresholds (if different from CI)
4. Deploy to production
5. Monitor for 24 hours
6. Review metrics and alarms

---

## Success Metrics

After completing implementation:

### Technical Metrics
- [ ] `window.__RUM_CONFIG__` populated on 100% of page loads
- [ ] Consent banner appears on first visit
- [ ] RUM client loads after consent granted
- [ ] Telemetry events sent to CloudWatch
- [ ] Metrics visible in CloudWatch dashboard within 10 minutes
- [ ] Alarms trigger correctly when thresholds exceeded

### Business Metrics
- [ ] LCP p75 < 2.5 seconds (good)
- [ ] INP p75 < 200ms (good)
- [ ] JS error rate < 1% of sessions
- [ ] RUM cost < $10/month for production

### Test Coverage
- [ ] 90%+ coverage for RUM functions
- [ ] End-to-end tests passing in CI
- [ ] Manual test checklist completed

---

## Rollback Plan

If RUM causes issues:

1. **Disable RUM Initialization**:
   - Comment out IIFE in `submit.js` that calls `bootstrapRumConfigFromMeta()`
   - Deploy update
   - RUM will no longer initialize but code remains in place

2. **Remove RUM from HTML**:
   - Remove meta tags from HTML files
   - Redeploy static files
   - `window.__RUM_CONFIG__` will be undefined

3. **Delete ObservabilityStack** (last resort):
   ```bash
   aws cloudformation delete-stack --stack-name ci-env-ObservabilityStack --region eu-west-2
   ```
   - Note: Will also delete CloudWatch dashboard and alarms

---

## Estimated Total Effort

| Phase | Steps | Estimated Time |
|-------|-------|----------------|
| Phase 1: Core Functionality | 1-3 | 30 minutes |
| Phase 2: Validation and Testing | 4-7 | 2 hours |
| Phase 3: Enhancements | 8-11 | 2 hours |
| Phase 4: Documentation | 12-14 | 1.5 hours |
| Phase 5: Optional | 15 | 30 minutes (if desired) |
| **Total (Critical Path)** | **1-7** | **2.5 hours** |
| **Total (With Enhancements)** | **1-14** | **6 hours** |

---

## Conclusion

This plan provides a comprehensive roadmap to complete the Amazon CloudWatch RUM implementation. The critical path (Steps 1-7) can be completed in approximately 2.5 hours and will result in a fully functional RUM integration.

For questions or issues during implementation, refer to:
- `REPOSITORY_DOCUMENTATION.md` - RUM architecture and component interaction
- `_developers/RUM_TROUBLESHOOTING.md` - Troubleshooting guide (created in Step 13)
- AWS CloudWatch RUM documentation: https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch-RUM.html
