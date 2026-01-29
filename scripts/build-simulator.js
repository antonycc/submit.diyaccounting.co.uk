#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// scripts/build-simulator.js
// Transform web/public -> web/public-simulator with simulator-specific modifications
// 1. Copy all files
// 2. Inject simulator banner into HTML files
// 3. Add data-simulator attribute to <html> tag
// 4. Add meta robots noindex
// 5. Create robots.txt for simulator subdomain

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, "..");
const sourceDir = path.join(projectRoot, "web/public");
const targetDir = path.join(projectRoot, "web/public-simulator");

// Simulator banner HTML to inject after <body>
const SIMULATOR_BANNER = `
  <!-- Simulator Banner - Injected by build-simulator.js -->
  <div class="simulator-banner" role="alert" aria-live="polite">
    <span aria-hidden="true">&#9888;</span>
    SIMULATOR - Demo Mode - No real data is submitted
  </div>
`;

// Meta tags to inject in <head>
const SIMULATOR_META_TAGS = `
  <!-- Simulator Meta Tags - Injected by build-simulator.js -->
  <meta name="robots" content="noindex, nofollow, noarchive">
  <meta name="simulator" content="true">
`;

// robots.txt content for simulator subdomain
const ROBOTS_TXT = `# Simulator subdomain - do not index
User-agent: *
Disallow: /
`;

/**
 * Recursively copy directory
 */
function copyDirSync(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * Transform HTML file with simulator modifications
 */
function transformHtmlFile(filePath) {
  let content = fs.readFileSync(filePath, "utf-8");

  // Add data-simulator="true" to <html> tag
  content = content.replace(/<html(\s+lang="[^"]*")?>/i, '<html$1 data-simulator="true">');

  // Inject meta tags after <head>
  content = content.replace(/<head>/i, "<head>" + SIMULATOR_META_TAGS);

  // Inject simulator banner after <body>
  content = content.replace(/<body>/i, "<body>" + SIMULATOR_BANNER);

  // Remove CloudWatch RUM placeholders (no analytics in simulator)
  content = content.replace(/<meta name="rum:[^"]*" content="[^"]*"\s*\/?>/g, "");

  // Inject script to set up simulator user session in localStorage
  const simulatorScript = `
  <script>
    // Simulator auto-login - inject demo user into localStorage
    (function() {
      if (document.documentElement.dataset.simulator === 'true') {
        // Set up demo user session
        const demoUser = {
          sub: 'demo-user-12345',
          email: 'demo@simulator.diyaccounting.co.uk',
          name: 'Demo User',
          given_name: 'Demo'
        };
        localStorage.setItem('userInfo', JSON.stringify(demoUser));
        localStorage.setItem('cognitoIdToken', 'simulator-demo-token');
        localStorage.setItem('cognitoAccessToken', 'simulator-demo-access-token');

        // Set HMRC token in sessionStorage
        sessionStorage.setItem('hmrcAccessToken', 'simulator-hmrc-token');
        sessionStorage.setItem('hmrcAccount', 'sandbox');
      }
    })();
  </script>
`;

  // Insert simulator script before closing </body>
  content = content.replace(/<\/body>/i, simulatorScript + "</body>");

  fs.writeFileSync(filePath, content, "utf-8");
}

/**
 * Transform CSS file with simulator styles
 */
function transformCssFile(filePath) {
  let content = fs.readFileSync(filePath, "utf-8");

  // Check if simulator styles already exist
  if (content.includes(".simulator-banner")) {
    console.log(`  Skipping ${path.basename(filePath)} - simulator styles already present`);
    return;
  }

  // Append simulator-specific CSS
  const simulatorCss = `

/* ============================================
   Simulator Mode Styles
   Injected by build-simulator.js
   ============================================ */

/* Simulator banner - always visible at top */
.simulator-banner {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  background: linear-gradient(90deg, #ff6b6b 0%, #ff8e8e 50%, #ff6b6b 100%);
  color: white;
  text-align: center;
  padding: 10px 16px;
  font-weight: bold;
  z-index: 10000;
  font-size: 14px;
  box-shadow: 0 2px 8px rgba(255, 107, 107, 0.4);
  letter-spacing: 0.5px;
}

/* Offset body content to account for fixed banner */
html[data-simulator="true"] body {
  padding-top: 44px !important;
}

/* Visual indicator on buttons - show "(demo)" suffix */
html[data-simulator="true"] .btn::after,
html[data-simulator="true"] button[type="submit"]::after {
  content: " (demo)";
  font-size: 0.75em;
  opacity: 0.8;
  font-weight: normal;
}

/* Don't add suffix to navigation buttons or icon buttons */
html[data-simulator="true"] .journey-btn::after,
html[data-simulator="true"] .about-nav-link::after,
html[data-simulator="true"] .main-nav a::after,
html[data-simulator="true"] .login-link::after,
html[data-simulator="true"] button.status-close-button::after,
html[data-simulator="true"] button[aria-label]::after {
  content: none;
}

/* Highlight animation for guided journeys */
.simulator-highlight {
  outline: 3px solid #ff6b6b !important;
  outline-offset: 2px;
  animation: pulse-highlight 1s ease-in-out infinite;
  position: relative;
  z-index: 1000;
}

@keyframes pulse-highlight {
  0%, 100% {
    outline-color: #ff6b6b;
    box-shadow: 0 0 10px rgba(255, 107, 107, 0.5);
  }
  50% {
    outline-color: #ff9999;
    box-shadow: 0 0 20px rgba(255, 107, 107, 0.8);
  }
}

/* Simulator notice styling */
.simulator-notice {
  background: #fff3cd;
  border: 1px solid #ffc107;
  border-radius: 4px;
  padding: 16px;
  margin-bottom: 20px;
}
`;

  content += simulatorCss;
  fs.writeFileSync(filePath, content, "utf-8");
}

/**
 * Main build function
 */
function buildSimulator() {
  console.log("Building simulator static files...");
  console.log(`  Source: ${sourceDir}`);
  console.log(`  Target: ${targetDir}`);

  // Clean target directory
  if (fs.existsSync(targetDir)) {
    console.log("  Cleaning existing target directory...");
    fs.rmSync(targetDir, { recursive: true });
  }

  // Copy all files
  console.log("  Copying files...");
  copyDirSync(sourceDir, targetDir);

  // Find and transform HTML files
  console.log("  Transforming HTML files...");
  const htmlFiles = findFiles(targetDir, ".html");
  for (const htmlFile of htmlFiles) {
    console.log(`    Processing ${path.relative(targetDir, htmlFile)}`);
    transformHtmlFile(htmlFile);
  }

  // Transform CSS files
  console.log("  Transforming CSS files...");
  const cssFiles = findFiles(targetDir, ".css");
  for (const cssFile of cssFiles) {
    console.log(`    Processing ${path.relative(targetDir, cssFile)}`);
    transformCssFile(cssFile);
  }

  // Create robots.txt
  console.log("  Creating robots.txt...");
  fs.writeFileSync(path.join(targetDir, "robots.txt"), ROBOTS_TXT, "utf-8");

  console.log("Simulator build complete!");
  console.log(`  Total HTML files: ${htmlFiles.length}`);
  console.log(`  Total CSS files: ${cssFiles.length}`);
}

/**
 * Recursively find files by extension
 */
function findFiles(dir, extension) {
  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findFiles(fullPath, extension));
    } else if (entry.name.endsWith(extension)) {
      results.push(fullPath);
    }
  }

  return results;
}

// Run build
buildSimulator();
