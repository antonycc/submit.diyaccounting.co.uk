package co.uk.diyaccounting.submit.swagger;

import co.uk.diyaccounting.submit.SubmitSharedNames;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

/**
 * Generates OpenAPI/Swagger documentation for the API Gateway endpoints
 */
public class OpenApiGenerator {

    public static void main(String[] args) {
        if (args.length != 1) {
            System.err.println("Usage: OpenApiGenerator <output-directory>");
            System.exit(1);
        }

        String outputDir = args[0];
        try {
            generateOpenApiSpec(outputDir);
            System.out.println("OpenAPI specification generated successfully in: " + outputDir);
        } catch (Exception e) {
            System.err.println("Failed to generate OpenAPI specification: " + e.getMessage());
            e.printStackTrace();
            System.exit(1);
        }
    }

    private static void generateOpenApiSpec(String outputDir) throws IOException {
        ObjectMapper mapper = new ObjectMapper();
        
        // Create OpenAPI 3.0 specification
        ObjectNode openApi = mapper.createObjectNode();
        openApi.put("openapi", "3.0.3");
        
        // Info section
        ObjectNode info = mapper.createObjectNode();
        info.put("title", "DIY Accounting Submit API");
        info.put("description", "API Gateway v2 endpoints for DIY Accounting Submit application");
        info.put("version", "1.0.0");
        openApi.set("info", info);

        // Servers section - will be populated with actual API Gateway URL
        ArrayNode servers = mapper.createArrayNode();
        ObjectNode server = mapper.createObjectNode();
        server.put("url", "https://{apiId}.execute-api.{region}.amazonaws.com/");
        server.put("description", "API Gateway v2 endpoint");
        ObjectNode serverVariables = mapper.createObjectNode();
        ObjectNode apiIdVar = mapper.createObjectNode();
        apiIdVar.put("description", "API Gateway ID");
        apiIdVar.put("default", "your-api-id");
        ObjectNode regionVar = mapper.createObjectNode();
        regionVar.put("description", "AWS Region");
        regionVar.put("default", "eu-west-2");
        serverVariables.set("apiId", apiIdVar);
        serverVariables.set("region", regionVar);
        server.set("variables", serverVariables);
        servers.add(server);
        openApi.set("servers", servers);

        // Add authentication info
        ObjectNode authInfo = mapper.createObjectNode();
        authInfo.put("description", "This API is protected by Amazon Cognito. To use the API:\n\n" +
            "1. **Via Website**: If you are logged into the DIY Accounting Submit website, you can access the Swagger UI directly and API calls will use your existing session cookies.\n\n" +
            "2. **External Access**: \n" +
            "   - First obtain a Cognito access token by calling `/api/v1/cognito/authUrl` to get the login URL\n" +
            "   - Complete the OAuth flow to get an access token\n" +
            "   - Include the token in the `Authorization: Bearer <token>` header\n\n" +
            "3. **For HMRC Integration**: Some endpoints require HMRC authorization tokens obtained via `/api/v1/hmrc/authUrl` and `/api/v1/hmrc/token`\n\n" +
            "**Note**: All endpoints require proper CORS headers and are accessible from the same domain as the main application.");
        info.set("x-authentication-guide", authInfo);

        // Paths section
        ObjectNode paths = mapper.createObjectNode();
        
        // Get the shared names to access path definitions
        // We'll use placeholder values since we can't instantiate SubmitSharedNames without props
        addCognitoEndpoints(paths, mapper);
        addHmrcEndpoints(paths, mapper);
        addAccountEndpoints(paths, mapper);
        
        openApi.set("paths", paths);

        // Components section for security schemes
        ObjectNode components = mapper.createObjectNode();
        ObjectNode securitySchemes = mapper.createObjectNode();
        
        ObjectNode cognitoAuth = mapper.createObjectNode();
        cognitoAuth.put("type", "http");
        cognitoAuth.put("scheme", "bearer");
        cognitoAuth.put("bearerFormat", "JWT");
        cognitoAuth.put("description", "Cognito JWT token");
        securitySchemes.set("CognitoAuth", cognitoAuth);
        
        ObjectNode hmrcAuth = mapper.createObjectNode();
        hmrcAuth.put("type", "http");
        hmrcAuth.put("scheme", "bearer");
        hmrcAuth.put("description", "HMRC OAuth2 token");
        securitySchemes.set("HmrcAuth", hmrcAuth);
        
        components.set("securitySchemes", securitySchemes);
        openApi.set("components", components);

        // Write the OpenAPI spec to files
        Path outputPath = Paths.get(outputDir);
        Files.createDirectories(outputPath);
        
        // Write JSON file
        File jsonFile = outputPath.resolve("openapi.json").toFile();
        mapper.writerWithDefaultPrettyPrinter().writeValue(jsonFile, openApi);
        
        // Write YAML file (simplified conversion)
        File yamlFile = outputPath.resolve("openapi.yaml").toFile();
        String yamlContent = convertToYaml(openApi);
        Files.writeString(yamlFile.toPath(), yamlContent);
        
        // Generate Swagger UI HTML
        generateSwaggerUiHtml(outputPath);
    }

