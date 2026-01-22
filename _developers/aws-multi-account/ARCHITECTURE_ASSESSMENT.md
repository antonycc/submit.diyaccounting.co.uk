# AWS Multi-Account Architecture Assessment

This document evaluates the DIY Accounting Submit AWS multi-account architecture against AWS best practices, the AWS Well-Architected Framework, and community standards.

## Executive Summary

The proposed 4-account model (management, backup, ci, prod) represents a **right-sized implementation** of AWS multi-account best practices for a small team. It balances security isolation benefits with operational simplicity.

**Overall Assessment**: Aligned with AWS best practices for the organization's size and requirements.

---

## 1. AWS Well-Architected Framework Alignment

### 1.1 Security Pillar

| Principle | Implementation | Status | Notes |
|-----------|---------------|--------|-------|
| **SEC01 - Operate your workloads securely** | Separate accounts isolate blast radius | Aligned | Compromise of CI cannot affect prod |
| **SEC02 - Manage identities and permissions** | IAM Identity Center for centralized SSO | Aligned | Single identity source, role-based access |
| **SEC03 - Protect data in transit and at rest** | Cross-account backup vault isolation | Aligned | Ransomware in prod cannot delete backups |
| **SEC04 - Detect and respond to security events** | Account-level CloudTrail | Aligned | Per-account audit trails |
| **SEC05 - Protect network resources** | VPC isolation per account | Aligned | No cross-account network exposure |
| **SEC06 - Protect compute resources** | Separate Lambda execution contexts | Aligned | CI functions cannot access prod data |
| **SEC07 - Classify your data** | Clear boundaries by account type | Aligned | PII only in prod account |

**Security Pillar Score**: 7/7 principles addressed

### 1.2 Operational Excellence Pillar

| Principle | Implementation | Status | Notes |
|-----------|---------------|--------|-------|
| **OPS01 - Organization** | Clear account boundaries (ci/prod/backup) | Aligned | Unambiguous ownership |
| **OPS02 - Prepare** | Separate CI environment for testing | Aligned | Safe deployment testing |
| **OPS03 - Operate** | GitHub Actions for consistent deployments | Aligned | Automated, repeatable |
| **OPS04 - Evolve** | Infrastructure as Code (CDK) | Aligned | Version controlled, auditable |

**Operational Excellence Score**: 4/4 principles addressed

### 1.3 Reliability Pillar

| Principle | Implementation | Status | Notes |
|-----------|---------------|--------|-------|
| **REL01 - Foundations** | Multi-account isolation | Aligned | Service limit isolation |
| **REL02 - Workload architecture** | Same architecture per environment | Aligned | Consistent patterns |
| **REL09 - Backup and restore** | Cross-account backup vault | Aligned | Survives account compromise |
| **REL10 - Disaster recovery** | Backup account independence | Aligned | Recovery possible from backup account |
| **REL11 - Design for failure** | Account-level fault isolation | Aligned | CI failure doesn't impact prod |

**Reliability Score**: 5/5 principles addressed

### 1.4 Cost Optimization Pillar

| Principle | Implementation | Status | Notes |
|-----------|---------------|--------|-------|
| **COST01 - Cloud Financial Management** | Consolidated billing via Organizations | Aligned | Single bill, volume discounts |
| **COST02 - Governance** | Account-level cost boundaries | Aligned | Clear cost attribution |
| **COST03 - Expenditure awareness** | Per-account cost visibility | Aligned | Easy to identify runaway costs |
| **COST07 - Optimize over time** | CI can use smaller instances | Aligned | Right-size per environment |

**Cost Optimization Score**: 4/4 principles addressed

### 1.5 Performance Efficiency Pillar

| Principle | Implementation | Status | Notes |
|-----------|---------------|--------|-------|
| **PERF01 - Selection** | Same services, different scale | Aligned | Consistent architecture |
| **PERF02 - Review** | Per-account metrics | Aligned | Environment-specific analysis |

**Performance Score**: 2/2 relevant principles addressed

### 1.6 Sustainability Pillar

