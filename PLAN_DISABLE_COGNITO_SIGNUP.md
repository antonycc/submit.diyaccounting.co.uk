# Disable Cognito Self-Registration

## Goal
Remove the sign-up option from Cognito. Users should only be created via:
- **Tests**: AWS SDK `adminCreateUser` API
- **Real users**: Federated login (Google) - auto-created on first login

## Change
**File:** `infra/main/java/co/uk/diyaccounting/submit/stacks/IdentityStack.java:154`

```java
// Before
.selfSignUpEnabled(true)

// After
.selfSignUpEnabled(false)
```

## Impact
| Scenario | Before | After |
|----------|--------|-------|
| Cognito Hosted UI | Shows sign-up option | No sign-up option |
| Behaviour tests | Create users via API | No change |
| Google login | Auto-creates federated users | No change |
| Existing users | Can sign in | No change |

## Verification
1. `./mvnw clean verify` - build passes
2. Deploy to test environment
3. Navigate to Cognito Hosted UI login - confirm no sign-up link visible
4. Run `npm run test:submitVatBehaviour-proxy` - confirm test user creation still works
