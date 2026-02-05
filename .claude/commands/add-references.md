# Add Citation References to a Knowledge Base Article

Process a single article to add inline citation references backed by authoritative sources.

## Arguments

The user provides an article filename (e.g., `capital-allowances.html` or `articles/capital-allowances.html`).

## Instructions

### Step 1: Load the reference database

Read `web/spreadsheets.diyaccounting.co.uk/public/references.toml` to load all existing references. Note the highest reference ID number (e.g., if REF016 exists, next is REF017).

### Step 2: Read the target article

Read the article HTML file from `web/spreadsheets.diyaccounting.co.uk/public/articles/<filename>`. If the user provided a path without `articles/`, prepend it.

### Step 3: Identify verifiable claims

Scan the article body text for verifiable factual statements. Focus on:
- **Numerical thresholds**: pound amounts (£X), percentages, time periods
- **Legal requirements**: "must", "required", "compulsory", obligations
- **Deadlines**: filing dates, registration periods, retention periods
- **Rates and allowances**: tax rates, flat rate percentages, allowance amounts
- **Regulatory rules**: who qualifies, eligibility criteria, penalty structures

Skip opinions, advice, how-to instructions, and product descriptions.

### Step 4: Match or create references

For each verifiable claim found:

a. **Check for existing match**: Search references.toml for a reference with a similar `claim` or matching `category`. If the claim is essentially the same fact (even worded differently), REUSE the existing reference ID.

b. **If no match exists**: Create a new reference entry:
   - Assign next sequential ID (REF017, REF018, etc.)
   - Write a concise `claim` statement
   - Assign appropriate `category` from: vat-registration, vat-flat-rate, vat-penalties, vat-records, mtd-vat, mtd-itsa, capital-allowances, tax-rates, payroll, company, sole-trader, bookkeeping, general
   - **Fetch the authoritative source**: Use WebFetch to access the relevant GOV.UK/HMRC page and extract a verbatim quote supporting the claim
   - Record: source URL, page title, publisher, verbatim extract, today's date, authority level (primary/secondary/commentary)

c. **Add the article ID** to the reference's `articles` array if not already listed.

### Step 5: Add inline markup to article HTML

For each matched claim in the article text, wrap it with citation markup:

```html
<span class="ref" data-ref="REF001">the claim text<sup><a href="../references.html#REF001">[1]</a></sup></span>
```

The number in brackets [1], [2], etc. should be sequential within the article (first reference mentioned = [1], second = [2], etc.), regardless of the global REF ID.

### Step 6: Update JSON-LD structured data

Add a `"citation"` array to the article's existing JSON-LD script:

```json
"citation": [
  {
    "@type": "CreativeWork",
    "name": "Source page title",
    "url": "https://www.gov.uk/...",
    "publisher": {
      "@type": "GovernmentOrganization",
      "name": "HM Revenue & Customs"
    },
    "dateAccessed": "2026-02-05"
  }
]
```

### Step 7: Update references.toml

Append any new `[[reference]]` and `[[reference.source]]` entries to the end of references.toml. Update existing references' `articles` arrays if the current article was added.

### Step 8: Report

Print a summary:
- Article processed: filename
- References added inline: count
- Existing references reused: list of IDs
- New references created: list of IDs with claims
- Sources fetched: list of URLs accessed

## Important Rules

- **Never fabricate sources**: Only cite pages you actually fetched via WebFetch
- **Verbatim extracts only**: Copy exact text from the source, do not paraphrase
- **Preserve article content**: Do not change the article's body text — only add `<span class="ref">` wrappers around existing text
- **One article per run**: This skill processes exactly one article to keep changes reviewable
- **Commit after each article**: The user should commit changes after reviewing each article's references
