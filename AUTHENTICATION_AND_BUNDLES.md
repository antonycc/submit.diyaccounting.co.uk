# Authentication and Bundle Tracking

This document explains how the DIY Accounting Submit website handles authentication and bundle-based entitlements.

## Overview

The website implements a dual-layer access control system:
1. **Authentication** - User identity verification via Cognito/OAuth2
2. **Bundle-based Entitlements** - Activity access control based on granted bundles

All pages are publicly accessible (no server-side restrictions), but the user interface indicates which features require authentication or specific bundle grants.

## Authentication System

### Storage
Authentication state is stored in browser `localStorage`:
- `cognitoIdToken` - JWT token containing user identity claims
- `cognitoAccessToken` - OAuth2 access token
- `cognitoRefreshToken` - Token for refreshing expired access tokens
- `userInfo` - Parsed user profile information (name, email, etc.)

### JWT Token Structure
The ID token is a standard JWT with three parts (header.payload.signature):
- **Header**: Token metadata and signing algorithm
- **Payload**: User claims including:
  - `sub` - User's unique identifier (Cognito user ID)
  - `email` - User's email address
  - `name` / `given_name` - User's display name
  - `exp` - Token expiration timestamp
  - Custom claims for bundles (when implemented)
- **Signature**: Cryptographic signature for verification

### Authentication Flow
1. User clicks "Log in" button
2. Redirected to `/auth/login.html`
3. Login page redirects to Cognito hosted UI or mock OAuth2 server
4. After successful authentication, callback page receives authorization code
5. Code is exchanged for JWT tokens via `/api/v1/auth/token` endpoint
6. Tokens and user info are stored in localStorage
7. User is redirected back to the application
8. `auth-status.js` widget updates UI to show logged-in state

### Authentication Check
The `auth-status.js` widget runs on every page:
- Checks for `userInfo` in localStorage
- Updates login status display ("Not logged in" vs "Logged in as [name]")
- Provides logout functionality that clears all auth tokens

## Bundle System

### What are Bundles?
Bundles are entitlement packages that grant access to specific activities. They are defined in `product-catalogue.toml` and can be:
- **Automatic** - Granted to all users (e.g., "default" bundle)
- **On-request** - User must explicitly request them (e.g., "test" bundle)

### Bundle Storage
User bundles are stored in `localStorage.userBundles` as a JSON array of strings:
```javascript
// Example:
["default", "test|EXPIRY=2025-12-31T23:59:59Z"]
```

Each entry can be:
- Simple bundle ID: `"bundleName"`
- Bundle with expiry: `"bundleName|EXPIRY=ISO8601_timestamp"`

### Bundle Allocation

#### Automatic Bundles
Automatically granted bundles (like "default") are:
- Defined in `product-catalogue.toml` with `allocation = "automatic"`
- Always considered active when checking access
- Included by frontend logic, not stored in userBundles

#### On-Request Bundles
Request-based bundles:
- Defined with `allocation = "on-request"` in catalog
- Require authentication (`auth = "required"`)
- User requests via `/account/bundles.html` page
- Granted by backend `/api/v1/bundle` POST endpoint
- Stored in `localStorage.userBundles` after grant
- May have expiration dates and usage caps

### Bundle Request Flow
1. User navigates to `/account/bundles.html`
2. Page fetches catalog from `/api/v1/catalog`
3. Available bundles displayed with "Request" buttons
4. User clicks "Request bundle" button
5. Frontend POSTs to `/api/v1/bundle` with:
   - Bundle ID
   - JWT token in Authorization header
   - Optional qualifiers (transactionId, subscriptionTier)
6. Backend validates JWT and grants bundle
7. Updated bundle list returned and stored in localStorage
8. UI updates to show "Added ✓" state

### Checking Bundle Access
The frontend determines available activities by:

1. **Loading the catalog** from `/api/v1/catalog`
2. **Parsing user bundles** from localStorage
3. **Building active bundle set**:
   ```javascript
   function getActiveBundles(catalog, userBundles) {
     const active = new Set();
     
     // Add automatic bundles from catalog
     for (const bundle of catalog.bundles) {
       if (bundle.allocation === "automatic") {
         active.add(bundle.id);
       }
     }
     
     // Add granted bundles from localStorage
     for (const bundleEntry of userBundles) {
       const bundleId = bundleEntry.split("|")[0]; // Remove expiry
       active.add(bundleId);
     }
     
     return Array.from(active);
   }
   ```

