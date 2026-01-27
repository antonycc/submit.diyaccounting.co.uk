# Simulator Deployment Plan

Host a public, read-only simulator of the DIY Accounting Submit application for demonstration and help documentation purposes.

## Goals

1. **Always-on demo** - Users can try the app without signing up
2. **Embedded in help** - iframe on `/simulator.html` alongside Help and User Guide
3. **Zero footprint** - No logging, no persistence, no durable state
4. **Accessible clarity** - Screen readers and robots must know this is a simulator
5. **Cheap hosting** - Lambda with cold start is acceptable

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Production Site (submit.diyaccounting.co.uk)                   │
│                                                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │ about.html  │  │ help/       │  │ simulator.html          │  │
│  │             │  │ index.html  │  │                         │  │
│  │ [Help&FAQs] │  │             │  │  ┌───────────────────┐  │  │
│  │ [UserGuide] │  │             │  │  │ SIMULATOR LABEL   │  │  │
│  │ [Simulator] │──┼─────────────┼──│  ├───────────────────┤  │  │
│  └─────────────┘  └─────────────┘  │  │                   │  │  │
│                                    │  │  <iframe src=     │  │  │
│                                    │  │   "https://       │  │  │
│                                    │  │   simulator...."> │  │  │
│                                    │  │                   │  │  │
│                                    │  └───────────────────┘  │  │
│                                    └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                                              │
                                              │ iframe
                                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Simulator (simulator.submit.diyaccounting.co.uk)               │
│  Lambda Function URL or API Gateway                             │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  Lambda Web Adapter                                     │    │
│  │  ┌───────────────────────────────────────────────────┐  │    │
│  │  │  Express Server (merged)                          │  │    │
│  │  │                                                   │  │    │
│  │  │  Static files:  web/public/* (modified)           │  │    │
│  │  │  API routes:    /api/v1/* (from server.js)        │  │    │
│  │  │  Mock HMRC:     /oauth/*, /vat/* (http-simulator) │  │    │
│  │  │  Mock Auth:     hardcoded demo user session       │  │    │
│  │  │                                                   │  │    │
│  │  │  State: In-memory only (resets on cold start)     │  │    │
│  │  │  Logging: Disabled                                │  │    │
│  │  │  DynamoDB: None                                   │  │    │
│  │  └───────────────────────────────────────────────────┘  │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

## Existing Code to Leverage

### app/http-simulator/
Already provides mock HMRC API with in-memory state:
- `state/store.js` - In-memory Maps for tokens, returns, auth codes
- `routes/vat-returns.js` - Mock VAT return submission
- `routes/vat-obligations.js` - Mock obligations with scenarios
- `routes/hmrc-oauth.js` - Mock HMRC OAuth flow
- `routes/local-oauth.js` - Mock local authentication

### app/bin/server.js
Express server that serves:
- Static files from `web/public/`
- API routes (bundle, HMRC token, VAT operations)
- Virtual `/submit.env` endpoint

## Implementation Phases

### Phase 1: Merged Simulator Server

Create `app/bin/simulator-server.js` that combines:

```javascript
// Merge existing functionality
import { createApp as createSimulatorApp } from "../http-simulator/server.js";
import express from "express";
import path from "path";

export function createSimulatorServer() {
  const app = express();

  // Disable all logging
  // No morgan, no console.log, no logger

  // Inject demo user session (no real auth)
  app.use((req, res, next) => {
    req.user = { sub: "demo-user", email: "demo@simulator.local" };
    next();
  });

  // Mount http-simulator routes for mock HMRC/OAuth
  const simulatorApp = createSimulatorApp();
  app.use(simulatorApp);

  // Serve modified static files (with simulator markup)
  app.use(express.static(path.join(__dirname, "../../web/public-simulator")));

  // In-memory bundle store (no DynamoDB)
  const bundles = new Map();
  app.get("/api/v1/account/bundles", (req, res) => {
    res.json({ bundles: Array.from(bundles.values()) });
  });
  // ... etc

  return app;
}
```

### Phase 2: Static File Transformation

At build time, transform `web/public/` → `web/public-simulator/`:

1. **HTML modifications** (all `.html` files):
   ```html
   <!-- Inject after <body> -->
   <div class="simulator-banner" role="alert" aria-live="polite">
     <span aria-hidden="true">⚠️</span>
     SIMULATOR - Demo Mode - No real data is submitted
   </div>

   <!-- Add to <html> tag -->
   <html lang="en" data-simulator="true">

   <!-- Add meta tags -->
   <meta name="robots" content="noindex, nofollow, noarchive">
   <meta name="simulator" content="true">
   ```

2. **CSS additions** (`submit.css`):
   ```css
   /* Simulator banner - always visible */
   .simulator-banner {
     position: fixed;
     top: 0;
     left: 0;
     right: 0;
     background: #ff6b6b;
     color: white;
     text-align: center;
     padding: 8px;
     font-weight: bold;
     z-index: 10000;
     font-size: 14px;
   }

   /* Offset body content */
   html[data-simulator="true"] body {
     padding-top: 40px;
   }

   /* Visual indicator on all interactive elements */
   html[data-simulator="true"] .btn,
   html[data-simulator="true"] button {
     position: relative;
   }

   html[data-simulator="true"] .btn::after,
   html[data-simulator="true"] button::after {
     content: "(demo)";
     font-size: 10px;
     opacity: 0.7;
     margin-left: 4px;
   }
   ```

3. **robots.txt** (for simulator subdomain):
   ```
   User-agent: *
   Disallow: /
   ```

4. **JavaScript modifications**:
   - Remove RUM/analytics initialization
   - Disable any real API calls to production
   - Replace Cognito auth with mock session

### Phase 3: Lambda Deployment

Use AWS Lambda Web Adapter:

```yaml
# In CDK (SimulatorStack.java)
Function simulatorFunction = Function.Builder.create(this, "SimulatorFunction")
    .runtime(Runtime.NODEJS_20_X)
    .handler("run.sh")  // Lambda Web Adapter entrypoint
    .code(Code.fromAsset("../app", AssetOptions.builder()
        .bundling(...)
        .build()))
    .memorySize(512)
    .timeout(Duration.seconds(30))
    .environment(Map.of(
        "AWS_LWA_INVOKE_MODE", "response_stream",
        "PORT", "8080"
    ))
    .layers(List.of(
        LayerVersion.fromLayerVersionArn(this, "LambdaAdapter",
            "arn:aws:lambda:eu-west-2:753240598075:layer:LambdaAdapterLayerX86:22")
    ))
    .build();

