/* eslint-env browser */
// Visibility Indicator Widget
// Shows the page's access status based on catalog and user bundles

(function () {
  "use strict";

  // Cache for catalog and bundles to avoid multiple API calls on same page
  let catalogCache = null;
  let bundlesCache = null;
  const fetchPromises = { catalog: null, bundles: null };

  /**
   * Fetch catalog with caching
   * @returns {Promise<Object>} The catalog object
   */
  async function fetchCatalog() {
    if (catalogCache) {
      return catalogCache;
    }

    if (fetchPromises.catalog) {
      return fetchPromises.catalog;
    }

    fetchPromises.catalog = (async () => {
      try {
        const response = await fetch("/api/v1/catalog");
        if (response.ok) {
          catalogCache = await response.json();
          return catalogCache;
        }
      } catch (err) {
        console.warn("Failed to fetch catalog for visibility indicator:", err);
      }
      return null;
    })();

    return fetchPromises.catalog;
  }

  /**
   * Fetch user bundles with caching
   * @returns {Promise<Array<string>>} Array of bundle IDs the user has access to
   */
  async function fetchUserBundles() {
    if (bundlesCache) {
      return bundlesCache;
    }

    if (fetchPromises.bundles) {
      return fetchPromises.bundles;
    }

    const idToken = localStorage.getItem("cognitoIdToken");
    if (!idToken) {
      bundlesCache = [];
      return bundlesCache;
    }

    fetchPromises.bundles = (async () => {
      try {
        const response = await fetch("/api/v1/bundle", {
          headers: {
            Authorization: `Bearer ${idToken}`,
          },
        });

        if (response.ok) {
          const data = await response.json();
          if (data.bundles && Array.isArray(data.bundles)) {
            bundlesCache = data.bundles.map((b) => (typeof b === "string" ? b : b.bundleId));
            return bundlesCache;
          }
        }
      } catch (err) {
        console.warn("Failed to fetch bundles for visibility indicator:", err);
      }
      bundlesCache = [];
      return bundlesCache;
    })();

    return fetchPromises.bundles;
  }

  /**
   * Get automatic bundles from catalog (always available)
   * @param {Object} catalog - The catalog object
   * @returns {Array<string>} Array of automatic bundle IDs
   */
  function getAutomaticBundles(catalog) {
    if (!catalog?.bundles) return [];
    return catalog.bundles.filter((bundle) => bundle.allocation === "automatic").map((bundle) => bundle.id);
  }

  /**
   * Check if a path matches using regex
   * @param {string} pattern - Regex pattern
   * @param {string} normalizedPath - Normalized path to check
   * @returns {boolean} True if matches
   */
  function matchesRegexPattern(pattern, normalizedPath) {
    try {
      const regex = new RegExp(pattern);
      return regex.test(normalizedPath) || regex.test("/" + normalizedPath);
    } catch (err) {
      console.warn("Invalid regex pattern in catalog:", pattern, err);
      return false;
    }
  }

  /**
   * Check if a path matches using simple string comparison
   * @param {string} path - Path pattern
   * @param {string} normalizedPath - Normalized path to check
   * @returns {boolean} True if matches
   */
  function matchesSimplePath(path, normalizedPath) {
    const normalizedActivityPath = path.replace(/^\//, "");
    return normalizedPath === normalizedActivityPath || normalizedPath.endsWith("/" + normalizedActivityPath);
  }

  /**
   * Find activity that matches the current page path
   * @param {Object} catalog - The catalog object
   * @param {string} currentPath - Current page path
   * @returns {Object|null} Matching activity or null
   */
  function findMatchingActivity(catalog, currentPath) {
    if (!catalog?.activities) return null;

    // Normalize path - remove leading slash and query parameters
    const normalizedPath = currentPath.replace(/^\//, "").split("?")[0];

    for (const activity of catalog.activities) {
      // Check both 'path' and 'paths' properties
      const paths = activity.paths || (activity.path ? [activity.path] : []);

      for (const path of paths) {
        const isMatch = path.startsWith("^") ? matchesRegexPattern(path, normalizedPath) : matchesSimplePath(path, normalizedPath);

        if (isMatch) {
          return activity;
        }
      }
    }

    return null;
  }

  /**
   * Determine visibility status for current page
   * @returns {Promise<Object>} Status object with type and link
   */
  async function determineVisibilityStatus() {
    const currentPath = window.location.pathname;
    const isLoggedIn = !!localStorage.getItem("cognitoIdToken");

    // Fetch catalog and user bundles in parallel
    const [catalog, userBundles] = await Promise.all([fetchCatalog(), fetchUserBundles()]);

    if (!catalog) {
      return { type: "Public", link: null };
    }

    // Find matching activity
    const matchingActivity = findMatchingActivity(catalog, currentPath);

    // If no matching activity, page is public
    if (!matchingActivity) {
      return { type: "Public", link: null };
    }

    // Get all bundles user has access to (automatic + granted)
    const automaticBundles = getAutomaticBundles(catalog);
    const allUserBundles = [...new Set([...automaticBundles, ...userBundles])];

    // Check if user has any required bundle
    const requiredBundles = matchingActivity.bundles || [];
    const hasAccess = requiredBundles.some((bundleId) => allUserBundles.includes(bundleId));

    if (hasAccess) {
      return { type: "Activity available", link: null };
    }

    // User doesn't have access
    if (!isLoggedIn) {
      return { type: "Needs login", link: "/auth/login.html" };
    }

    // Logged in but needs to request bundles
    return { type: "Needs activity", link: "/account/bundles.html" };
  }

  /**
   * Create and inject visibility indicator into the page
   */
  async function injectVisibilityIndicator() {
    // Check if indicator already exists
    if (document.getElementById("visibility-indicator")) {
      return;
    }

    const status = await determineVisibilityStatus();

    // Create indicator element
    const indicator = document.createElement("div");
    indicator.id = "visibility-indicator";
    indicator.style.cssText =
      "position: fixed; bottom: 0; right: 0; background: rgba(0, 0, 0, 0.75); color: white; padding: 0.5em 1em; font-size: 0.85em; z-index: 1000; border-top-left-radius: 4px;";

    if (status.link) {
      // Create link
      const link = document.createElement("a");
      link.href = status.link;
      link.textContent = status.type;
      link.style.cssText = "color: #9cf; text-decoration: none;";
      link.onmouseover = () => (link.style.textDecoration = "underline");
      link.onmouseout = () => (link.style.textDecoration = "none");
      indicator.appendChild(document.createTextNode("Status: "));
      indicator.appendChild(link);
    } else {
      indicator.textContent = `Status: ${status.type}`;
    }

    // Add to page
    document.body.appendChild(indicator);
  }

  /**
   * Initialize visibility indicator on page load
   */
  function initVisibilityIndicator() {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", injectVisibilityIndicator);
    } else {
      injectVisibilityIndicator();
    }
  }

  // Initialize when script loads
  initVisibilityIndicator();

  // Expose functions for testing
  if (typeof window !== "undefined") {
    window.__visibilityIndicator = {
      determineVisibilityStatus,
      fetchCatalog,
      fetchUserBundles,
      findMatchingActivity,
      getAutomaticBundles,
    };
  }
})();
