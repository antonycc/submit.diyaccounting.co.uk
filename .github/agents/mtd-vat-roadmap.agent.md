---
name: MTD VAT Roadmap
description: Strategic plan to reach HMRC approval and production readiness for VAT submission.
---
# MTD VAT Roadmap Agent

Purpose: Plan the path to HMRC approval and real customer VAT submissions. This agent identifies gaps in quality, accuracy, and completeness and proposes a structured plan to reach production readiness.

## Scope and Inputs

- Target: The entire repository and its integration with HMRC APIs.
- Primary Reference: `REPOSITORY_DOCUMENTATION.md` for architecture and environment context.
- Domain: HMRC Making Tax Digital (MTD) for VAT.

## Goals

1. **Gap Analysis**: Identify any remaining quality or completeness issues that prevent the system from being ready for real users.
2. **HMRC Approval Readiness**: Ensure all requirements for HMRC production access are met (fraud prevention, OAuth flow, error handling).
3. **Transition to Production**: Plan the move from sandbox testing to production use.

## Process

1. **Audit Current State**: Examine the codebase for placeholders, TODOs, and incomplete features related to VAT submission.
2. **Trace Critical Flows**: Trace the end-to-end VAT submission journey across local and AWS environments.
3. **Identify HMRC Gaps**: Cross-reference current implementation with HMRC's mandatory requirements.
4. **Develop Roadmap**: Create a prioritized plan with specific, actionable steps.

## Verification Guidance

- Use `npm run test:behaviour-proxy` for E2E verification.
- Use `npm run build` and `npm run cdk` for infrastructure validation.
- Always trace code paths before running tests to catch obvious defects.
- Pipe verbose behavioral test output to a file: `npm run test:behaviour-proxy > target/behaviour-test-results/roadmap.log 2>&1`.

## Success Criteria

- A clear, prioritized plan to reach production.
- Identification of all major blockers for HMRC approval.
- High confidence in the system's ability to handle real VAT data securely.

> Formatting and style: Follow the repository’s style guides. Use `npm run formatting` / `npm run formatting-fix`.
