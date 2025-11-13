# MTD VAT Production Roadmap

## Executive Summary

DIY Accounting Submit is an open-source Making Tax Digital (MTD) VAT submission system for UK businesses. This document outlines the complete roadmap from current state to HMRC production approval and public release.

**Current Status**: Ready for HMRC sandbox testing (Phase 1 complete)  
**Target**: HMRC-approved production software listed on GOV.UK  
**Timeline**: 3-6 months to production release  
**License**: GPL-3.0 (Free for all users)

---

## Current Capabilities ✅

### Working Features

1. **VAT Submission** (POST /organisations/vat/{vrn}/returns)
   - Full VAT return submission to HMRC sandbox
   - All 9 VAT return fields supported
   - Validation of VRN, period key, and amounts

2. **VAT Obligations** (GET /organisations/vat/{vrn}/obligations)
   - Retrieve open and fulfilled VAT obligations
   - Date range and status filtering
   - Gov-Test-Scenario support for sandbox testing

3. **View VAT Return** (GET /organisations/vat/{vrn}/returns/{periodKey})
   - Retrieve previously submitted VAT returns
   - Full return details with all fields

4. **OAuth Integration**
   - HMRC OAuth 2.0 authorization flow
   - Dynamic scope support (read:vat, write:vat)
   - Token exchange and management

5. **Fraud Prevention Headers**
   - All 17 required headers implemented
   - Dynamic client-side collection
   - Server-side validation and enhancement
   - Test Fraud Prevention Headers API endpoint

6. **User Interface**
   - Submit VAT page with form validation
   - VAT Obligations page with filtering
   - View VAT Return page
   - OAuth callback handling
   - Responsive design

7. **Bundle System**
   - Default bundle (free, basic features)
   - Test bundle (sandbox access)
   - Guest/Basic/Legacy bundles defined (not active)

8. **Testing Infrastructure**
   - 222 unit and integration tests passing
   - Vitest for backend testing
   - Playwright for browser/behavior testing
   - CI/CD with GitHub Actions

### Infrastructure

1. **Local Development**
   - Express server with hot reload
   - Ngrok for HTTPS tunneling
   - Mock OAuth2 server
   - MinIO for local S3 receipts

2. **AWS Deployment**
   - CloudFront + S3 static hosting
   - Lambda functions for backend
   - Cognito for user authentication
   - DynamoDB for bundle storage (optional)
   - Secrets Manager for credentials
   - Route53 + ACM for DNS/SSL

---

## Phases to Production

### Phase 1: Fraud Prevention Headers ✅ (COMPLETE)

**Status**: 100% Complete  
**Duration**: 1 week (Completed 2025-11-13)

**Completed Work**:
- [x] Test Fraud Prevention Headers API endpoint
- [x] Dynamic Gov-Vendor headers (license hash, version)
- [x] Comprehensive documentation (FRAUD_PREVENTION_HEADERS.md)
- [x] Sandbox testing guide (SANDBOX_TESTING_GUIDE.md)
- [x] All tests passing (222 tests)

**Deliverables**:
- Fraud prevention headers fully implemented
- HMRC test endpoint integration working
- Documentation ready for HMRC submission

---

### Phase 2: HMRC Sandbox Testing ⏳ (NEXT)

**Status**: Ready to Start  
**Duration**: 1-2 weeks  
**Owner**: Developer + QA

**Tasks**:

1. **Setup** (1 day)
   - [ ] Register sandbox application at HMRC Developer Hub
   - [ ] Create HMRC test user (organisation with VAT)
   - [ ] Configure .env.sandbox with credentials
   - [ ] Verify local environment working

2. **Execute Test Scenarios** (3-5 days)
   - [ ] Test 1: Create HMRC test user
   - [ ] Test 2: OAuth authorization flow
   - [ ] Test 3: Test fraud prevention headers
   - [ ] Test 4: Retrieve VAT obligations (3 scenarios)
   - [ ] Test 5: Submit VAT return
   - [ ] Test 6: View submitted VAT return
   - [ ] Test 7: Error handling (4 scenarios)
   - [ ] Test 8: Gov-Test-Scenario variations

