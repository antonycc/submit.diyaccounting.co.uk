# PLAN: HMRC Token Scope Enforcement

## User Assertion

> It should be a valid scenario for a user to check obligations, authenticate, then submit VAT.

## Problem

When a user visits the obligations page first and authorises with HMRC, the token is granted with `read:vat` scope only. If the user then navigates to the submit page, the submit page finds an existing HMRC access token in session storage and **skips the OAuth redirect entirely**, attempting to POST the VAT return with the `read:vat`-only token. HMRC rejects this with `403 INVALID_SCOPE`.

## Evidence

### Incident: 2026-02-19 ~16:21 UTC (tester report via WhatsApp screenshot)

Error displayed in browser:
```
Submission failed: Failed to submit VAT. Remote call failed: POST /api/v1/hmrc/vat/return - Status: 400
Body: {"message":"An unexpected error occurred","hmrcResponseCode":403,
"responseBody":{"message":"Can not access the required resource. Ensure this token has all the required scopes.","code":"INVALID_SCOPE"},
"userMessage":"An unexpected error occurred","actionAdvice":"Please try again or contact support if the problem persists"}
```

### CloudWatch trace (traceparent `00-ecc880b92d5387d2f47332aa1991dd5b-d9be66221fdf8bf9-01`)

User: Cognito sub `66e21264-a011-701c-ba7b-49c1a91c27ed` (`Google_109721324623224564911`)
Browser: Chrome 143 / Opera 127, Windows 10, 1920x1080
Prod deployment: `prod-4c05746`

| Time (UTC) | Lambda | RequestId | What happened |
|---|---|---|---|
| 16:04:10 | — | — | Cognito MFA login (from `Gov-Client-Multi-Factor` timestamp) |
| 16:09:51 | `hmrc-token-post` | `efbda026-ef81-...` | Token exchange #1. HMRC returned **`scope: "read:vat"`** only |
| 16:09:58 | `hmrc-vat-obligation-get` | `e592fef9-f853-...` | Obligations GET for VRN `438219640` — **200 OK** |
| 16:10:00 | `hmrc-vat-obligation-get` | `e592fef9-f853-...` | Second obligations poll — **200 OK** |
| 16:10:02 | `hmrc-vat-obligation-get` | `e592fef9-f853-...` | Third obligations poll — **200 OK** |

User navigated away and returned (new traceparent `bed1e7d466efc4821cffb251343845d6`, same user):

| Time (UTC) | Lambda | RequestId | What happened |
|---|---|---|---|
| 16:13:41 | `hmrc-token-post` | `0c9336d2-0de6-...` | Token exchange #2. HMRC again returned **`scope: "read:vat"`** only |
| 16:13:46 | `hmrc-vat-obligation-get` | `66c906c6-cb93-...` | Obligations GET — **200 OK** |

User then attempted to submit a VAT return (back on traceparent `ecc880b9...`):

| Time (UTC) | Lambda | RequestId | What happened |
|---|---|---|---|
| 16:17:32 | `hmrc-vat-return-post` | `ae262373-404f-...` | VAT return POST begins. Bundle check passed, token consumed (2 remaining) |
| 16:17:34 | `hmrc-vat-return-post` | `ae262373-404f-...` | Period key resolved: `17A1` (sandbox obligation flexibility) |
| 16:17:37.097 | `hmrc-vat-return-post` | `ae262373-404f-...` | Token validated (prefix `4f205d05...`, 32 chars, valid format) |
| 16:17:37.224 | `hmrc-vat-return-post` | `ae262373-404f-...` | Obligations GET to HMRC — **200 OK** (read:vat sufficient) |
| 16:17:37.410 | `hmrc-vat-return-post` | `ae262373-404f-...` | **POST** to `https://test-api.service.hmrc.gov.uk/organisations/vat/438219640/returns` |
| 16:17:37.630 | `hmrc-vat-return-post` | `ae262373-404f-...` | **HMRC responded 403**: `{"code":"INVALID_SCOPE","message":"Can not access the required resource. Ensure this token has all the required scopes."}` |
| 16:17:39.634 | `hmrc-vat-return-post` | `ae262373-404f-...` | Returned HTTP 400 to browser with error body (the screenshot) |

