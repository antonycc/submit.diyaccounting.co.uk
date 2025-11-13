# DIY Accounting Submit - User Guide

A comprehensive guide for end users to submit UK VAT returns via HMRC's Making Tax Digital (MTD) APIs.

## Table of Contents

- [Overview](#overview)
- [Getting Started](#getting-started)
- [Bundles and Entitlements](#bundles-and-entitlements)
- [Submitting a VAT Return](#submitting-a-vat-return)
- [Viewing VAT Obligations](#viewing-vat-obligations)
- [Viewing VAT Returns](#viewing-vat-returns)
- [Managing Receipts](#managing-receipts)
- [Troubleshooting](#troubleshooting)
- [FAQs](#faqs)

## Overview

DIY Accounting Submit is a web application that simplifies the process of submitting VAT returns to HMRC under the Making Tax Digital framework. The application provides:

- **Secure authentication** via Google (through AWS Cognito)
- **Direct HMRC integration** for VAT submissions
- **Receipt management** for audit trails
- **Bundle-based access control** for different service tiers

## Getting Started

### 1. Access the Application

Navigate to the application URL (e.g., `https://submit.diyaccounting.co.uk`) in your web browser.

### 2. Sign In

1. Click the **Sign In** button
2. You'll be redirected to Google authentication
3. Sign in with your Google account
4. Grant necessary permissions
5. You'll be redirected back to the application

### 3. Request a Bundle

Before you can submit VAT returns, you need to request access to a bundle:

1. Navigate to **Account → Bundles** (or visit `/account/bundles.html`)
2. Select the appropriate bundle:
   - **Test**: For sandbox/testing with HMRC's test API
   - **Guest/Basic/Legacy**: For production VAT submissions
3. Click **Request Bundle**
4. Your access will be granted based on bundle configuration

## Bundles and Entitlements

The application uses a bundle system to control access to different features:

### Bundle Types

#### Default Bundle
- **Allocation**: Automatic (granted to all users)
- **Features**:
  - View receipts
  - Manage bundles

#### Test Bundle
- **Allocation**: On-request
- **Features**:
  - Submit VAT (Sandbox API)
  - View VAT obligations (Sandbox)
  - View VAT returns (Sandbox)
- **Limits**: Up to 10 users, 1-day expiry
- **Use case**: Testing and development

#### Guest/Basic/Legacy Bundles
- **Allocation**: On-request
- **Features**:
  - Submit VAT (Production)
  - View VAT obligations (Production)
  - View VAT returns (Production)
- **Use case**: Production submissions

### Viewing Your Bundles

1. Navigate to **Account → Bundles**
2. Your active bundles are displayed with:
   - Bundle name
   - Expiry date
   - Activities included

## Submitting a VAT Return

### Prerequisites

- Active HMRC credentials
- VAT registration number
- Period key for the return
- Authorization from HMRC (obtained through OAuth flow)

### Submission Process

1. Navigate to **Activities → Submit VAT**
2. Click **Authorize with HMRC** to obtain access token
3. Complete HMRC OAuth flow
4. Fill in the VAT return form:
   - **VAT Number**: Your 9-digit VAT registration number (e.g., `176540158`)
   - **Period Key**: The period identifier (e.g., `24A1`)
   - **VAT Due**: Amount in pounds (e.g., `2400.00`)
5. Click **Submit VAT Return**
6. View confirmation with:
   - Processing date
   - Form bundle number
   - Charge reference number

### Understanding the Response

After successful submission, you'll receive:

```json
{
  "processingDate": "2025-07-14T20:20:20Z",
  "formBundleNumber": "123456789012",
  "chargeRefNumber": "XZ1234567890"
}
```

- **processingDate**: When HMRC processed your submission
- **formBundleNumber**: HMRC's internal reference for your submission
- **chargeRefNumber**: Reference for payment tracking

**Important**: Save these details for your records. A receipt is automatically stored in your account.

## Viewing VAT Obligations

Check your outstanding and fulfilled VAT obligations:

1. Navigate to **Activities → VAT Obligations**
2. Click **Authorize with HMRC**
3. Enter your **VAT Number**
4. View obligations list with:
   - Period key
   - Start and end dates
   - Due date
   - Status (Open/Fulfilled)
   - Received date (if fulfilled)

## Viewing VAT Returns

Retrieve previously submitted VAT returns:

1. Navigate to **Activities → View VAT Return**
2. Click **Authorize with HMRC**
3. Enter:
   - **VAT Number**
   - **Period Key**
4. View return details including all submitted figures

## Managing Receipts

All VAT submissions automatically generate receipts stored securely in AWS S3.

### Viewing Receipts

1. Navigate to **Account → Receipts**
2. View list of all your submissions with:
   - Form bundle number
   - Charge reference number
   - Processing date
   - Submission timestamp

### Receipt Format

Receipts are stored as JSON files with naming format:
```
receipts/{user-id}/{date}-{formBundleNumber}.json
```

Example filename: `2025-03-31-123456789012.json`

## Troubleshooting

### Common Issues

#### Authentication Errors

**Problem**: "Unauthorized - invalid or expired HMRC access token"

**Solution**:
1. Re-authorize with HMRC using the **Authorize** button
2. Ensure you complete the HMRC OAuth flow without interruption
3. Check that you're using the correct HMRC credentials

#### Validation Errors

**Problem**: "Invalid vatNumber format - must be 9 digits"

**Solution**:
- VAT numbers must be exactly 9 digits
- Remove any spaces, hyphens, or GB prefix
- Example: Use `176540158` not `GB 176 5401 58`

**Problem**: "Invalid periodKey format"

**Solution**:
- Period keys are typically 3-5 characters (e.g., `24A1`, `#001`)
- Use the exact format provided by HMRC
- Check your VAT obligations for valid period keys

**Problem**: "Invalid vatDue - must be a number"

**Solution**:
- Enter numeric values only (e.g., `2400.00`)
- Do not include currency symbols or commas
- Use decimal point for pence (not comma)

#### Bundle Access Issues

**Problem**: "Bundle not found in catalog"

**Solution**:
1. Verify the bundle ID is correct
2. Check that the bundle exists in the product catalog
3. Ensure your account has permission to request the bundle

**Problem**: "Bundle request denied - cap reached"

**Solution**:
- The bundle has reached its user limit
- Try again later or contact support for access
- Consider using an alternative bundle tier

#### Submission Errors

**Problem**: "HMRC API returned error"

**Solution**:
1. Check HMRC API status: https://api.service.hmrc.gov.uk/api-status
2. Verify your credentials are correct
3. Ensure you're not duplicating a submission
4. Wait a few minutes and retry
5. If using sandbox, check you're authorized for test data

### Getting Help

If you encounter issues not covered here:

1. Check the [GitHub Issues](https://github.com/antonycc/submit.diyaccounting.co.uk/issues)
2. Review the [Technical Documentation](README.md)
3. Contact support with:
   - Error message (exact text)
   - Steps to reproduce
   - Screenshots if applicable
   - Request ID from error response (if available)

## FAQs

### General

**Q: Is this application officially supported by HMRC?**

A: This is a third-party application that integrates with HMRC's official MTD APIs. It is not maintained by HMRC.

**Q: Can I use this for my business VAT returns?**

A: Yes, with appropriate bundles (Guest/Basic/Legacy) you can submit production VAT returns. Always test in sandbox first.

**Q: Is my data secure?**

A: Yes. The application uses:
- AWS Cognito for authentication
- HTTPS for all communications
- AWS S3 with encryption for receipts
- OAuth2 for HMRC authorization
- No storage of HMRC credentials

### Bundles

**Q: How long do bundles last?**

A: Depends on the bundle:
- Test bundle: 1 day (configurable)
- Other bundles: Varies by configuration
- Check your bundle page for expiry dates

**Q: Can I have multiple bundles?**

A: Yes, you can have multiple active bundles simultaneously.

**Q: What happens when a bundle expires?**

A: You'll lose access to activities in that bundle. You can request it again.

### Submissions

**Q: Can I submit multiple VAT returns?**

A: Yes, submit as many returns as needed for different periods.

**Q: Can I edit a submitted return?**

A: No, VAT returns cannot be edited after submission to HMRC. Contact HMRC directly for corrections.

**Q: Are receipts automatically saved?**

A: Yes, every successful submission generates a receipt stored in your account.

**Q: How do I know my submission was successful?**

A: You'll receive immediate confirmation with a form bundle number and charge reference number.

### Testing

**Q: How do I test without affecting my real VAT account?**

A: Use the Test bundle which connects to HMRC's sandbox environment with test credentials.

**Q: What test data can I use?**

A: Refer to HMRC's [sandbox testing guide](https://developer.service.hmrc.gov.uk/api-documentation/docs/testing) for test VAT numbers and scenarios.

### Environment Setup

**Q: Can I run this locally?**

A: Yes, see [SETUP.md](_developers/SETUP.md) for developer instructions.

**Q: What browsers are supported?**

A: Any modern browser with JavaScript enabled (Chrome, Firefox, Safari, Edge).

## Version Information

This guide is for version 0.0.2-4 of DIY Accounting Submit.

For technical documentation, see [README.md](README.md).

For developer setup instructions, see [SETUP.md](_developers/SETUP.md).

For API documentation, see [API.md](_developers/API.md).
