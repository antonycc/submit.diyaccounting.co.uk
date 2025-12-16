<script>
  import { onMount } from 'svelte';
  import { push } from 'svelte-spa-router';
  import { api } from '../lib/api.js';
  import { authStore } from '../stores/authStore.js';

  let useMock = false;
  let loading = false;
  let error = null;

  onMount(() => {
    // Check if already authenticated
    if ($authStore.isAuthenticated) {
      push('/');
    }
  });

  async function handleLogin() {
    loading = true;
    error = null;

    try {
      const data = useMock 
        ? await fetch('/api/auth/mock/authurl').then(r => r.json())
        : await api.getCognitoAuthUrl();
      
      if (data.authUrl) {
        window.location.href = data.authUrl;
      } else {
        error = 'Failed to get authorization URL';
      }
    } catch (err) {
      console.error('Login error:', err);
      error = err.message || 'An error occurred during login';
    } finally {
      loading = false;
    }
  }
</script>

<div class="form-container">
  <h2>Log in to DIY Accounting Submit</h2>
  
  <p style="margin-bottom: 2em; color: #666">
    You need to log in to submit VAT returns and access your account.
  </p>

  {#if error}
    <div class="alert alert-error">
      {error}
    </div>
  {/if}

  <div class="login-options">
    <button 
      class="btn btn-primary btn-large" 
      on:click={handleLogin} 
      disabled={loading}
    >
      {loading ? 'Redirecting...' : 'Log in with Cognito'}
    </button>

    <div class="divider">or</div>

    <label class="checkbox-label">
      <input type="checkbox" bind:checked={useMock} />
      Use mock authentication (for testing)
    </label>
  </div>
</div>

<style>
  .login-options {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1.5em;
  }

  .btn {
    display: inline-block;
    padding: 0.75em 1.5em;
    border: none;
    border-radius: 4px;
    font-size: 1em;
    cursor: pointer;
    transition: all 0.3s;
    text-decoration: none;
  }

  .btn-primary {
    background-color: #2c5aa0;
    color: white;
  }

  .btn-primary:hover:not(:disabled) {
    background-color: #234580;
  }

  .btn-large {
    padding: 1em 2em;
    font-size: 1.1em;
  }

  .btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .divider {
    color: #999;
    font-size: 0.9em;
  }

  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 0.5em;
    cursor: pointer;
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
</style>
