# Incident Response Playbook

## Quick Reference

**Security Incidents Hotline:** security@diyaccounting.co.uk  
**AWS Support:** https://console.aws.amazon.com/support/  
**Escalation:** admin@diyaccounting.co.uk

---

## Common Incident Scenarios

### Scenario 1: Suspicious Authentication Activity

**Symptoms:**
- CloudWatch Alarm: High 401 error rate (> 50/5min)
- Multiple failed login attempts from same IP
- Login attempts from unusual geographic locations

**Immediate Actions:**
1. **Identify affected user(s)**:
   ```bash
   aws logs filter-log-events \
     --log-group-name /aws/lambda/auth-function \
     --filter-pattern '401' \
     --start-time $(date -u -d '15 minutes ago' +%s)000
   ```

2. **Block malicious IP in WAF**:
   ```bash
   aws wafv2 update-ip-set \
     --name BlockedIPs \
     --scope CLOUDFRONT \
     --id YOUR_IP_SET_ID \
     --addresses 192.0.2.1/32
   ```

3. **Force user logout** (if compromised):
   ```bash
   aws cognito-idp admin-user-global-sign-out \
     --user-pool-id YOUR_USER_POOL_ID \
     --username user@example.com
   ```

4. **Enable MFA for affected user** (if not already enabled):
   ```bash
   aws cognito-idp admin-set-user-mfa-preference \
     --user-pool-id YOUR_USER_POOL_ID \
     --username user@example.com \
     --software-token-mfa-settings Enabled=true,PreferredMfa=true
   ```

5. **Monitor for additional suspicious activity**:
   - Check CloudWatch Logs for same source IP
   - Check for successful logins after failed attempts
   - Review user activity logs (API calls, VAT submissions)

**Investigation:**
- Determine if credentials were compromised (password reuse, phishing)
- Check if user's email account was compromised
- Review user's recent account activity for unauthorized actions

**Resolution:**
- Require user to reset password
- Enable MFA for user account
- Remove WAF IP block after 24 hours (if confirmed not malicious)

---

### Scenario 2: Exposed AWS Credentials

**Symptoms:**
- AWS IAM Access Analyzer alert
- GitHub secret scanning alert
- Unusual AWS API activity (GuardDuty finding)
- Unexpected AWS bills (crypto-mining)

**Immediate Actions:**
1. **Deactivate exposed credentials**:
   ```bash
   aws iam delete-access-key \
     --access-key-id AKIAIOSFODNN7EXAMPLE \
     --user-name compromised-user
   ```

2. **Revoke active sessions**:
   ```bash
   aws sts get-session-token  # Get current session info
   # Sessions automatically expire; no revocation API for STS
   ```

3. **Review recent API activity**:
   ```bash
   aws cloudtrail lookup-events \
     --lookup-attributes AttributeKey=AccessKeyId,AttributeValue=AKIAIOSFODNN7EXAMPLE \
     --max-results 50
   ```

4. **Check for created resources** (EC2, Lambda, S3):
   ```bash
   aws ec2 describe-instances --filters "Name=tag:CreatedBy,Values=compromised-key"
   aws s3 ls  # Look for unexpected buckets
   aws lambda list-functions  # Look for unexpected functions
   ```

5. **Rotate affected secrets**:
   - If credentials had Secrets Manager access, rotate all secrets
   - Update application code with new credentials
   - Deploy updated application

**Investigation:**
- Determine how credentials were exposed (committed to Git, leaked in logs)
- Assess scope of unauthorized access (resources created, data accessed)
- Calculate financial impact (unexpected AWS charges)

**Resolution:**
- Generate new credentials (if needed)
- Update application configuration
- Implement preventive measures (git-secrets, pre-commit hooks)
- File AWS billing dispute (if fraudulent charges)

---

### Scenario 3: DDoS Attack

**Symptoms:**
- CloudWatch Alarm: Unusual request volume (> 10,000/min)
- CloudFront WAF blocking high percentage of requests
- API Gateway throttling errors (429 status codes)
- Increased AWS costs (data transfer, Lambda invocations)

**Immediate Actions:**
1. **Verify it's an attack** (not legitimate traffic spike):
   - Check CloudWatch metrics (request count, blocked requests)
   - Review WAF sampled requests (look for patterns)
   - Check for single source IP or distributed attack

2. **Enable AWS Shield Advanced** (if not already enabled):
   ```bash
   aws shield create-protection \
     --name submit-diyaccounting-cloudfront \
     --resource-arn arn:aws:cloudfront::ACCOUNT:distribution/DIST_ID
   ```
   Note: Shield Advanced costs $3,000/month but provides DDoS Response Team (DRT) support

3. **Tighten WAF rate limiting**:
   - Temporarily reduce rate limit from 2000 req/5min to 500 req/5min
   - Add geographic blocking (if attack from specific country)
   - Add IP reputation lists (AWS managed rule group)

4. **Contact AWS Support**:
   - Open high-priority support case
   - Request DDoS mitigation assistance
   - AWS may provide free Shield Advanced during attack

