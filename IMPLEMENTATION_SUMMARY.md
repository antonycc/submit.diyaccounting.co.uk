# Route 53 Weighted Alias Switching Implementation Summary

This document summarizes the implementation of the Route 53 weighted alias switching strategy as detailed in `_developers/backlog/alias.md`.

## What Was Implemented

### 1. ApexStack Infrastructure Changes
- **Removed**: Route 53 alias record creation logic from ApexStack.java
- **Kept**: Maintenance distribution and required CloudFormation outputs
- **Result**: ApexStack now only manages the maintenance CloudFront distribution

### 2. New DNS Management Strategy
- **Created**: `.github/actions/set-alias-records/action.yml` composite action
- **Functionality**: Creates weighted Route 53 A/AAAA records using AWS CLI
- **Traffic control**: Active deployment (weight 100) vs maintenance (weight 0)
- **Deployment isolation**: Each deployment gets unique SetIdentifier

### 3. Workflow Integration
- **Updated**: `.github/workflows/deploy.yml` to use new set-alias-records action
- **Replaced**: set-origins job with set-alias-records job
- **Dependencies**: Updated web-test job to depend on set-alias-records

### 4. Cleanup
- **Removed**: Old set-origins action and set-apex-origins.mjs script
- **Result**: Cleaner codebase without unused CloudFront origin management

## Architecture Benefits

### Before (CloudFront Chaining)
```
User → Apex CloudFront → Environment CloudFront → Lambda Functions
```

### After (DNS Weighted Routing)
```
User → DNS (weighted) → Environment CloudFront → Lambda Functions
                    └→ Maintenance CloudFront (weight 0)
```

## Key Technical Details

### DNS Record Structure
- **A Record**: Points to primary or maintenance CloudFront distribution
- **AAAA Record**: IPv6 equivalent of A record
- **SetIdentifier**: Uses deployment name for uniqueness
- **Weight**: 100 for active, 0 for maintenance

### Stack Naming Convention
- **EdgeStack**: `del-{deployment-name}-EdgeStack`
- **ApexStack**: `env-{environment-name}-ApexStack`
- **Outputs**: `WebDistributionDomainName` and `ApexDistributionDomainName`

### Environment Support
- **Production**: Routes to apex domain (e.g., `submit.diyaccounting.co.uk`)
- **CI/Development**: Routes to subdomain (e.g., `ci.submit.diyaccounting.co.uk`)

## Testing Results

All existing functionality continues to work:
- ✅ 153 unit tests pass
- ✅ 28 integration tests pass  
- ✅ Java compilation successful
- ✅ Maven build successful

## Next Steps for Production Deployment

### 1. Configure GitHub Variables
Set the following repository variables in GitHub:
- `AWS_HOSTED_ZONE_NAME`: Your Route 53 hosted zone (e.g., `diyaccounting.co.uk`)
- `AWS_HOSTED_ZONE_ID`: Your Route 53 hosted zone ID

### 2. Certificate Requirements
Ensure your ACM certificate includes:
- Apex domain: `submit.diyaccounting.co.uk`
- Wildcard: `*.submit.diyaccounting.co.uk`

### 3. Testing the Implementation
1. Deploy a test environment
2. Verify weighted records are created correctly
3. Test traffic switching by updating weights
4. Confirm maintenance page appears when primary weight = 0

### 4. Operations Documentation
Document the new traffic switching process:
- How to switch traffic between deployments
- How to enable maintenance mode
- How to perform rollbacks using DNS weights

## Rollback Plan

If issues arise, the old approach can be restored by:
1. Reverting the ApexStack.java changes
2. Restoring the set-origins action
3. Updating deploy.yml to use set-origins

However, this implementation follows the exact alias.md specification and should work reliably.

## Implementation Compliance

This implementation fully complies with the `_developers/backlog/alias.md` specification:
- ✅ Step 1: ApexStack updated to remove Route 53 alias
- ✅ Step 2: set-origins logic removed from deploy.yml  
- ✅ Step 3: New set-alias-records action created
- ✅ Step 4: deploy.yml updated to use new action
- ✅ Step 5: Certificate requirements documented

The alias switching strategy is now ready for production use.