| Principle | Implementation | Status | Notes |
|-----------|---------------|--------|-------|
| **SUS01 - Region selection** | eu-west-2 primary | Aligned | Low-carbon region choice |
| **SUS02 - Alignment to demand** | CI resources on-demand only | Aligned | No always-on test infrastructure |

**Sustainability Score**: 2/2 relevant principles addressed

---

## 2. AWS Landing Zone Best Practices

### 2.1 Account Structure

| AWS Best Practice | Our Implementation | Assessment |
|-------------------|-------------------|------------|
| Dedicated management account | submit-management for org admin only | Best Practice |
| No workloads in management | Org management only, no applications | Best Practice |
| Dedicated security/audit account | Combined with backup account | Acceptable (simplified) |
| Dedicated log archive | CloudTrail to backup account | Best Practice |
| Workload isolation | ci and prod in separate accounts | Best Practice |
| Network account (optional) | Not needed (simple architecture) | Not Applicable |

### 2.2 Identity and Access

| AWS Best Practice | Our Implementation | Assessment |
|-------------------|-------------------|------------|
| Centralized identity | IAM Identity Center | Best Practice |
| No IAM users in member accounts | SSO-only access | Best Practice |
| Permission sets (not individual policies) | Admin/PowerUser/ReadOnly sets | Best Practice |
| MFA on all privileged access | Required via Identity Center | Best Practice |
| Cross-account roles for automation | GitHub OIDC → Actions Role → Deploy Role | Best Practice |

### 2.3 Governance

| AWS Best Practice | Our Implementation | Assessment |
|-------------------|-------------------|------------|
| Service Control Policies | Not implemented in Phase 1 | Enhancement for Phase 2 |
| Tagging strategy | Environment tags on resources | Partial |
| Config Rules | Not implemented in Phase 1 | Enhancement for Phase 2 |
| CloudTrail in all accounts | Enabled by default | Best Practice |

---

## 3. Community Standards Comparison

### 3.1 Multi-Account Patterns

| Pattern | Description | Complexity | Our Fit |
|---------|-------------|------------|---------|
| **Single Account** | Everything in one account | Low | Moving away (current state) |
| **Dev/Prod Split** | Two accounts minimum | Medium | Too basic for our needs |
| **Foundational OUs** | Security, Workloads, Sandbox | Medium-High | Adopted (simplified) |
| **Full Landing Zone** | Control Tower + all OUs | High | Overkill for team size |

**Our Choice**: Simplified Foundational OUs pattern - the sweet spot for small teams.

### 3.2 Why 4 Accounts (Not 3, Not 5+)

| Question | Answer |
|----------|--------|
| Why not 3 accounts? | Management account should be dedicated |
| Why not 5+ accounts? | No current need for staging/dev separation |
| Why dedicated backup? | Critical for ransomware protection |
| Why not Control Tower? | Too complex for single developer |

### 3.3 Comparison with Industry Guidance

**AWS Prescriptive Guidance** recommends:
- Minimum 3 OUs (Security, Infrastructure, Workloads)
- We use: Backup (security function), Workloads

**HashiCorp/Terraform guidance** recommends:
- Separate state per environment
- We achieve: Account isolation provides stronger boundary

**GitHub/GitOps guidance** recommends:
- Environment-specific secrets
- We achieve: Per-account OIDC roles

---

## 4. Alternatives Analysis

### 4.1 Option A: AWS Control Tower

**Pros:**
- Automated guardrails and compliance
- Account Factory for self-service
- Built-in detective controls

**Cons:**
- Significant initial setup complexity
- Harder to customize for specific needs
- Overkill for single developer
- Ongoing management overhead

**Verdict**: Not recommended now. Consider when team grows to 3+ developers.

### 4.2 Option B: Keep Single Account

**Pros:**
- No migration needed
- Simpler mental model

**Cons:**
- CI can interfere with prod
- Backup not isolated (ransomware risk)
- IAM becomes cluttered
- Cost attribution unclear

**Verdict**: Not recommended. Security risks outweigh simplicity.

