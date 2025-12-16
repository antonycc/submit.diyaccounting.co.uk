<div class="form-container">
  <h2>About DIY Accounting Submit</h2>

  <section class="about-section">
    <h3>What is DIY Accounting Submit?</h3>
    <p>
      DIY Accounting Submit is a web application that helps small businesses submit their VAT returns to HMRC using the Making Tax
      Digital (MTD) API.
    </p>
  </section>

  <section class="about-section">
    <h3>Key Features</h3>
    <ul>
      <li>Direct integration with HMRC's Making Tax Digital API</li>
      <li>Secure authentication using AWS Cognito</li>
      <li>View VAT obligations and filing deadlines</li>
      <li>Submit VAT returns directly to HMRC</li>
      <li>Store and retrieve submission receipts</li>
      <li>Bundle-based entitlement system</li>
    </ul>
  </section>

  <section class="about-section">
    <h3>Technology Stack</h3>
    <p>Built with modern web technologies:</p>
    <ul>
      <li>Frontend: Svelte + Vite (SPA)</li>
      <li>Backend: AWS Lambda (Node.js 22)</li>
      <li>Infrastructure: AWS CDK (serverless)</li>
      <li>API: REST endpoints via API Gateway</li>
      <li>Storage: DynamoDB + S3</li>
      <li>Deployment: CloudFront + S3</li>
    </ul>
  </section>

  <section class="about-section">
    <h3>Open Source</h3>
    <p>
      This project is open source and available on GitHub. Licensed under GPL-3.0.
    </p>
  </section>
</div>

<style>
  .about-section {
    margin-bottom: 2em;
  }

  .about-section h3 {
    color: #2c5aa0;
    margin-bottom: 1em;
  }

  .about-section ul {
    list-style-position: inside;
    line-height: 1.8;
  }

  .about-section li {
    margin-bottom: 0.5em;
  }
</style>
;