4. **Checking activity access**:
   ```javascript
   function canAccessActivity(activity, activeBundles) {
     return activity.bundles.some(bundleId => 
       activeBundles.includes(bundleId)
     );
   }
   ```

## Product Catalog

### Structure
The `product-catalogue.toml` file defines:
- **Bundles** - Entitlement packages with allocation rules
- **Activities** - Features/pages with their required bundles

### Bundle Definition
```toml
[[bundles]]
id = "test"
name = "Test"
allocation = "on-request"  # or "automatic"
auth = "required"          # or "none"
cap = 10                   # usage limit
timeout = "P1D"            # ISO 8601 duration (1 day)
```

### Activity Definition
```toml
[[activities]]
id = "submit-vat-sandbox"
name = "Submit VAT (Sandbox API)"
bundles = ["test"]  # Which bundles grant this activity
paths = ["activities/submitVat.html", "^/api/v1/hmrc/vat.*"]
```

### Path Matching
Activities define `path` (string) or `paths` (array):
- Simple paths: `"account/receipts.html"` - exact match
- Regex paths: `"^/api/v1/hmrc/vat.*"` - pattern match
- Multiple paths: Array of paths that all grant the same activity

## Current Implementation Status

### What Works
✅ Authentication via Cognito/OAuth2  
✅ JWT token storage and management  
✅ Bundle request and storage  
✅ Activity filtering based on bundles  
✅ Dynamic UI updates based on auth/bundle state  

### What's Missing
❌ JWT bundles as claims (bundles only in localStorage)  
❌ Server-side authorization enforcement  
❌ Bundle expiration checking  
❌ Visibility indicators on pages  

## Security Considerations

### Current Model
- **Public pages** - All HTML pages are publicly accessible
- **Client-side filtering** - Activity visibility controlled by frontend
- **API protection** - Backend APIs validate JWT tokens
- **No enforcement** - Users can bypass frontend checks by directly accessing pages

### Recommended Improvements
1. **Server-side authorization** - Lambda authorizer to check bundles
2. **JWT bundle claims** - Include bundles in token payload
3. **Expiration enforcement** - Check bundle timeouts server-side
4. **CloudFront restrictions** - Use Lambda@Edge for page-level access control

## Usage Examples

### Check if Logged In
```javascript
const isLoggedIn = !!localStorage.getItem('cognitoIdToken');
```

### Get Current User Bundles
```javascript
function parseUserBundles() {
  try {
    const raw = localStorage.getItem('userBundles');
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}
```

### Check for Specific Bundle
```javascript
function hasBundle(bundles, id) {
  return bundles.some(b => 
    typeof b === 'string' && (b === id || b.startsWith(id + '|'))
  );
}

const bundles = parseUserBundles();
const hasTestAccess = hasBundle(bundles, 'test');
```

### Match Page to Activity
```javascript
async function getActivityForCurrentPage() {
  const response = await fetch('/api/v1/catalog');
  const catalog = await response.json();
  
  // Get relative path (e.g., "activities/submitVat.html")
  const currentPath = window.location.pathname
    .split('/').slice(-2).join('/');
  
  // Find matching activity
  return catalog.activities?.find(activity => {
    const paths = activity.paths || [activity.path];
    return paths.some(path => {
      if (path.startsWith('^')) {
        // Regex path
        return new RegExp(path).test(currentPath);
      }
      // Exact path
      return path === currentPath;
    });
  });
}
```

## References

- `web/public/widgets/auth-status.js` - Authentication status widget
- `web/public/account/bundles.html` - Bundle management page
- `web/public/index.html` - Dynamic activity rendering
- `app/functions/account/catalogGet.js` - Catalog API endpoint
- `app/lib/jwtHelper.js` - JWT decoding utilities
- `product-catalogue.toml` - Bundle and activity definitions
