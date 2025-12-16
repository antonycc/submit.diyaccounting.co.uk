<div class="form-container">
  <h2>User Guide</h2>

  <section class="guide-section">
    <h3>Getting Started</h3>
    <ol>
      <li><strong>Log In:</strong> Click the "Log in" button in the header to authenticate with Google via AWS Cognito</li>
      <li><strong>Add Bundles:</strong> Navigate to the Bundles page to add entitlements for accessing features</li>
      <li><strong>Select an Activity:</strong> Return to the home page and choose an activity (VAT obligations, submit return, etc.)</li>
    </ol>
  </section>

  <section class="guide-section">
    <h3>Submitting a VAT Return</h3>
    <ol>
      <li>Go to "Submit VAT Return" from the home page</li>
      <li>Authorize with HMRC (one-time setup)</li>
      <li>Enter your VAT Registration Number (VRN)</li>
      <li>Select the period you want to submit for</li>
      <li>Fill in the VAT return figures</li>
      <li>Review and submit</li>
      <li>View the receipt from HMRC</li>
    </ol>
  </section>

  <section class="guide-section">
    <h3>Viewing VAT Obligations</h3>
    <ol>
      <li>Go to "View VAT Obligations" from the home page</li>
      <li>Authorize with HMRC if not already done</li>
      <li>Enter your VAT Registration Number (VRN)</li>
      <li>View your filing obligations and deadlines</li>
    </ol>
  </section>

  <section class="guide-section">
    <h3>Managing Bundles</h3>
    <p>Bundles give you access to features:</p>
    <ul>
      <li><strong>Guest Bundle:</strong> Limited access for trying out the service</li>
      <li><strong>Test Bundle:</strong> Full access for testing purposes</li>
    </ul>
    <p>You can add or remove bundles from the Bundles page in the hamburger menu.</p>
  </section>

  <section class="guide-section">
    <h3>Troubleshooting</h3>
    <p><strong>Authentication Issues:</strong></p>
    <ul>
      <li>Ensure you're using a supported browser (Chrome, Firefox, Safari, Edge)</li>
      <li>Clear your browser cache and cookies if login fails</li>
      <li>Check that third-party cookies are enabled</li>
    </ul>

    <p><strong>HMRC Authorization:</strong></p>
    <ul>
      <li>Make sure you're using the correct HMRC credentials</li>
      <li>Check that your HMRC account has VAT enabled</li>
      <li>Tokens expire - you may need to re-authorize periodically</li>
    </ul>
  </section>

  <section class="guide-section">
    <h3>Support</h3>
    <p>
      For technical issues or questions, please visit the GitHub repository and create an issue. We monitor issues regularly and will
      respond as soon as possible.
    </p>
  </section>
</div>

<style>
  .guide-section {
    margin-bottom: 2.5em;
  }

  .guide-section h3 {
    color: #2c5aa0;
    margin-bottom: 1em;
    margin-top: 1em;
  }

  .guide-section ol,
  .guide-section ul {
    line-height: 1.8;
    margin-left: 1.5em;
  }

  .guide-section li {
    margin-bottom: 0.75em;
  }

  .guide-section strong {
    color: #333;
  }
</style>
;