    private static void addCognitoEndpoints(ObjectNode paths, ObjectMapper mapper) {
        // GET /cognito/authUrl
        ObjectNode cognitoAuthUrl = mapper.createObjectNode();
        ObjectNode getAuthUrl = mapper.createObjectNode();
        getAuthUrl.put("summary", "Get Cognito authentication URL");
        getAuthUrl.put("description", "Returns the Cognito OAuth2 authorization URL for user login");
        getAuthUrl.put("operationId", "getCognitoAuthUrl");
        
        ArrayNode getTags = mapper.createArrayNode();
        getTags.add("Authentication");
        getAuthUrl.set("tags", getTags);
        
        ObjectNode getResponses = mapper.createObjectNode();
        ObjectNode get200 = mapper.createObjectNode();
        get200.put("description", "Authentication URL returned successfully");
        getResponses.set("200", get200);
        getAuthUrl.set("responses", getResponses);
        
        cognitoAuthUrl.set("get", getAuthUrl);
        paths.set("/cognito/authUrl", cognitoAuthUrl);

        // POST /cognito/token
        ObjectNode cognitoToken = mapper.createObjectNode();
        ObjectNode postToken = mapper.createObjectNode();
        postToken.put("summary", "Exchange Cognito authorization code for access token");
        postToken.put("description", "Exchanges an authorization code for a Cognito access token");
        postToken.put("operationId", "exchangeCognitoToken");
        
        ArrayNode postTags = mapper.createArrayNode();
        postTags.add("Authentication");
        postToken.set("tags", postTags);
        
        ObjectNode postResponses = mapper.createObjectNode();
        ObjectNode post200 = mapper.createObjectNode();
        post200.put("description", "Token exchanged successfully");
        postResponses.set("200", post200);
        postToken.set("responses", postResponses);
        
        cognitoToken.set("post", postToken);
        paths.set("/cognito/token", cognitoToken);
    }

