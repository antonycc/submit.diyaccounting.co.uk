# Navigation Structure Plan

This document describes the navigation structure for DIY Accounting Submit.

## Current Layout

```
┌─────────────────────────────────────────────────────────────────────────┐
│ HEADER                                                                  │
│ ┌─────────────────────────────────┐  ┌────────────────────────────────┐ │
│ │ 🏠  ⓘ                           │  │ Activity: unrestricted         │ │
│ │                                 │  │ Not logged in  [Log in]        │ │
│ │                                 │  └────────────────────────────────┘ │
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

## About Page (Info Icon Destination)

The info icon (ⓘ) navigates to the About page, which provides links to Help and User Guide:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      About DIY Accounting Submit                        │
│                                                                         │
│              [ Help & FAQs ]          [ User Guide ]                    │
│                                                                         │
│ ┌─────────────────────────────────────────────────────────────────────┐ │
│ │  [ Activities ]     [ Receipts ]     [ Bundles ]                    │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
```

## Site Map / Navigation Flow

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

Help Navigation (via Info Icon ⓘ):

                            ┌─────────────┐
                            │  Any Page   │
                            └──────┬──────┘
                                   │ (click ⓘ)
                                   ▼
                            ┌─────────────┐
                            │    About    │
                            └──────┬──────┘
                                   │
                      ┌────────────┴────────────┐
                      │                         │
                      ▼                         ▼
               ┌─────────────┐           ┌─────────────┐
               │ Help & FAQs │           │ User Guide  │
               └─────────────┘           └─────────────┘
```

## Authentication Journeys

### HMRC Auth Journey: Submit VAT Return

```
┌──────────┐      ┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│   Home   │ ───► │  Submit VAT  │ ───► │ Fill Form &  │ ───► │    HMRC      │
│ (click   │      │  Return Page │      │  Click       │      │   OAuth      │
│  Submit) │      │              │      │  Submit      │      │   Login      │
└──────────┘      └──────────────┘      └──────────────┘      └──────┬───────┘
                                                                     │
                                                                     │ (grant access)
                                                                     ▼
┌──────────┐      ┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│   Home   │ ◄─── │   Receipts   │ ◄─── │   Callback   │ ◄─── │    HMRC      │
│ (via     │      │   (see new   │      │   Page w/    │      │   Redirect   │
│  nav)    │      │    receipt)  │      │   Result     │      │   Back       │
└──────────┘      └──────────────┘      └──────────────┘      └──────────────┘

Timeline: Home → Submit VAT → Fill Form → HMRC OAuth → Callback → Receipt → Home
```

### Cognito/Google Auth Journey: Add Bundle

```
┌──────────┐      ┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│   Home   │ ───► │   Bundles    │ ───► │  Click Add   │ ───► │  Cognito/    │
│ (click   │      │  Page (not   │      │  Bundle      │      │  Google      │
│  Bundles)│      │  logged in)  │      │  (or Login)  │      │  OAuth       │
└──────────┘      └──────────────┘      └──────────────┘      └──────┬───────┘
                                                                     │
                                                                     │ (authenticate)
                                                                     ▼
┌──────────┐      ┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│   Home   │ ◄─── │   Bundles    │ ◄─── │   Callback   │ ◄─── │   Cognito    │
│ (with    │      │   (logged    │      │   Page       │      │   Redirect   │
│  bundle) │      │   in, select)│      │   (tokens)   │      │   Back       │
└──────────┘      └──────────────┘      └──────────────┘      └──────────────┘

Timeline: Home → Bundles → Login → Google OAuth → Callback → Bundles (select) → Home
```

## Navigation Tiers

### Primary Navigation (Main Nav Bar)

Always visible below the header title. Contains core application functions:

| Link | Path | Purpose |
|------|------|---------|
| Activities | `/index.html` | Home page with activity buttons |
| Receipts | `/hmrc/receipt/receipts.html` | View submission receipts |
| Bundles | `/account/bundles.html` | Manage feature bundles |

### Secondary Navigation (Info Icon → About Page)

Top-left info icon (ⓘ) navigates to About page with links to:

| Link | Path | Purpose |
|------|------|---------|
| Help & FAQs | `/help/index.html` | FAQs and troubleshooting |
| User Guide | `/guide/index.html` | Step-by-step usage instructions |

The About page (`/about.html`) itself contains application information.

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
| Home Icon (🏠) | Top-left | Quick return to home from any page |
| Info Icon (ⓘ) | Top-left (after home) | Navigate to About page for Help/Guide |
| Log in | Top-right | Authentication action |

## Design Principles

1. **Primary actions visible** - Activities, Receipts, Bundles are always one click away
2. **Help accessible** - Info icon provides quick access to About → Help/Guide
3. **Legal content unobtrusive** - Footer keeps privacy/terms out of the way
4. **Consistent layout** - Same navigation structure on every page
5. **Home always reachable** - Home icon provides escape hatch from any page
6. **No hidden menus** - All navigation is visible (no hamburger/dropdown required)

## What Works Well

- Clear separation between primary actions and secondary information
- Main nav is always visible - no hunting through menus
- Info icon provides intuitive path to help content
- Home icon provides quick navigation from any page
- Footer keeps legal/meta links accessible but out of the way
- About page serves as hub for help-related content

## Potential Future Improvements

### 1. Authentication-Aware Navigation

The main nav shows Receipts/Bundles but those require login. Options:
- Grey out links when not authenticated
- Show tooltip explaining login requirement
- Hide entirely until authenticated

### 2. Active State Highlighting

Each page should highlight its corresponding nav item:
- Activities: active on `/index.html`
- Receipts: active on `/hmrc/receipt/receipts.html`
- Bundles: active on `/account/bundles.html`

### 3. Breadcrumbs for VAT Pages

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
- `web/public/submit.css` - `.main-nav`, `.header-left`, `.home-link`, `.home-icon`, `.info-link`, `.info-icon`, `.about-nav-links`, `.about-nav-link` styles

### Test Files
- `behaviour-tests/steps/behaviour-steps.js` - `goToHomePageUsingMainNav()`, `goToAboutPage()`, `goToHelpPageFromAbout()`, `goToUserGuideFromAbout()`
- `behaviour-tests/steps/behaviour-bundle-steps.js` - `goToBundlesPage()`
- `behaviour-tests/steps/behaviour-hmrc-receipts-steps.js` - `goToReceiptsPageUsingMainNav()`
