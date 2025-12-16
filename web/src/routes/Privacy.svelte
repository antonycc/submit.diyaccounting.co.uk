<div class="form-container">
  <h2>Privacy Policy</h2>

  <section class="privacy-section">
    <p class="last-updated">Last updated: December 2025</p>

    <h3>Introduction</h3>
    <p>
      DIY Accounting Limited ("we", "our", or "us") operates the DIY Accounting Submit service. This page informs you of our policies
      regarding the collection, use, and disclosure of personal data when you use our service.
    </p>
  </section>

  <section class="privacy-section">
    <h3>Data Collection</h3>
    <p>We collect the following types of data:</p>
    <ul>
      <li><strong>Authentication Data:</strong> Email address, name, and authentication tokens from your identity provider (Google or AWS Cognito)</li>
      <li><strong>VAT Data:</strong> VAT registration numbers and returns that you submit through our service</li>
      <li><strong>Usage Data:</strong> Information about how you use our service, including page visits and API calls</li>
    </ul>
  </section>

  <section class="privacy-section">
    <h3>Performance Monitoring</h3>
    <p>
      We use Amazon CloudWatch RUM (Real User Monitoring) to collect performance metrics such as page load times, JavaScript errors,
      and HTTP request timings from your browser to our API.
    </p>
    <p>This helps us improve the performance and reliability of our service. User IDs are hashed before being sent to AWS.</p>
  </section>

  <section class="privacy-section">
    <h3>Data Storage</h3>
    <p>Your data is stored securely in the following AWS services:</p>
    <ul>
      <li><strong>DynamoDB:</strong> Bundles, receipts, and API request logs</li>
      <li><strong>S3:</strong> Receipt backups</li>
      <li><strong>Cognito:</strong> User authentication data</li>
    </ul>
    <p>All data is stored in the EU-West-2 (London) region.</p>
  </section>

  <section class="privacy-section">
    <h3>Data Sharing</h3>
    <p>We share data only in the following circumstances:</p>
    <ul>
      <li><strong>HMRC:</strong> VAT returns are submitted directly to HMRC via their Making Tax Digital API</li>
      <li><strong>AWS Services:</strong> Data is processed by AWS services (Lambda, DynamoDB, S3, CloudWatch) as part of our infrastructure</li>
    </ul>
    <p>We do not sell or share your personal data with third parties for marketing purposes.</p>
  </section>

  <section class="privacy-section">
    <h3>Your Rights</h3>
    <p>Under GDPR, you have the right to:</p>
    <ul>
      <li>Access your personal data</li>
      <li>Correct inaccurate data</li>
      <li>Request deletion of your data</li>
      <li>Object to processing of your data</li>
      <li>Export your data in a machine-readable format</li>
    </ul>
  </section>

  <section class="privacy-section">
    <h3>Contact</h3>
    <p>
      For any questions about this privacy policy or to exercise your rights, please contact us via the repository issue tracker on
      GitHub.
    </p>
  </section>
</div>

<style>
  .last-updated {
    font-style: italic;
    color: #666;
    margin-bottom: 2em;
  }

  .privacy-section {
    margin-bottom: 2em;
  }

  .privacy-section h3 {
    color: #2c5aa0;
    margin-bottom: 1em;
    margin-top: 1.5em;
  }

  .privacy-section ul {
    list-style-position: inside;
    line-height: 1.8;
  }

  .privacy-section li {
    margin-bottom: 0.5em;
  }
</style>
;