    private static void addHmrcEndpoints(ObjectNode paths, ObjectMapper mapper) {
        // GET /hmrc/authUrl
        ObjectNode hmrcAuthUrl = mapper.createObjectNode();
        ObjectNode getHmrcAuthUrl = mapper.createObjectNode();
        getHmrcAuthUrl.put("summary", "Get HMRC authentication URL");
        getHmrcAuthUrl.put("description", "Returns the HMRC OAuth2 authorization URL for accessing HMRC APIs");
        getHmrcAuthUrl.put("operationId", "getHmrcAuthUrl");
        
        ArrayNode getTags = mapper.createArrayNode();
        getTags.add("HMRC");
        getHmrcAuthUrl.set("tags", getTags);
        
        ArrayNode security = mapper.createArrayNode();
        ObjectNode cognitoSecurity = mapper.createObjectNode();
        ArrayNode cognitoScopes = mapper.createArrayNode();
        cognitoSecurity.set("CognitoAuth", cognitoScopes);
        security.add(cognitoSecurity);
        getHmrcAuthUrl.set("security", security);
        
        ObjectNode getResponses = mapper.createObjectNode();
        ObjectNode get200 = mapper.createObjectNode();
        get200.put("description", "HMRC authentication URL returned successfully");
        getResponses.set("200", get200);
        getHmrcAuthUrl.set("responses", getResponses);
        
        hmrcAuthUrl.set("get", getHmrcAuthUrl);
        paths.set("/hmrc/authUrl", hmrcAuthUrl);

        // POST /hmrc/token
        ObjectNode hmrcToken = mapper.createObjectNode();
        ObjectNode postHmrcToken = mapper.createObjectNode();
        postHmrcToken.put("summary", "Exchange HMRC authorization code for access token");
        postHmrcToken.put("description", "Exchanges an HMRC authorization code for an access token");
        postHmrcToken.put("operationId", "exchangeHmrcToken");
        
        ArrayNode postTags = mapper.createArrayNode();
        postTags.add("HMRC");
        postHmrcToken.set("tags", postTags);
        postHmrcToken.set("security", security);
        
        ObjectNode postResponses = mapper.createObjectNode();
        ObjectNode post200 = mapper.createObjectNode();
        post200.put("description", "HMRC token exchanged successfully");
        postResponses.set("200", post200);
        postHmrcToken.set("responses", postResponses);
        
        hmrcToken.set("post", postHmrcToken);
        paths.set("/hmrc/token", hmrcToken);

        // POST /hmrc/vat/return
        ObjectNode vatReturn = mapper.createObjectNode();
        ObjectNode postVatReturn = mapper.createObjectNode();
        postVatReturn.put("summary", "Submit VAT return to HMRC");
        postVatReturn.put("description", "Submits a VAT return to HMRC on behalf of the authenticated user");
        postVatReturn.put("operationId", "submitVatReturn");
        
        postVatReturn.set("tags", postTags);
        
        ArrayNode hmrcSecurity = mapper.createArrayNode();
        ObjectNode hmrcSecurityItem = mapper.createObjectNode();
        ArrayNode hmrcScopes = mapper.createArrayNode();
        hmrcSecurityItem.set("HmrcAuth", hmrcScopes);
        hmrcSecurity.add(hmrcSecurityItem);
        postVatReturn.set("security", hmrcSecurity);
        
        // Create a new response object for VAT return
        ObjectNode vatReturnResponses = mapper.createObjectNode();
        ObjectNode vatReturn200 = mapper.createObjectNode();
        vatReturn200.put("description", "VAT return submitted successfully");
        vatReturnResponses.set("200", vatReturn200);
        postVatReturn.set("responses", vatReturnResponses);
        
        vatReturn.set("post", postVatReturn);
        paths.set("/hmrc/vat/return", vatReturn);

        // POST /hmrc/receipt  
        ObjectNode hmrcReceipt = mapper.createObjectNode();
        ObjectNode postReceipt = mapper.createObjectNode();
        postReceipt.put("summary", "Log receipt to storage");
        postReceipt.put("description", "Logs a transaction receipt to secure storage");
        postReceipt.put("operationId", "logReceipt");
        postReceipt.set("tags", postTags);
        postReceipt.set("security", security);
        // Create a new response object for receipt logging
        ObjectNode postReceiptResponses = mapper.createObjectNode();
        ObjectNode postReceipt200 = mapper.createObjectNode();
        postReceipt200.put("description", "Receipt logged successfully");
        postReceiptResponses.set("200", postReceipt200);
        postReceipt.set("responses", postReceiptResponses);
        
        // GET /hmrc/receipt
        ObjectNode getReceipt = mapper.createObjectNode();
        getReceipt.put("summary", "Retrieve stored receipts");
        getReceipt.put("description", "Retrieves previously stored receipts for the authenticated user");
        getReceipt.put("operationId", "getReceipts");
        getReceipt.set("tags", postTags);
        getReceipt.set("security", security);
        getReceipt.set("responses", getResponses);
        
        hmrcReceipt.set("post", postReceipt);
        hmrcReceipt.set("get", getReceipt);
        paths.set("/hmrc/receipt", hmrcReceipt);
    }

