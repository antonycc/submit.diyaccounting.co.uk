/* eslint-env browser */
/**
 * Visibility Indicator Widget
 * Shows the page's status with respect to intended entitlement based on catalog and bundles
 */
(function () {
  // Cache for catalog and bundles to avoid multiple API calls
  let catalogCache = null;
  let bundlesCache = null;
  let catalogPromise = null;
  let bundlesPromise = null;

  /**
   * Fetch catalog with caching
   */
  async function getCatalog() {
    if (catalogCache) {
      return catalogCache;
    }
    if (catalogPromise) {
      return catalogPromise;
    }
    catalogPromise = (async () => {
      try {
        const response = await fetch("/api/v1/catalog");
        if (response.ok) {
          catalogCache = await response.json();
          return catalogCache;
        }
      } catch (error) {
        console.warn("Failed to fetch catalog:", error);
      }
      return null;
    })();
    return catalogPromise;
  }

  /**
   * Fetch bundles with caching
   * Uses localStorage cache if available, otherwise fetches from API
   */
  async function getBundles() {
    if (bundlesCache) {
      return bundlesCache;
    }
    if (bundlesPromise) {
      return bundlesPromise;
    }
    bundlesPromise = (async () => {
      // Try localStorage first
      try {
        const cached = localStorage.getItem("userBundles");
        if (cached) {
          const parsedBundles = JSON.parse(cached);
          if (Array.isArray(parsedBundles)) {
            bundlesCache = parsedBundles;
            return bundlesCache;
          }
        }
      } catch (err) {
        console.warn("Failed to parse cached bundles:", err);
      }

      // Fetch from API if user is authenticated
      const idToken = localStorage.getItem("cognitoIdToken");
      if (idToken) {
        try {
          const response = await fetch("/api/v1/bundle", {
            headers: {
              Authorization: `Bearer ${idToken}`,
            },
          });
          if (response.ok) {
            const data = await response.json();
            if (data.bundles && Array.isArray(data.bundles)) {
              // Store in localStorage for future use
              const bundleStrings = data.bundles.map((b) => {
                return b.expiry ? `${b.bundleId}|EXPIRY=${b.expiry}` : b.bundleId;
              });
              localStorage.setItem("userBundles", JSON.stringify(bundleStrings));
              bundlesCache = bundleStrings;
              return bundlesCache;
            }
          }
        } catch (error) {
          console.warn("Failed to fetch bundles from API:", error);
        }
      }

      // Return empty array if no bundles available
      bundlesCache = [];
      return bundlesCache;
    })();
    return bundlesPromise;
  }

  /**
   * Get active bundles (automatic + granted)
   */
  function getActiveBundles(catalog, userBundles) {
    const active = new Set();

    // Add automatic bundles from catalog
    if (catalog && catalog.bundles) {
      for (const bundle of catalog.bundles) {
        if (bundle.allocation === "automatic") {
          active.add(bundle.id);
        }
      }
    }

    // Add granted bundles from user
    for (const bundleEntry of userBundles) {
      const bundleId = bundleEntry.split("|")[0]; // Remove expiry info if present
      active.add(bundleId);
    }

    return Array.from(active);
  }

  /**
   * Get current page path relative to web/public
   */
  function getCurrentPagePath() {
    const pathname = window.location.pathname;
    // Remove leading slash and normalize
    return pathname.replace(/^\//, "");
  }

  /**
   * Check if a path pattern matches the current page
   */
  function pathMatches(pattern, currentPath) {
    // If pattern starts with ^, it's a regex pattern for API paths - skip for web pages
    if (pattern.startsWith("^")) {
      return false;
    }

    // Normalize both paths for comparison
    const normalizedPattern = pattern.replace(/^\//, "");
    const normalizedCurrent = currentPath.replace(/^\//, "");

    return normalizedPattern === normalizedCurrent;
  }

  /**
   * Find activity that matches the current page
   */
  function findActivityForPage(catalog, currentPath) {
    if (!catalog || !catalog.activities) {
      return null;
    }

    for (const activity of catalog.activities) {
      // Check both 'path' and 'paths' properties
      if (activity.path && pathMatches(activity.path, currentPath)) {
        return activity;
      }
      if (activity.paths && Array.isArray(activity.paths)) {
        for (const path of activity.paths) {
          if (pathMatches(path, currentPath)) {
            return activity;
          }
        }
      }
    }

    return null;
  }

  /**
   * Determine visibility status for the current page
   */
  async function determineVisibilityStatus() {
    const catalog = await getCatalog();
    const userBundles = await getBundles();
    const currentPath = getCurrentPagePath();
    const isLoggedIn = !!localStorage.getItem("cognitoIdToken");

    // Find the activity that matches this page
    const activity = findActivityForPage(catalog, currentPath);

    if (!activity) {
      // Page not in catalog - public access
      return { status: "public", activity: null };
    }

    const activeBundles = getActiveBundles(catalog, userBundles);
    const requiredBundles = activity.bundles || [];

    // Check if user has any of the required bundles
    const hasAccess = requiredBundles.some((bundleId) => activeBundles.includes(bundleId));

    if (hasAccess) {
      return { status: "activity-available", activity, requiredBundles };
    } else if (isLoggedIn) {
      return { status: "needs-activity", activity, requiredBundles };
    } else {
      return { status: "needs-login", activity, requiredBundles };
    }
  }

  /**
   * Create and render the visibility indicator
   */
  async function renderVisibilityIndicator() {
    // Find the footer
    const footer = document.querySelector("footer .footer-content");
    if (!footer) {
      console.warn("Footer not found, cannot render visibility indicator");
      return;
    }

    // Check if indicator already exists
    let indicatorContainer = document.getElementById("visibility-indicator");
    if (!indicatorContainer) {
      // Create indicator container
      indicatorContainer = document.createElement("div");
      indicatorContainer.id = "visibility-indicator";
      indicatorContainer.className = "footer-right";
      indicatorContainer.style.cssText = "flex: 1; text-align: right; font-size: 0.85em;";
      footer.appendChild(indicatorContainer);
    }

    try {
      const result = await determineVisibilityStatus();
      let html = "";
      let title = "";

      switch (result.status) {
        case "public":
          html = '<span style="color: #666;">🌐 Public</span>';
          title = "This page is publicly accessible";
          break;
        case "needs-login":
          html = '<a href="/auth/login.html" style="color: #2c5aa0; text-decoration: none;">🔒 Needs login →</a>';
          title = "Login required to access this page";
          break;
        case "needs-activity":
          html = '<a href="/account/bundles.html" style="color: #ff8800; text-decoration: none;">📦 Needs activity →</a>';
          title = "Request bundles to access this page";
          break;
        case "activity-available":
          html = '<span style="color: #28a745;">✓ Activity available</span>';
          title = "You have access to this page";
          break;
        default:
          html = '<span style="color: #666;">❓ Unknown</span>';
          title = "Status unknown";
      }

      indicatorContainer.innerHTML = html;
      indicatorContainer.title = title;
    } catch (error) {
      console.error("Error rendering visibility indicator:", error);
      indicatorContainer.innerHTML = '<span style="color: #999;">—</span>';
      indicatorContainer.title = "Status unavailable";
    }
  }

  /**
   * Initialize the visibility indicator
   */
  function initializeVisibilityIndicator() {
    renderVisibilityIndicator();
  }

  // Expose functions globally
  if (typeof window !== "undefined") {
    window.VisibilityIndicator = {
      initialize: initializeVisibilityIndicator,
      render: renderVisibilityIndicator,
      determineStatus: determineVisibilityStatus,
      // Expose cache clearing for testing
      clearCache: () => {
        catalogCache = null;
        bundlesCache = null;
        catalogPromise = null;
        bundlesPromise = null;
      },
    };
  }

  // Auto-initialize if DOM is already loaded, otherwise wait for it
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeVisibilityIndicator);
  } else {
    // Delay slightly to ensure other widgets have initialized
    setTimeout(initializeVisibilityIndicator, 100);
  }

  // Re-render when auth state changes (cross-tab)
  window.addEventListener("storage", (e) => {
    if (e.key === "cognitoIdToken" || e.key === "userBundles") {
      // Clear cache and re-render
      catalogCache = null;
      bundlesCache = null;
      catalogPromise = null;
      bundlesPromise = null;
      renderVisibilityIndicator();
    }
  });
})();
