# Security & Compliance Hardening Prompt

Analyze the application’s authentication, authorization, data handling, and infrastructure posture as implemented in this repository — AWS Cognito (with Google IdP), HMRC OAuth 2.0 integration, AWS Lambda (Node.js), CloudFront/S3 static hosting, and DynamoDB — and enhance security while ensuring compliance readiness for production deployments.

Focus on:
- Comprehensive security audit and vulnerability assessment
- OAuth 2.0/OIDC integration patterns and attack vector mitigation relevant to Cognito + HMRC
- Compliance framework validation (GDPR, ISO 27001, SOC 2)
- Advanced threat protection and monitoring capabilities
- Security incident response procedures and automation
- Token lifecycle management and revocation strategies
- Rate limiting, DDoS protection, and abuse prevention
- Penetration testing frameworks and security validation

## Identity, OAuth 2.0, and OIDC Security Areas

Examine these critical identity and authorization security domains:

### Identity and Authentication Security (Cognito + Google IdP)
- Multi-factor authentication integration patterns
- Credential stuffing and brute force protection
- Session management and timeout policies
- Account lockout and suspicious activity detection
- Password policy enforcement and complexity requirements
- Social engineering attack prevention

### Token Security and Lifecycle Management
- JWT security patterns and claims validation
- Token encryption at rest and in transit
- Refresh token rotation and revocation strategies
- Token introspection endpoint security
- Short-lived access token patterns
- Token binding and proof-of-possession validation
- JWKS rotation and key management automation

### OAuth 2.0 and OIDC Flow Security (HMRC + Cognito)
- Authorization code injection attack prevention
- PKCE implementation validation and enforcement
- Redirect URI validation and allowlist management
- State parameter validation and CSRF protection
- Nonce validation for replay attack prevention
- Client authentication and registration security
- Scope validation and privilege escalation prevention

### Federation and Integration Security
- Identity provider chaining security
- SAML assertion validation when federating
- Cross-origin resource sharing (CORS) policies
- API rate limiting and quota management
- Webhook security and payload validation
- Third-party integration security patterns

## Compliance and Governance Framework

Address regulatory and compliance requirements appropriate for this project:

### SOC 2 Type II Preparation
- Security control documentation and evidence collection
- Access control reviews and privilege management
- Data processing and retention policy implementation
- Incident response procedure documentation
- Vulnerability management and patch procedures
- Third-party vendor risk assessment

### GDPR and Privacy Compliance (UK/EU)
- Data protection impact assessment (DPIA) for identity data
- Consent management and withdrawal mechanisms
- Right to erasure (data deletion) implementation
- Data portability and export capabilities
- Privacy by design architectural review
- Cross-border data transfer security measures

### Additional Framework Alignment
- ISO 27001 security management system alignment
- Financial services considerations (e.g., protecting HMRC identifiers and VAT data)

## Infrastructure Security Hardening (AWS)

Strengthen the AWS serverless architecture:

### Lambda Function Security (Node.js)
- Runtime security and dependency vulnerability scanning
- Environment variable encryption and secrets management
- Function execution role privilege minimization
- VPC configuration for network isolation
- Dead letter queue security and monitoring
- Cold start attack mitigation strategies

### DynamoDB Security Enhancement
- Fine-grained access control and resource-based policies
- Encryption at rest with customer-managed keys
- Point-in-time recovery and backup encryption
- VPC endpoint configuration for private access
- Audit logging and access pattern monitoring
- Data masking and anonymization for non-production

### CloudFront and CDN Security
- Web Application Firewall (WAF) rule implementation
- Geographic restriction and IP allowlist management
- Origin access control (OAC) validation
- Cache poisoning attack prevention
- SSL/TLS configuration and HSTS enforcement
- Real-time logging and threat detection

### API/Lambda Endpoint and Proxy Security
- Request validation and input sanitization
- SQL injection and XSS attack prevention
- API versioning security considerations
- Throttling and quotas for abuse prevention
- Request signing and authentication validation
- Response header security configuration

## Monitoring and Incident Response

Implement comprehensive security monitoring:

### Security Information and Event Management (SIEM)
- Centralized log aggregation and correlation
- Real-time threat detection and alerting
- Automated incident response workflows
- Forensic log preservation and chain of custody
- Compliance reporting and audit trail generation
- Security dashboard and visualization

### Advanced Threat Detection
- Anomaly detection for authentication patterns
- Machine learning-based fraud detection
- Geographic access pattern analysis
- Device fingerprinting and risk scoring
- Behavioral analytics for insider threats
- Integration with threat intelligence feeds

### Vulnerability Management
- Automated dependency vulnerability scanning
- Infrastructure vulnerability assessment
- Penetration testing procedures and schedules
- Bug bounty program setup and management
- Security patch management workflows
- Zero-day vulnerability response procedures

## Implementation Recommendations

Provide specific, actionable security improvements that:

### Immediate Security Wins (Repo-Specific)
- Implement security headers (CSP, HSTS, X-Frame-Options)
- Add rate limiting to all authentication endpoints
- Enable AWS GuardDuty and Security Hub
- Configure CloudTrail for comprehensive audit logging
- Implement secrets rotation for JWT signing keys
- Add input validation and sanitization everywhere
 - Validate and minimize Gov-Client/Gov-Vendor headers; avoid logging sensitive identifiers
 - Store HMRC OAuth client secrets in AWS Secrets Manager via configured `*_SECRET_ARN`s; remove plaintext secrets from `.env`
 - Verify Lambda execution roles are least-privilege for DynamoDB tables (`bundles`, `receipts`, `hmrc-api-requests`)
 - Ensure CloudFront Origin Access Control (OAC) and S3 bucket policies prevent public writes

### Progressive Security Enhancements
- Deploy AWS WAF with OWASP top 10 protection
- Implement comprehensive security testing pipeline
- Add fraud detection and risk scoring
- Configure advanced CloudWatch security metrics
- Implement security incident response automation
- Establish security training and awareness programs

### Compliance and Governance
- Document security controls and procedures
- Implement data classification and handling policies
- Establish vendor risk management processes
- Create security incident response playbooks
- Implement regular security assessments
- Maintain compliance evidence and documentation

## Success Criteria

Security hardening must achieve:
- **Zero Critical Vulnerabilities**: No high-risk security issues in production
- **Compliance Readiness**: Documented controls for major compliance frameworks
- **Monitoring Coverage**: 100% visibility into authentication and authorization events
- **Incident Response**: <30 minute mean time to detection for security events
- **Penetration Testing**: Annual third-party security assessment with remediation
- **Developer Security**: Security-first development practices and training

Consider the impact on:
- **User Experience**: Security measures should not significantly impact performance
- **Operational Complexity**: Security tools should integrate seamlessly
- **Cost Management**: Security investments should be proportional to risk
- **Compliance Deadlines**: Implementation should align with regulatory timelines
- **Third-Party Integrations**: Security should not break existing integrations
- **Development Velocity**: Security processes should enable, not hinder, development

Focus on creating a security-first culture while maintaining the serverless architecture's advantages of scalability, cost-effectiveness, and operational simplicity.

> Formatting and style: Defer to the repo’s formatters — ESLint (flat) + Prettier for JS (ESM) and Spotless (Palantir Java Format) for Java. Use `npm run formatting` / `npm run formatting-fix`. See README for details.
> Avoid reformatting files you are not otherwise changing; prefer to match the existing local style where strict formatting updates would be jarring.