    private static void addAccountEndpoints(ObjectNode paths, ObjectMapper mapper) {
        ArrayNode accountTags = mapper.createArrayNode();
        accountTags.add("Account");
        
        ArrayNode security = mapper.createArrayNode();
        ObjectNode cognitoSecurity = mapper.createObjectNode();
        ArrayNode cognitoScopes = mapper.createArrayNode();
        cognitoSecurity.set("CognitoAuth", cognitoScopes);
        security.add(cognitoSecurity);

        // GET /catalog
        ObjectNode catalog = mapper.createObjectNode();
        ObjectNode getCatalog = mapper.createObjectNode();
        getCatalog.put("summary", "Get product catalog");
        getCatalog.put("description", "Retrieves the available product catalog");
        getCatalog.put("operationId", "getCatalog");
        getCatalog.set("tags", accountTags);
        
        ObjectNode getResponses = mapper.createObjectNode();
        ObjectNode get200 = mapper.createObjectNode();
        get200.put("description", "Catalog retrieved successfully");
        getResponses.set("200", get200);
        getCatalog.set("responses", getResponses);
        
        catalog.set("get", getCatalog);
        paths.set("/catalog", catalog);

        // Bundle endpoints
        ObjectNode bundle = mapper.createObjectNode();
        
        // POST /bundle
        ObjectNode postBundle = mapper.createObjectNode();
        postBundle.put("summary", "Request new bundle");
        postBundle.put("description", "Creates a new bundle request for the authenticated user");
        postBundle.put("operationId", "requestBundle");
        postBundle.set("tags", accountTags);
        postBundle.set("security", security);
        
        ObjectNode postResponses = mapper.createObjectNode();
        ObjectNode post200 = mapper.createObjectNode();
        post200.put("description", "Bundle created successfully");
        postResponses.set("200", post200);
        postBundle.set("responses", postResponses);
        
        // GET /bundle
        ObjectNode getBundle = mapper.createObjectNode();
        getBundle.put("summary", "Get user bundles");
        getBundle.put("description", "Retrieves bundles for the authenticated user");
        getBundle.put("operationId", "getBundles");
        getBundle.set("tags", accountTags);
        getBundle.set("security", security);
        getBundle.set("responses", getResponses);
        
        // DELETE /bundle
        ObjectNode deleteBundle = mapper.createObjectNode();
        deleteBundle.put("summary", "Delete bundle");
        deleteBundle.put("description", "Deletes a bundle for the authenticated user");
        deleteBundle.put("operationId", "deleteBundle");
        deleteBundle.set("tags", accountTags);
        deleteBundle.set("security", security);
        ObjectNode deleteResponses = mapper.createObjectNode();
        ObjectNode delete200 = mapper.createObjectNode();
        delete200.put("description", "Bundle deleted successfully");
        deleteResponses.set("200", delete200);
        deleteBundle.set("responses", deleteResponses);
        
        bundle.set("post", postBundle);
        bundle.set("get", getBundle);
        bundle.set("delete", deleteBundle);
        paths.set("/bundle", bundle);
    }

    private static String convertToYaml(ObjectNode openApi) {
        // Simple JSON to YAML conversion for basic structure
        StringBuilder yaml = new StringBuilder();
        yaml.append("openapi: ").append(openApi.get("openapi").asText()).append("\n");
        yaml.append("info:\n");
        yaml.append("  title: ").append(openApi.path("info").path("title").asText()).append("\n");
        yaml.append("  description: ").append(openApi.path("info").path("description").asText()).append("\n");
        yaml.append("  version: ").append(openApi.path("info").path("version").asText()).append("\n");
        yaml.append("# Full specification available in openapi.json\n");
        return yaml.toString();
    }

    private static void generateSwaggerUiHtml(Path outputPath) throws IOException {
        String swaggerUiHtml = """
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>DIY Accounting Submit API</title>
    <link rel="stylesheet" type="text/css" href="https://unpkg.com/swagger-ui-dist@5.10.3/swagger-ui.css" />
    <style>
        html {
            box-sizing: border-box;
            overflow: -moz-scrollbars-vertical;
            overflow-y: scroll;
        }
        *, *:before, *:after {
            box-sizing: inherit;
        }
        body {
            margin:0;
            background: #fafafa;
        }
    </style>
</head>
<body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@5.10.3/swagger-ui-bundle.js"></script>
    <script src="https://unpkg.com/swagger-ui-dist@5.10.3/swagger-ui-standalone-preset.js"></script>
    <script>
        window.onload = function() {
            // Determine if we're logged in by checking for Cognito session
            const isLoggedIn = document.cookie.includes('AWSELBAuthSessionCookie') || 
                              document.cookie.includes('cognito') ||
                              localStorage.getItem('cognitoToken');
            
            const ui = SwaggerUIBundle({
                url: './openapi.json',
                dom_id: '#swagger-ui',
                deepLinking: true,
                presets: [
                    SwaggerUIBundle.presets.apis,
                    SwaggerUIStandalonePreset
                ],
                plugins: [
                    SwaggerUIBundle.plugins.DownloadUrl
                ],
                layout: "StandaloneLayout",
                requestInterceptor: function(request) {
                    // If logged in via the website, include cookies for same-origin requests
                    if (isLoggedIn && request.url.startsWith(window.location.origin)) {
                        request.credentials = 'include';
                    }
                    return request;
                },
                onComplete: function() {
                    if (isLoggedIn) {
                        // Show a notice that the user is authenticated
                        const authNotice = document.createElement('div');
                        authNotice.style.cssText = 'background: #d4edda; border: 1px solid #c3e6cb; color: #155724; padding: 10px; margin: 10px; border-radius: 4px;';
                        authNotice.innerHTML = '✓ You appear to be logged in. API calls will use your existing session.';
                        document.querySelector('.swagger-ui').prepend(authNotice);
                    }
                }
            });
            
            window.ui = ui;
        };
    </script>
</body>
</html>
        """;
        
        Files.writeString(outputPath.resolve("index.html"), swaggerUiHtml);
    }
}