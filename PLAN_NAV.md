# Navigation Structure Plan

This document describes the navigation structure for DIY Accounting Submit.

## Current Layout

```
┌─────────────────────────────────────────────────────────────────────────┐
│ HEADER                                                                  │
│ ┌─────────────────────────────────┐  ┌────────────────────────────────┐ │
│ │ 🏠  ☰                           │  │ Activity: unrestricted         │ │
│ │      ├─ User Guide              │  │ Not logged in  [Log in]        │ │
│ │      ├─ Help                    │  └────────────────────────────────┘ │
│ │      └─ About                   │                                     │
│ └─────────────────────────────────┘                                     │
│                                                                         │
│                    DIY Accounting Submit                                │
│         Submit UK VAT returns to HMRC under Making Tax Digital          │
│                                                                         │
│ ┌─────────────────────────────────────────────────────────────────────┐ │
│ │  [ Activities ]     [ Receipts ]     [ Bundles ]                    │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│ MAIN CONTENT                                                            │
│                                                                         │
│   (page-specific content)                                               │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│ FOOTER                                                                  │
│  tests | api | privacy | terms | accessibility    © 2025-2026 DIY...   │
└─────────────────────────────────────────────────────────────────────────┘
```

## Site Map / Flow

```
                            ┌─────────────┐
                            │    HOME     │
                            │ (Activities)│
                            └──────┬──────┘
                                   │
          ┌────────────────────────┼────────────────────────┐
          │                        │                        │
          ▼                        ▼                        ▼
   ┌─────────────┐         ┌─────────────┐         ┌─────────────┐
   │  Receipts   │         │   Bundles   │         │  VAT Pages  │
   └─────────────┘         └─────────────┘         └──────┬──────┘
                                                          │
                                   ┌──────────────────────┼──────────────────────┐
                                   │                      │                      │
                                   ▼                      ▼                      ▼
                            ┌─────────────┐       ┌─────────────┐       ┌─────────────┐
                            │ Submit VAT  │       │ Obligations │       │ View Return │
                            └─────────────┘       └─────────────┘       └─────────────┘
```

## Navigation Tiers

### Primary Navigation (Main Nav Bar)

Always visible below the header title. Contains core application functions:

| Link | Path | Purpose |
|------|------|---------|
| Activities | `/index.html` | Home page with activity buttons |
| Receipts | `/hmrc/receipt/receipts.html` | View submission receipts |
| Bundles | `/account/bundles.html` | Manage feature bundles |

### Secondary Navigation (Hamburger Menu)

Top-left corner, contains informational/support pages:

| Link | Path | Purpose |
|------|------|---------|
| User Guide | `/guide/index.html` | Step-by-step usage instructions |
| Help | `/help/index.html` | FAQs and troubleshooting |
| About | `/about.html` | Application information |

### Tertiary Navigation (Footer)

Bottom of page, contains legal and meta links:

| Link | Path | Purpose |
|------|------|---------|
| tests | `/tests/index.html` | Test results dashboard |
| api | `/docs/index.html` | API documentation |
| privacy | `/privacy.html` | Privacy policy |
| terms | `/terms.html` | Terms of use |
| accessibility | `/accessibility.html` | Accessibility statement |

### Quick Navigation

| Element | Location | Purpose |
|---------|----------|---------|
| Home Icon | Top-left (before hamburger) | Quick return to home from any page |
| Log in | Top-right | Authentication action |

## Design Principles

1. **Primary actions visible** - Activities, Receipts, Bundles are always one click away
2. **Secondary info accessible** - User Guide, Help, About available via hamburger
3. **Legal content unobtrusive** - Footer keeps privacy/terms out of the way
4. **Consistent layout** - Same navigation structure on every page
5. **Home always reachable** - Home icon provides escape hatch from any page

## What Works Well

- Clear separation between primary actions and secondary information
- Main nav is always visible - no hunting through menus
- Home icon provides quick navigation from any page
- Footer keeps legal/meta links accessible but out of the way

## Potential Future Improvements

### 1. Authentication-Aware Navigation

The main nav shows Receipts/Bundles but those require login. Options:
- Grey out links when not authenticated
- Show tooltip explaining login requirement
- Hide entirely until authenticated

### 2. Active State Highlighting

Currently only Activities shows as "active" on home page. Each page should highlight its corresponding nav item:
- Activities: active on `/index.html`
- Receipts: active on `/hmrc/receipt/receipts.html`
- Bundles: active on `/account/bundles.html`

### 3. Mobile Hamburger Simplification

On mobile, there's now both the hamburger AND the main nav visible. Options:
- Remove hamburger entirely on mobile
- Move User Guide/Help/About to footer
- Collapse main nav into hamburger on very small screens

### 4. Breadcrumbs for VAT Pages

VAT pages are nested (Submit VAT, Obligations, View Return). Could add breadcrumbs:
```
Activities > Submit VAT Return
Activities > VAT Obligations
```

## Files Affected

Navigation structure is implemented in:

### HTML Pages
- `web/public/index.html`
- `web/public/account/bundles.html`
- `web/public/hmrc/receipt/receipts.html`
- `web/public/hmrc/vat/submitVat.html`
- `web/public/hmrc/vat/vatObligations.html`
- `web/public/hmrc/vat/viewVatReturn.html`
- `web/public/auth/login.html`
- `web/public/about.html`
- `web/public/privacy.html`
- `web/public/terms.html`
- `web/public/accessibility.html`
- `web/public/help/index.html`
- `web/public/guide/index.html`

### CSS
- `web/public/submit.css` - `.main-nav`, `.header-left`, `.home-link`, `.home-icon` styles

### Test Files
- `behaviour-tests/steps/behaviour-steps.js` - `goToHomePageUsingHamburgerMenu()`
- `behaviour-tests/steps/behaviour-bundle-steps.js` - `goToBundlesPage()`
- `behaviour-tests/steps/behaviour-hmrc-receipts-steps.js` - `goToReceiptsPageUsingHamburgerMenu()`
