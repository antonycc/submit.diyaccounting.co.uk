// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd
//
// Developer Mode Toggle Script
// Provides a global developer mode toggle that persists in sessionStorage.
// The toggle icon only appears if the user has the "test" bundle.
// When enabled:
// - Adds 'developer-mode' class to <body>
// - Shows header dev info (traceparent, x-request-id, entitlement) with terminal styling
// - Shows footer dev links (tests, api) with terminal styling
// - Shows developer sections on forms (test scenarios, validation options)
//
(function () {
  const KEY = "showDeveloperOptions";

  // Read current state
  const isEnabled = () => sessionStorage.getItem(KEY) === "true";

  // Check if user has the test bundle
  async function userHasTestBundle() {
    try {
      const idToken = localStorage.getItem("cognitoIdToken");
      if (!idToken) return false;

      const response = await fetch("/api/v1/bundle", {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      if (!response.ok) return false;

      const data = await response.json();
      const bundles = Array.isArray(data?.bundles) ? data.bundles : [];
      return bundles.some((b) => (b?.bundleId || b) === "test" || String(b).startsWith("test|"));
    } catch (e) {
      console.warn("Failed to check test bundle for developer mode:", e);
      return false;
    }
  }

  // Copy icon SVG
  const copyIconSvg = `<svg class="dev-copy-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
  </svg>`;

  // Copy to clipboard helper
  function copyToClipboard(text, element) {
    navigator.clipboard?.writeText?.(text).then(() => {
      const original = element.style.color;
      element.style.color = "#00ff00";
      setTimeout(() => { element.style.color = original; }, 200);
    }).catch(err => console.warn("Copy failed:", err));
  }

  // Get deployment name from meta tag or URL
  function getDeploymentName() {
    const hostname = window.location.hostname;
    if (hostname.includes("ci.")) return "ci";
    if (hostname.includes("prod.") || hostname === "submit.diyaccounting.co.uk") return "prod";
    if (hostname.includes("localhost") || hostname.includes("127.0.0.1")) return "local";
    // Try to extract from subdomain pattern like ci-branchname.submit...
    const match = hostname.match(/^([^.]+)\./);
    return match ? match[1] : hostname;
  }

  // Create or update dev float elements
  function createDevFloats() {
    const body = document.body;

    // DateTime float
    let datetimeEl = document.getElementById("dev-datetime");
    if (!datetimeEl) {
      datetimeEl = document.createElement("div");
      datetimeEl.id = "dev-datetime";
      datetimeEl.className = "dev-float-left";
      body.appendChild(datetimeEl);
    }
    const now = new Date();
    datetimeEl.textContent = now.toLocaleString();

    // Deployment float
    let deploymentEl = document.getElementById("dev-deployment");
    if (!deploymentEl) {
      deploymentEl = document.createElement("div");
      deploymentEl.id = "dev-deployment";
      deploymentEl.className = "dev-float-left";
      deploymentEl.style.cursor = "pointer";
      body.appendChild(deploymentEl);
    }
    const deployment = getDeploymentName();
    deploymentEl.innerHTML = `deploy: ${deployment} ${copyIconSvg}`;
    deploymentEl.onclick = () => copyToClipboard(deployment, deploymentEl);

    // Traceparent float
    let traceparentEl = document.getElementById("dev-traceparent");
    if (!traceparentEl) {
      traceparentEl = document.createElement("div");
      traceparentEl.id = "dev-traceparent";
      traceparentEl.className = "dev-float-left";
      traceparentEl.style.cursor = "pointer";
      body.appendChild(traceparentEl);
    }
    const traceparent = sessionStorage.getItem("traceparent") ||
      (window.__correlation?.getTraceparent?.()) || "-";
    const tpShort = traceparent.length > 20 ? traceparent.substring(0, 20) + "..." : traceparent;
    traceparentEl.innerHTML = `trace: ${tpShort} ${copyIconSvg}`;
    traceparentEl.title = traceparent;
    traceparentEl.onclick = () => copyToClipboard(traceparent, traceparentEl);

    // Request ID float
    let requestIdEl = document.getElementById("dev-requestid");
    if (!requestIdEl) {
      requestIdEl = document.createElement("div");
      requestIdEl.id = "dev-requestid";
      requestIdEl.className = "dev-float-left";
      requestIdEl.style.cursor = "pointer";
      body.appendChild(requestIdEl);
    }
    const requestId = (window.__correlation?.getLastXRequestId?.()) ||
      (window.getLastXRequestId?.()) || "-";
    const ridShort = requestId.length > 20 ? requestId.substring(0, 20) + "..." : requestId;
    requestIdEl.innerHTML = `req-id: ${ridShort} ${copyIconSvg}`;
    requestIdEl.title = requestId;
    requestIdEl.onclick = () => copyToClipboard(requestId, requestIdEl);

    // Update request ID on correlation changes
    window.addEventListener("correlation:update", () => {
      const rid = (window.__correlation?.getLastXRequestId?.()) ||
        (window.getLastXRequestId?.()) || "-";
      const short = rid.length > 20 ? rid.substring(0, 20) + "..." : rid;
      requestIdEl.innerHTML = `req-id: ${short} ${copyIconSvg}`;
      requestIdEl.title = rid;
      requestIdEl.onclick = () => copyToClipboard(rid, requestIdEl);
    });
  }

  // Remove dev float elements
  function removeDevFloats() {
    ["dev-datetime", "dev-deployment", "dev-traceparent", "dev-requestid"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.remove();
    });
  }

  // Apply state to body class, icon, and dev elements visibility
  function applyState() {
    const enabled = isEnabled();
    document.body.classList.toggle("developer-mode", enabled);

    const icon = document.querySelector(".developer-mode-toggle");
    if (icon) {
      // When enabled: coloured wrench, when off: greyed out
      const wrench = icon.querySelector("svg path");
      if (wrench) {
        wrench.style.fill = enabled ? "#e67e22" : "#888";
      }
      // Add subtle glow when enabled
      icon.style.filter = enabled ? "drop-shadow(0 0 4px rgba(230, 126, 34, 0.6))" : "";
    }

    // Create or remove dev floats
    if (enabled) {
      createDevFloats();
    } else {
      removeDevFloats();
    }

    // Toggle visibility of entitlement status
    const entitlementStatus = document.querySelector(".entitlement-status");
    if (entitlementStatus) entitlementStatus.style.display = enabled ? "block" : "none";

    // Toggle visibility of footer dev links
    const viewSourceLink = document.getElementById("viewSourceLink");
    const testsLink = document.getElementById("latestTestsLink");
    const apiDocsLink = document.getElementById("apiDocsLink");
    const localStorageContainer = document.getElementById("localstorageContainer");
    if (viewSourceLink) viewSourceLink.style.display = enabled ? "block" : "none";
    if (testsLink) testsLink.style.display = enabled ? "block" : "none";
    if (apiDocsLink) apiDocsLink.style.display = enabled ? "block" : "none";
    if (localStorageContainer) localStorageContainer.style.display = enabled ? "block" : "none";

    // Dispatch event for page-specific handlers (e.g., show/hide form developer sections)
    window.dispatchEvent(new CustomEvent("developer-mode-changed", { detail: { enabled } }));
  }

  // Inject toggle icon into header-left (only if user has test bundle)
  async function injectToggle() {
    const headerLeft = document.querySelector(".header-left");
    if (!headerLeft) return;

    // Don't inject twice
    if (headerLeft.querySelector(".developer-mode-toggle")) return;

    // Only show icon if user has test bundle
    const hasTestBundle = await userHasTestBundle();
    if (!hasTestBundle) return;

    const toggle = document.createElement("a");
    toggle.href = "#";
    toggle.title = "Toggle Developer Mode";
    toggle.className = "developer-mode-toggle";
    // Wrench icon - works well at small sizes
    toggle.innerHTML = `
      <svg class="developer-icon" viewBox="0 0 24 24" aria-hidden="true" style="width:20px;height:20px;">
        <path d="M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.7C.4 7.1.9 10.1 2.9 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1.1.1-1.4z" fill="#888"/>
      </svg>
    `;

    toggle.addEventListener("click", (e) => {
      e.preventDefault();
      sessionStorage.setItem(KEY, isEnabled() ? "" : "true");
      applyState();
    });

    headerLeft.appendChild(toggle);
    applyState();
  }

  // Inject CSS for terminal overlay styling
  function injectStyles() {
    if (document.getElementById("developer-mode-styles")) return;

    const style = document.createElement("style");
    style.id = "developer-mode-styles";
    style.textContent = `
      /* Developer Mode Toggle Icon Styling */
      .developer-mode-toggle {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 4px;
        margin-left: 8px;
        text-decoration: none;
        transition: transform 0.3s ease;
      }

      .developer-mode-toggle:hover {
        filter: drop-shadow(0 0 6px rgba(241, 196, 15, 0.8)) !important;
      }

      .developer-icon {
        width: 24px;
        height: 24px;
      }

      /* ================================================================
         TERMINAL OVERLAY STYLING
         Inspired by Homebrew Mac Terminal / Alien movie CRT aesthetics
         Applied when body.developer-mode is set
         ================================================================ */

      /* Hide developer controls button when using global toggle */
      body.developer-mode .developer-controls {
        display: none;
      }

      /* ================================================================
         TERMINAL SIDEBAR - LEFT SIDE
         All dev info positioned vertically on the left
         ================================================================ */

      /* Base styling for all left-side dev floats */
      .dev-float-left {
        position: fixed;
        left: 0;
        background: rgba(0, 15, 0, 0.5);
        border: 1px solid rgba(0, 255, 0, 0.4);
        border-left: none;
        border-radius: 0 4px 4px 0;
        padding: 4px 12px;
        font-family: "Courier New", Consolas, Monaco, monospace;
        color: #00ff00 !important;
        text-shadow: 0 0 3px rgba(0, 255, 0, 0.5);
        font-size: 0.7em;
        z-index: 1000;
      }

      .dev-float-left:hover {
        background: rgba(0, 30, 0, 0.6);
        border-color: #00ff00;
        box-shadow: 0 0 8px rgba(0, 255, 0, 0.4);
      }

      /* Copy icon styling */
      .dev-copy-icon {
        cursor: pointer;
        margin-left: 6px;
        opacity: 0.7;
        transition: opacity 0.2s;
      }

      .dev-copy-icon:hover {
        opacity: 1;
      }

      /* Individual float positions */
      body.developer-mode #dev-datetime { top: 80px; }
      body.developer-mode #dev-deployment { top: 110px; }
      body.developer-mode #dev-traceparent { top: 140px; }
      body.developer-mode #dev-requestid { top: 170px; }
      body.developer-mode .entitlement-status { top: 200px; }
      body.developer-mode #latestTestsLink { top: 230px; }
      body.developer-mode #apiDocsLink { top: 260px; }
      body.developer-mode #viewSourceLink { top: 290px; }
      body.developer-mode #localstorageContainer { top: 320px; }

      /* Hide the old combined correlationWidget - we use separate floats now */
      body.developer-mode #correlationWidget {
        display: none !important;
      }

      /* Entitlement status styling */
      body.developer-mode .entitlement-status {
        position: fixed;
        left: 0;
        background: rgba(0, 15, 0, 0.5);
        border: 1px solid rgba(0, 255, 0, 0.4);
        border-left: none;
        border-radius: 0 4px 4px 0;
        padding: 4px 12px;
        font-family: "Courier New", Consolas, Monaco, monospace;
        color: #00ff00 !important;
        text-shadow: 0 0 3px rgba(0, 255, 0, 0.5);
        font-size: 0.7em;
        z-index: 1000;
      }

      /* Footer dev links */
      body.developer-mode #latestTestsLink,
      body.developer-mode #apiDocsLink,
      body.developer-mode #viewSourceLink {
        position: fixed;
        left: 0;
        background: rgba(0, 15, 0, 0.5);
        border: 1px solid rgba(0, 255, 0, 0.4);
        border-left: none;
        border-radius: 0 4px 4px 0;
        padding: 4px 12px;
        font-family: "Courier New", Consolas, Monaco, monospace;
        color: #00ff00 !important;
        text-shadow: 0 0 3px rgba(0, 255, 0, 0.5);
        text-decoration: none;
        font-size: 0.7em;
        z-index: 1000;
        display: block !important;
      }

      body.developer-mode #latestTestsLink:hover,
      body.developer-mode #apiDocsLink:hover,
      body.developer-mode #viewSourceLink:hover {
        background: rgba(0, 30, 0, 0.6);
        border-color: #00ff00;
        box-shadow: 0 0 8px rgba(0, 255, 0, 0.4);
      }

      /* Storage button */
      body.developer-mode #localstorageContainer {
        position: fixed;
        left: 0;
        background: rgba(0, 15, 0, 0.5);
        border: 1px solid rgba(0, 255, 0, 0.4);
        border-left: none;
        border-radius: 0 4px 4px 0;
        padding: 0;
        z-index: 1000;
      }

      body.developer-mode #localstorageContainer #lsv-button {
        position: static !important;
        background: transparent !important;
        border: none !important;
        box-shadow: none !important;
        color: #00ff00 !important;
        font-family: "Courier New", Consolas, Monaco, monospace !important;
        font-size: 0.7em !important;
        padding: 4px 12px !important;
        text-shadow: 0 0 3px rgba(0, 255, 0, 0.5);
      }

      body.developer-mode #localstorageContainer #lsv-button:hover {
        background: rgba(0, 30, 0, 0.6) !important;
      }

      body.developer-mode #localstorageContainer #lsv-button svg {
        stroke: #00ff00 !important;
      }

      body.developer-mode #localstorageContainer #lsv-button span {
        color: #00ff00 !important;
      }

      /* ================================================================
         TERMINAL STYLING FOR LOCALSTORAGE MODAL
         Homebrew terminal aesthetic for the storage viewer dialog
         ================================================================ */
      body.developer-mode #lsv-overlay > div {
        background: rgba(0, 15, 0, 0.95) !important;
        border: 1px solid rgba(0, 255, 0, 0.4) !important;
        box-shadow: 0 0 20px rgba(0, 255, 0, 0.3), 0 10px 40px rgba(0, 0, 0, 0.5) !important;
      }

      body.developer-mode #lsv-overlay > div > div:first-child {
        border-bottom-color: rgba(0, 255, 0, 0.3) !important;
        background: linear-gradient(180deg, rgba(0, 40, 0, 0.9) 0%, rgba(0, 20, 0, 0.9) 100%) !important;
      }

      body.developer-mode #lsv-overlay > div > div:first-child > div:first-child {
        color: #00ff00 !important;
        font-family: "Courier New", Consolas, Monaco, monospace !important;
        text-shadow: 0 0 5px rgba(0, 255, 0, 0.5);
        letter-spacing: 1px;
        text-transform: uppercase;
        font-size: 11px !important;
      }

      body.developer-mode #lsv-overlay button[aria-label="Empty localStorage"] {
        background: transparent !important;
        border-color: #ff4444 !important;
        color: #ff4444 !important;
        font-family: "Courier New", Consolas, Monaco, monospace !important;
      }

      body.developer-mode #lsv-overlay button[aria-label="Empty localStorage"]:hover {
        background: rgba(255, 68, 68, 0.2) !important;
      }

      body.developer-mode #lsv-overlay button[aria-label="Close"] {
        color: #00ff00 !important;
        text-shadow: 0 0 5px rgba(0, 255, 0, 0.5);
      }

      body.developer-mode #lsv-overlay #lsv-pre {
        background: rgba(0, 10, 0, 0.8) !important;
        border-color: rgba(0, 255, 0, 0.3) !important;
        color: #00ff00 !important;
        font-family: "Courier New", Consolas, Monaco, monospace !important;
        text-shadow: 0 0 2px rgba(0, 255, 0, 0.3);
      }

      /* ================================================================
         TERMINAL STYLING FOR FORM DEVELOPER SECTIONS
         Applied to #developerSection on forms
         ================================================================ */
      body.developer-mode #developerSection {
        position: relative;
        display: block !important;
        background: rgba(0, 15, 0, 0.92);
        border: 1px solid rgba(0, 255, 0, 0.3);
        border-radius: 6px;
        padding: 20px;
        margin: 20px 0;
        font-family: "Courier New", Consolas, Monaco, monospace;
        color: #00ff00;
        box-shadow:
          0 0 10px rgba(0, 255, 0, 0.2),
          inset 0 0 60px rgba(0, 20, 0, 0.3);
        overflow: hidden;
      }

      /* CRT scanline effect */
      body.developer-mode #developerSection::before {
        content: "";
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: repeating-linear-gradient(
          0deg,
          transparent,
          transparent 2px,
          rgba(0, 0, 0, 0.15) 2px,
          rgba(0, 0, 0, 0.15) 4px
        );
        pointer-events: none;
        z-index: 1;
      }

      /* Terminal header bar (decorative) */
      body.developer-mode #developerSection::after {
        content: "DEVELOPER TERMINAL";
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        background: linear-gradient(180deg, rgba(0, 40, 0, 0.9) 0%, rgba(0, 20, 0, 0.9) 100%);
        border-bottom: 1px solid rgba(0, 255, 0, 0.3);
        padding: 4px 12px;
        font-size: 10px;
        letter-spacing: 2px;
        color: rgba(0, 255, 0, 0.7);
        text-transform: uppercase;
      }

      /* Adjust content to account for terminal header */
      body.developer-mode #developerSection > * {
        position: relative;
        z-index: 2;
        margin-top: 24px;
      }

      body.developer-mode #developerSection > *:first-child {
        margin-top: 28px;
      }

      /* Terminal text styling */
      body.developer-mode #developerSection label {
        color: #00ff00;
        font-weight: bold;
        text-shadow: 0 0 5px rgba(0, 255, 0, 0.5);
      }

      body.developer-mode #developerSection .hint {
        color: rgba(0, 200, 0, 0.8);
        font-style: normal;
      }

      /* Terminal form controls */
      body.developer-mode #developerSection select,
      body.developer-mode #developerSection input[type="checkbox"] {
        background: rgba(0, 30, 0, 0.8);
        border: 1px solid rgba(0, 255, 0, 0.4);
        color: #00ff00;
        font-family: "Courier New", Consolas, Monaco, monospace;
      }

      body.developer-mode #developerSection select:focus {
        outline: none;
        border-color: #00ff00;
        box-shadow: 0 0 8px rgba(0, 255, 0, 0.4);
      }

      body.developer-mode #developerSection select option {
        background: #001a00;
        color: #00ff00;
      }

      /* Checkbox custom styling in terminal */
      body.developer-mode #developerSection input[type="checkbox"] {
        width: 16px;
        height: 16px;
        accent-color: #00ff00;
      }

      /* Pulsing cursor/glow effect for active state */
      @keyframes terminalGlow {
        0%, 100% { box-shadow: 0 0 10px rgba(0, 255, 0, 0.2), inset 0 0 60px rgba(0, 20, 0, 0.3); }
        50% { box-shadow: 0 0 15px rgba(0, 255, 0, 0.3), inset 0 0 60px rgba(0, 20, 0, 0.3); }
      }

      body.developer-mode #developerSection:hover {
        animation: terminalGlow 2s ease-in-out infinite;
      }

      /* Sandbox obligations option - nested terminal styling */
      body.developer-mode #sandboxObligationsOption {
        display: block;
        margin-top: 10px;
        padding: 8px;
        background: rgba(0, 10, 0, 0.5);
        border-left: 2px solid rgba(0, 255, 0, 0.3);
      }
    `;
    document.head.appendChild(style);
  }

  // Re-check test bundle and inject/remove icon as needed
  async function refreshToggleVisibility() {
    const headerLeft = document.querySelector(".header-left");
    if (!headerLeft) return;

    const existingToggle = headerLeft.querySelector(".developer-mode-toggle");
    const hasTestBundle = await userHasTestBundle();

    if (hasTestBundle && !existingToggle) {
      // User now has test bundle, inject the icon
      await injectToggle();
    } else if (!hasTestBundle && existingToggle) {
      // User no longer has test bundle, remove the icon
      existingToggle.remove();
      // Also disable developer mode
      sessionStorage.setItem(KEY, "");
      applyState();
    }
  }

  // Run on DOMContentLoaded or immediately if already loaded
  function init() {
    injectStyles();
    injectToggle();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    // DOM is already ready (interactive or complete)
    init();
  }

  // Listen for bundle changes and refresh toggle visibility
  window.addEventListener("bundle-changed", refreshToggleVisibility);
  window.addEventListener("storage", (e) => {
    if (e.key === "cognitoIdToken" || e.key === "userInfo") {
      refreshToggleVisibility();
    }
  });
})();
