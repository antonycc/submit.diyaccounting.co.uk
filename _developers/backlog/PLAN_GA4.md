# GA4 and Marketing Plan

**Status**: Pending (post go-live tasks)

Live sites:
- https://diyaccounting.co.uk/ (gateway)
- https://spreadsheets.diyaccounting.co.uk/
- https://submit.diyaccounting.co.uk/

## Done

- GA4 property "DIY Accounting" (ID `523400333`) with three data streams
- Measurement IDs in `google-analytics.toml`
- gtag.js on all three sites
- Ecommerce events: `view_item_list`, `view_item`, `begin_checkout`, `add_to_cart`, `purchase` on spreadsheets; `login`, `begin_checkout`, `purchase` on submit; `select_content` on gateway
- Cross-domain tracking
- CSP headers for analytics (`*.google-analytics.com`, `www.googletagmanager.com`)
- Privacy policy with GA4 section
- Default consent mode: `analytics_storage: 'denied'`

## Open

| Item | Notes |
|------|-------|
| Retire old GA4 stream | `G-PJPVQWRWJZ` on `www.diyaccounting.co.uk` — still receiving traffic from old distribution. Retire now that live sites are on new domains. |
| Configure GA4 conversions | Mark `purchase` and `begin_checkout` as conversion events in GA4 console |
| Link Google Ads | Check if remarketing campaigns (conversion ID `1065724931`) are still active |
| Cookie consent banner | GA4 defaults to `analytics_storage: 'denied'`; need consent banner to allow opt-in. GA4 data retention: 14 months. IP anonymization on by default. |
