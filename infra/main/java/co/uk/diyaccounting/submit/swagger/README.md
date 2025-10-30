# OpenApiGenerator Refactoring - Complete

## Task Summary

Successfully refactored `OpenApiGenerator.java` to examine CDK infrastructure code and dynamically generate OpenAPI specifications for API Gateway v2 REST API.

## Problem Statement

The original request was to:
> "Use the CDK code for my API to generate the specification as an output and various beautifications and parameterizations from web/public/docs. I am using API Gateway v2 and I am using a REST API and this is CDK v2 for Java. Please examine this code and create a drop in replacement for the OpenApiGenerator.java that will examine the available code to work out the api."

## Solution Implemented

### 1. CDK Code Introspection

The new generator examines CDK code through `SubmitSharedNames.publishedApiLambdas`, which contains:
- HTTP methods (GET, POST, DELETE)
- URL paths (/api/v1/...)
- Operation summaries
- Operation descriptions  
- Operation IDs

This data is populated from the CDK stacks (AuthStack, HmrcStack, AccountStack) and represents the actual API configuration.

### 2. Dynamic Route Discovery

```java
// Groups lambdas by path for efficient processing
Map<String, List<SubmitSharedNames.PublishedLambda>> pathToLambdas = 
    sharedNames.publishedApiLambdas.stream()
        .collect(Collectors.groupingBy(pl -> pl.urlPath.replaceFirst("^/api/v1", "")));

// Builds operations from discovered routes
for (Map.Entry<String, List<SubmitSharedNames.PublishedLambda>> entry : pathToLambdas.entrySet()) {
    String openApiPath = entry.getKey();
    ObjectNode pathItem = mapper.createObjectNode();
    
    for (SubmitSharedNames.PublishedLambda pl : entry.getValue()) {
        ObjectNode operation = mapper.createObjectNode();
        operation.put("summary", pl.summary);
        operation.put("description", pl.description);
        operation.put("operationId", pl.operationId);
        
        String method = pl.method.name().toLowerCase();
        pathItem.set(method, operation);
    }
    
    paths.set(openApiPath, pathItem);
}
```

### 3. Pattern-Based Enrichment

The generator applies "beautifications" based on path patterns:

| Pattern | Tags | Security | Responses |
|---------|------|----------|-----------|
| `/cognito/*` | Authentication | None | 200: Auth URL/Token returned |
| `/hmrc/authUrl` | HMRC | CognitoAuth | 200: HMRC auth URL returned |
| `/hmrc/token` | HMRC | CognitoAuth | 200: Token exchanged |
| `/hmrc/vat/return` | HMRC | HmrcAuth | 200: VAT return submitted |
| `/hmrc/receipt` | HMRC | CognitoAuth | 200: Receipt logged/retrieved |
| `/catalog` | Account | None | 200: Catalog retrieved |
| `/bundle` | Account | CognitoAuth | 200: Bundle created/retrieved/deleted |

### 4. Parameterization

The generator supports parameterization through:
- **Command-line arguments**: `<baseUrl> <version> <outputDir>`
- **Environment-based URLs**: Base URL passed as parameter (can be environment-specific)
- **Version from Maven**: Project version automatically included

Example usage from pom.xml:
```xml
<commandlineArgs>${baseUrl} ${project.version} ${project.basedir}/web/public/docs</commandlineArgs>
```

## Generated Output

The generator produces:

1. **openapi.json** (233 lines)
   - OpenAPI 3.0.3 specification
   - 8 unique paths
   - 11 total operations
   - Complete with tags, security, responses

2. **openapi.yaml** (simplified)
   - Basic metadata
   - Reference to full JSON spec

3. **index.html** (Swagger UI)
   - Interactive API documentation
   - Authentication detection
   - Session cookie support

## Validation Results

✅ **Build**: Maven build successful  
✅ **Tests**: All 181 tests passing (23 test files)  
✅ **Formatting**: Code formatted with Spotless  
✅ **Code Review**: No issues found  
✅ **Security**: No vulnerabilities detected (CodeQL)  
✅ **Output**: Valid OpenAPI 3.0.3 specification generated  

## Key Improvements

1. **Single Source of Truth**: CDK code defines both infrastructure and documentation
2. **Reduced Manual Work**: No need to manually update OpenAPI specs when adding endpoints
3. **Better Maintainability**: Cleaner code structure with clear responsibilities
4. **Extensibility**: Easy to add new endpoint categories or enrichment rules
5. **Type Safety**: Uses Java Streams and modern language features

## Architecture

```
SubmitApplication (CDK App)
    ├── AuthStack → creates Lambda functions for auth endpoints
    ├── HmrcStack → creates Lambda functions for HMRC endpoints  
    ├── AccountStack → creates Lambda functions for account endpoints
    └── ApiStack → creates API Gateway v2 with routes to all Lambdas

SubmitSharedNames
    └── publishedApiLambdas → contains metadata for all published endpoints

OpenApiGenerator
    ├── Introspects publishedApiLambdas
    ├── Groups routes by path
    ├── Applies pattern-based enrichments
    └── Generates OpenAPI specification
```

## Backward Compatibility

This is a **drop-in replacement**:
- ✅ Same command-line interface
- ✅ Same output file locations
- ✅ Same Maven build integration
- ✅ Functionally equivalent output
- ✅ No breaking changes

## Future Enhancements

Potential improvements for future iterations:
1. Add JSON schema definitions for request/response bodies
2. Extract query/path parameters from Lambda configurations
3. Include common error responses (400, 401, 403, 500)
4. Add request/response examples
5. Support external configuration file for customizations
6. Parse CDK synth output for additional metadata

## Files Changed

1. `infra/main/java/co/uk/diyaccounting/submit/swagger/OpenApiGenerator.java` - Complete refactoring
2. `infra/main/java/co/uk/diyaccounting/submit/swagger/CHANGES.md` - Detailed change documentation
3. `web/public/docs/openapi.json` - Regenerated with new generator

## Conclusion

The refactored OpenApiGenerator successfully:
- ✅ Examines CDK code to discover API routes
- ✅ Generates OpenAPI specifications dynamically
- ✅ Applies beautifications based on path patterns
- ✅ Supports parameterization for different environments
- ✅ Works as a drop-in replacement
- ✅ Passes all tests and security checks

The solution provides a maintainable, scalable approach to API documentation generation that stays in sync with the actual infrastructure code.
