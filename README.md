# DIY Accounting Submit

**HMRC recognised software for Making Tax Digital VAT submissions**

Submit UK VAT returns to HMRC using the official Making Tax Digital (MTD) APIs.

**Website**: https://submit.diyaccounting.co.uk
**Status**: Sandbox tested, seeking HMRC production credentials

---

## What is DIY Accounting Submit?

DIY Accounting Submit is a free, open source web application that enables UK VAT-registered businesses to:

- **View VAT obligations** - See your outstanding and fulfilled VAT periods
- **Submit VAT returns** - File your VAT return directly to HMRC
- **View submission receipts** - Access confirmation of submitted returns
- **Track submission history** - Keep records for 7 years (HMRC requirement)

The software connects directly to HMRC's official MTD APIs and implements all required fraud prevention measures.

---

## Key Features

| Feature | Description |
|---------|-------------|
| **Free to use** | Guest bundle available at no cost |
| **HMRC compliant** | Full fraud prevention header implementation |
| **Secure** | Data encrypted at rest (AES-256) and in transit (TLS 1.2+) |
| **UK hosted** | AWS eu-west-2 (London) region |
| **Privacy focused** | User identifiers hashed before storage |
| **Open source** | Full source code available under AGPL-3.0 |
| **7-year retention** | Submission receipts stored per HMRC requirements |

---

## How It Works

1. **Sign in** with Google (via AWS Cognito)
2. **Authorise** the application through HMRC's secure OAuth flow
3. **Enter** your VAT return figures
4. **Submit** directly to HMRC
5. **Receive** confirmation and receipt

Your HMRC Government Gateway credentials are never stored by this application. Authentication is handled entirely by HMRC's secure OAuth service.

---

## Technology

| Component | Technology |
|-----------|------------|
| Frontend | Static HTML/JavaScript (no framework dependencies) |
| Backend | Node.js on AWS Lambda |
| Authentication | AWS Cognito with Google federation |
| Data storage | AWS DynamoDB (encrypted at rest) |
| Hosting | AWS CloudFront + S3 |
| Security | AWS WAF, TLS 1.2+, fraud prevention headers |

### HMRC Integration

- **APIs used**: VAT MTD (obligations, returns)
- **Connection method**: WEB_APP_VIA_SERVER
- **Fraud prevention**: All Gov-Client and Gov-Vendor headers implemented
- **Error handling**: Full HMRC error code mapping

---

## Compliance

### HMRC Requirements

| Requirement | Status |
|-------------|--------|
| Fraud prevention headers | Implemented and validated |
| OAuth 2.0 authentication | Implemented |
| Error handling | All HMRC error codes handled |
| Accessibility (WCAG 2.1 AA) | Audit in progress |
| Penetration testing | Scheduled |

### Data Protection

| Requirement | Status |
|-------------|--------|
| UK GDPR compliance | Implemented |
| Privacy policy | Published |
| Terms of service | Published |
| Data subject rights | Export/deletion scripts available |
| 72-hour breach notification | Documented procedures |

---

## Organisation

**DIY Accounting Limited**
- Registered Office: 37 Sutherland Avenue, Leeds, LS8 1BY.
- Company Number: 06846849
- Registered in England and Wales
- Contact: admin@diyaccounting.co.uk

---

## Documentation

| Document | Description |
|----------|-------------|
| [Privacy Policy](https://submit.diyaccounting.co.uk/privacy.html) | How we handle your data |
| [Terms of Use](https://submit.diyaccounting.co.uk/terms.html) | Service terms and conditions |
| [User Guide](https://submit.diyaccounting.co.uk/guide/index.html) | How to use the application |

---

## License

This software is licensed under the **GNU Affero General Public License v3.0 (AGPL-3.0)**.

This means:
- You can use, modify, and distribute this software freely
- If you modify and deploy this software as a network service, you must make your source code available
- Any derivative works must also be licensed under AGPL-3.0

See [LICENSE](LICENSE) for the full license text.

### Third-Party Attributions

- HMRC and Making Tax Digital are trademarks of HM Revenue and Customs
- AWS is a trademark of Amazon Web Services
- Google is a trademark of Alphabet Inc.

---

## Contributing

Contributions are welcome. Please see our [GitHub repository](https://github.com/antonycc/submit.diyaccounting.co.uk) for:
- Issue tracking
- Pull request guidelines
- Development setup instructions

---

## Support

For support enquiries: **admin@diyaccounting.co.uk**

For HMRC-specific questions about VAT or Making Tax Digital, please contact HMRC directly or visit [gov.uk/vat](https://www.gov.uk/vat).

---

*DIY Accounting Submit is HMRC recognised software. This software is not endorsed, approved, or certified by HMRC.*