3. **Evidence Collection** (2 days)
   - [ ] Document all test results
   - [ ] Screenshot OAuth flows
   - [ ] Save all API request/response logs
   - [ ] Capture fraud prevention headers validation
   - [ ] Create SANDBOX_TEST_RESULTS.md

4. **Issue Resolution** (2-3 days buffer)
   - [ ] Fix any issues found during testing
   - [ ] Re-test after fixes
   - [ ] Verify all tests pass

**Deliverables**:
- Complete SANDBOX_TEST_RESULTS.md
- Screenshots and logs for HMRC submission
- All test scenarios passed
- No warnings from fraud prevention headers validation

**Success Criteria**:
- ✅ All 8 test scenarios pass
- ✅ Fraud prevention headers validate with no warnings
- ✅ Evidence collected and organized
- ✅ Ready for HMRC submission

---

### Phase 3: HMRC Approval Submission ⏳

**Status**: Waiting for Phase 2  
**Duration**: 3-4 weeks (includes HMRC response time)  
**Owner**: Developer + Business Owner

**Timeline**:

| Week | Activity | Owner |
|------|----------|-------|
| 1 | Prepare and submit application | Developer |
| 2-3 | HMRC review and questionnaires | HMRC + Developer |
| 3 | Sign Terms of Use | Business Owner |
| 4 | Receive production credentials | HMRC |

**Tasks**:

1. **Prepare Submission** (2 days)
   - [ ] Organize all test evidence
   - [ ] Write submission email to SDSTeam@hmrc.gov.uk
   - [ ] Attach SANDBOX_TEST_RESULTS.md
   - [ ] Attach fraud prevention headers validation
   - [ ] Attach sample API logs
   - [ ] Submit within 2 weeks of completing sandbox tests

2. **Complete Questionnaires** (1 day)
   - [ ] Fraud Prevention Implementation Questionnaire
   - [ ] API Testing Questionnaire
   - [ ] Respond to any HMRC queries

3. **Sign Terms of Use** (1 day)
   - [ ] Review HMRC Terms of Use
   - [ ] Sign electronically
   - [ ] Return signed copy to HMRC

4. **Production Credentials** (1 week)
   - [ ] Receive production Client ID
   - [ ] Receive production Client Secret
   - [ ] Store securely in AWS Secrets Manager
   - [ ] Update staging environment

**Deliverables**:
- Email sent to HMRC with all evidence
- Questionnaires completed and submitted
- Terms of Use signed
- Production credentials received

**Success Criteria**:
- ✅ HMRC approves application
- ✅ Production credentials issued
- ✅ Terms of Use signed

---

### Phase 4: Production Environment Setup ⏳

**Status**: Waiting for Phase 3  
**Duration**: 1-2 weeks  
**Owner**: DevOps + Developer

**Tasks**:

1. **AWS Accounts** (3 days)
   - [ ] Create dedicated production AWS account
   - [ ] Create dedicated CI AWS account
   - [ ] Set up cross-account IAM roles
   - [ ] Configure billing alerts

2. **Production Deployment** (3 days)
   - [ ] Update CDK with production parameters
   - [ ] Deploy to production AWS account
   - [ ] Configure Route53 DNS
   - [ ] Configure ACM SSL certificates
   - [ ] Set up CloudFront distribution

3. **Secrets Management** (1 day)
   - [ ] Store HMRC production credentials in Secrets Manager
   - [ ] Store Google OAuth credentials
   - [ ] Configure secret rotation policies
   - [ ] Test secret retrieval

