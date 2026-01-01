Here is a proposed migration roadmap to refactor the `main` branch to the cleaner architecture used in `copilot/refactor-js-code-structure`.  Each step extracts a logically‑cohesive piece of functionality into its own module or service, modifies `submit.js` to delegate to those modules and re‑exports functions on `window` for backward compatibility, then pauses to run the test suite (e.g., `npm test` and the behaviour proxy tests) before continuing.  Throughout the plan, references to code or concepts from the refactor branch are cited.

1. **Introduce bundling infrastructure for tests.**

    * Add a `scripts/bundle-for-tests.js` script that concatenates all ES modules into `web/public/submit.bundle.js` and strips `import`/`export` statements so `eval()` can load it in tests.
    * Update `package.json` test scripts to run this bundler before Vitest/Playwright tests (`npm test`, `test:web-unit`, `test:browser`).
    * Modify unit and browser tests to load `submit.bundle.js` instead of `submit.js` (the refactor branch updates test files accordingly).
    * **Run `npm test`** to ensure bundling and test changes work.  If failures appear, fix bundler script or adjust test setup.

2. **Extract JWT and crypto helpers.**

    * Create `web/public/lib/utils/jwt-utils.js` and `web/public/lib/utils/crypto-utils.js` that contain `parseJwtClaims`, `getJwtExpiryMs`, `base64UrlDecode`, `generateRandomState` and related crypto functions.
    * In `submit.js`, remove those helper definitions and instead import them from the new files, then re‑export them on `window` (as shown in the refactor branch).
    * **Run `npm test`** and fix any breakages (e.g., missing exports or incorrect import paths).

3. **Extract DOM and storage utilities.**

    * Create `web/public/lib/utils/dom-utils.js` for status message functions (`showStatus`, `hideStatus`, `removeStatusMessage`) and `web/public/lib/utils/storage-utils.js` for safe `localStorage`/`sessionStorage` access.
    * Replace inline implementations in `submit.js` with imports from these modules; ensure you still attach them to `window` so existing inline scripts work.
    * Extract correlation‐related functions (traceparent and request‑ID generation) into `web/public/lib/utils/correlation-utils.js`.  The refactor branch’s interceptor installs itself on load; replicate this behaviour.
    * **Run `npm test` and `npm run test:test:authBehaviour-proxy`**.  Fix missing exports or invocation order issues.

4. **Create the service layer.**

    * Move token management and authentication logic (`getAccessToken`, `getIdToken`, `ensureSession`, `checkAuthStatus`, `handle403Error`, etc.) into `web/public/lib/services/auth-service.js`.  Make sure the service returns meaningful values and that calls are idempotent (the refactor branch shows how to handle in‑flight refreshes with a `__ensureSessionInflight` promise).
    * Move HTTP‑client functions (`fetchWithId`, `authorizedFetch`, `fetchWithIdToken`, `executeAsyncRequestPolling`) into `web/public/lib/services/api-client.js`.
    * Modify `submit.js` to import these services and expose them via `window` variables (e.g., `window.authorizedFetch`, `window.fetchWithId`).
    * **Run `npm test` and behaviour proxy tests**, paying special attention to asynchronous polling and token refresh logic.

5. **Refactor `submit.js` to a lightweight coordinator.**

    * Once the utility and service layers are extracted, prune `submit.js` to only handle page‑level coordination, UI widgets, and RUM setup.  Use ES module imports at the top of `submit.js` and delegate to services for all business logic.
    * Keep the correlation widget, debug gating, catalog helpers and RUM functions in `submit.js` (these remain mainly presentation logic).
    * Ensure that `submit.js` still attaches all necessary functions to the `window` object for backward compatibility.
    * **Run the full test suite**.  Fix any regressions caused by missing global exports.

6. **Convert HTML pages to ES modules.**

    * Update all `<script src="./submit.js"></script>` tags in `web/public/**/*.html` to `<script type="module" src="./submit.js"></script>`.  This enables ES module imports in browsers while retaining backwards compatibility (since `submit.js` attaches functions to `window` after import).
    * **Run Playwright browser tests** (including auth behaviour tests) to verify that pages still behave correctly.  Pay special attention to pages that are loaded in iframes or by third‑party code.

7. **Incrementally refactor inline scripts.**

    * Many HTML files contain inline JavaScript that calls functions defined in `submit.js`.  After ensuring the tests pass, gradually refactor these inline scripts to use the service layer directly (e.g., call `authService.ensureSession()` rather than `window.ensureSession`).  This is optional but improves testability.
    * When refactoring an inline script, run the relevant behaviour test to ensure no behavioural changes.

8. **Optional improvements and clean‑ups.**

    * Extract HMRC‑specific API calls and catalog functions into additional service modules (`hmrc-service.js`, `catalog-service.js`) as suggested in the summary.  This further isolates business logic and simplifies unit testing.
    * Consider modernizing the unit tests to import modules directly rather than using `eval()` and the bundler; at that point the bundler script can be removed.
    * Document all exported functions with JSDoc and add lint rules to enforce clear boundaries.
    * Monitor performance and bundle size; if necessary, introduce a bundler (esbuild or Rollup) for production assets while keeping the developer experience unopinionated.

By following this step‑wise approach—extracting utilities, adding a service layer, updating the main script, converting HTML to modules, and testing after each stage—you can migrate `main` to the cleaner architecture of the `copilot/refactor-js-code-structure` branch while preserving existing behaviour and tests.
