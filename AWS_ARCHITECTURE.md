# DIY Accounting Submit - AWS Architecture

**Version**: 2.0
**Date**: January 2026
**Status**: Production

---

## Executive Summary

DIY Accounting Submit is a serverless web application enabling UK businesses to submit VAT returns directly to HMRC via the Making Tax Digital (MTD) API. The architecture leverages AWS services for scalability, security, and cost-efficiency.

**Key Characteristics:**
- Fully serverless (no EC2 instances)
- Multi-account AWS Organization for security isolation
- Infrastructure as Code (AWS CDK)
- CI/CD via GitHub Actions with OIDC authentication

---

## 1. Multi-Account Structure

### 1.1 Account Overview

```mermaid
graph TB
    subgraph org["AWS Organization"]
        mgmt["submit-management<br/>Organization Admin"]

        subgraph workloads["Workloads OU"]
            prod["submit-prod<br/>887764105431<br/>Production"]
            ci["submit-ci<br/>CI/CD Testing"]
        end

        subgraph backup_ou["Backup OU"]
            backup["submit-backup<br/>Disaster Recovery"]
        end
    end

    mgmt --> workloads
    mgmt --> backup_ou

    style mgmt fill:#e1f5fe
    style prod fill:#c8e6c9
    style ci fill:#fff3e0
    style backup fill:#fce4ec
```

### 1.2 Account Responsibilities

| Account | ID | Purpose | Contains |
|---------|-----|---------|----------|
| **submit-management** | (new) | Organization administration | IAM Identity Center, Organizations, Consolidated Billing |
| **submit-prod** | 887764105431 | Production workloads | All application resources, live user data |
| **submit-ci** | (new) | CI/CD testing | Identical stack with test data, HMRC sandbox |
| **submit-backup** | (new) | Backup isolation | Cross-account backup vault only |

### 1.3 Security Rationale

```mermaid
graph LR
    subgraph threat["Threat Scenario"]
        attacker["Attacker"]
    end

    subgraph single["Single Account ❌"]
        app1["Application"]
        backup1["Backups"]
        attacker -.->|"Compromises"| app1
        attacker -.->|"Deletes"| backup1
    end

    subgraph multi["Multi-Account ✓"]
        app2["submit-prod<br/>Application"]
        backup2["submit-backup<br/>Isolated Backups"]
        attacker -.->|"Compromises"| app2
        attacker -.-x|"Cannot Access"| backup2
    end

    style backup1 fill:#ffcdd2
    style backup2 fill:#c8e6c9
```

---

## 2. Application Architecture

### 2.1 High-Level Overview

```mermaid
graph TB
    subgraph users["Users"]
        browser["Web Browser"]
    end

    subgraph edge["Edge Layer"]
        cf["CloudFront CDN"]
        waf["WAF"]
    end

    subgraph api["API Layer"]
        apigw["API Gateway"]
        auth["Custom Authorizer<br/>Lambda"]
    end

    subgraph compute["Compute Layer"]
        vatGet["VAT Obligations<br/>Lambda"]
        vatPost["VAT Submit<br/>Lambda"]
        vatView["VAT View<br/>Lambda"]
        tokenMgr["Token Manager<br/>Lambda"]
    end

    subgraph data["Data Layer"]
        dynamo["DynamoDB"]
        secrets["Secrets Manager"]
    end

    subgraph external["External Services"]
        hmrc["HMRC MTD API"]
        cognito["Cognito<br/>User Pools"]
    end

    browser --> cf
    cf --> waf
    waf --> apigw
    apigw --> auth
    auth --> cognito
    apigw --> vatGet
    apigw --> vatPost
    apigw --> vatView
    vatGet --> dynamo
    vatPost --> dynamo
    vatGet --> hmrc
    vatPost --> hmrc
    tokenMgr --> secrets
    tokenMgr --> hmrc

    style cf fill:#ff9800
    style apigw fill:#7b1fa2,color:#fff
    style dynamo fill:#2196f3,color:#fff
    style hmrc fill:#00695c,color:#fff
```