// Function URL (no API Gateway needed)
FunctionUrl functionUrl = simulatorFunction.addFunctionUrl(FunctionUrlOptions.builder()
    .authType(FunctionUrlAuthType.NONE)  // Public access
    .cors(FunctionUrlCorsOptions.builder()
        .allowedOrigins(List.of("https://submit.diyaccounting.co.uk"))
        .build())
    .build());
```

### Phase 4: Simulator Page

Create `web/public/simulator.html`:

```html
<!doctype html>
<html lang="en">
<head>
  <title>Simulator - DIY Accounting Submit</title>
  <meta name="description" content="Try DIY Accounting Submit in demo mode. No account required.">
  <link rel="stylesheet" href="./submit.css">
  <style>
    .simulator-container {
      position: relative;
      width: 100%;
      height: calc(100vh - 200px);
      min-height: 600px;
      border: 3px solid #ff6b6b;
      border-radius: 8px;
      overflow: hidden;
    }

    .simulator-overlay-label {
      position: absolute;
      top: 10px;
      right: 10px;
      background: #ff6b6b;
      color: white;
      padding: 4px 12px;
      border-radius: 4px;
      font-weight: bold;
      z-index: 100;
      pointer-events: none;
    }

    .simulator-frame {
      width: 100%;
      height: 100%;
      border: none;
    }

    .simulator-notice {
      background: #fff3cd;
      border: 1px solid #ffc107;
      border-radius: 4px;
      padding: 16px;
      margin-bottom: 20px;
    }
  </style>
