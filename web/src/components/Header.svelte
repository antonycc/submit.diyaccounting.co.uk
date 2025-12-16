<script>
  import { link } from "svelte-spa-router";
  import { authStore, userName } from "../stores/authStore.js";
  import { bundlesStore } from "../stores/bundlesStore.js";

  let menuOpen = false;

  function toggleMenu() {
    menuOpen = !menuOpen;
  }

  function closeMenu() {
    menuOpen = false;
  }

  function logout() {
    authStore.logout();
    closeMenu();
  }

  // Get entitlement status text
  $: entitlementText = $bundlesStore.length > 0 ? `Bundles: ${$bundlesStore.length}` : "Activity: unrestricted";
</script>

<header>
  <div class="header-nav">
    <div class="hamburger-menu">
      <button class="hamburger-btn" on:click={toggleMenu}>☰</button>
      <div class="menu-dropdown" class:show={menuOpen}>
        <a href="/" use:link on:click={closeMenu}>Home</a>
        <a href="/account/bundles" use:link on:click={closeMenu}>Bundles</a>
        <a href="/hmrc/receipt/receipts" use:link on:click={closeMenu}>Receipts</a>
        <a href="/guide" use:link on:click={closeMenu}>User Guide</a>
        <a href="/about" use:link on:click={closeMenu}>About</a>
      </div>
    </div>

    <div class="auth-section">
      <span class="entitlement-status">{entitlementText}</span>
      {#if $authStore.isAuthenticated}
        <span class="login-status">Logged in as {$userName}</span>
        <button class="login-link" on:click={logout}>Log out</button>
      {:else}
        <span class="login-status">Not logged in</span>
        <a href="/auth/login" use:link class="login-link">Log in</a>
      {/if}
    </div>
  </div>

  <h1>DIY Accounting Submit</h1>
  <p class="subtitle">Submit UK VAT returns to HMRC under Making Tax Digital (MTD)</p>
</header>
