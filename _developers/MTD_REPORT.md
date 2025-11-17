# MTD Report

Write HTTP requests and responses to an db key'd' on the traceparent (partition?) and request-id (sort?).
And the hashed sub.

For Sandbox mode behaviour tests, extract a report from the HMRC audit db using the traceparent and
request-id.

Extract screenshots from tests and match to the test transactions by finding a request-id in the test log

Extend behaviour tests to read HMRC_TEST_SCENARIO=[all|sometest|etc..]
Then run either:
- default: current tests
- all: iterate through all scenarios
- scenario: pick from list with form submission
This is also exposed as a job parameter so all the tests c

---
# Example report:
---

# HMRC API (Sandbox) POST /hmrc/api/1

## Scenario: Title

Description

## Result: Pass observed at <timestamp>

Test data table:
--------------------------
| VAT number | 123456789 |
--------------------------
| Period     | 24A1      |
--------------------------
| Amount     | 1.23      |
--------------------------

Fill form:
<screenshot>

Request to HMRC:
```
```

Response from to HMRC:
```
```

Result:
<screenshot>