4. **Monitoring Setup** (2 days)
   - [ ] Enable CloudWatch dashboards
   - [ ] Enable X-Ray tracing
   - [ ] Configure CloudWatch alarms
   - [ ] Set up SNS notifications
   - [ ] Enable GuardDuty
   - [ ] Enable Security Hub

5. **Backup and Recovery** (2 days)
   - [ ] Set up separate backup AWS account
   - [ ] Configure automated backups
   - [ ] Document restore procedures
   - [ ] Test backup and restore process

**Deliverables**:
- Production AWS environment deployed
- Monitoring and alerting configured
- Backup and recovery tested
- Production domain live (submit.diyaccounting.co.uk)

**Success Criteria**:
- ✅ Production environment deployed successfully
- ✅ All monitoring tools enabled
- ✅ Backup and recovery working
- ✅ Ready for live VAT submission

---

### Phase 5: Live Submission and Verification ⏳

**Status**: Waiting for Phase 4  
**Duration**: 1 week  
**Owner**: Developer + Test User

**Tasks**:

1. **Pre-Live Checks** (2 days)
   - [ ] Verify production environment working
   - [ ] Test OAuth flow with production credentials
   - [ ] Test fraud prevention headers validation
   - [ ] Verify all monitoring in place

2. **Live Submission** (1 day)
   - [ ] Find a willing test user with real VRN
   - [ ] Submit one real VAT return
   - [ ] Verify submission accepted by HMRC
   - [ ] Document submission details

3. **HMRC Verification** (2-3 days)
   - [ ] Send submission confirmation to HMRC
   - [ ] Provide VRN and submission details
   - [ ] Wait for HMRC verification
   - [ ] Address any HMRC queries

4. **GOV.UK Listing** (1 day)
   - [ ] HMRC adds to approved software list
   - [ ] Verify listing on GOV.UK
   - [ ] Update website with badge/certification

**Deliverables**:
- One successful live VAT return submission
- HMRC verification confirmation
- GOV.UK listing active

**Success Criteria**:
- ✅ Live VAT return submitted successfully
- ✅ HMRC verifies submission
- ✅ Software listed on GOV.UK

---

### Phase 6: Additional VAT API Operations ⏳

**Status**: Optional for initial approval, recommended for better UX  
**Duration**: 2-3 weeks  
**Owner**: Developer

**Tasks**:

1. **VAT Liabilities** (3 days)
   - [ ] Create hmrcVatLiabilityGet.js handler
   - [ ] Add GET /api/v1/hmrc/vat/{vrn}/liabilities endpoint
   - [ ] Create vatLiabilities.html page
   - [ ] Add unit and integration tests
   - [ ] Test in sandbox

2. **VAT Payments** (3 days)
   - [ ] Create hmrcVatPaymentGet.js handler
   - [ ] Add GET /api/v1/hmrc/vat/{vrn}/payments endpoint
   - [ ] Create vatPayments.html page
   - [ ] Add unit and integration tests
   - [ ] Test in sandbox

3. **VAT Penalties** (3 days)
   - [ ] Create hmrcVatPenaltyGet.js handler
   - [ ] Add GET /api/v1/hmrc/vat/{vrn}/penalties endpoint
   - [ ] Create vatPenalties.html page
   - [ ] Add unit and integration tests
   - [ ] Test in sandbox

4. **Integration** (2 days)
   - [ ] Update navigation menu
   - [ ] Add links from obligations page
   - [ ] Test complete user journey
   - [ ] Update documentation

**Deliverables**:
- Three new VAT API endpoints
- Three new frontend pages
- Tests for all new features
- Updated documentation

**Success Criteria**:
- ✅ All new endpoints working
- ✅ All tests passing
- ✅ User journey smooth and complete

---

### Phase 7: Security and Compliance Hardening ⏳

**Status**: Parallel with other phases  
**Duration**: 2-3 weeks  
**Owner**: Security Engineer + Developer

**Tasks**:

