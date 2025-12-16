# Web Application - Svelte + Vite

This directory contains the frontend web application for DIY Accounting Submit, built with Svelte and Vite.

## Directory Structure

```
web/
├── src/                    # Svelte source files
│   ├── App.svelte         # Main application component with routing
│   ├── main.js            # Application entry point
│   ├── app.css            # Global styles
│   ├── index.html         # HTML template (with RUM placeholders)
│   ├── components/        # Reusable Svelte components
│   │   ├── Header.svelte  # Application header with navigation
│   │   └── Footer.svelte  # Application footer
│   ├── routes/            # Page components (one per route)
│   │   ├── Home.svelte
│   │   ├── Login.svelte
│   │   ├── Bundles.svelte
│   │   ├── VatObligations.svelte
│   │   ├── SubmitVat.svelte
│   │   ├── Receipts.svelte
│   │   └── ...
│   ├── stores/            # Svelte stores for state management
│   │   ├── authStore.js   # Authentication state
│   │   └── bundlesStore.js # Bundles/entitlements state
│   ├── lib/               # Utility libraries
│   │   └── api.js         # REST API client
│   ├── public/            # Static assets copied to build
│   │   ├── favicon.ico
│   │   └── images/
│   └── svelte.config.js   # Svelte compiler configuration
│
├── public/                # Build output directory (deployed to S3)
│   ├── index.html         # Built HTML (with asset references)
│   ├── assets/            # Built JavaScript and CSS
│   ├── docs/              # API documentation (preserved)
│   ├── tests/             # Test results (preserved)
│   ├── images/            # Images (copied from src/public)
│   └── submit.*           # Special marker files (preserved)
│
├── unit-tests/            # Vitest unit tests
└── browser-tests/         # Playwright browser tests
```

## Development

### Prerequisites

- Node.js 22+
- npm 10+

### Install Dependencies

```bash
npm install
```

### Development Server

Start the Vite dev server with hot module replacement:

```bash
npm run dev
```

The dev server runs on http://localhost:5173 and proxies API requests to the Express server (which should be running on port 3000).

### Build for Production

Build the Svelte app to `web/public/`:

```bash
npm run build:web
```

This generates:
- Minified JavaScript bundles in `web/public/assets/`
- Optimized CSS in `web/public/assets/`
- `index.html` with references to hashed assets
- Preserves RUM configuration placeholders for deployment-time injection

### Preview Production Build

Test the production build locally:

```bash
npm run preview
```

## Routing

The application uses `svelte-spa-router` for client-side routing:

- `/` - Home page (activity selection)
- `/auth/login` - Login page
- `/auth/loginWithCognitoCallback` - OAuth callback for Cognito
- `/auth/loginWithMockCallback` - OAuth callback for mock auth
- `/account/bundles` - Bundles management
- `/hmrc/vat/vatObligations` - View VAT obligations
- `/hmrc/vat/submitVat` - Submit VAT return
- `/hmrc/vat/viewVatReturn` - View VAT return details
- `/hmrc/receipt/receipts` - View submission receipts
- `/about` - About page
- `/privacy` - Privacy policy
- `/guide` - User guide
- `*` - 404 page

## State Management

### AuthStore

Manages authentication state with localStorage persistence:

```javascript
import { authStore } from './stores/authStore.js';

// Subscribe to auth state
$authStore.isAuthenticated // true/false
$authStore.userInfo // User details
$authStore.accessToken // Access token

// Actions
authStore.login(tokens, userInfo);
authStore.logout();
authStore.updateTokens(newTokens);
```

### BundlesStore

Manages user bundles/entitlements:

```javascript
import { bundlesStore } from './stores/bundlesStore.js';

// Subscribe to bundles
$bundlesStore // Array of bundles

// Actions
bundlesStore.refresh(authToken);
bundlesStore.add(bundle);
bundlesStore.remove(bundleId);
```

## API Client

The `lib/api.js` module provides a typed API client:

```javascript
import { api } from './lib/api.js';

// Auth endpoints
await api.getCognitoAuthUrl();
await api.exchangeCognitoToken(code, state);

// HMRC endpoints
await api.getVatObligations(vrn, account);
await api.submitVatReturn(vrn, periodKey, vatReturn, account);

// Account endpoints
await api.getBundles();
await api.addBundle(product);
await api.getCatalog();
```

All API calls automatically include the Authorization header from the auth store.

## Testing

### Unit Tests

Run Vitest unit tests:

```bash
npm run test:web-unit
```

### Browser Tests

Run Playwright browser tests:

```bash
npm run test:browser
```

## Styling

Global styles are in `src/app.css`. Component-specific styles use Svelte's scoped `<style>` blocks:

```svelte
<div class="my-component">
  <h1>Hello</h1>
</div>

<style>
  .my-component {
    padding: 1em;
  }
</style>
```

## Code Quality

### Linting

ESLint with Svelte plugin:

```bash
npm run linting
npm run linting-fix
```

### Formatting

Prettier with Svelte plugin:

```bash
npm run formatting:js
npm run formatting:js-fix
```

## Build Output

The build process:

1. Compiles Svelte components to JavaScript
2. Bundles JavaScript with Rollup (via Vite)
3. Minifies and optimizes assets
4. Generates hash-based filenames for cache busting
5. Outputs to `web/public/`
6. Preserves important files and directories:
   - `docs/` - OpenAPI documentation
   - `tests/` - Test results
   - `submit.*` - Deployment markers

## Deployment

The deployment process (GitHub Actions):

1. Build Svelte app: `npm run build:web`
2. Build Maven/CDK: `./mvnw clean verify`
3. Inject RUM configuration into `web/public/index.html`
4. Deploy PublishStack to sync `web/public/` to S3
5. Invalidate CloudFront cache

## Migration Notes

This application was migrated from vanilla HTML/CSS/JS to Svelte + Vite. Key changes:

- **SPA Architecture**: Single `index.html` with client-side routing instead of multiple HTML pages
- **Component-Based**: Reusable Svelte components instead of Web Components
- **State Management**: Svelte stores with reactive subscriptions instead of global variables
- **Build Process**: Vite build step added to `package.json`
- **Module System**: ES modules throughout
- **API Client**: Centralized API client instead of scattered fetch calls

Old HTML files are preserved as `.html.old` for reference.

## Troubleshooting

### Dev Server Not Starting

Ensure port 5173 is available. You can change it in `vite.config.js`:

```javascript
server: {
  port: 3001,
}
```

### API Calls Failing in Dev

Make sure the Express server is running on port 3000. The Vite dev server proxies API requests to it.

### Build Errors

Check that all dependencies are installed:

```bash
npm install
```

### RUM Placeholders Not Working

The placeholders `${RUM_APP_MONITOR_ID}` etc. are replaced during deployment by the GitHub Actions workflow. In local dev, they remain as placeholders.

## Further Reading

- [Svelte Documentation](https://svelte.dev/)
- [Vite Documentation](https://vitejs.dev/)
- [svelte-spa-router](https://github.com/ItalyPaleAle/svelte-spa-router)
- [Repository Documentation](../REPOSITORY_DOCUMENTATION.md)
