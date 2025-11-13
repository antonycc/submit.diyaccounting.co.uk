# Security & Compliance Documentation

## Overview

This document provides comprehensive security and compliance information for the DIY Accounting Submit application, a serverless AWS application for submitting UK VAT returns to HMRC via the Making Tax Digital (MTD) APIs.

**Last Updated:** 2025-11-13  
**Version:** 1.0  
**Classification:** Internal - Security Documentation

---

## Table of Contents

1. [Security Architecture](#security-architecture)
2. [Identity and Authentication](#identity-and-authentication)
3. [Token Security](#token-security)
4. [Network Security](#network-security)
5. [Data Protection](#data-protection)
6. [Monitoring and Incident Response](#monitoring-and-incident-response)
7. [Compliance Framework](#compliance-framework)
8. [Security Best Practices](#security-best-practices)
9. [Incident Response Procedures](#incident-response-procedures)
10. [Security Testing](#security-testing)

---

## Security Architecture

### High-Level Architecture

```
┌─────────────┐
│   Browser   │
└──────┬──────┘
       │ HTTPS (TLS 1.2+)
       ↓
┌─────────────────────────────────────────────┐
│         AWS CloudFront (CDN)                │
│  - WAF Protection                           │
│  - DDoS Protection (Shield Standard)        │
│  - Security Headers                         │
│  - Rate Limiting (2000 req/5min per IP)     │
└──────┬──────────────────────────────────────┘
       │
       ├──→ S3 Origin (Static Content)
       │    - Origin Access Control (OAC)
       │    - Encryption at Rest (S3-Managed)
       │    - Block Public Access
       │
       └──→ API Gateway HTTP API
            │
            ├──→ Lambda Functions
            │    - Custom Authorizer (JWT verification)
            │    - Environment encryption
            │    - IAM roles (least privilege)
            │    - VPC isolation (optional)
            │
            ├──→ AWS Cognito User Pool
            │    - OAuth 2.0 / OIDC
            │    - Google IdP integration
            │    - Custom IdP support
            │    - MFA capable
            │
            ├──→ AWS Secrets Manager
            │    - OAuth client secrets
            │    - HMRC API credentials
            │    - Automatic rotation capable
            │
            └──→ DynamoDB (Future)
                 - Encryption at rest
                 - Point-in-time recovery
                 - Fine-grained access control
```

### Security Layers

#### Layer 1: Edge Protection (CloudFront + WAF)
- **AWS WAF WebACL** with managed rule sets:
  - `AWSManagedRulesCommonRuleSet` - Protection against OWASP Top 10
  - `AWSManagedRulesKnownBadInputsRuleSet` - Known malicious patterns
  - Custom rate limiting rule (2000 requests per 5 minutes per IP)
  
- **CloudFront Security**:
  - TLS 1.2+ enforcement
  - HTTP to HTTPS redirect
  - Security headers injection
  - Access logging to CloudWatch

#### Layer 2: Application Security
- **Security Headers** (implemented in `app/lib/securityHeaders.js`):
  - `Strict-Transport-Security`: 2-year max-age with preload
  - `Content-Security-Policy`: Strict CSP preventing XSS
  - `X-Frame-Options`: SAMEORIGIN (clickjacking protection)
  - `X-Content-Type-Options`: nosniff
  - `X-XSS-Protection`: Legacy XSS filter
  - `Referrer-Policy`: strict-origin-when-cross-origin
  - `Permissions-Policy`: Restricted browser features

#### Layer 3: Authentication & Authorization
- **AWS Cognito User Pool**:
  - Centralized user management
  - OAuth 2.0 / OpenID Connect flows
  - Identity provider federation (Google, custom OIDC)
  - Session management
  - Token issuance and validation

- **Custom Lambda Authorizer** (`app/functions/auth/customAuthorizer.js`):
  - JWT signature verification using `aws-jwt-verify`
  - Token expiration validation
  - Claims extraction and validation
  - Context enrichment for downstream functions

#### Layer 4: Data Protection
- **Encryption at Rest**:
  - S3 buckets: AWS-managed encryption (SSE-S3)
  - Secrets Manager: KMS encryption (AWS-managed keys)
  - Lambda environment variables: KMS encryption
  - Future: DynamoDB encryption with customer-managed keys

- **Encryption in Transit**:
  - TLS 1.2+ for all HTTPS connections
  - Internal AWS service communication over TLS
  - No unencrypted HTTP traffic allowed

---

## Identity and Authentication

### Authentication Flows

#### 1. OAuth 2.0 Authorization Code Flow (with Cognito)

```
User → Login Page → Cognito Authorization Endpoint
  ↓
  state parameter (CSRF protection)
  ↓
Cognito → Identity Provider (Google/Custom OIDC)
  ↓
Authorization Code → Callback URL
  ↓
Token Exchange → Cognito Token Endpoint
  ↓
Access Token + ID Token + Refresh Token (optional)
```

**Implementation Details:**
- **Authorization Request**: `app/functions/auth/cognitoAuthUrlGet.js`
- **Token Exchange**: `app/functions/auth/cognitoTokenPost.js`
- **Callback Handler**: `web/public/auth/loginWithCognitoCallback.html`

**Security Controls:**
- State parameter for CSRF protection (currently implemented)
- **PKCE** (Proof Key for Code Exchange): **RECOMMENDED FOR IMPLEMENTATION**
  - Generate `code_verifier` and `code_challenge` on client
  - Include `code_challenge` in authorization request
  - Include `code_verifier` in token exchange
  - Prevents authorization code interception attacks

#### 2. JWT Verification Flow

```
Client → API Request with Authorization: Bearer <access_token>
  ↓
API Gateway → Custom Lambda Authorizer
  ↓
JWT Verification (aws-jwt-verify library)
  ↓
  ├─→ Valid: Extract claims, generate IAM policy (Allow)
  └─→ Invalid: Generate IAM policy (Deny)
```

**Implementation**: `app/functions/auth/customAuthorizer.js`

**Verification Steps:**
1. Extract JWT from `X-Authorization` header (case-insensitive)
2. Verify JWT signature against Cognito JWKS
3. Validate token expiration (`exp` claim)
4. Validate token audience (`aud` claim matches client ID)
5. Validate token usage (`token_use` claim equals "access")
6. Extract user identity (`sub` claim)

### Multi-Factor Authentication (MFA)

**Current Status**: Not enforced, but Cognito supports MFA  
**Recommendation**: Enable optional MFA for production users

**MFA Types Supported by Cognito:**
- SMS-based OTP
- TOTP (Time-based One-Time Password) via authenticator apps
- WebAuthn / FIDO2 (hardware keys)

**Implementation Steps:**
1. Update Cognito User Pool MFA settings via CDK:
   ```java
   .mfa(Mfa.OPTIONAL)
   .mfaSecondFactor(MfaSecondFactor.builder()
       .sms(true)
       .otp(true)
       .build())
   ```
2. Update client applications to handle MFA challenges
3. Provide user interface for MFA enrollment

### Account Security

#### Password Policy
Cognito default password policy (can be customized):
- Minimum length: 8 characters
- Requires uppercase letters
- Requires lowercase letters
- Requires numbers
- Requires special characters

#### Account Lockout
- **Automatic**: Cognito handles temporary account lockout after failed attempts
- **Duration**: Configurable (default: temporary lockout increases with attempts)

#### Session Management
- **Access Token Lifetime**: 1 hour (Cognito default)
- **ID Token Lifetime**: 1 hour (Cognito default)
- **Refresh Token Lifetime**: 30 days (configurable)
- **Session Timeout**: Handled client-side via token expiration

---

## Token Security

### JWT Structure

**Access Token (Cognito):**
```json
{
  "sub": "user-uuid",
  "cognito:username": "user@example.com",
  "token_use": "access",
  "scope": "openid profile email",
  "auth_time": 1637000000,
  "iss": "https://cognito-idp.{region}.amazonaws.com/{userPoolId}",
  "exp": 1637003600,
  "iat": 1637000000,
  "client_id": "client-id"
}
```

**ID Token (Cognito):**
```json
{
  "sub": "user-uuid",
  "email": "user@example.com",
  "email_verified": true,
  "given_name": "John",
  "family_name": "Doe",
  "token_use": "id",
  "auth_time": 1637000000,
  "iss": "https://cognito-idp.{region}.amazonaws.com/{userPoolId}",
  "exp": 1637003600,
  "iat": 1637000000,
  "aud": "client-id"
}
```

### Token Lifecycle

#### 1. Token Issuance
- **Authority**: AWS Cognito
- **Signing Algorithm**: RS256 (RSA with SHA-256)
- **Key Management**: Cognito manages JWKS rotation automatically
- **Token Binding**: Future enhancement (token bound to client certificate)

#### 2. Token Storage
**Client-Side (Browser):**
- **Current**: `localStorage` for access, ID, and refresh tokens
- **Risk**: Vulnerable to XSS attacks
- **Recommendation**: Use `httpOnly` cookies for production (requires backend proxy)

**Server-Side (Lambda):**
- Environment variables (encrypted at rest via KMS)
- Secrets Manager for sensitive credentials

#### 3. Token Validation
See JWT Verification Flow above.

**Additional Validations Recommended:**
- Nonce validation (for ID tokens from OIDC flows)
- Audience (`aud`) claim validation
- Token binding validation (future)
- Custom claims validation based on business logic

#### 4. Token Refresh
**Current Implementation:**
- Refresh tokens stored in localStorage
- Client-side refresh logic to be implemented

**Recommended Flow:**
```
Client detects token expiration (exp claim)
  ↓
Client sends refresh_token to token endpoint
  ↓
Cognito validates refresh token
  ↓
  ├─→ Valid: Issue new access and ID tokens
  └─→ Invalid: Require re-authentication
```

**Refresh Token Rotation:**
- **Current**: Not implemented
- **Recommendation**: Enable refresh token rotation in Cognito
- **Benefit**: Compromised refresh tokens automatically expire

#### 5. Token Revocation
**Current Status**: No explicit revocation mechanism  
**Options:**
1. **Token Expiration**: Rely on short access token lifetime (1 hour)
2. **Cognito Global Sign-Out**: Invalidate all user tokens
3. **Token Blacklist**: Future implementation (requires DynamoDB or Redis)

**Implementation Recommendation:**
```javascript
// Revoke all tokens for a user
await cognitoIdentityServiceProvider.adminUserGlobalSignOut({
  UserPoolId: userPoolId,
  Username: username
});
```

---

## Network Security

### CloudFront Configuration

**Domain Names:**
- Primary: `submit.diyaccounting.co.uk`
- Auth subdomain: `auth.submit.diyaccounting.co.uk` (Cognito custom domain)

**TLS Configuration:**
- **Protocol**: TLS 1.2, TLS 1.3
- **Cipher Suites**: AWS recommended (forward secrecy enabled)
- **Certificate**: AWS Certificate Manager (ACM)
- **SSL Support Method**: SNI (Server Name Indication)

**Security Policies:**
- **Viewer Protocol Policy**: Redirect HTTP to HTTPS
- **Origin Protocol Policy**: HTTPS only
- **Access Control**: Origin Access Control (OAC) for S3
- **Logging**: CloudFront access logs to CloudWatch

### WAF Rules

**Rule 1: Rate Limiting**
- **Priority**: 1
- **Type**: Rate-based rule
- **Limit**: 2000 requests per 5 minutes per IP address
- **Action**: Block
- **Metrics**: CloudWatch metrics enabled

**Rule 2: Known Bad Inputs**
- **Priority**: 2
- **Type**: AWS managed rule group
- **Rule Set**: `AWSManagedRulesKnownBadInputsRuleSet`
- **Action**: Block
- **Protection**: Log4j vulnerabilities, malformed requests

**Rule 3: Common Rule Set (OWASP Top 10)**
- **Priority**: 3
- **Type**: AWS managed rule group
- **Rule Set**: `AWSManagedRulesCommonRuleSet`
- **Action**: Block
- **Protection**: SQL injection, XSS, RFI, LFI, command injection

**Monitoring:**
- WAF logs streamed to CloudWatch Logs
- CloudWatch metrics for each rule
- Sampled requests captured for analysis

### CORS Configuration

**Current Implementation:**
```javascript
// app/bin/server.js
res.setHeader("Access-Control-Allow-Origin", origin);
res.setHeader("Access-Control-Allow-Credentials", "true");
res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
```

**Security Considerations:**
- **Origin Validation**: Currently allows all origins (for local development)
- **Production Recommendation**: Whitelist specific origins
- **Credentials**: Enabled for authenticated requests

**Recommended Production CORS:**
```javascript
const allowedOrigins = [
  'https://submit.diyaccounting.co.uk',
  'https://auth.submit.diyaccounting.co.uk'
];

if (allowedOrigins.includes(origin)) {
  res.setHeader("Access-Control-Allow-Origin", origin);
}
```

### API Gateway Security

**HTTP API Configuration:**
- **Protocol**: HTTPS only
- **CORS**: Configured at CloudFront level
- **Authorization**: Custom Lambda authorizer
- **Throttling**: Default AWS throttling (10,000 RPS per account)

**Per-Endpoint Rate Limiting:**
Implemented via `rateLimitConfig` in `app/lib/securityHeaders.js`:
- Auth endpoints: 5 requests per 15 minutes
- Token endpoints: 10 requests per 15 minutes
- API endpoints: 100 requests per minute

---

## Data Protection

### Data Classification

| Data Type | Classification | Encryption | Retention | PII |
|-----------|---------------|------------|-----------|-----|
| Access Tokens | Confidential | In transit (TLS) | 1 hour | No |
| ID Tokens | Confidential | In transit (TLS) | 1 hour | Yes |
| Refresh Tokens | Confidential | In transit (TLS) | 30 days | No |
| User Profile | Confidential | At rest (S3), In transit (TLS) | Account lifetime | Yes |
| VAT Submissions | Confidential | At rest (S3), In transit (TLS) | 7 years (HMRC requirement) | Yes |
| Access Logs | Internal | At rest (CloudWatch), In transit (TLS) | 28 days | IP addresses |
| OAuth Secrets | Secret | At rest (Secrets Manager KMS) | Indefinite | No |

### Encryption at Rest

**S3 Buckets:**
- **Origin Bucket** (static website): SSE-S3 (AWS-managed keys)
- **Receipts Bucket**: SSE-S3 (AWS-managed keys)
- **Access Log Buckets**: SSE-S3
- **Future**: Migrate to SSE-KMS with customer-managed keys for receipts

**Secrets Manager:**
- **Encryption**: AWS KMS (AWS-managed key)
- **Secrets**:
  - Google OAuth client secret
  - HMRC API client secret
  - Future: Additional IdP credentials

**Lambda Environment Variables:**
- **Encryption**: KMS (AWS-managed key)
- **Sensitive Variables**:
  - `COGNITO_USER_POOL_ID`
  - `COGNITO_USER_POOL_CLIENT_ID`
  - Test access tokens (for development only)

**DynamoDB (Future):**
- **Encryption**: KMS encryption at rest
- **Key Management**: Customer-managed key recommended
- **Backup Encryption**: Automated backups encrypted with same key

### Encryption in Transit

**All Communications:**
- **TLS Version**: 1.2 or higher (1.3 preferred)
- **Certificate Authority**: AWS Certificate Manager
- **Certificate Validation**: Full chain validation

**Internal AWS Service Communication:**
- AWS services communicate over TLS
- Private VPC endpoints available (not currently used)

### Data Retention

**CloudWatch Logs:**
- **Access Logs**: 28 days (configurable via `ACCESS_LOG_GROUP_RETENTION_PERIOD_DAYS`)
- **Lambda Logs**: 3 days (development), configurable for production
- **CloudTrail Logs**: Indefinite (if enabled)

**S3 Objects:**
- **Static Website**: Indefinite (no lifecycle policy)
- **VAT Receipts**: Indefinite (HMRC requires 7-year retention)
- **Access Logs**: 90 days (recommended lifecycle policy)

**User Data:**
- **Cognito User Pool**: Account lifetime
- **Custom Attributes**: Stored in Cognito, encrypted at rest

### Data Deletion

**GDPR Right to Erasure:**
1. **User Request**: User requests account deletion
2. **Cognito**: Admin delete user API call
3. **S3 Receipts**: Delete user-specific objects
4. **Logs**: Redact or delete user PII from logs (challenging)
5. **Backup**: Ensure backups also deleted (S3 versioning disabled)

**Implementation:**
```javascript
// Pseudo-code for user deletion
async function deleteUserData(userId) {
  // 1. Delete Cognito user
  await cognito.adminDeleteUser({ UserPoolId, Username: userId });
  
  // 2. Delete S3 receipts
  const objects = await s3.listObjects({ 
    Bucket: receiptsBucket, 
    Prefix: `receipts/${userId}/` 
  });
  await s3.deleteObjects({ 
    Bucket: receiptsBucket, 
    Delete: { Objects: objects.Contents } 
  });
  
  // 3. Mark audit logs
  await auditLog({ action: 'USER_DELETED', userId, timestamp: Date.now() });
}
```

---

## Monitoring and Incident Response

### Security Monitoring

#### CloudWatch Metrics

**WAF Metrics:**
- `AllowedRequests`: Requests passing WAF rules
- `BlockedRequests`: Requests blocked by WAF
- `CountedRequests`: Requests matching COUNT rules
- `RateLimitRule`: Rate limit blocks

**Lambda Metrics:**
- `Invocations`: Total function invocations
- `Errors`: Function errors (including authorization failures)
- `Duration`: Execution time (anomalies may indicate attacks)
- `ConcurrentExecutions`: Concurrency (detect DDoS)

**API Gateway Metrics:**
- `Count`: Total API requests
- `4XXError`: Client errors (including 401 Unauthorized)
- `5XXError`: Server errors
- `Latency`: Response time (detect performance issues)

**Cognito Metrics:**
- Sign-in activity (via CloudTrail)
- Failed authentication attempts (via CloudTrail)
- MFA challenges (via CloudTrail)

#### CloudWatch Alarms

**Recommended Alarms:**
1. **High WAF Block Rate**
   - Metric: `BlockedRequests`
   - Threshold: > 100 in 5 minutes
   - Action: SNS notification to security team

2. **High 401 Error Rate**
   - Metric: API Gateway `4XXError` with status 401
   - Threshold: > 50 in 5 minutes
   - Action: SNS notification (potential credential stuffing)

3. **Lambda Authorizer Failures**
   - Metric: Lambda `Errors` for authorizer function
   - Threshold: > 10 in 1 minute
   - Action: SNS notification

4. **Unusual API Request Volume**
   - Metric: API Gateway `Count`
   - Threshold: > 10,000 in 1 minute (adjust per baseline)
   - Action: SNS notification (potential DDoS)

5. **Secrets Manager Access Anomaly**
   - Metric: CloudTrail events for `GetSecretValue`
   - Threshold: > 100 in 5 minutes (unusual for this app)
   - Action: SNS notification

#### CloudTrail Logging

**Status**: Optional (enabled via `CLOUD_TRAIL_ENABLED=true`)

**Events Logged:**
- **Data Events**:
  - S3 object-level operations (GetObject, PutObject, DeleteObject)
  - Lambda function invocations (optional)
  
- **Management Events**:
  - IAM policy changes
  - Security group changes
  - Cognito user pool changes
  - Secrets Manager secret access

**Log Retention:**
- CloudTrail logs stored in S3 (encrypted)
- CloudWatch Logs integration for real-time analysis
- Retention: Indefinite (for audit and compliance)

#### AWS GuardDuty (Recommended)

**Status**: Not currently enabled  
**Recommendation**: Enable for production environments

**Features:**
- Threat detection using machine learning
- Monitors CloudTrail, VPC Flow Logs, DNS logs
- Detects compromised credentials, malicious IPs, crypto-mining
- Integration with AWS Security Hub

**Implementation:**
```bash
aws guardduty create-detector --enable --region eu-west-2
```

#### AWS Security Hub (Recommended)

**Status**: Not currently enabled  
**Recommendation**: Enable for centralized security posture

**Features:**
- Aggregates findings from GuardDuty, Inspector, Macie
- CIS AWS Foundations Benchmark checks
- PCI DSS compliance checks
- Security best practices checks

### Anomaly Detection

**Behavioral Analytics:**
1. **Geographic Access Patterns**
   - Track user login locations via IP geolocation
   - Alert on suspicious location changes (e.g., UK → China in 1 hour)
   
2. **Time-Based Patterns**
   - Track user login times
   - Alert on unusual login times (e.g., 3 AM when user typically logs in at 9 AM)

3. **Failed Authentication Tracking**
   - Track failed login attempts per user
   - Implement temporary account lockout after N failures
   - Alert security team on brute force patterns

**Implementation Recommendation:**
Use CloudWatch Logs Insights queries to analyze auth patterns:
```sql
fields @timestamp, userIdentity.principalId, sourceIPAddress
| filter eventName = "InitiateAuth" or eventName = "AdminInitiateAuth"
| stats count() by userIdentity.principalId, sourceIPAddress, eventName
| sort count desc
```

### Security Dashboard

**Recommended Dashboard Widgets:**
1. WAF blocked requests (line chart, 1-hour period)
2. API Gateway 4XX/5XX errors (stacked area chart)
3. Lambda authorizer invocations and errors (line chart)
4. Top 10 blocked IPs (table)
5. Geographic distribution of requests (map widget)
6. Cognito sign-in activity (line chart)

---

## Compliance Framework

### SOC 2 Type II Preparation

SOC 2 (System and Organization Controls 2) is an auditing standard for service organizations. Type II reports on the operational effectiveness of controls over time.

#### Trust Service Criteria

**1. Security (CC6 - Logical and Physical Access Controls)**

| Control | Implementation | Evidence |
|---------|----------------|----------|
| CC6.1: Logical access security | Cognito user authentication, Lambda authorizer | CloudTrail logs, Cognito configuration |
| CC6.2: New internal users | No internal users; external OAuth IdPs | IdP integration documentation |
| CC6.3: Modify user access | Cognito admin APIs for user management | API logs, change management records |
| CC6.6: Logical access - removal | `adminDeleteUser` API, account deletion procedure | Audit logs, deletion tickets |
| CC6.7: Prevent unauthorized access | WAF rules, rate limiting, TLS enforcement | WAF logs, SSL/TLS scan reports |
| CC6.8: Restrict physical access | N/A (serverless, AWS-managed infrastructure) | AWS SOC 2 report (inherited) |

**2. Availability (A1 - Availability Objectives)**

| Control | Implementation | Evidence |
|---------|----------------|----------|
| A1.1: Performance targets | CloudWatch metrics, Lambda concurrency limits | Performance monitoring dashboards |
| A1.2: Disaster recovery | CloudFormation templates, automated deployments | DR test results, RTO/RPO documentation |
| A1.3: System capacity | Auto-scaling (Lambda, API Gateway), CloudFront CDN | Capacity planning documents |

**3. Confidentiality (C1 - Confidentiality Objectives)**

| Control | Implementation | Evidence |
|---------|----------------|----------|
| C1.1: Confidentiality agreements | Not applicable (no employee access to customer data) | N/A |
| C1.2: Confidential info disposal | S3 object deletion, Cognito user deletion | Deletion procedures, audit logs |

#### SOC 2 Evidence Collection

**Automated Evidence:**
- CloudTrail logs (access events, configuration changes)
- CloudWatch logs (application logs, access logs)
- WAF logs (blocked requests, rate limit triggers)
- Lambda logs (function invocations, errors)
- S3 access logs (object access, bucket policy changes)

**Manual Evidence:**
- Architecture diagrams (this document)
- Change management records (Git commits, PR approvals)
- Incident response records (ticketing system)
- Vendor assessments (AWS SOC 2 report)
- Penetration test reports (annual)

**Evidence Retention:**
- **CloudTrail logs**: Indefinite (S3 lifecycle policy)
- **CloudWatch logs**: 90 days minimum for access logs
- **Change management**: 1 year (Git history)
- **Incident records**: 3 years (compliance requirement)

### GDPR Compliance

The General Data Protection Regulation (GDPR) governs processing of personal data for EU residents.

#### Data Protection Impact Assessment (DPIA)

**Identity Data Processing:**
- **Purpose**: User authentication for HMRC VAT submission
- **Legal Basis**: Legitimate interest (providing accounting services)
- **Data Categories**: Email, name, Cognito user ID, IP address
- **Data Subjects**: UK small business owners and accountants
- **Retention**: Account lifetime, deleted on request
- **Third Parties**: AWS (data processor), Google (identity provider)

**HMRC VAT Data Processing:**
- **Purpose**: Submitting VAT returns to HMRC on behalf of users
- **Legal Basis**: Contractual obligation (user agreement), legal requirement (HMRC MTD)
- **Data Categories**: VAT number, period key, VAT amounts, submission receipts
- **Retention**: 7 years (HMRC requirement)
- **Third Parties**: AWS (data processor), HMRC (data controller for VAT data)

#### GDPR Rights Implementation

| Right | Implementation | Status |
|-------|----------------|--------|
| Right to Access (Art. 15) | User can view profile in Cognito, download receipts | ✅ Implemented |
| Right to Rectification (Art. 16) | User can update profile in Cognito (if enabled) | ⚠️ Partial (email update limited) |
| Right to Erasure (Art. 17) | `deleteUserData()` function (see Data Deletion section) | ⚠️ Manual process |
| Right to Data Portability (Art. 20) | Export receipts as JSON from S3 | ⚠️ Manual process |
| Right to Restrict Processing (Art. 18) | Disable user account (Cognito `adminDisableUser`) | ✅ Available |
| Right to Object (Art. 21) | Opt-out of analytics (CloudWatch RUM) | ⚠️ Not implemented |

**Implementation Recommendations:**
1. Create user-facing API for GDPR rights (e.g., `/api/v1/gdpr/export`, `/api/v1/gdpr/delete`)
2. Automate data deletion workflow
3. Implement consent management for optional data processing (analytics)
4. Provide clear privacy notice and terms of service

#### Data Protection by Design

**Privacy-Enhancing Technologies:**
- **Data Minimization**: Only collect necessary data (email, name, Cognito ID)
- **Pseudonymization**: Use Cognito `sub` (UUID) instead of email in logs
- **Encryption**: All data encrypted at rest and in transit
- **Access Controls**: Least privilege IAM roles, no direct database access

### PCI DSS Considerations

While this application does not directly handle credit card data, it integrates with HMRC APIs that may involve financial transactions.

**PCI DSS Relevant Requirements:**
- **Req 1**: Network security (CloudFront, WAF, VPC isolation)
- **Req 2**: Secure configurations (CDK infrastructure as code)
- **Req 4**: Encryption in transit (TLS 1.2+)
- **Req 6**: Secure development (linting, code review, dependency scanning)
- **Req 8**: User authentication (Cognito, MFA support)
- **Req 10**: Logging and monitoring (CloudWatch, CloudTrail)

**Recommendation**: If future features involve payment processing, conduct full PCI DSS assessment.

### ISO 27001 Alignment

ISO 27001 is an information security management system (ISMS) standard.

**Key Controls Implemented:**
- **A.9 Access Control**: Cognito authentication, Lambda authorizer
- **A.10 Cryptography**: TLS, S3 encryption, Secrets Manager encryption
- **A.12 Operations Security**: CloudWatch monitoring, WAF protection
- **A.13 Communications Security**: TLS-only, HTTPS enforcement
- **A.14 System Acquisition**: Infrastructure as code (CDK), code review
- **A.16 Incident Management**: See Incident Response section below
- **A.17 Business Continuity**: CloudFormation templates, automated deployments

---

## Security Best Practices

### Secure Development Lifecycle

**1. Code Review**
- All code changes require pull request review
- Security-focused review for authentication/authorization changes
- Automated linting and formatting (`eslint`, `prettier`)

**2. Dependency Management**
- Regular dependency updates (`npm audit`, `npm-check-updates`)
- Security advisory monitoring (GitHub Dependabot)
- Pin major versions, allow minor/patch updates

**3. Secrets Management**
- Never commit secrets to Git
- Use AWS Secrets Manager for sensitive credentials
- Rotate secrets regularly (manual process currently)

**4. Testing**
- Unit tests for business logic (`vitest`)
- Integration tests for API endpoints (`vitest`)
- System tests for E2E flows (`playwright`)
- Security testing (see Security Testing section)

**5. Static Analysis**
- ESLint with security plugin (`eslint-plugin-security`)
- SonarJS plugin for code quality (`eslint-plugin-sonarjs`)
- Prettier for consistent code style

### Lambda Function Security

**Best Practices:**
1. **Least Privilege IAM Roles**
   - Each Lambda has dedicated execution role
   - Permissions scoped to minimum required actions
   - No `*` actions or resources in policies

2. **Environment Variable Encryption**
   - Sensitive variables encrypted with KMS
   - Avoid storing secrets in environment variables (use Secrets Manager)

3. **VPC Isolation** (Future)
   - Place Lambdas in private subnets
   - Use VPC endpoints for AWS service access
   - No internet access except via NAT gateway

4. **Function Timeouts**
   - Set appropriate timeouts (5-30 seconds)
   - Prevent long-running functions (cost and security)

5. **Error Handling**
   - Never expose sensitive data in error messages
   - Log errors to CloudWatch for analysis
   - Return generic error messages to clients

### S3 Bucket Security

**Best Practices:**
1. **Block Public Access**
   - Enabled for all buckets
   - Enforce via AWS Organizations policy

2. **Origin Access Control (OAC)**
   - CloudFront accesses S3 via OAC (not OAI)
   - No direct public access to origin bucket

3. **Bucket Policies**
   - Restrict access to CloudFront distribution
   - Use condition keys (`aws:SourceAccount`, `aws:SourceArn`)

4. **Versioning** (Future)
   - Enable versioning for receipts bucket
   - Protects against accidental deletion or ransomware

5. **Lifecycle Policies** (Future)
   - Archive old logs to Glacier
   - Delete temporary files after 30 days

### Cognito Security

**Best Practices:**
1. **Password Policy**
   - Require 12+ characters (current: 8)
   - Require uppercase, lowercase, numbers, symbols

2. **MFA Enforcement**
   - Enable optional MFA for all users
   - Consider mandatory MFA for admin accounts (future)

3. **Advanced Security Features**
   - Enable Cognito Advanced Security (risk-based adaptive authentication)
   - Detect compromised credentials via leaked password databases

4. **User Pool Configuration**
   - No self-service password reset (email verification required)
   - Account verification required (email)
   - No SMS-based account recovery (phishing risk)

---

## Incident Response Procedures

### Incident Classification

| Severity | Definition | Examples | Response Time |
|----------|------------|----------|---------------|
| Critical | Ongoing attack, data breach | Active credential stuffing, S3 bucket exposed | 15 minutes |
| High | Potential breach, service disruption | Multiple failed auth attempts, WAF block spike | 1 hour |
| Medium | Security misconfiguration, policy violation | Overly permissive IAM role, unencrypted log | 4 hours |
| Low | Security advisory, best practice violation | Outdated dependency, missing security header | 1 week |

### Incident Response Plan

#### Phase 1: Detection and Analysis (0-30 minutes)

**Detection Sources:**
- CloudWatch Alarms (SNS email notifications)
- AWS GuardDuty findings (if enabled)
- AWS Security Hub findings (if enabled)
- Manual security review or penetration test

**Initial Analysis:**
1. Confirm incident is legitimate (rule out false positive)
2. Classify severity (Critical/High/Medium/Low)
3. Identify affected resources (Lambda, S3, Cognito, API Gateway)
4. Determine scope (number of users affected, data compromised)
5. Document timeline in incident ticket (create GitHub issue)

#### Phase 2: Containment (30 minutes - 2 hours)

**Immediate Containment:**
- **Block Malicious IP**: Add IP block rule to WAF
- **Revoke Compromised Credentials**: Delete Cognito user or global sign-out
- **Disable Affected Lambda**: Set concurrency to 0 (if function is compromised)
- **Block S3 Access**: Update bucket policy to deny public access

**Eradication:**
- Identify root cause (e.g., vulnerable dependency, misconfigured IAM role)
- Apply fix (patch dependency, update IAM policy, rotate secrets)
- Deploy fix to production (via CDK or hotfix)

#### Phase 3: Recovery (2 hours - 1 day)

**Service Restoration:**
- Verify fix is effective (test in staging environment)
- Remove temporary containment measures (unblock IPs, re-enable Lambda)
- Monitor for recurrence (check CloudWatch metrics)

**Communication:**
- Notify affected users (if personal data compromised)
- Update status page (if public outage)
- Internal post-mortem meeting

#### Phase 4: Post-Incident Activity (1 day - 1 week)

**Root Cause Analysis:**
- Document timeline of events
- Identify contributing factors (technical, process, human error)
- Determine systemic issues (e.g., lack of MFA enforcement)

**Lessons Learned:**
- Update incident response procedures
- Implement preventive measures (e.g., enable GuardDuty, enforce MFA)
- Schedule follow-up reviews (30 days, 90 days)

**Evidence Preservation:**
- Export CloudTrail logs to S3 (immutable storage)
- Export CloudWatch logs to S3
- Screenshot AWS console (IAM policies, WAF rules, etc.)
- Archive in secure location (compliance requirement)

### Incident Response Contacts

**Security Team:**
- Primary: security@diyaccounting.co.uk
- Secondary: admin@diyaccounting.co.uk

**AWS Support:**
- Support Plan: Developer (or Business/Enterprise for production)
- Contact: AWS Console → Support Center → Create case

**Third-Party Services:**
- GitHub Security Advisories: security@github.com
- HMRC Security Incidents: (via HMRC developer hub)

### Incident Response Testing

**Tabletop Exercises:**
- Frequency: Annually
- Scenario: Credential stuffing attack, S3 bucket exposed, DDoS attack
- Participants: Development team, security team, management

**Simulated Attacks:**
- Frequency: Annually (or as part of penetration test)
- Scope: Authentication bypass, privilege escalation, data exfiltration
- Tools: OWASP ZAP, Burp Suite, custom scripts

---

## Security Testing

### Vulnerability Scanning

**Dependency Scanning:**
- **Tool**: `npm audit` (built-in), GitHub Dependabot
- **Frequency**: On every pull request, weekly cron job
- **Action**: Update dependencies to latest patch version
- **Critical Vulnerabilities**: Immediate patch and deployment

**Infrastructure Scanning:**
- **Tool**: AWS Inspector (for EC2, if used), Prowler (AWS CIS Benchmark)
- **Frequency**: Monthly
- **Scope**: IAM policies, S3 bucket permissions, security groups

**Container Scanning** (Future, if using Docker Lambda):
- **Tool**: Trivy, Clair, AWS ECR image scanning
- **Frequency**: On image build, daily re-scan

### Penetration Testing

**Scope:**
- Web application (CloudFront, static site)
- API endpoints (authentication, authorization)
- OAuth 2.0 flows (CSRF, token leakage)
- Infrastructure (CloudFront, WAF bypass)

**Frequency:**
- **Full Penetration Test**: Annually (required for SOC 2, PCI DSS)
- **Targeted Testing**: After major changes (new authentication flow)

**Methodology:**
- OWASP Testing Guide (WSTG)
- OWASP Top 10 coverage
- OWASP ASVS Level 2 (Application Security Verification Standard)

**External Provider:**
- Use certified penetration testing firm (CREST, OSCP)
- Provide test report to auditors

### Security Regression Testing

**Automated Security Tests:**
1. **CSRF Protection**: Verify state parameter in OAuth flows
2. **XSS Protection**: Verify CSP headers, input sanitization
3. **SQL Injection**: N/A (no SQL database, but test API input validation)
4. **Authentication Bypass**: Attempt to access API without JWT
5. **Authorization Bypass**: Attempt to access other users' data

**Test Implementation** (Playwright or Vitest):
```javascript
// Example: Test JWT requirement for protected endpoint
test('API returns 401 without JWT', async () => {
  const response = await fetch('/api/v1/hmrc/vat/return', {
    method: 'POST',
    body: JSON.stringify({ vatNumber: '123456789' })
  });
  expect(response.status).toBe(401);
});
```

### Bug Bounty Program (Future)

**Recommendation**: Launch public bug bounty program for crowdsourced security testing

**Platform**: HackerOne or Bugcrowd  
**Scope**: Web application, API endpoints, OAuth flows  
**Out of Scope**: AWS infrastructure (shared responsibility), DDoS attacks  
**Rewards**: $100-$5000 based on severity (CVSS score)

---

## Security Roadmap

### Phase 1: Immediate (0-3 months)

- [x] Implement security headers middleware
- [ ] Add PKCE support to OAuth 2.0 flows
- [ ] Enable AWS GuardDuty
- [ ] Configure CloudWatch Alarms for security events
- [ ] Document incident response procedures
- [ ] Implement automated security testing (regression tests)

### Phase 2: Short-term (3-6 months)

- [ ] Enable MFA for Cognito User Pool (optional)
- [ ] Implement token refresh rotation
- [ ] Add behavioral anomaly detection (failed auth tracking)
- [ ] Migrate to customer-managed KMS keys for S3 encryption
- [ ] Enable DynamoDB point-in-time recovery (when DynamoDB is used)
- [ ] Conduct first penetration test

### Phase 3: Medium-term (6-12 months)

- [ ] Implement token revocation (blacklist or short-lived tokens)
- [ ] Add comprehensive audit logging (custom audit table in DynamoDB)
- [ ] Enable AWS Security Hub
- [ ] Implement GDPR self-service data export/deletion
- [ ] Launch bug bounty program
- [ ] Achieve SOC 2 Type I certification

### Phase 4: Long-term (12+ months)

- [ ] Implement advanced threat detection (ML-based anomaly detection)
- [ ] Enable AWS VPC for Lambda functions
- [ ] Implement disaster recovery automation (multi-region failover)
- [ ] Achieve SOC 2 Type II certification
- [ ] Consider ISO 27001 certification
- [ ] Implement zero-trust architecture (mTLS, service mesh)

---

## Appendix

### Security Headers Reference

See `app/lib/securityHeaders.js` for implementation details.

**Headers Applied:**
- `Strict-Transport-Security`: Enforces HTTPS connections
- `Content-Security-Policy`: Prevents XSS attacks
- `X-Frame-Options`: Prevents clickjacking
- `X-Content-Type-Options`: Prevents MIME-sniffing
- `X-XSS-Protection`: Legacy XSS filter
- `Referrer-Policy`: Controls referrer information leakage
- `Permissions-Policy`: Restricts browser features

### Threat Model

**Threat Actors:**
1. **Script Kiddies**: Automated scanners, known exploits
2. **Hacktivists**: Targeted attacks, defacement, data leaks
3. **Cybercriminals**: Credential theft, data exfiltration, ransomware
4. **Insiders**: Accidental misconfiguration, malicious access (N/A for serverless)

**Attack Vectors:**
1. **Web Application Attacks**: XSS, CSRF, injection attacks
2. **Authentication Attacks**: Credential stuffing, brute force, session hijacking
3. **Authorization Attacks**: Privilege escalation, IDOR (Insecure Direct Object References)
4. **Infrastructure Attacks**: DDoS, CloudFront cache poisoning, S3 bucket enumeration
5. **Social Engineering**: Phishing (users), spear-phishing (admins)

**Mitigations:**
- WAF blocks common attacks (OWASP Top 10)
- Rate limiting prevents brute force and DDoS
- JWT verification prevents unauthorized API access
- Cognito handles credential security
- CloudFront + S3 OAC prevents direct S3 access
- Security awareness training (future)

### Security Audit Checklist

**Quarterly Security Review:**
- [ ] Review IAM policies (least privilege)
- [ ] Audit Cognito user pool settings (MFA, password policy)
- [ ] Review S3 bucket policies and ACLs
- [ ] Check CloudTrail is enabled and logging
- [ ] Review CloudWatch Alarms configuration
- [ ] Scan for vulnerable dependencies (`npm audit`)
- [ ] Review WAF rules and metrics (blocked requests)
- [ ] Verify TLS certificates are not expiring
- [ ] Review Lambda execution role permissions
- [ ] Check for public S3 buckets or snapshots

**Annual Security Activities:**
- [ ] Conduct external penetration test
- [ ] Review and update incident response procedures
- [ ] Conduct tabletop exercise (simulated incident)
- [ ] Review security documentation (this file)
- [ ] Train team on security best practices
- [ ] Review third-party security (AWS, GitHub, Google)
- [ ] Update threat model
- [ ] Evaluate new security tools (GuardDuty, Security Hub)

### Contact Information

**Security Reporting:**
- Email: security@diyaccounting.co.uk
- PGP Key: (future - publish on website)
- Response Time: 24 hours for critical issues

**Responsible Disclosure Policy:**
- We welcome security researchers to report vulnerabilities
- We will not pursue legal action against good-faith researchers
- Please allow reasonable time for remediation before public disclosure
- We appreciate acknowledgment in our security page (if desired)

---

**Document Version:** 1.0  
**Last Updated:** 2025-11-13  
**Next Review:** 2026-02-13 (Quarterly)  
**Owner:** Security Team  
**Approvers:** CTO, Compliance Officer  

---

*This document contains confidential security information. Do not share publicly or with unauthorized parties.*
