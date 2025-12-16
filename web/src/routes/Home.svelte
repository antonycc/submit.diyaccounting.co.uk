<script>
  import { link } from 'svelte-spa-router';
  import { onMount } from 'svelte';
  import { authStore } from '../stores/authStore.js';
  import { bundlesStore } from '../stores/bundlesStore.js';
  import { api } from '../lib/api.js';
  
  let loading = false;
  let catalog = [];
  let activities = [];

  onMount(async () => {
    // Fetch bundles if authenticated
    if ($authStore.isAuthenticated) {
      try {
        const bundlesData = await api.getBundles();
        bundlesStore.set(bundlesData.bundles || []);
      } catch (error) {
        console.error('Failed to fetch bundles:', error);
      }
    }

    // Fetch catalog
    try {
      const catalogData = await api.getCatalog();
      catalog = catalogData.products || [];
      
      // Build activities list
      activities = [
        {
          id: 'vat-obligations',
          name: 'View VAT Obligations',
          description: 'Check your VAT filing obligations from HMRC',
          path: '/hmrc/vat/vatObligations',
          requiredBundle: null,
        },
        {
          id: 'submit-vat',
          name: 'Submit VAT Return',
          description: 'Submit a VAT return to HMRC',
          path: '/hmrc/vat/submitVat',
          requiredBundle: null,
        },
        {
          id: 'view-receipts',
          name: 'View Receipts',
          description: 'View your HMRC submission receipts',
          path: '/hmrc/receipt/receipts',
          requiredBundle: null,
        },
      ];
    } catch (error) {
      console.error('Failed to fetch catalog:', error);
    }
  });

  function canAccessActivity(activity) {
    if (!activity.requiredBundle) return true;
    return $bundlesStore.some(b => b.product === activity.requiredBundle);
  }
</script>

<div class="form-container" style="text-align: center">
  <h2>Select an activity to continue:</h2>

  {#if loading}
    <div class="loading-spinner">Loading...</div>
  {:else}
    <div class="activities-grid">
      {#each activities as activity}
        <a 
          href={activity.path} 
          use:link 
          class="activity-card"
          class:disabled={!canAccessActivity(activity)}
        >
          <h3>{activity.name}</h3>
          <p>{activity.description}</p>
          {#if !canAccessActivity(activity)}
            <span class="badge badge-restricted">Bundle Required</span>
          {/if}
        </a>
      {/each}
    </div>

    <div class="add-service-section">
      <p style="margin-bottom: 1em; color: #666; font-style: italic">
        Need more choices? Select additional bundles to expand your available activities.
      </p>
      <a 
        href="/account/bundles" 
        use:link 
        class="btn btn-success"
      >
        Add Bundle
      </a>
    </div>
  {/if}
</div>

<style>
  .activities-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 1.5em;
    margin: 2em 0;
  }

  .activity-card {
    display: block;
    padding: 1.5em;
    background: white;
    border: 2px solid #ddd;
    border-radius: 8px;
    text-decoration: none;
    color: #333;
    transition: all 0.3s;
    position: relative;
  }

  .activity-card:hover:not(.disabled) {
    border-color: #2c5aa0;
    box-shadow: 0 4px 12px rgba(44, 90, 160, 0.1);
    transform: translateY(-2px);
  }

  .activity-card.disabled {
    opacity: 0.6;
    cursor: not-allowed;
    border-color: #eee;
  }

  .activity-card h3 {
    color: #2c5aa0;
    margin-bottom: 0.5em;
    font-size: 1.2em;
  }

  .activity-card p {
    color: #666;
    font-size: 0.95em;
    margin: 0;
  }

  .badge {
    display: inline-block;
    padding: 0.25em 0.75em;
    border-radius: 12px;
    font-size: 0.75em;
    font-weight: bold;
    margin-top: 0.75em;
  }

  .badge-restricted {
    background-color: #ffc107;
    color: #333;
  }

  .add-service-section {
    margin: 2em 0;
    padding: 1.5em;
    background-color: #f8f9fa;
    border-radius: 8px;
    border: 1px solid #ddd;
  }

  .btn {
    display: inline-block;
    padding: 0.75em 1.5em;
    border: none;
    border-radius: 4px;
    font-size: 1em;
    text-decoration: none;
    cursor: pointer;
    transition: all 0.3s;
  }

  .btn-success {
    background-color: #28a745;
    color: white;
  }

  .btn-success:hover {
    background-color: #218838;
  }

  .loading-spinner {
    padding: 2em;
    color: #666;
  }
</style>