</head>
<body>
  <a href="#mainContent" class="skip-link">Skip to main content</a>
  <header>
    <!-- Standard header nav -->
  </header>

  <main id="mainContent">
    <h1>Try the Simulator</h1>

    <div class="simulator-notice" role="alert">
      <strong>Demo Mode:</strong> This is a fully functional simulator.
      No real VAT returns are submitted. No account is required.
      Data resets periodically.
    </div>

    <nav class="about-nav-links" aria-label="Help navigation">
      <a href="help/index.html" class="about-nav-link">Help & FAQs</a>
      <a href="guide/index.html" class="about-nav-link">User Guide</a>
    </nav>

    <div class="simulator-container" role="region" aria-label="DIY Accounting Submit Simulator">
      <div class="simulator-overlay-label" aria-hidden="true">SIMULATOR</div>
      <iframe
        src="https://simulator.submit.diyaccounting.co.uk/"
        class="simulator-frame"
        title="DIY Accounting Submit Simulator - Demo Mode"
        sandbox="allow-scripts allow-forms allow-same-origin"
        loading="lazy">
      </iframe>
    </div>

    <p>
      <a href="index.html">Ready to use the real application? Go to the home page →</a>
    </p>
  </main>

  <footer><!-- Standard footer --></footer>
</body>
</html>
```

### Phase 5: Behaviour Test

Add simple click-through test for simulator page:

```javascript
// behaviour-tests/simulator.behaviour.test.js

test("Simulator page loads and iframe is interactive", async ({ page }) => {
  // Navigate to simulator page
  await page.goto(`${baseUrl}/simulator.html`);

  // Verify page structure
  await expect(page.locator("h1")).toContainText("Simulator");
  await expect(page.locator(".simulator-notice")).toBeVisible();
  await expect(page.locator(".simulator-container")).toBeVisible();

  // Verify iframe loaded
  const iframe = page.frameLocator(".simulator-frame");
  await expect(iframe.locator("body")).toBeVisible({ timeout: 30000 });

  // Verify simulator banner inside iframe
  await expect(iframe.locator(".simulator-banner")).toBeVisible();
  await expect(iframe.locator(".simulator-banner")).toContainText("SIMULATOR");

  // Click through basic navigation inside iframe
  await iframe.locator("a.info-link").click();
  await expect(iframe.locator("h1")).toContainText("About");

  // Verify Help link works
  await iframe.locator("a.about-nav-link:has-text('Help')").click();
  await expect(iframe.locator("h1")).toContainText("Help");

  // Navigate back to home via home icon
  await iframe.locator("a.home-link").click();

  // Test complete - simulator is clickable
  console.log("Simulator iframe is interactive and navigable");
});
```

## Build Script

Create `scripts/build-simulator.js`:

```javascript
// Transform web/public → web/public-simulator
// 1. Copy all files
// 2. Inject simulator markup into HTML files
// 3. Modify submit.css with simulator styles
// 4. Create robots.txt
// 5. Remove analytics/RUM code
```

## Security Considerations

1. **No secrets** - Simulator has no access to production secrets
2. **No persistence** - In-memory state only, resets on cold start
3. **No logging** - No CloudWatch logs, no RUM, no analytics
4. **Sandboxed iframe** - `sandbox` attribute limits capabilities
5. **Clear labeling** - Cannot be mistaken for production
6. **ARIA announcements** - Screen readers informed this is demo mode

## Cost Estimate

- **Lambda**: ~$0/month at low traffic (free tier: 1M requests, 400,000 GB-seconds)
- **Function URL**: Free (no API Gateway)
- **CloudFront** (optional): ~$1/month for caching
- **Route53**: Already have the hosted zone

## Task Breakdown

1. [ ] Create `app/bin/simulator-server.js` - merged Express server
2. [ ] Create `scripts/build-simulator.js` - HTML/CSS transformation
3. [ ] Add simulator CSS to `submit.css`
4. [ ] Create `web/public/simulator.html` - host page with iframe
5. [ ] Add link to simulator from about.html (alongside Help/Guide)
6. [ ] Create `SimulatorStack.java` - Lambda + Function URL
7. [ ] Create `simulator.behaviour.test.js` - click-through test
8. [ ] Add deployment config for simulator subdomain
9. [ ] Test locally with `npm run start:simulator`
10. [ ] Deploy and verify

## Future Enhancements

- **Guided tour**: Highlight UI elements with tooltips
- **Pre-populated scenarios**: "See a submitted return" button
- **Mobile-friendly**: Responsive iframe container
- **Fargate upgrade**: When traffic justifies always-on compute
