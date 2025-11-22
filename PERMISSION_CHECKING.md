# Permission Checking API

## Overview

This application supports permission checking via HTTP HEAD requests. This allows web pages and client applications to check if a URL is permissible to call without executing the actual action.

## Usage

### HTTP HEAD Method

The standard HTTP HEAD method is used to signal a permission query rather than an action request. HEAD requests follow HTTP semantics:
- They return the same headers as the corresponding GET/POST would return
- They do NOT include a response body
- They run the same authorization and bundle enforcement checks

### Endpoints

All `/api/v1/*` endpoints support HEAD requests for permission checking.

### Response Codes

- **200 OK**: User has permission to access the resource
  - Header: `x-permission-check: allowed`
- **401 Unauthorized**: User is not authenticated or has an invalid token
  - Header: `x-permission-check: denied`
- **403 Forbidden**: User is authenticated but lacks required bundles/permissions
  - Header: `x-permission-check: denied`
- **500 Internal Server Error**: Unexpected error during permission check
  - Header: `x-permission-check: error`

### Examples

#### Check catalog access permission (without authentication)
```bash
curl -I http://127.0.0.1:3000/api/v1/catalog

# Response:
# HTTP/1.1 401 Unauthorized
# x-permission-check: denied
```

#### Check catalog access permission (with authentication)
```bash
curl -I -H "Authorization: Bearer YOUR_JWT_TOKEN" http://127.0.0.1:3000/api/v1/catalog

# Response:
# HTTP/1.1 200 OK
# x-permission-check: allowed
```

#### Check bundle endpoint permission
```bash
curl -I -H "Authorization: Bearer YOUR_JWT_TOKEN" http://127.0.0.1:3000/api/v1/bundle

# Response depends on user's bundle entitlements
```

#### Check with query parameters (ignored in permission checks)
```bash
curl -I -H "Authorization: Bearer YOUR_JWT_TOKEN" "http://127.0.0.1:3000/api/v1/catalog?page=1&search=test"

# Query parameters are ignored; permission is checked for the base URL only
# Response:
# HTTP/1.1 200 OK
# x-permission-check: allowed
```

### JavaScript Example

```javascript
// Check if user has permission to access an endpoint
async function checkPermission(url, token) {
  try {
    const response = await fetch(url, {
      method: 'HEAD',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    const permissionStatus = response.headers.get('x-permission-check');
    
    if (response.ok && permissionStatus === 'allowed') {
      console.log('Permission granted');
      return true;
    } else if (response.status === 401) {
      console.log('User not authenticated');
      return false;
    } else if (response.status === 403) {
      console.log('User lacks required permissions/bundles');
      return false;
    }
  } catch (error) {
    console.error('Error checking permission:', error);
    return false;
  }
}

// Usage
const hasPermission = await checkPermission(
  'http://127.0.0.1:3000/api/v1/catalog',
  'YOUR_JWT_TOKEN'
);

if (hasPermission) {
  // Proceed with GET/POST request
  const data = await fetch('http://127.0.0.1:3000/api/v1/catalog', {
    headers: { 'Authorization': `Bearer ${token}` }
  }).then(r => r.json());
}
```

## Implementation Details

- Permission checks use the same bundle enforcement logic as actual requests
- Query parameters are passed through but do not affect the permission check (path-based only)
- The `x-permission-check` header provides a quick way to determine the permission status
- HEAD requests never include a response body, following HTTP standards

## Security Considerations

- Permission checks do NOT bypass authentication or authorization
- They provide the same security guarantees as actual requests
- Tokens are validated and bundle entitlements are checked
- No action is performed; only permission verification occurs