5. **Enable CloudFront geo-restrictions** (if attack from specific regions):
   ```bash
   aws cloudfront update-distribution \
     --id DIST_ID \
     --distribution-config file://geo-restrictions.json
   ```

**Investigation:**
- Determine attack type (volumetric, application-layer, protocol attack)
- Identify attack pattern (single IP, botnet, amplification attack)
- Assess impact (service degradation, downtime, cost)

**Resolution:**
- Remove temporary WAF rules after attack subsides
- Implement permanent protections (keep Shield Advanced if attacks are frequent)
- Optimize application to handle high traffic (caching, CDN optimization)

---

### Scenario 4: Data Breach (S3 Bucket Exposed)

**Symptoms:**
- AWS Access Analyzer finding: S3 bucket publicly accessible
- CloudTrail event: Bucket policy changed to allow public access
- Unusual GetObject API calls from unknown IPs
- Third-party notification (security researcher, media)

**Immediate Actions:**
1. **Block all public access**:
   ```bash
   aws s3api put-public-access-block \
     --bucket receipts-bucket-name \
     --public-access-block-configuration \
       "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"
   ```

2. **Review bucket policy** (revert to secure policy):
   ```bash
   aws s3api get-bucket-policy --bucket receipts-bucket-name
   aws s3api delete-bucket-policy --bucket receipts-bucket-name  # Remove if malicious
   aws s3api put-bucket-policy --bucket receipts-bucket-name --policy file://secure-policy.json
   ```

3. **Check CloudTrail** for who changed bucket policy:
   ```bash
   aws cloudtrail lookup-events \
     --lookup-attributes AttributeKey=ResourceName,AttributeValue=receipts-bucket-name \
     --max-results 50
   ```

4. **Assess data accessed**:
   - Review S3 access logs (if enabled)
   - Check CloudTrail for GetObject events
   - Determine which objects were accessed by unauthorized parties

5. **Rotate affected credentials**:
   - If IAM credentials were used, rotate them
   - If bucket contained OAuth secrets, rotate them
   - Update applications with new credentials

**Investigation:**
- Determine how bucket became public (misconfiguration, compromised credentials)
- Identify all objects accessed by unauthorized parties
- Assess sensitivity of exposed data (PII, secrets, financial data)

**Resolution:**
- Notify affected users (GDPR breach notification within 72 hours)
- Implement preventive measures (SCPs to block public S3 buckets)
- Enable S3 Object Lock (prevent accidental or malicious deletion)
- Enable MFA Delete for critical buckets

