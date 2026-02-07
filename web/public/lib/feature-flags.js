// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// lib/feature-flags.js
// Client-side feature flag evaluator.
// Fetches /submit.features.toml once per page load, caches the result,
// and exposes a simple async isFeatureEnabled(id) API.
//
// Future: extend with rolloutPercent, user-segment targeting, and variant
// assignment for A/B testing. The evaluation function signature is stable
// so callers won't need to change.

(function () {
  "use strict";

  let _featuresPromise = null;

  function fetchFeatures() {
    if (_featuresPromise) return _featuresPromise;
    _featuresPromise = (async () => {
      try {
        const response = await fetch("/submit.features.toml", { cache: "no-store" });
        if (!response.ok) return {};
        const text = await response.text();
        if (window.TOML && typeof window.TOML.parse === "function") {
          return window.TOML.parse(text);
        }
        return {};
      } catch {
        return {};
      }
    })();
    return _featuresPromise;
  }

  /**
   * Check whether a feature flag is enabled.
   * @param {string} featureId - the feature id (e.g. "waitlist")
   * @returns {Promise<boolean>}
   */
  async function isFeatureEnabled(featureId) {
    const config = await fetchFeatures();
    const features = config.features || [];
    const feature = features.find(function (f) {
      return f.id === featureId;
    });
    return !!(feature && feature.enabled);
  }

  window.featureFlags = { isFeatureEnabled: isFeatureEnabled };
})();