1. **OAuth Security** (3 days)
   - [ ] Implement state parameter validation
   - [ ] Implement nonce validation
   - [ ] Add PKCE verification
   - [ ] Implement CSRF protection
   - [ ] Add token refresh logic
   - [ ] Test all security measures

2. **HTTP Security Headers** (2 days)
   - [ ] Add Content Security Policy (CSP)
   - [ ] Add HTTP Strict Transport Security (HSTS)
   - [ ] Add X-Content-Type-Options: nosniff
   - [ ] Add X-Frame-Options: DENY
   - [ ] Add Referrer-Policy
   - [ ] Test all headers

3. **AWS WAF** (2 days)
   - [ ] Configure AWS WAF rules
   - [ ] Add rate limiting rules
   - [ ] Add geographic restrictions (UK only)
   - [ ] Add SQL injection protection
   - [ ] Add XSS protection
   - [ ] Test WAF rules

4. **Data Protection** (3 days)
   - [ ] Document data retention policy
   - [ ] Implement data deletion procedures
   - [ ] Add user consent tracking
   - [ ] Update privacy policy
   - [ ] Add GDPR compliance documentation
   - [ ] Test data deletion

5. **Penetration Testing** (3 days)
   - [ ] Conduct OWASP ASVS assessment
   - [ ] Perform penetration testing
   - [ ] Fix identified vulnerabilities
   - [ ] Re-test after fixes
   - [ ] Document security assessment

**Deliverables**:
- Enhanced OAuth security
- HTTP security headers implemented
- AWS WAF configured
- GDPR compliance documented
- Security assessment report

**Success Criteria**:
- ✅ No critical vulnerabilities
- ✅ All security best practices implemented
- ✅ GDPR compliant
- ✅ Security assessment passed

---

### Phase 8: Bundle Management and Monetization ⏳

**Status**: Post-launch  
**Duration**: 2-3 weeks  
**Owner**: Product Manager + Developer

**Tasks**:

1. **Bundle Configuration** (2 days)
   - [ ] Activate "guest" bundle in product-catalogue.toml
   - [ ] Activate "basic" bundle
   - [ ] Activate "legacy" bundle
   - [ ] Configure bundle caps and timeouts
   - [ ] Test bundle lifecycle

2. **Bundle Enforcement** (3 days)
   - [ ] Implement requireActivity middleware
   - [ ] Add bundle checks on all endpoints
   - [ ] Add bundle indicators on UI pages
   - [ ] Implement redirect to bundles page
   - [ ] Add clear error messages
   - [ ] Test bundle enforcement

3. **Admin Approval** (2 days)
   - [ ] Create bundle approval workflow
   - [ ] Implement admin approval link
   - [ ] Require admin@diyaccounting.co.uk approval
   - [ ] Make test bundle discrete
   - [ ] Test approval process

4. **Payment Integration** (Optional, 5 days)
   - [ ] Integrate Stripe for "basic" bundle
   - [ ] Add subscription management
   - [ ] Add billing portal
   - [ ] Test payment flow
   - [ ] Add receipt generation

**Deliverables**:
- All bundles configured and active
- Bundle enforcement working
- Admin approval workflow
- Payment integration (optional)

**Success Criteria**:
- ✅ Free "guest" bundle working
- ✅ Paid "basic" bundle (if implemented)
- ✅ Legacy bundle for existing customers
- ✅ Test bundle requires approval

---

### Phase 9: Documentation and User Experience ⏳

**Status**: Parallel with other phases  
**Duration**: 2-3 weeks  
**Owner**: Technical Writer + UX Designer

**Tasks**:

1. **User Documentation** (5 days)
   - [ ] Complete USERGUIDE.md
   - [ ] Add troubleshooting section
   - [ ] Create FAQ document
   - [ ] Add video tutorials
   - [ ] Add screenshots of each page

2. **Developer Documentation** (3 days)
   - [ ] Update README.md
   - [ ] Document deployment process
   - [ ] Create API documentation
   - [ ] Add contribution guidelines
   - [ ] Update architecture diagrams