### 2.2 Request Flow

```mermaid
sequenceDiagram
    participant U as User Browser
    participant CF as CloudFront
    participant AG as API Gateway
    participant AU as Authorizer
    participant L as Lambda
    participant DB as DynamoDB
    participant H as HMRC API

    U->>CF: GET /api/vat/obligations
    CF->>AG: Forward Request
    AG->>AU: Validate JWT
    AU->>AG: Allow/Deny
    AG->>L: Invoke Function
    L->>DB: Get User Tokens
    L->>H: Fetch Obligations
    H->>L: Return Data
    L->>AG: JSON Response
    AG->>CF: Response
    CF->>U: Display Obligations
```

---

## 3. Service Components

### 3.1 Edge Layer

```mermaid
graph LR
    subgraph edge["Edge Services (us-east-1 + Global)"]
        r53["Route 53<br/>DNS"]
        acm["ACM<br/>SSL Certificates"]
        cf["CloudFront<br/>CDN"]
        waf["WAF<br/>Firewall"]
        lambda_edge["Lambda@Edge<br/>Security Headers"]
    end

    r53 --> cf
    acm --> cf
    waf --> cf
    lambda_edge --> cf

    style cf fill:#ff9800
```

| Service | Purpose | Configuration |
|---------|---------|---------------|
| Route 53 | DNS management | submit.diyaccounting.co.uk |
| CloudFront | Content delivery | Origin: S3 + API Gateway |
| WAF | Web firewall | Rate limiting, SQL injection protection |
| Lambda@Edge | Security headers | CSP, HSTS, X-Frame-Options |
| ACM | SSL/TLS | Wildcard certificate |

### 3.2 API Layer

```mermaid
graph TB
    subgraph api["API Gateway (eu-west-2)"]
        rest["REST API"]

        subgraph endpoints["Endpoints"]
            e1["/api/vat/obligations"]
            e2["/api/vat/return"]
            e3["/api/auth/token"]
            e4["/api/account/bundles"]
        end

        subgraph auth["Authorization"]
            custom["Custom Authorizer"]
            cognito["Cognito Integration"]
        end
    end

    rest --> endpoints
    endpoints --> auth

    style rest fill:#7b1fa2,color:#fff
```

### 3.3 Compute Layer (Lambda Functions)

| Function | Purpose | Trigger | Memory |
|----------|---------|---------|--------|
| `customAuthorizer` | JWT validation | API Gateway | 256 MB |
| `hmrcVatObligationsGet` | Fetch VAT obligations | API Gateway | 512 MB |
| `hmrcVatReturnPost` | Submit VAT return | API Gateway | 512 MB |
| `hmrcVatReturnGet` | View submitted returns | API Gateway | 512 MB |
| `hmrcTokenRefresh` | OAuth token refresh | EventBridge (scheduled) | 256 MB |
| `accountBundlesGet` | User subscription info | API Gateway | 256 MB |
| `securityHeaders` | Add security headers | CloudFront (Lambda@Edge) | 128 MB |

### 3.4 Data Layer

```mermaid
graph TB
    subgraph data["Data Services (eu-west-2)"]
        subgraph dynamo["DynamoDB Tables"]
            bundles["submit-bundles<br/>User Subscriptions"]
            receipts["submit-receipts<br/>HMRC Receipts"]
            hmrc_requests["submit-hmrc-api-requests<br/>HMRC Audit"]
            async["async-requests (5 tables)<br/>1-hour TTL"]
        end

        subgraph secrets["Secrets Manager"]
            salt_registry["user-sub-hash-salt<br/>JSON registry (multi-version)"]
            hmrc_creds["HMRC Credentials"]
            oauth_secrets["OAuth Secrets"]
        end

        subgraph kms_svc["KMS"]
            salt_key["Salt Encryption Key<br/>Encrypts salt backup in DynamoDB"]
        end

        subgraph backup_svc["AWS Backup"]
            vault["Local Vault"]
            pitr["Point-in-Time Recovery"]
        end
    end

    salt_registry -->|cold start| bundles
    bundles --> vault
    receipts --> vault
    vault --> pitr
    salt_key -->|Path 3 recovery| bundles

    style bundles fill:#2196f3,color:#fff
    style receipts fill:#2196f3,color:#fff
    style salt_registry fill:#ff9800,color:#fff
    style salt_key fill:#ff9800,color:#fff
```

