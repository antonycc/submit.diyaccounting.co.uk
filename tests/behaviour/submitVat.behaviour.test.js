// tests/behaviour/submitVat.behaviour.test.js
import { test, expect } from '@playwright/test';
import { spawn } from 'child_process';
import { setTimeout } from 'timers/promises';

let serverProcess;

test.beforeAll(async () => {
    // Start the server
    serverProcess = spawn('node', ['src/lib/server.js'], {
        env: { ...process.env, PORT: '3000' },
        stdio: 'pipe'
    });

    // Wait for server to start
    await setTimeout(2000);
    
    // Check if server is running
    let serverReady = false;
    let attempts = 0;
    while (!serverReady && attempts < 10) {
        try {
            const response = await fetch('http://127.0.0.1:3000');
            if (response.ok) {
                serverReady = true;
            }
        } catch (error) {
            attempts++;
            await setTimeout(1000);
        }
    }
    
    if (!serverReady) {
        throw new Error('Server failed to start');
    }
});

test.afterAll(async () => {
    if (serverProcess) {
        serverProcess.kill();
    }
});

test.use({
    video: 'on',
});

test('Submit VAT return end-to-end flow with browser emulation', async ({ page }) => {
    // Mock the API endpoints that the server will call
    await page.route('**/oauth/token', route => {
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ access_token: 'test-access-token' }),
        });
    });

    await page.route('**/organisations/vat/*/returns', route => {
        const url = new URL(route.request().url());
        const vrn = url.pathname.split('/')[3]; // Extract VRN from path
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                formBundleNumber: `${vrn}-bundle`,
                chargeRefNumber: `${vrn}-charge`,
                processingDate: new Date().toISOString(),
            }),
        });
    });

    // Mock S3 endpoints for receipt logging
    await page.route('**/test-receipts/**', route => {
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ status: 'success' }),
        });
    });

    // 1) Navigate to the application served by server.js
    await page.goto('http://127.0.0.1:3000');
    
    // Wait for page to load completely
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: 'test-results/behaviour-initial.png' });

    // 2) Verify the form is present and fill it out with correct field IDs
    await expect(page.locator('#vatSubmissionForm')).toBeVisible();
    
    // Fill out the VAT form using the correct field IDs from index.html
    await page.fill('#vatNumber', '123456789');
    await page.fill('#periodKey', '24A1');
    await page.fill('#vatDue', '1000.00');
    
    await page.screenshot({ path: 'test-results/behaviour-form-filled.png' });

    // 3) Mock the token exchange endpoint
    await page.route('**/api/exchange-token', route => {
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ accessToken: 'test-access-token' }),
        });
    });

    // Mock the VAT submission endpoint
    await page.route('**/api/submit-vat', route => {
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                formBundleNumber: '123456789-bundle',
                chargeRefNumber: '123456789-charge',
                processingDate: new Date().toISOString(),
            }),
        });
    });

    // Mock the receipt logging endpoint
    await page.route('**/api/log-receipt', route => {
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ status: 'receipt logged' }),
        });
    });

    // 4) Intercept the OAuth redirect and simulate the callback
    let authState;
    
    // Listen for navigation to HMRC OAuth URL
    page.on('request', async (request) => {
        if (request.url().includes('oauth/authorize')) {
            const url = new URL(request.url());
            authState = url.searchParams.get('state');
            
            // Simulate OAuth callback by navigating back with code and state
            await page.goto(`http://127.0.0.1:3000/?code=test-code&state=${encodeURIComponent(authState)}`);
        }
    });

    // Submit the form - this will trigger the OAuth flow
    await page.click('#submitBtn');

    await page.screenshot({ path: 'test-results/behaviour-after-oauth.png' });

    // 5) Wait for the submission process to complete and receipt to be displayed
    await page.waitForSelector('#receiptDisplay', { state: 'visible', timeout: 15000 });
    
    // Verify the receipt is displayed with correct content
    const receiptDisplay = page.locator('#receiptDisplay');
    await expect(receiptDisplay).toBeVisible();
    
    // Check for the success message
    const successHeader = receiptDisplay.locator('h3');
    await expect(successHeader).toContainText('VAT Return Submitted Successfully');
    
    // Verify receipt details are populated
    await expect(page.locator('#formBundleNumber')).toContainText('123456789-bundle');
    await expect(page.locator('#chargeRefNumber')).toContainText('123456789-charge');
    await expect(page.locator('#processingDate')).not.toBeEmpty();
    
    // Verify the form is hidden after successful submission
    await expect(page.locator('#vatForm')).toBeHidden();
    
    await page.screenshot({ path: 'test-results/behaviour-receipt.png', fullPage: true });

    console.log('[DEBUG_LOG] VAT submission flow completed successfully');
});
