# Privacy Duties for Operating DIY Accounting Submit

This document outlines the specific privacy and data protection duties required when operating this system, as mandated by UK GDPR and HMRC MTD requirements.

## Administrator: admin@diyaccounting.co.uk

---

## 1. Data Subject Rights Requests (30-day response time)

### Right of Access
- **Request**: User asks for copy of their personal data
- **Action**: Run `scripts/export-user-data.js <userId>` to generate JSON export
- **Deliver**: Email JSON file or provide secure download link
- **Timeline**: Within 30 days

### Right to Erasure ("Right to be Forgotten")
- **Request**: User asks for account and data deletion
- **Action**:
  1. Run `scripts/delete-user-data.js <userId>` to delete bundles and auth data
  2. HMRC receipts will be retained for 7 years (legal requirement) but anonymized
  3. Verify deletion in DynamoDB and Cognito
- **Timeline**: Complete within 30 days
- **Note**: Inform user that HMRC receipts retained for legal compliance

### Right to Rectification
- **Request**: User reports incorrect data
- **Action**: Update data via DynamoDB console or admin scripts
- **Timeline**: Within 30 days

### Right to Data Portability
- **Request**: User wants data in machine-readable format for transfer
- **Action**: Same as Right of Access - export to JSON or CSV
- **Timeline**: Within 30 days

---

## 2. Security Incident Response (72-hour notification)

### When a Breach Occurs
1. **Assess impact**: Determine what data was affected and how many users
2. **Contain**: Immediately mitigate the breach (revoke credentials, block access, etc.)
3. **Notify within 72 hours**:
   - **ICO**: Report via https://ico.org.uk/make-a-complaint/data-protection-complaints/
   - **HMRC**: Email SDSTeam@hmrc.gov.uk if OAuth tokens or HMRC data affected
   - **Affected users**: Email all impacted users with:
     - What happened
     - What data was affected
     - What actions you've taken
     - What users should do (e.g., revoke HMRC authorization, change passwords)
4. **Document**: Keep records of the incident, response, and remediation

### Types of Breaches Requiring Notification
- Unauthorized access to DynamoDB (bundles, receipts)
- Exposed OAuth tokens or HMRC credentials
- AWS credential compromise
- Data exfiltration or ransomware
- Accidental public exposure of user data

---

## 3. Data Retention Management

### Regular Tasks

#### Every 30 Days
- Review and delete data for closed accounts older than 30 days
- Run: `scripts/cleanup-deleted-accounts.js`
- This removes: user bundles, Cognito profiles, OAuth refresh tokens

#### Every 7 Years
- HMRC receipts: After 7 years, eligible for deletion (UK tax record-keeping requirement)
- Consider: Archive to cold storage (S3 Glacier) after 2 years for cost savings

#### Every 90 Days
- Review CloudWatch log retention policies
- Ensure infrastructure logs not exceeding 90 days unless flagged for investigation

---

## 4. Monitoring and Auditing

### Weekly
- Check CloudWatch alarms for unusual access patterns
- Review GuardDuty findings (if enabled)
- Monitor failed authentication attempts

### Monthly
- Review DynamoDB table sizes and growth
- Audit IAM access logs for admin actions
- Check for expired OAuth tokens in need of cleanup

### Quarterly
- Review and update privacy policy if services/data processing changes
- Test data export and deletion scripts
- Verify encryption at rest for all DynamoDB tables

---

## 5. HMRC Compliance

### Ongoing
- **Fraud Prevention Headers**: Ensure all API calls include required Gov-Client-* headers
- **OAuth Token Security**: Never log or expose OAuth tokens; ensure they're encrypted at rest
- **Production Readiness**: Before HMRC approval, verify:
  - Privacy policy URL is live and accessible
  - Terms of use URL is live and accessible
  - Penetration testing completed
  - Fraud prevention headers tested via HMRC Test API

### Annual
- Review and test disaster recovery procedures
- Verify backups and restoration process
- Update security documentation

---

## 6. User Communications

### Privacy Policy Updates
- When changing data processing practices:
  1. Update privacy.html with new "Last updated" date
  2. Email all active users with summary of changes
  3. Add prominent banner on site for 30 days

### Terms of Use Updates
- Similar to privacy policy updates
- For material changes (e.g., new fees, service restrictions):
  - Email users at least 30 days before changes take effect
  - Allow users to close account if they disagree

---

## 7. Scripts and Tools

### Required Admin Scripts (to be created/maintained)

```bash
# Export user data (JSON format)
node scripts/export-user-data.js <userId>

# Delete user account and data
node scripts/delete-user-data.js <userId>

# Cleanup accounts closed >30 days ago
node scripts/cleanup-deleted-accounts.js

# Anonymize old HMRC receipts (after 7 years)
node scripts/anonymize-old-receipts.js --before-date YYYY-MM-DD

# Audit user access logs
node scripts/audit-user-access.js <userId> --days 90
```

### AWS Console Access
- **DynamoDB**: Direct access for data inspection and manual corrections
- **CloudWatch**: Log review and monitoring
- **Cognito**: User management and token revocation
- **Secrets Manager**: OAuth client secrets (never expose in logs)

---

## 8. Contact and Escalation

### Primary Contact
- **Email**: admin@diyaccounting.co.uk
- **Response SLA**: 30 days for data requests, 72 hours for security incidents

### Escalation
- **ICO**: For guidance on complex GDPR issues - https://ico.org.uk/
- **HMRC SDS Team**: SDSTeam@hmrc.gov.uk for MTD compliance questions
- **AWS Support**: For infrastructure security incidents

---

## 9. Documentation to Maintain

### Keep Updated
- This document (PRIVACY_DUTIES.md)
- web/public/privacy.html
- web/public/terms.html
- _developers/REVIEW_TO_MTD.md (HMRC readiness checklist)

### Keep Accessible
- Data processing agreements with AWS
- Penetration test reports
- Security incident logs
- Data subject request logs (who requested what, when responded)

---

## 10. Checklist for HMRC Production Approval

Before submitting for HMRC production credentials:

- [ ] Privacy policy URL live and linked from all pages
- [ ] Terms of use URL live and linked from all pages
- [ ] Data export script tested and working
- [ ] Data deletion script tested and working
- [ ] 72-hour breach notification procedures documented
- [ ] Penetration testing completed and reported
- [ ] Fraud prevention headers validated via HMRC Test API
- [ ] Server location disclosed (AWS eu-west-2 London)
- [ ] Encryption verified (TLS 1.2+ in transit, AES-256 at rest)
- [ ] Admin contact email functional: admin@diyaccounting.co.uk

---

## Summary

**Most Important**:
1. Respond to data requests within **30 days**
2. Report breaches within **72 hours** to ICO and HMRC
3. Delete closed accounts within **30 days**
4. Retain HMRC receipts for **7 years**
5. Keep privacy/terms documentation current and accessible

**Tools Needed**:
- scripts/export-user-data.js
- scripts/delete-user-data.js
- scripts/cleanup-deleted-accounts.js
- scripts/anonymize-old-receipts.js

**Regular Reviews**:
- Weekly: Security monitoring
- Monthly: Data growth and access audits
- Quarterly: Policy reviews and script testing
- Annual: Disaster recovery and penetration testing