**Salt architecture**: The user sub hash salt is stored as a multi-version JSON registry in Secrets Manager. Each DynamoDB item includes a `saltVersion` field. A KMS key in DataStack encrypts a backup copy of the salt stored as a `system#config` item in the bundles table (recovery Path 3). This KMS key must move to the submit-backup account during account separation.

---

## 4. Security Architecture

### 4.1 Authentication Flow

```mermaid
sequenceDiagram
    participant U as User
    participant A as App
    participant C as Cognito
    participant H as HMRC OAuth

    U->>A: Click "Connect to HMRC"
    A->>H: Redirect to HMRC Login
    U->>H: Enter Credentials
    H->>A: Authorization Code
    A->>H: Exchange for Tokens
    H->>A: Access + Refresh Tokens
    A->>C: Create/Update User Session
    C->>A: JWT Token
    A->>U: Logged In
```

### 4.2 IAM Role Chain (GitHub Actions)

```mermaid
graph LR
    subgraph github["GitHub Actions"]
        action["Workflow"]
    end

    subgraph aws["AWS Account"]
        oidc["OIDC Provider"]
        actions_role["github-actions-role"]
        deploy_role["github-deploy-role"]
        cfn["CloudFormation"]
    end

    action -->|"1. OIDC Token"| oidc
    oidc -->|"2. Assume Role"| actions_role
    actions_role -->|"3. Assume Role"| deploy_role
    deploy_role -->|"4. Deploy"| cfn

    style oidc fill:#4caf50,color:#fff
    style actions_role fill:#ff9800
    style deploy_role fill:#f44336,color:#fff
```

### 4.3 Network Security

| Control | Implementation |
|---------|----------------|
| **Encryption in Transit** | TLS 1.2+ enforced everywhere |
| **Encryption at Rest** | DynamoDB encryption, S3 SSE |
| **WAF Rules** | Rate limiting, SQL injection, XSS protection |
| **Security Headers** | CSP, HSTS, X-Content-Type-Options |
| **API Authentication** | JWT tokens via Cognito |
| **Secrets** | AWS Secrets Manager (no hardcoded credentials) |

---

## 5. Backup & Disaster Recovery

### 5.1 Backup Architecture

```mermaid
graph TB
    subgraph prod["submit-prod"]
        prod_db["DynamoDB Tables"]
        prod_vault["Local Backup Vault<br/>35-day retention"]
    end

    subgraph ci_acc["submit-ci"]
        ci_db["DynamoDB Tables"]
        ci_vault["Local Backup Vault<br/>14-day retention"]
    end

    subgraph backup_acc["submit-backup"]
        cross_vault["Cross-Account Vault<br/>90-day retention"]
    end

    prod_db -->|"Daily Backup"| prod_vault
    prod_vault -->|"Cross-Account Copy"| cross_vault
    ci_db -->|"Daily Backup"| ci_vault
    ci_vault -.->|"Optional Copy"| cross_vault

    style cross_vault fill:#c8e6c9
    style prod_vault fill:#fff3e0
```

### 5.2 Recovery Objectives

| Metric | Target | Implementation |
|--------|--------|----------------|
| **RPO** (Recovery Point Objective) | < 24 hours | Daily backups + PITR |
| **RTO** (Recovery Time Objective) | < 4 hours | Automated restore scripts |
| **Backup Retention** | 90 days | Cross-account vault |

---

## 6. CI/CD Pipeline

### 6.1 Deployment Flow

