<script>
  // Get version info from environment or build
  const version = import.meta.env.VITE_APP_VERSION || '0.0.2-4';
</script>

<footer>
  <div class="footer-content">
    <div class="footer-left">
      <a href="/tests/index.html" target="_blank">tests</a>
      <a href="/docs/index.html" target="_blank">api</a>
    </div>
    <div class="footer-center">
      <p>&copy; 2025 DIY Accounting Limited</p>
    </div>
    <div class="footer-right">
      <span class="version">v{version}</span>
    </div>
  </div>
</footer>

<style>
  footer {
    margin-top: 2em;
    padding-top: 1em;
    border-top: 1px solid #ddd;
  }

  .footer-content {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.9em;
    color: #666;
  }

  .footer-left {
    display: flex;
    gap: 1em;
  }

  .footer-left a {
    color: #2c5aa0;
    text-decoration: none;
  }

  .footer-left a:hover {
    text-decoration: underline;
  }

  .footer-center {
    text-align: center;
  }

  .footer-right {
    text-align: right;
  }

  .version {
    font-size: 0.85em;
    color: #999;
  }

  @media (max-width: 600px) {
    .footer-content {
      flex-direction: column;
      gap: 0.5em;
      text-align: center;
    }

    .footer-left,
    .footer-right {
      text-align: center;
    }
  }
</style>
