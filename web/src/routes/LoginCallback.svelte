<script>
  import { onMount } from 'svelte';
  import { push } from 'svelte-spa-router';
  import { api } from '../lib/api.js';
  import { authStore } from '../stores/authStore.js';

  let loading = true;
  let error = null;

  onMount(async () => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');
    const isMock = window.location.pathname.includes('Mock');

    if (!code) {
      error = 'No authorization code received';
      loading = false;
      return;
    }

    try {
      const data = isMock
        ? await fetch('/api/auth/mock/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code, state }),
          }).then(r => r.json())
        : await api.exchangeCognitoToken(code, state);

      if (data.accessToken && data.idToken) {
        // Decode ID token to get user info (simple JWT decode)
        const base64Url = data.idToken.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const userInfo = JSON.parse(decodeURIComponent(atob(base64).split('').map(c => 
          '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)
        ).join('')));

        authStore.login({
          accessToken: data.accessToken,
          idToken: data.idToken,
          refreshToken: data.refreshToken,
        }, userInfo);

        // Redirect to home
        push('/');
      } else {
        error = 'Invalid response from authentication server';
      }
    } catch (err) {
      console.error('Token exchange error:', err);
      error = err.message || 'Failed to complete authentication';
    } finally {
      loading = false;
    }
  });
</script>

<div class="form-container" style="text-align: center">
  {#if loading}
    <h2>Completing login...</h2>
    <div class="loading-spinner">
      <div class="spinner"></div>
      <p>Please wait while we complete your authentication</p>
    </div>
  {:else if error}
    <h2>Authentication Error</h2>
    <div class="alert alert-error">
      {error}
    </div>
    <a href="/auth/login" class="btn btn-primary">Try Again</a>
  {:else}
    <h2>Login Successful!</h2>
    <p>Redirecting to home page...</p>
  {/if}
</div>

<style>
  .loading-spinner {
    padding: 2em;
  }

  .spinner {
    border: 4px solid #f3f3f3;
    border-top: 4px solid #2c5aa0;
    border-radius: 50%;
    width: 40px;
    height: 40px;
    animation: spin 1s linear infinite;
    margin: 0 auto 1em;
  }

  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }

  .alert {
    padding: 1em;
    border-radius: 4px;
    margin: 1em 0;
  }

  .alert-error {
    background-color: #f8d7da;
    color: #721c24;
    border: 1px solid #f5c6cb;
  }

  .btn {
    display: inline-block;
    padding: 0.75em 1.5em;
    border: none;
    border-radius: 4px;
    font-size: 1em;
    cursor: pointer;
    text-decoration: none;
    margin-top: 1em;
  }

  .btn-primary {
    background-color: #2c5aa0;
    color: white;
  }

  .btn-primary:hover {
    background-color: #234580;
  }
</style>
