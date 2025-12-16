<script>
  import { onMount } from "svelte";
  import { api } from "../lib/api.js";
  import { bundlesStore } from "../stores/bundlesStore.js";
  import { authStore } from "../stores/authStore.js";
  import { push } from "svelte-spa-router";

  let loading = true;
  let error = null;
  let catalog = [];
  let userBundles = $bundlesStore;

  $: userBundles = $bundlesStore;

  onMount(async () => {
    if (!$authStore.isAuthenticated) {
      push("/auth/login");
      return;
    }

    try {
      // Fetch catalog and user bundles
      const [catalogData, bundlesData] = await Promise.all([api.getCatalog(), api.getBundles()]);

      catalog = catalogData.products || [];
      bundlesStore.set(bundlesData.bundles || []);
    } catch (err) {
      console.error("Failed to load bundles:", err);
      error = err.message;
    } finally {
      loading = false;
    }
  });

  async function addBundle(productId) {
    try {
      await api.addBundle(productId);
      // Refresh bundles
      const data = await api.getBundles();
      bundlesStore.set(data.bundles || []);
    } catch (err) {
      console.error("Failed to add bundle:", err);
      error = err.message;
    }
  }

  async function removeBundle(productId) {
    if (!confirm("Are you sure you want to remove this bundle?")) {
      return;
    }

    try {
      await api.removeBundle(productId);
      // Refresh bundles
      const data = await api.getBundles();
      bundlesStore.set(data.bundles || []);
    } catch (err) {
      console.error("Failed to remove bundle:", err);
      error = err.message;
    }
  }

  function hasBundle(productId) {
    return userBundles.some((b) => b.product === productId);
  }
</script>

<div class="form-container">
  <h2>Manage Your Bundles</h2>

  <p style="margin-bottom: 2em; color: #666">Bundles give you access to additional features and activities.</p>

  {#if error}
    <div class="alert alert-error">
      {error}
    </div>
  {/if}

  {#if loading}
    <div class="loading-spinner">Loading bundles...</div>
  {:else}
    <div class="bundles-section">
      <h3>Your Active Bundles</h3>
      {#if userBundles.length > 0}
        <div class="bundles-list">
          {#each userBundles as bundle (bundle.product)}
            <div class="bundle-card active">
              <div class="bundle-info">
                <h4>{bundle.productName || bundle.product}</h4>
                <p>Expires: {new Date(bundle.expiryDate).toLocaleDateString()}</p>
                <p>User limit: {bundle.userLimit}</p>
              </div>
              <button class="btn btn-danger btn-small" on:click={() => removeBundle(bundle.product)}> Remove </button>
            </div>
          {/each}
        </div>
      {:else}
        <p class="no-bundles">You don't have any active bundles.</p>
      {/if}
    </div>

    <div class="bundles-section">
      <h3>Available Bundles</h3>
      <div class="bundles-list">
        {#each catalog as product (product.id)}
          <div class="bundle-card">
            <div class="bundle-info">
              <h4>{product.name}</h4>
              <p>{product.description || "No description"}</p>
            </div>
            {#if hasBundle(product.id)}
              <span class="badge badge-active">Active</span>
            {:else}
              <button class="btn btn-primary btn-small" on:click={() => addBundle(product.id)}> Add Bundle </button>
            {/if}
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  .bundles-section {
    margin-bottom: 2em;
  }

  .bundles-section h3 {
    color: #2c5aa0;
    margin-bottom: 1em;
  }

  .bundles-list {
    display: flex;
    flex-direction: column;
    gap: 1em;
  }

  .bundle-card {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1em;
    background: #f8f9fa;
    border: 1px solid #ddd;
    border-radius: 8px;
  }

  .bundle-card.active {
    background: #e7f3ff;
    border-color: #2c5aa0;
  }

  .bundle-info h4 {
    margin: 0 0 0.5em 0;
    color: #333;
  }

  .bundle-info p {
    margin: 0.25em 0;
    font-size: 0.9em;
    color: #666;
  }

  .btn {
    padding: 0.5em 1em;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.9em;
    transition: all 0.3s;
  }

  .btn-small {
    padding: 0.4em 0.8em;
    font-size: 0.85em;
  }

  .btn-primary {
    background-color: #2c5aa0;
    color: white;
  }

  .btn-primary:hover {
    background-color: #234580;
  }

  .btn-danger {
    background-color: #dc3545;
    color: white;
  }

  .btn-danger:hover {
    background-color: #c82333;
  }

  .badge {
    padding: 0.4em 0.8em;
    border-radius: 12px;
    font-size: 0.85em;
    font-weight: bold;
  }

  .badge-active {
    background-color: #28a745;
    color: white;
  }

  .no-bundles {
    color: #666;
    font-style: italic;
  }

  .alert {
    padding: 1em;
    border-radius: 4px;
    margin-bottom: 1em;
  }

  .alert-error {
    background-color: #f8d7da;
    color: #721c24;
    border: 1px solid #f5c6cb;
  }

  .loading-spinner {
    padding: 2em;
    text-align: center;
    color: #666;
  }
</style>