**GDPR Breach Notification** (if PII exposed):
- **Within 72 hours**: Notify ICO (Information Commissioner's Office) in UK
- **Without undue delay**: Notify affected data subjects
- **Include**: Nature of breach, likely consequences, measures taken, contact point

---

### Scenario 5: Vulnerable Dependency

**Symptoms:**
- GitHub Dependabot alert: Critical vulnerability in dependency
- npm audit: High-severity vulnerability
- CVE notification from dependency maintainer
- Media coverage of widespread vulnerability (e.g., Log4Shell)

**Immediate Actions:**
1. **Assess impact**:
   - Determine if vulnerable code path is used in application
   - Check if vulnerability is exploitable in current deployment
   - Review CVE details (CVSS score, attack vector)

2. **Check for exploits**:
   - Search logs for known exploit patterns
   - Check WAF logs for blocked requests matching exploit
   - Review CloudTrail for unusual API activity

3. **Update dependency** (if patch available):
   ```bash
   npm update package-name@latest
   npm audit fix
   npm audit
   ```

4. **Test updated application**:
   ```bash
   npm test
   npm run test:integration
   npm run test:system
   ```

5. **Deploy hotfix** (expedited deployment):
   ```bash
   ./mvnw clean package
   npx cdk deploy WebStack-prod
   ```

**Investigation:**
- Determine if application was compromised via vulnerability
- Check for unauthorized access or data exfiltration
- Review logs for time period when vulnerability existed

**Resolution:**
- Update all environments (dev, staging, production)
- Document incident and response time
- Improve dependency update process (automate with Dependabot auto-merge)

---

### Scenario 6: Insider Threat (Accidental or Malicious)

**Symptoms:**
- CloudTrail event: Unusual IAM policy changes
- CloudTrail event: Large data export (S3 GetObject bulk)
- CloudTrail event: User pool deletion attempt
- Employee reports lost or stolen laptop

**Immediate Actions:**
1. **Revoke access** (if malicious or stolen device):
   ```bash
   aws iam delete-access-key --user-name employee-name --access-key-id AKIAIOSFODNN7EXAMPLE
   aws iam remove-user-from-group --user-name employee-name --group-name Developers
   ```

2. **Review activity** (past 90 days):
   ```bash
   aws cloudtrail lookup-events \
     --lookup-attributes AttributeKey=Username,AttributeValue=employee-name \
     --max-results 1000
   ```

3. **Check for backdoors**:
   - Review IAM users created by insider (delete if unauthorized)
   - Review IAM roles and policies changed by insider (revert if malicious)
   - Check for Lambda functions created (may contain backdoor code)
   - Review S3 bucket policies (may have added unauthorized access)

4. **Secure stolen device** (if laptop stolen):
   - Wipe device remotely (MDM solution)
   - Rotate credentials accessible from device (SSH keys, AWS keys)
   - Monitor for login attempts from device

**Investigation:**
- Determine motive (accidental, financial, disgruntled employee)
- Assess damage (data exfiltrated, configurations changed)
- Interview employee (if accidental)

**Resolution:**
- Terminate employee access (if malicious)
- Implement least privilege IAM policies (prevent future incidents)
- Enable CloudTrail data events (monitor S3 object access)
- Implement code review for infrastructure changes

---

## Escalation Matrix

| Severity | Notification | Escalation | Response SLA |
|----------|-------------|------------|--------------|
| **Critical** | Security team, CTO, CEO | AWS Support (Business/Enterprise), external security firm | 15 minutes |
| **High** | Security team, CTO | AWS Support, internal team | 1 hour |
| **Medium** | Security team | Internal team | 4 hours |
| **Low** | Security team | Internal team | 1 week |

---

## Post-Incident Review Template

**Incident ID:** INC-2025-001  
**Date:** 2025-11-13  
**Severity:** High  
**Status:** Resolved

### Summary
Brief description of what happened.

### Timeline
- **00:00 UTC**: Incident detected (CloudWatch Alarm)
- **00:05 UTC**: Initial investigation started
- **00:15 UTC**: Root cause identified (credential stuffing attack)
- **00:20 UTC**: Containment actions taken (IP blocked, user signed out)
- **00:30 UTC**: Incident resolved (user password reset, MFA enabled)
- **01:00 UTC**: Monitoring for recurrence

### Root Cause
Detailed explanation of what caused the incident.

### Impact
- Users affected: 1
- Service downtime: None
- Data compromised: No
- Financial cost: $0

### Actions Taken
1. Blocked attacker IP in WAF
2. Forced user global sign-out
3. Enabled MFA for user account
4. Notified user of suspicious activity

### Preventive Measures
1. Enable MFA for all users (optional)
2. Implement failed login attempt monitoring
3. Add CloudWatch Alarm for unusual login patterns
4. Educate users on password security

### Lessons Learned
- Current detection worked well (CloudWatch Alarms)
- Response time was acceptable (15 minutes)
- Need to automate IP blocking (Lambda function)
- Consider enabling Cognito Advanced Security

### Follow-up Actions
- [ ] Update incident response procedures (Owner: Security Team, Due: 2025-11-20)
- [ ] Implement automated IP blocking (Owner: Dev Team, Due: 2025-12-01)
- [ ] Enable Cognito Advanced Security (Owner: Ops Team, Due: 2025-12-15)
- [ ] Schedule follow-up review (Owner: Security Team, Due: 2025-12-13)

---

## Security Tools & Commands

### CloudWatch Logs Insights Queries

**Find 401 errors in past hour:**
```sql
fields @timestamp, @message
| filter @message like /401/
| sort @timestamp desc
| limit 100
```

**Find failed Cognito sign-ins:**
```sql
fields @timestamp, userIdentity.principalId, sourceIPAddress, errorMessage
| filter eventName = "InitiateAuth" and errorMessage like /NotAuthorizedException/
| stats count() by sourceIPAddress
| sort count desc
```

**Find unusual API activity:**
```sql
fields @timestamp, eventName, userIdentity.principalId, sourceIPAddress
| filter eventTime > ago(1h)
| stats count() by eventName, sourceIPAddress
| sort count desc
| limit 20
```

### AWS CLI Commands

**List all S3 buckets and public access status:**
```bash
aws s3api list-buckets --query 'Buckets[].Name' --output text | \
  xargs -I {} aws s3api get-public-access-block --bucket {} 2>/dev/null
```

**Find IAM users without MFA:**
```bash
aws iam list-users --query 'Users[].UserName' --output text | \
  xargs -I {} sh -c 'aws iam list-mfa-devices --user-name {} | grep -q SerialNumber || echo {}'
```

**Review recent CloudTrail events:**
```bash
aws cloudtrail lookup-events --max-results 50 \
  --lookup-attributes AttributeKey=EventName,AttributeValue=DeleteBucket \
  --output table
```

**Check Lambda function configurations:**
```bash
aws lambda list-functions --query 'Functions[].FunctionName' --output text | \
  xargs -I {} aws lambda get-function-configuration --function-name {}
```

---

## Contact Information

**Internal Contacts:**
- Security Team: security@diyaccounting.co.uk
- CTO: cto@diyaccounting.co.uk
- Admin: admin@diyaccounting.co.uk

**External Contacts:**
- AWS Support: https://console.aws.amazon.com/support/
- AWS Trust & Safety: abuse@amazonaws.com
- ICO (GDPR Breach): https://ico.org.uk/make-a-complaint/data-protection-complaints/
- Action Fraud (Cybercrime): https://www.actionfraud.police.uk/

**Third-Party Security:**
- GitHub Security: security@github.com
- Google Security: security@google.com
- HMRC Security: (via HMRC developer hub)

---

**Document Version:** 1.0  
**Last Updated:** 2025-11-13  
**Next Review:** 2026-02-13 (Quarterly)  
**Owner:** Security Team
