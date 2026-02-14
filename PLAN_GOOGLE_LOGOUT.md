# PLAN: Google Logout Must Actually Log Out of Google

## Non-Negotiable Assertion

> "YOU MUST direct out to Google's logout. We need to logout to Google's own endpoint to address Google's own session. This local session clearance bullshit has not worked several times."

When a user who logged in via Google clicks "Sign Out", they MUST end up at `https://accounts.google.com/Logout` so that their Google session is terminated. The next time they click "Log In", they MUST see Google's login screen asking for credentials. No silent re-authentication. No session cookie magic. Full logout.

---

## The Bug (Feb 14 2026)

`signed-out.html` already has the Google redirect code. It never executes.

### Current flow:

```
1. auth-status.js:186  → localStorage.removeItem("loginProvider")   ← DELETES THE KEY
2. auth-status.js:230  → redirect to Cognito /logout
3. Cognito             → clears Cognito session cookie
4. Cognito             → redirects to /auth/signed-out.html
5. signed-out.html:19  → reads loginProvider from localStorage       ← ALWAYS NULL
6. signed-out.html:28  → if (loginProvider === "Google")             ← NEVER TRUE
7. signed-out.html:33  → redirects to "/" instead of Google logout   ← BUG
```

Step 1 deletes `loginProvider`. Step 5 needs it. The Google redirect on line 31 is dead code.

### Why this keeps happening

Every session involving "logout" has cleared localStorage in bulk as step 1, destroying the `loginProvider` breadcrumb before the multi-redirect chain (our site → Cognito → our site → Google) can use it. Three separate sessions have attempted to fix logout by adding more localStorage clearing, making the problem worse each time.

---

## The Fix

### Option A Assessment: Stop deleting `loginProvider` early

Remove `localStorage.removeItem("loginProvider")` from `auth-status.js:190`. Let `signed-out.html` handle it (it already does at line 21).

**Will this actually redirect to Google?** YES. Here's why:

1. `auth-status.js` clears all auth tokens but **keeps `loginProvider`** in localStorage
2. Browser redirects to `https://{cognito-domain}/logout` (different origin)
3. Cognito clears its session cookie, redirects back to `https://{our-domain}/auth/signed-out.html`
4. `signed-out.html` loads on **our origin** — localStorage still has `loginProvider = "Google"`
5. `signed-out.html:21` removes `loginProvider` from localStorage (cleanup)
6. `signed-out.html:31` redirects to `https://accounts.google.com/Logout`
7. **Google's own logout page terminates the Google session**

localStorage is **origin-scoped**. The Cognito redirect goes through Cognito's domain, which cannot touch our localStorage. When the browser returns to our domain, `loginProvider` is still there.

**This is the correct fix.** One line removed from `auth-status.js`. The existing code in `signed-out.html` does the rest.

### What `accounts.google.com/Logout` does

This is Google's full logout endpoint. It terminates the user's Google session in the browser. On next login, they will see Google's credential prompt. This also signs them out of other Google services (Gmail, YouTube, etc.) in that browser.

This is the standard approach for apps that need a clean break from Google auth. If the user wants to stay signed into other Google services, they can re-authenticate with Google after our logout — that's a 10-second process.

---

## Files to Change

### 1. `web/public/widgets/auth-status.js` — line 190

**Remove** `localStorage.removeItem("loginProvider")` from the bulk cleanup in the `logout()` function. This is the only change needed to unblock the Google redirect.

### 2. Verify `signed-out.html` — no changes needed

The existing code already:
- Reads `loginProvider` (line 19)
- Clears all remaining auth localStorage (lines 21-26)
- Redirects to `https://accounts.google.com/Logout` if provider was Google (lines 28-31)
- Redirects to `/` for non-Google logins (line 33)

### 3. Verify `loginWithCognitoCallback.html` — no changes needed

Already stores `loginProvider` correctly:
- Federated (Google) login: stores `"Google"` (line 258)
- Native Cognito login: stores `"cognito"` (line 260)

### 4. Verify `IdentityStack.java` — no changes needed

`/auth/signed-out.html` is already registered as a valid Cognito logout URI (line 258).

---

## Verification

### Proxy test (local with ngrok):
1. Log in via mock auth → logout → should redirect to `/` (mock auth, not Google)
2. Verify `loginProvider` is not in localStorage after logout completes

### CI test (real Cognito + Google):
1. Log in via Google → click Sign Out
2. Observe redirect chain: our site → Cognito → our site (`signed-out.html`) → `accounts.google.com/Logout`
3. Click Log In again → **must see Google credential prompt, not silent re-auth**

### Behaviour test update:
- `auth.behaviour.test.js` in proxy mode uses mock auth, so `loginProvider` = provider name from mock (not "Google"). The Google redirect won't fire in proxy — this is correct.
- CI mode uses real Cognito with Google. The existing `logOutAndExpectToBeLoggedOut` step should verify the redirect chain completes.

---

## Anti-Pattern Registry

Do NOT do any of the following in future sessions:

1. **Do NOT clear all localStorage in auth-status.js logout()** — `loginProvider` must survive until `signed-out.html`
2. **Do NOT replace Google logout with local session clearing** — clearing local state does not clear Google's session
3. **Do NOT remove the `signed-out.html` intermediate page** — it's the bridge between Cognito's redirect and Google's logout
4. **Do NOT add "smart" re-authentication after logout** — if the user logged out, they logged out
