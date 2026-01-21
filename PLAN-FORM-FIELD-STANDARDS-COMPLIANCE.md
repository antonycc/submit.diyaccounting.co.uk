# Plan: UK Government Form Field Standards Compliance

## Overview

This plan addresses deviations from the [UK Government Form Field Standards Guide](./UK-Government-Form-Field-Standards-Guide.md) found in the public web forms. The guide follows GOV.UK Design System patterns for WCAG 2.2 AA compliance.

---

## Phase 1: VAT Registration Number Fields (HIGH PRIORITY)

### Deviation Summary
All VAT forms use inconsistent labeling and lack proper accessibility attributes for the VAT registration number field.

### Files to Change
- `web/public/hmrc/vat/submitVat.html`
- `web/public/hmrc/vat/viewVatReturn.html`
- `web/public/hmrc/vat/vatObligations.html`

### Current Implementation
```html
<label for="vatNumber">VAT Registration Number (VRN)</label>
<input
  type="text"
  id="vatNumber"
  name="vatNumber"
  required
  placeholder="e.g., 176540158"
  maxlength="9"
  pattern="[0-9]{9}"
  autocomplete="off"
/>
<div class="help-text">Enter your 9-digit VAT registration number</div>
```

### Issues
1. Label says "VAT Registration Number (VRN)" - should be "VAT registration number" (lowercase, no abbreviation)
2. Missing `aria-describedby` linking to hint text
3. Hint text uses `<div class="help-text">` instead of `<p id="..." class="hint">`
4. Hint text missing: GB prefix option, format examples, where to find it
5. Missing `spellcheck="false"` attribute
6. `autocomplete="off"` should be removed (not needed for VAT number)

### Required Fix
```html
<div class="form-group">
  <label for="vatNumber">VAT registration number</label>
  <p id="vatNumber-hint" class="hint">
    This is 9 numbers, sometimes with 'GB' at the start, for example
    123456789 or GB123456789. You can find it on your VAT registration certificate.
  </p>
  <input
    type="text"
    id="vatNumber"
    name="vatNumber"
    required
    placeholder="e.g., 176540158"
    maxlength="9"
    pattern="[0-9]{9}"
    aria-describedby="vatNumber-hint"
    spellcheck="false"
  />
</div>
```

### Changes Per File

**submitVat.html (lines ~67-79):**
- Change label from "VAT Registration Number (VRN)" to "VAT registration number"
- Change `<div class="help-text">` to `<p id="vatNumber-hint" class="hint">`
- Update hint text content
- Add `aria-describedby="vatNumber-hint"` to input
- Add `spellcheck="false"` to input
- Remove `autocomplete="off"`

**viewVatReturn.html (lines ~65-67):**
- Same changes as submitVat.html (field id is "vrn")

**vatObligations.html (lines ~69-71):**
- Same changes as submitVat.html (field id is "vrn")

---

## Phase 2: Currency/Monetary Fields (MEDIUM PRIORITY)

### Deviation Summary
All 9 VAT box fields in submitVat.html use `type="number"` without the required £ prefix pattern.

### Files to Change
- `web/public/hmrc/vat/submitVat.html`

### Current Implementation
```html
<label for="vatDueSales">Box 1: VAT due on sales and other outputs (£)</label>
<input type="number" id="vatDueSales" name="vatDueSales" required placeholder="0.00" step="0.01" />
```

### Issues
1. No `<div class="input-prefix">` wrapper with `<span class="prefix">£</span>`
2. Using `type="number"` instead of `type="text"` with `inputmode="decimal"`
3. Missing `aria-describedby` linking to format hint
4. No format examples in hint text (e.g., "£600 or £193.54")

### Required Fix
```html
<div class="form-group">
  <label for="vatDueSales">Box 1: VAT due on sales and other outputs</label>
  <p id="vatDueSales-hint" class="hint">For example, £600 or £193.54</p>
  <div class="input-prefix">
    <span class="prefix">£</span>
    <input
      type="text"
      id="vatDueSales"
      name="vatDueSales"
      required
      placeholder="0.00"
      inputmode="decimal"
      aria-describedby="vatDueSales-hint"
    />
  </div>
</div>
```