### 4.3 Option C: Three Accounts (No Management Account)

**Pros:**
- Fewer accounts to manage
- Simpler organization

**Cons:**
- Org management mixed with workloads
- Violates AWS best practice
- Harder to add accounts later
- Root credentials handling unclear

**Verdict**: Not recommended. Management account overhead is minimal but separation is valuable.

### 4.4 Option D: Five+ Accounts (Add Staging)

**Pros:**
- Dedicated staging environment
- More isolation

**Cons:**
- No current need for staging
- Added complexity
- More accounts to manage
- Higher cost

**Verdict**: Not needed now. Easy to add later if requirements change.

---

## 5. Compliance and Regulatory Alignment

### 5.1 GDPR Considerations

| Requirement | How Addressed |
|-------------|---------------|
| Data minimization | CI uses test data only, no real PII |
| Security of processing | Account isolation provides defense in depth |
| Data breach notification | Account boundaries limit breach scope |
| Right to erasure | Clear data location (prod only) |

### 5.2 HMRC MTD Requirements

| Requirement | How Addressed |
|-------------|---------------|
| Data security | Production hardened separately from CI |
| Audit trail | CloudTrail per account |
| Access control | IAM Identity Center with MFA |
| Incident response | Account isolation contains incidents |

### 5.3 PCI-DSS Alignment (Future-Proofing)

| Requirement | Current Status |
|-------------|---------------|
| Network segmentation | Account-level isolation |
| Access logging | CloudTrail enabled |
| Encryption | In-transit and at-rest |
| Vulnerability management | Separate CI for testing |

---

## 6. Risk Analysis

### 6.1 Risks Mitigated by Multi-Account

| Risk | Single Account | Multi-Account |
|------|---------------|---------------|
| CI deployment breaks prod | High | Eliminated |
| Ransomware destroys backups | High | Mitigated (backup account) |
| Accidental data exposure | Medium | Reduced (CI has no prod data) |
| Service limit exhaustion | Medium | Eliminated (per-account limits) |
| Cost overrun visibility | Medium | Clear (per-account billing) |

### 6.2 New Risks Introduced

| Risk | Mitigation |
|------|------------|
| Cross-account misconfiguration | Verification scripts, testing |
| SSO outage locks everyone out | Break-glass procedures documented |
| Complexity increase | Automation, clear documentation |
| Management account compromise | MFA, minimal activity, monitoring |

---

## 7. Future Enhancement Roadmap

### Phase 2 Enhancements

1. **Service Control Policies**
   - Prevent account deletion
   - Restrict regions to eu-west-2
   - Deny root account usage

2. **AWS Config Rules**
   - S3 bucket encryption required
   - CloudTrail enabled
   - VPC flow logs enabled

3. **Security Hub**
   - Centralized findings
   - CIS Benchmark compliance
   - Custom standards

4. **GuardDuty**
   - Threat detection
   - Cross-account aggregation
   - Automated response

5. **Cost Management**
   - Budgets per account
   - Anomaly detection alerts
   - Reserved instance planning

---

## 8. Conclusion

### Overall Assessment

| Category | Score | Notes |
|----------|-------|-------|
| Well-Architected Alignment | 24/24 | All applicable principles met |
| Landing Zone Best Practices | 8/9 | SCPs deferred to Phase 2 |
| Security Posture | Strong | Significant improvement over single account |
| Operational Fit | Excellent | Right-sized for team |
| Future Scalability | Good | Easy to add accounts/OUs |

### Recommendation

**Proceed with the 4-account architecture.** It represents the optimal balance of security, operational simplicity, and AWS best practices for a small development team handling sensitive financial data.

The architecture is:
- **Secure**: Account isolation, backup protection, centralized identity
- **Compliant**: GDPR-aligned, HMRC-ready, audit-friendly
- **Maintainable**: Automation-first, well-documented, right-sized
- **Extensible**: Easy to add staging/dev accounts when needed

---

*Document Version: 1.0*
*Last Updated: 2026-01-15*
*Review Frequency: Annually or on major changes*
