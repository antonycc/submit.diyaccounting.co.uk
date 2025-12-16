import { writable, derived } from "svelte/store";

function createBundlesStore() {
  const { subscribe, set, update } = writable([]);

  return {
    subscribe,
    set,
    add: (bundle) => update((bundles) => [...bundles, bundle]),
    remove: (bundleId) => update((bundles) => bundles.filter((b) => b.product !== bundleId)),
    refresh: async (authToken) => {
      try {
        const response = await fetch("/api/account/bundles", {
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
        });
        if (response.ok) {
          const data = await response.json();
          set(data.bundles || []);
        }
      } catch (error) {
        console.error("Failed to fetch bundles:", error);
      }
    },
  };
}

export const bundlesStore = createBundlesStore();

// Derived store to check if user has specific entitlements
export const hasEntitlement = derived(bundlesStore, ($bundles) => (productId) => {
  return $bundles.some((bundle) => bundle.product === productId);
});