### Fields to Update (submitVat.html)
| Field | Line | ID |
|-------|------|-----|
| Box 1: VAT due on sales | ~100-102 | vatDueSales |
| Box 2: VAT due on acquisitions | ~107-109 | vatDueAcquisitions |
| Box 3: Total VAT due | ~114-116 | totalVatDue |
| Box 4: VAT reclaimed | ~121-123 | vatReclaimed |
| Box 5: Net VAT due | ~128-130 | netVatDue |
| Box 6: Total value of sales | ~135-137 | totalSales |
| Box 7: Total value of purchases | ~142-144 | totalPurchases |
| Box 8: Total goods supplied | ~149-151 | goodsSupplied |
| Box 9: Total acquisitions | ~156-158 | totalAcquisitions |

### CSS Required
Add to `web/public/submit.css`:
```css
.input-prefix {
  display: flex;
  align-items: center;
}
.input-prefix .prefix {
  padding: 0.5em 0.75em;
  background-color: #f3f2f1;
  border: 2px solid #0b0c0c;
  border-right: none;
  font-size: 1rem;
}
.input-prefix input {
  flex: 1;
  border-left: none;
}
```

---

## Phase 3: Help Text Accessibility (MEDIUM PRIORITY)

### Deviation Summary
All help text uses `<div class="help-text">` instead of the accessible pattern `<p id="[field]-hint" class="hint">` with matching `aria-describedby`.

### Files to Change
- `web/public/hmrc/vat/submitVat.html`
- `web/public/hmrc/vat/viewVatReturn.html`
- `web/public/hmrc/vat/vatObligations.html`

### Pattern to Apply
For every field with help text:

**Before:**
```html
<label for="fieldId">Field Label</label>
<input type="text" id="fieldId" ... />
<div class="help-text">Help text here</div>
```

**After:**
```html
<label for="fieldId">Field Label</label>
<p id="fieldId-hint" class="hint">Help text here</p>
<input type="text" id="fieldId" aria-describedby="fieldId-hint" ... />
```

### Fields Requiring This Change

**submitVat.html:**
- VAT number field
- Obligation select field
- All 9 VAT box fields (if not already using hint pattern)

**viewVatReturn.html:**
- VAT number field
- Obligation select field
- Test scenario dropdown

**vatObligations.html:**
- VAT number field
- From date field
- To date field
- Test scenario dropdown

---

## Phase 4: Select Field Accessibility (LOW PRIORITY)

### Deviation Summary
Select dropdowns lack `aria-describedby` linking to their hint text.

### Files to Change
- `web/public/hmrc/vat/submitVat.html`
- `web/public/hmrc/vat/viewVatReturn.html`
- `web/public/hmrc/vat/vatObligations.html`

### Current Implementation
```html
<label for="obligationSelect">VAT Period</label>
<select id="obligationSelect" name="obligationSelect" required>
  <option value="">-- Enter VRN to load periods --</option>
</select>
<div class="help-text">Select the VAT period you're submitting for</div>
```

### Required Fix
```html
<label for="obligationSelect">VAT period</label>
<p id="obligationSelect-hint" class="hint">Select the VAT period you're submitting for</p>
<select id="obligationSelect" name="obligationSelect" required aria-describedby="obligationSelect-hint">
  <option value="">-- Enter VRN to load periods --</option>
</select>
```

---

## Verification Checklist

After implementing each phase, verify:

1. **Unit tests pass:** `npm test`
2. **Browser tests pass:** `npm run test:browser`
3. **Behaviour tests pass:** `npm run test:submitVatBehaviour-proxy`
4. **Manual accessibility check:**
   - Screen reader announces hint text when field receives focus
   - No console errors related to ARIA attributes
   - Visual £ prefix displays correctly for currency fields

---

## Summary Table

| Phase | Issue Type | Count | Files | Effort |
|-------|-----------|-------|-------|--------|
| 1 | VAT registration number labeling | 3 fields | 3 files | Low |
| 1 | VAT registration number aria-describedby | 3 fields | 3 files | Low |
| 1 | VAT registration number hint content | 3 fields | 3 files | Low |
| 2 | Currency £ prefix pattern | 9 fields | 1 file | Medium |
| 2 | Currency inputmode="decimal" | 9 fields | 1 file | Low |
| 2 | Currency aria-describedby | 9 fields | 1 file | Low |
| 3 | Help text div to p conversion | ~15 instances | 3 files | Medium |
| 4 | Select aria-describedby | ~5 fields | 3 files | Low |

**Total: ~52 individual changes across 3 HTML files**

---

## Implementation Order

1. **Phase 1** - Critical accessibility fixes for VAT registration number
2. **Phase 2** - Currency field improvements (significant visual change)
3. **Phase 3** - General help text accessibility (structural changes)
4. **Phase 4** - Select field accessibility (minor improvements)

Each phase should be implemented and tested before proceeding to the next.