3. **UI/UX Improvements** (5 days)
   - [ ] Add entitlement indicators
   - [ ] Add loading spinners
   - [ ] Improve error messages
   - [ ] Add success confirmations
   - [ ] Add breadcrumb navigation
   - [ ] Improve mobile responsiveness

4. **Accessibility** (2 days)
   - [ ] Add ARIA labels
   - [ ] Test with screen readers
   - [ ] Improve keyboard navigation
   - [ ] Add focus indicators
   - [ ] Test color contrast

**Deliverables**:
- Complete user documentation
- Updated developer documentation
- Improved UI/UX
- Accessibility compliance

**Success Criteria**:
- ✅ User guide complete and clear
- ✅ Developer docs up to date
- ✅ UI intuitive and accessible
- ✅ WCAG 2.1 Level AA compliance

---

### Phase 10: Public Release and Marketing ⏳

**Status**: Post-approval  
**Duration**: 2-3 weeks  
**Owner**: Marketing + Product Manager

**Tasks**:

1. **Pre-Launch Checks** (2 days)
   - [ ] Review all documentation
   - [ ] Test complete user journey
   - [ ] Verify GOV.UK listing
   - [ ] Check all social media profiles
   - [ ] Prepare launch materials

2. **Soft Launch** (1 week)
   - [ ] Invite 10 beta users
   - [ ] Monitor usage and errors
   - [ ] Collect feedback
   - [ ] Fix any critical issues
   - [ ] Update documentation

3. **Public Launch** (1 day)
   - [ ] Announce on GOV.UK listing
   - [ ] Post on social media
   - [ ] Send press release
   - [ ] Update website with launch badge
   - [ ] Monitor launch metrics

4. **Post-Launch** (Ongoing)
   - [ ] Monitor usage metrics
   - [ ] Respond to user feedback
   - [ ] Fix bugs promptly
   - [ ] Add new features based on feedback
   - [ ] Regular security updates

**Deliverables**:
- Beta testing completed
- Public launch announcement
- Social media presence
- User support channels

**Success Criteria**:
- ✅ 10 beta users successfully submitted VAT
- ✅ No critical issues in production
- ✅ Positive user feedback
- ✅ Growing user base

---

## Timeline Summary

| Phase | Duration | Dependencies | Status |
|-------|----------|--------------|--------|
| 1. Fraud Prevention Headers | 1 week | None | ✅ Complete |
| 2. Sandbox Testing | 1-2 weeks | Phase 1 | ⏳ Ready |
| 3. HMRC Approval | 3-4 weeks | Phase 2 | ⏳ Waiting |
| 4. Production Setup | 1-2 weeks | Phase 3 | ⏳ Waiting |
| 5. Live Submission | 1 week | Phase 4 | ⏳ Waiting |
| 6. Additional APIs | 2-3 weeks | Phase 5 | ⏳ Optional |
| 7. Security Hardening | 2-3 weeks | Parallel | ⏳ Planned |
| 8. Bundle Management | 2-3 weeks | Phase 5 | ⏳ Planned |
| 9. Documentation & UX | 2-3 weeks | Parallel | ⏳ Planned |
| 10. Public Release | 2-3 weeks | Phase 5 | ⏳ Planned |

**Total Time to Production**: 10-15 weeks (2.5-4 months)  
**Critical Path**: Phases 1-5 (7-10 weeks)  
**Buffer for Issues**: 2-3 weeks

---

## Resource Requirements

### Development Team

- **Senior Developer**: Full-time, all phases
- **DevOps Engineer**: Part-time, Phases 4, 7
- **Security Engineer**: Part-time, Phase 7
- **QA Tester**: Part-time, Phases 2, 5, 10
- **Technical Writer**: Part-time, Phase 9
- **UX Designer**: Part-time, Phase 9

### External Dependencies

