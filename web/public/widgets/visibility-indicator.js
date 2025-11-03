/* eslint-env browser */
/**
 * Visibility Indicator Widget
 *
 * Shows the current page's status with respect to intended entitlement:
 * - "Public" - Page is publicly accessible
 * - "Needs login" - Page requires authentication (with link to login)
 * - "Needs activity" - Page requires bundle grant (with link to bundles)
 * - "Activity available" - User has required bundles
 */
(function () {
  // Parse user bundles from localStorage
  function parseUserBundles() {
    try {
      const raw = localStorage.getItem("userBundles");
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }

  // Check if user has a specific bundle
  function hasBundle(bundles, id) {
    return bundles.some((b) => typeof b === "string" && (b === id || b.startsWith(id + "|")));
  }

  // Get active bundles (automatic + granted)
  function getActiveBundles(catalog, userBundles) {
    const active = new Set();

    // Add automatic bundles
    if (catalog?.bundles) {
      for (const bundle of catalog.bundles) {
        if (bundle.allocation === "automatic") {
          active.add(bundle.id);
        }
      }
    }

    // Add granted bundles from localStorage
    for (const bundleEntry of userBundles) {
      const bundleId = bundleEntry.split("|")[0]; // Remove expiry info
      active.add(bundleId);
    }

    return Array.from(active);
  }

  // Check if user is logged in
  function isLoggedIn() {
    return !!localStorage.getItem("cognitoIdToken");
  }

  // Get current page path relative to public directory
  function getCurrentPagePath() {
    const pathname = window.location.pathname;
    // Remove leading slash and get relative path
    // e.g., "/activities/submitVat.html" -> "activities/submitVat.html"
    // e.g., "/index.html" -> "index.html"
    const parts = pathname.split("/").filter((p) => p);
    if (parts.length === 0) return "index.html";
    // Get last 2 parts for nested paths, or just the filename
    if (parts.length >= 2) {
      return parts.slice(-2).join("/");
    }
    return parts[parts.length - 1];
  }

  // Get base path for links (to handle different directory levels)
  function getBasePath() {
    const pathname = window.location.pathname;
    const parts = pathname.split("/").filter((p) => p);
    
    // Determine depth: count parent directories needed
    // e.g., "/index.html" -> "./"
    // e.g., "/account/bundles.html" -> "../"
    // e.g., "/activities/submitVat.html" -> "../"
    if (parts.length <= 1) {
      return "./";
    }
    return "../";
  }

  // Find activity matching current page
  function findActivityForPage(catalog, currentPath) {
    if (!catalog?.activities) return null;

    return catalog.activities.find((activity) => {
      const paths = activity.paths || (activity.path ? [activity.path] : []);
      return paths.some((path) => {
        // Handle regex paths (starting with ^)
        if (path.startsWith("^")) {
          try {
            const regex = new RegExp(path);
            return regex.test(currentPath) || regex.test("/" + currentPath);
          } catch {
            return false;
          }
        }
        // Exact match
        return path === currentPath;
      });
    });
  }

  // Check if user can access an activity
  function canAccessActivity(activity, activeBundles) {
    if (!activity?.bundles || !Array.isArray(activity.bundles)) return false;
    return activity.bundles.some((bundleId) => activeBundles.includes(bundleId));
  }

  // Determine visibility status for current page
  async function determineVisibilityStatus() {
    try {
      // Fetch catalog
      const response = await fetch("/api/v1/catalog");
      if (!response.ok) {
        return { status: "error", message: "Unable to load catalog" };
      }

      const catalog = await response.json();
      const currentPath = getCurrentPagePath();
      const activity = findActivityForPage(catalog, currentPath);
      const basePath = getBasePath();

      // If no activity found, page is public
      if (!activity) {
        return { status: "public", message: "Public", link: null };
      }

      // Check authentication
      const loggedIn = isLoggedIn();
      if (!loggedIn) {
        return {
          status: "needs-login",
          message: "Needs login",
          link: `${basePath}auth/login.html`,
          linkText: "Log in",
        };
      }

      // Check bundles
      const userBundles = parseUserBundles();
      const activeBundles = getActiveBundles(catalog, userBundles);
      const hasAccess = canAccessActivity(activity, activeBundles);

      if (hasAccess) {
        return {
          status: "activity-available",
          message: "Activity available",
          link: null,
        };
      } else {
        return {
          status: "needs-activity",
          message: "Needs activity",
          link: `${basePath}account/bundles.html`,
          linkText: "Request bundles",
        };
      }
    } catch (error) {
      console.error("Error determining visibility status:", error);
      return { status: "error", message: "Status unknown" };
    }
  }

  // Create and render the visibility indicator
  async function renderVisibilityIndicator() {
    const container = document.getElementById("visibilityIndicator");
    if (!container) return;

    const status = await determineVisibilityStatus();

    // Create indicator HTML
    let statusClass = "";
    let statusIcon = "";

    switch (status.status) {
      case "public":
        statusClass = "visibility-public";
        statusIcon = "🌐";
        break;
      case "needs-login":
        statusClass = "visibility-needs-login";
        statusIcon = "🔒";
        break;
      case "needs-activity":
        statusClass = "visibility-needs-activity";
        statusIcon = "🔐";
        break;
      case "activity-available":
        statusClass = "visibility-available";
        statusIcon = "✓";
        break;
      default:
        statusClass = "visibility-error";
        statusIcon = "?";
    }

    // Build HTML
    let html = `<span class="visibility-status ${statusClass}">`;
    html += `<span class="visibility-icon">${statusIcon}</span>`;

    if (status.link) {
      html += `<a href="${status.link}" class="visibility-link">${status.message}</a>`;
    } else {
      html += `<span class="visibility-text">${status.message}</span>`;
    }

    html += `</span>`;

    container.innerHTML = html;
  }

  // Initialize visibility indicator
  function initializeVisibilityIndicator() {
    renderVisibilityIndicator();

    // Re-render when localStorage changes (e.g., after login or bundle request)
    window.addEventListener("storage", renderVisibilityIndicator);

    // Also listen for custom events that might trigger status changes
    window.addEventListener("auth-status-changed", renderVisibilityIndicator);
    window.addEventListener("bundles-changed", renderVisibilityIndicator);
  }

  // Expose functions globally for manual refresh if needed
  if (typeof window !== "undefined") {
    window.VisibilityIndicator = {
      render: renderVisibilityIndicator,
      initialize: initializeVisibilityIndicator,
    };
  }

  // Auto-initialize if DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeVisibilityIndicator);
  } else {
    initializeVisibilityIndicator();
  }
})();
