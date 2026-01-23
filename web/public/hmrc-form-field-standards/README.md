# UK Tax Form Field Standards Demo

## Overview

This demo package demonstrates UK government standards for form field labelling, validation, and accessibility — specifically for tax-related fields used in HMRC Recognised third-party services.

## Contents

```
demo/
├── index.html      # Interactive demo page
├── styles.css      # Example styling (not GOV.UK branded)
└── validation.js   # Validation patterns for tax references
```

## Usage

1. Open `index.html` in a web browser
2. Review the field examples and try the validation
3. View the HTML source code for implementation patterns

## Important: Non-GOV.UK Sites

### What You MUST Follow

- **HMRC Terminology** — Use correct names for tax references (e.g., "VAT registration number" not "VAT number")
- **WCAG 2.2 AA** — Accessibility requirements are a legal obligation
- **Validation Formats** — Match HMRC's expected formats for API submissions
- **Hint Text Patterns** — Help users find and enter their reference numbers correctly

### What You MUST NOT Do

- **Do NOT use GOV.UK branding** — Crown logo, GOV.UK fonts, or colour schemes
- **Do NOT imply government affiliation** — Unless explicitly authorised
- **Do NOT use GOV.UK Frontend CSS** — This is for government services only

### What This Demo Provides

- Neutral styling that demonstrates patterns without GOV.UK branding
- Complete validation logic for all common HMRC reference types
- Accessible HTML patterns with proper ARIA attributes
- Error message patterns matching HMRC's guidance

## Field Reference

| Field | Label | Format | Example |
|-------|-------|--------|---------|
| VAT registration number | "VAT registration number" | 9 digits (optionally GB prefix) | 123456789 |
| UTR | "Unique Taxpayer Reference (UTR)" | 10 or 13 digits | 1234567890 |
| National Insurance | "National Insurance number" | 2L + 6N + 1L | QQ 12 34 56 C |
| PAYE Reference | "Employer PAYE reference" | 3N + "/" + ref | 123/AB456 |
| Accounts Office | "Accounts Office reference" | 13 characters | 123PX00123456 |
| EORI | "EORI number" | GB/XI + 12-15N | GB123456123456 |

## Sources

- [GOV.UK Design System](https://design-system.service.gov.uk/)
- [HMRC Design Patterns](https://design.tax.service.gov.uk/hmrc-design-patterns/)
- [HMRC Content Style Guide](https://design.tax.service.gov.uk/hmrc-content-style-guide/)
- [WCAG 2.2](https://www.w3.org/WAI/WCAG22/quickref/)

## Licence

The content patterns and terminology guidance are derived from UK Government publications available under the [Open Government Licence v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/).

The demo code is provided for educational purposes.