```mermaid
graph LR
    subgraph dev["Development"]
        code["Code Change"]
        pr["Pull Request"]
    end

    subgraph ci["CI Pipeline"]
        test["Unit Tests"]
        lint["Linting"]
        build["CDK Synth"]
    end

    subgraph deploy_ci["Deploy to CI"]
        ci_stack["submit-ci Account"]
        e2e["E2E Tests"]
    end

    subgraph deploy_prod["Deploy to Prod"]
        approval["Manual Approval"]
        prod_stack["submit-prod Account"]
    end

    code --> pr
    pr --> test
    test --> lint
    lint --> build
    build --> ci_stack
    ci_stack --> e2e
    e2e --> approval
    approval --> prod_stack

    style ci_stack fill:#fff3e0
    style prod_stack fill:#c8e6c9
    style approval fill:#ffcdd2
```

### 6.2 Environment Mapping

| Git Branch | Target Account | Environment |
|------------|----------------|-------------|
| `feature/*`, `claude/*` | submit-ci | Development/Testing |
| `main` | submit-prod | Production |

---

## 7. Monitoring & Observability

### 7.1 Monitoring Stack

```mermaid
graph TB
    subgraph sources["Log Sources"]
        lambda_logs["Lambda Logs"]
        api_logs["API Gateway Logs"]
        cf_logs["CloudFront Logs"]
        waf_logs["WAF Logs"]
    end

    subgraph monitoring["Monitoring"]
        cw["CloudWatch"]
        alarms["CloudWatch Alarms"]
        dashboard["CloudWatch Dashboard"]
    end

    subgraph alerting["Alerting"]
        sns["SNS Topics"]
        email["Email Notifications"]
    end

    sources --> cw
    cw --> alarms
    cw --> dashboard
    alarms --> sns
    sns --> email

    style cw fill:#ff9800
```

### 7.2 Key Metrics

| Metric | Threshold | Action |
|--------|-----------|--------|
| Lambda Errors | > 5% | Alert |
| API Latency (p99) | > 3s | Alert |
| DynamoDB Throttling | Any | Alert |
| 4xx Error Rate | > 10% | Alert |
| 5xx Error Rate | > 1% | Alert + Page |

---

## 8. Cost Optimization

### 8.1 Cost Distribution

```mermaid
pie title Monthly Cost Distribution (Estimated)
    "CloudFront" : 25
    "Lambda" : 20
    "DynamoDB" : 20
    "API Gateway" : 15
    "S3" : 5
    "Other" : 15
```

### 8.2 Optimization Strategies

| Strategy | Implementation | Savings |
|----------|----------------|---------|
| **Serverless-first** | No EC2 instances | ~60% vs traditional |
| **DynamoDB On-Demand** | Pay per request | Variable workloads |
| **CloudFront Caching** | Static asset caching | Reduced origin requests |
| **Lambda Right-sizing** | Memory optimization | ~20% Lambda costs |
| **Reserved Capacity** | Not used (low volume) | N/A |

---

## 9. Compliance

### 9.1 Compliance Framework

| Requirement | Implementation |
|-------------|----------------|
| **GDPR** | Data in eu-west-2, encryption, audit logs |
| **HMRC MTD** | Fraud prevention headers, secure token storage |
| **WCAG 2.2 AA** | Accessible UI, tested with axe-core |
| **OWASP Top 10** | WAF rules, security headers, input validation |

### 9.2 Audit Trail

All API calls logged to CloudWatch with:
- Timestamp
- User identity (masked)
- Action performed
- Resource affected
- Source IP (anonymized)

---

## 10. Infrastructure as Code

### 10.1 CDK Stack Structure

```mermaid
graph TB
    subgraph cdk["CDK Application"]
        app["App"]

        subgraph stacks["Stacks"]
            dev["DevStack<br/>Development Resources"]
            auth["AuthStack<br/>Cognito, OAuth"]
            hmrc["HmrcStack<br/>HMRC Lambda Functions"]
            account["AccountStack<br/>User Management"]
            api["ApiStack<br/>API Gateway"]
            edge["EdgeStack<br/>CloudFront, WAF"]
            backup["BackupStack<br/>AWS Backup"]
        end
    end

    app --> dev
    app --> auth
    app --> hmrc
    app --> account
    app --> api
    app --> edge
    app --> backup

    auth --> api
    hmrc --> api
    account --> api
    api --> edge
```