- **HMRC**: Approval timeline (3-4 weeks)
- **AWS**: Production accounts setup
- **Domain/SSL**: DNS and certificate management
- **Beta Users**: 10 users for soft launch

### Budget Considerations

- **AWS Costs**: $50-100/month for production
- **Domain/SSL**: $12/year for domain (if not existing)
- **Ngrok Pro** (optional): $10/month for stable URLs
- **Testing**: Minimal, using sandbox
- **Security Assessment** (optional): $1000-5000

---

## Risk Management

### High Risks

1. **HMRC Approval Delays**
   - **Mitigation**: Submit complete, high-quality documentation
   - **Contingency**: Build buffer time into timeline

2. **Security Vulnerabilities**
   - **Mitigation**: Regular security assessments
   - **Contingency**: Dedicated security engineer on call

3. **Production Issues**
   - **Mitigation**: Thorough testing in staging
   - **Contingency**: Rollback procedures documented

### Medium Risks

1. **User Adoption**
   - **Mitigation**: Clear documentation, easy onboarding
   - **Contingency**: User support channels, beta feedback

2. **API Changes**
   - **Mitigation**: Monitor HMRC developer hub
   - **Contingency**: Flexible architecture, quick updates

3. **Resource Constraints**
   - **Mitigation**: Prioritize critical path phases
   - **Contingency**: Extend timeline, reduce scope

---

## Success Metrics

### Technical Metrics

- ✅ All tests passing (target: 100%)
- ✅ Code coverage > 80%
- ✅ No critical security vulnerabilities
- ✅ Page load time < 2 seconds
- ✅ API response time < 500ms
- ✅ Uptime > 99.9%

### Business Metrics

- ✅ HMRC approval obtained
- ✅ Listed on GOV.UK
- 📊 10+ active users in first month
- 📊 50+ active users in 3 months
- 📊 100+ active users in 6 months
- 📊 < 5% error rate

### User Satisfaction

- 📊 User satisfaction > 4/5
- 📊 Net Promoter Score > 50
- 📊 < 10% support ticket rate
- 📊 Positive reviews on forums

---

## Next Steps

### Immediate (Week 1)

1. ✅ Complete Phase 1 (fraud prevention headers) - DONE
2. 🔄 Begin Phase 2 (sandbox testing)
   - Register sandbox application
   - Create test user
   - Start Test 1

### Short Term (Weeks 2-4)

1. Complete Phase 2 (sandbox testing)
2. Submit to HMRC (Phase 3)
3. Begin documentation updates (Phase 9)

### Medium Term (Weeks 5-10)

1. Receive HMRC approval (Phase 3)
2. Set up production environment (Phase 4)
3. Complete live submission (Phase 5)
4. Begin security hardening (Phase 7)

### Long Term (Weeks 11-15)

1. Add additional VAT APIs (Phase 6)
2. Implement bundle management (Phase 8)
3. Complete documentation (Phase 9)
4. Launch publicly (Phase 10)

---

## Conclusion

DIY Accounting Submit has completed a major milestone with Phase 1 (Fraud Prevention Headers) now 100% complete. The system is technically sound, well-tested, and ready for HMRC sandbox testing.

**Key Strengths**:
- ✅ Comprehensive fraud prevention headers implementation
- ✅ Excellent test coverage (222 tests)
- ✅ Clean, maintainable codebase
- ✅ Strong documentation
- ✅ Production-ready architecture

**Path Forward**:
1. Execute sandbox testing (1-2 weeks)
2. Submit to HMRC for approval (3-4 weeks)
3. Deploy to production (1-2 weeks)
4. Complete live submission verification (1 week)
5. Launch publicly (2-3 weeks)

**Target**: Production release in **10-15 weeks** (2.5-4 months)

---

**Document Version**: 1.0  
**Last Updated**: 2025-11-13  
**Next Review**: After Phase 2 completion  
**Owner**: DIY Accounting Development Team
