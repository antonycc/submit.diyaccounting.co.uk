<script>
  import { push } from 'svelte-spa-router';
  import { authStore } from '../stores/authStore.js';

  if (!$authStore.isAuthenticated) {
    push('/auth/login');
  }
</script>

<div class="form-container">
  <h2>VAT Obligations</h2>
  <p>View your VAT obligations from HMRC. This feature is under development.</p>
</div>