### 10.2 Key Files

| File | Purpose |
|------|---------|
| `cdk/src/main/java/.../App.java` | CDK entry point |
| `cdk/src/main/java/.../stacks/*.java` | Stack definitions |
| `cdk.json` | CDK configuration |
| `.github/workflows/deploy.yml` | CI/CD pipeline |

---

## Appendix A: AWS Service Inventory

| Service | Region | Account | Purpose |
|---------|--------|---------|---------|
| Route 53 | Global | submit-prod | DNS |
| CloudFront | Global | submit-prod | CDN |
| ACM | us-east-1 | submit-prod | SSL certificates |
| WAF | us-east-1 | submit-prod | Web firewall |
| API Gateway | eu-west-2 | submit-prod/ci | REST API |
| Lambda | eu-west-2, us-east-1 | submit-prod/ci | Compute |
| DynamoDB | eu-west-2 | submit-prod/ci | Database |
| Cognito | eu-west-2 | submit-prod/ci | Authentication |
| Secrets Manager | eu-west-2 | submit-prod/ci | Credentials |
| S3 | eu-west-2 | submit-prod/ci | Static assets |
| CloudWatch | eu-west-2 | submit-prod/ci | Monitoring |
| AWS Backup | eu-west-2 | All | Backup management |
| IAM Identity Center | eu-west-2 | submit-management | SSO |
| Organizations | Global | submit-management | Account management |

---

## Appendix B: Network Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              INTERNET                                        │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Route 53 (DNS)                                       │
│                    submit.diyaccounting.co.uk                                │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    CloudFront (CDN + WAF)                                    │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                      │
│  │ WAF Rules   │    │ SSL/TLS     │    │ Lambda@Edge │                      │
│  │ Rate Limit  │    │ TLS 1.2+    │    │ Sec Headers │                      │
│  └─────────────┘    └─────────────┘    └─────────────┘                      │
└─────────────────────────────────────────────────────────────────────────────┘
                          │                    │
              ┌───────────┘                    └───────────┐
              ▼                                            ▼
┌──────────────────────────┐              ┌──────────────────────────┐
│     S3 (Static Assets)   │              │     API Gateway          │
│  ┌────────────────────┐  │              │  ┌────────────────────┐  │
│  │ index.html         │  │              │  │ /api/vat/*         │  │
│  │ CSS/JS bundles     │  │              │  │ /api/auth/*        │  │
│  │ Images             │  │              │  │ /api/account/*     │  │
│  └────────────────────┘  │              │  └────────────────────┘  │
└──────────────────────────┘              └──────────────────────────┘
                                                       │
                                                       ▼
                                          ┌──────────────────────────┐
                                          │   Custom Authorizer      │
                                          │   (JWT Validation)       │
                                          └──────────────────────────┘
                                                       │
                                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Lambda Functions                                   │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │ VAT Get     │  │ VAT Post    │  │ VAT View    │  │ Token Mgr   │        │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘        │
└─────────────────────────────────────────────────────────────────────────────┘
              │                    │                    │
              ▼                    ▼                    ▼
┌──────────────────────────┐  ┌─────────────┐  ┌──────────────────────────┐
│       DynamoDB           │  │  Secrets    │  │      HMRC MTD API        │
│  ┌────────────────────┐  │  │  Manager    │  │  ┌────────────────────┐  │
│  │ submit-tokens      │  │  └─────────────┘  │  │ api.service.hmrc   │  │
│  │ submit-bundles     │  │                   │  │ .gov.uk            │  │
│  └────────────────────┘  │                   │  └────────────────────┘  │
└──────────────────────────┘                   └──────────────────────────┘
```

---

*Document generated: January 2026*
*Architecture version: 2.0 (Multi-Account)*