### Separate incident: Synthetic test failure at 16:12

Run [22189790219](https://github.com/antonycc/submit.diyaccounting.co.uk/actions/runs/22189790219/job/64174000512) — **unrelated**. The test timed out at the Google OAuth login step (`net::ERR_ABORTED`). It never reached VAT submission. The runs before and after both passed. Transient Google OAuth issue.

## Root Cause

### Scope mismatch between pages

- `vatObligations.html:476` requests `read:vat` scope only
- `submitVat.html:760` requests `write:vat read:vat` scope
- `viewVatReturn.html:470` requests `read:vat` scope only

### Token reuse skips scope check

`submitVat.html:740-743`:
```javascript
if (accessToken) {
  // Token available - submit directly without OAuth redirect
  console.log("HMRC access token found, submitting directly");
  continueVatSubmission();
```

The submit page checks for the **presence** of an HMRC access token but not its **scope**. If a token exists (from a prior obligations page visit), it skips the OAuth redirect and uses the `read:vat`-only token for the POST.

### HMRC scope requirements (from `_developers/reference/hmrc-mtd-vat-api-1.0.yaml`)

| Endpoint | Method | Required scope |
|---|---|---|
| `/organisations/vat/{vrn}/obligations` | GET | `read:vat` |
| `/organisations/vat/{vrn}/returns` | POST | `write:vat` |
| `/organisations/vat/{vrn}/returns/{periodKey}` | GET | `read:vat` |

## Why the behaviour test passes

`submitVatBehaviour.test.js` goes **Submit first, then Obligations** (lines 350-440):

1. `initSubmitVat` → `fillInVat` → `submitFormVat` (submit page first)
2. HMRC Auth flow (triggered from submit page → scope `write:vat read:vat`)
3. `initVatObligations` → obligations page (HMRC Auth **commented out** at lines 428-433, reuses write+read token)

The human test plan (`_developers/PLAN_HUMAN_TEST.md`) goes **Obligations first, then Submit**:

1. Section 3: "Click 'VAT Obligations (HMRC)'" → HMRC OAuth with `read:vat`
2. Section 4: "From the Home page, click 'Submit VAT (HMRC)'" → reuses `read:vat` token → **INVALID_SCOPE**

## Fix

### Option A: Always request `write:vat read:vat` on all pages

Change `vatObligations.html:476` and `viewVatReturn.html:470` to request `write:vat read:vat` instead of `read:vat`. This is the simplest fix but asks the user for more HMRC permissions than the page strictly needs.

### Option B: Check scope before reusing token (preferred)

On the submit page, before reusing an existing HMRC token, check whether it was granted with `write:vat` scope. If not, force a new OAuth redirect with `write:vat read:vat`.

This requires:
1. Storing the granted scope alongside the access token in session storage (during the HMRC OAuth callback)
2. Checking the stored scope on the submit page before deciding to reuse the token

### Option C: Server-side scope check

Have the `hmrcVatReturnPost` Lambda check the token scope before calling HMRC. If insufficient, return a specific error code that the client can use to trigger re-authorization.

## Verification

- [ ] User can view obligations first, then submit VAT without error
- [ ] `submitVatBehaviour` test still passes (submit-first flow)
- [ ] New behaviour test or test variant for obligations-first flow
- [ ] Synthetic test on prod continues passing

## Files involved

| File | Line | Role |
|---|---|---|
| `web/public/hmrc/vat/submitVat.html` | 740-743, 760 | Token reuse check and scope request |
| `web/public/hmrc/vat/vatObligations.html` | 476 | Scope request (`read:vat` only) |
| `web/public/hmrc/vat/viewVatReturn.html` | 470 | Scope request (`read:vat` only) |
| `web/public/lib/auth-url-builder.js` | 31 | Builds HMRC OAuth URL with scope parameter |
| `behaviour-tests/submitVat.behaviour.test.js` | 350-440 | Test flow order (submit first) |
| `_developers/PLAN_HUMAN_TEST.md` | Section 3-4 | Human test flow order (obligations first) |
