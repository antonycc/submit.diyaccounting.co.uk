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
        if (args.length != 3) {
            System.err.println("Usage: OpenApiGenerator <baseUrl> <version> <outputDir>");
            System.exit(1);
        }

        String baseUrl = args[0];
        String version = args[1];
        String outputDir = args[2];
        try {
            generateOpenApiSpec(baseUrl, version, outputDir);
            System.out.println("OpenAPI specification generated successfully in: " + outputDir);
        } catch (Exception e) {
            System.err.println("Failed to generate OpenAPI specification: " + e.getMessage());
            e.printStackTrace();
            System.exit(1);
        }
    }

    private static void generateOpenApiSpec(String baseUrl, String version, String outputDir) throws IOException {
        ObjectMapper mapper = new ObjectMapper();

        // Create OpenAPI 3.0 specification
        ObjectNode openApi = mapper.createObjectNode();
        openApi.put("openapi", "3.0.3");

        // Info section
        ObjectNode info = mapper.createObjectNode();
        info.put("title", "DIY Accounting Submit API");
        info.put("description", "DIY Accounting Submit API documentation");
        info.put("version", version);
        openApi.set("info", info);

        // Servers section - will be populated with actual API Gateway URL
        ArrayNode servers = mapper.createArrayNode();
        ObjectNode server = mapper.createObjectNode();
        server.put("url", "%sapi/v1/".formatted(baseUrl));
        server.put("description", "DIY Accounting Submit API documentation");
        // ObjectNode serverVariables = mapper.createObjectNode();
        // ObjectNode apiIdVar = mapper.createObjectNode();
        // apiIdVar.put("description", "API Gateway ID");
        // apiIdVar.put("default", "your-api-id");
        // ObjectNode regionVar = mapper.createObjectNode();
        // regionVar.put("description", "AWS Region");
        // regionVar.put("default", "eu-west-2");
        // serverVariables.set("apiId", apiIdVar);
        // serverVariables.set("region", regionVar);
        // server.set("variables", serverVariables);
        servers.add(server);
        openApi.set("servers", servers);

        // Add authentication info
        ObjectNode authInfo = mapper.createObjectNode();
        authInfo.put(
                "description",
                "This API is protected by Amazon Cognito. To use the API:\n\n"
                        + "1. **Via Website**: If you are logged into the DIY Accounting Submit website, you can access the Swagger UI directly and API calls will use your existing session cookies.\n\n"
                        + "2. **External Access**: \n"
                        + "   - First obtain a Cognito access token by calling `/api/v1/cognito/authUrl` to get the login URL\n"
                        + "   - Complete the OAuth flow to get an access token\n"
                        + "   - Include the token in the `Authorization: Bearer <token>` header\n\n"
                        + "3. **For HMRC Integration**: Some endpoints require HMRC authorization tokens obtained via `/api/v1/hmrc/authUrl` and `/api/v1/hmrc/token`\n\n"
                        + "**Note**: All endpoints require proper CORS headers and are accessible from the same domain as the main application.");
        info.set("x-authentication-guide", authInfo);

        // Paths section
        ObjectNode paths = mapper.createObjectNode();

        // Build base operations from published lambdas (summary/description/operationId)
        SubmitSharedNames sharedNames = SubmitSharedNames.forDocs();
        for (SubmitSharedNames.PublishedLambda pl : sharedNames.publishedApiLambdas) {
            String openApiPath = pl.urlPath.replaceFirst("^/api/v1", "");
            ObjectNode pathItem =
                    paths.has(openApiPath) ? (ObjectNode) paths.get(openApiPath) : mapper.createObjectNode();
            ObjectNode op = mapper.createObjectNode();
            op.put("summary", pl.summary);
            op.put("description", pl.description);
            op.put("operationId", pl.operationId);
            String method = pl.method.name().toLowerCase();
            pathItem.set(method, op);
            paths.set(openApiPath, pathItem);
        }

        // Apply endpoint-specific colouring (tags, security, responses)
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
        ObjectNode cognitoAuthUrl =
                paths.has("/cognito/authUrl") ? (ObjectNode) paths.get("/cognito/authUrl") : mapper.createObjectNode();
        ObjectNode getAuthUrl =
                cognitoAuthUrl.has("get") ? (ObjectNode) cognitoAuthUrl.get("get") : mapper.createObjectNode();

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
        ObjectNode cognitoToken =
                paths.has("/cognito/token") ? (ObjectNode) paths.get("/cognito/token") : mapper.createObjectNode();
        ObjectNode postToken =
                cognitoToken.has("post") ? (ObjectNode) cognitoToken.get("post") : mapper.createObjectNode();

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
        ArrayNode hmrcTags = mapper.createArrayNode();
        hmrcTags.add("HMRC");

        // Security helpers
        ArrayNode cognitoSecurityArr = mapper.createArrayNode();
        ObjectNode cognitoSecObj = mapper.createObjectNode();
        cognitoSecObj.set("CognitoAuth", mapper.createArrayNode());
        cognitoSecurityArr.add(cognitoSecObj);

        ArrayNode hmrcSecurityArr = mapper.createArrayNode();
        ObjectNode hmrcSecObj = mapper.createObjectNode();
        hmrcSecObj.set("HmrcAuth", mapper.createArrayNode());
        hmrcSecurityArr.add(hmrcSecObj);

        // GET /hmrc/authUrl
        ObjectNode hmrcAuthUrl =
                paths.has("/hmrc/authUrl") ? (ObjectNode) paths.get("/hmrc/authUrl") : mapper.createObjectNode();
        ObjectNode getHmrcAuthUrl =
                hmrcAuthUrl.has("get") ? (ObjectNode) hmrcAuthUrl.get("get") : mapper.createObjectNode();
        getHmrcAuthUrl.set("tags", hmrcTags);
        getHmrcAuthUrl.set("security", cognitoSecurityArr);
        ObjectNode getResponses = mapper.createObjectNode();
        ObjectNode get200 = mapper.createObjectNode();
        get200.put("description", "HMRC authentication URL returned successfully");
        getResponses.set("200", get200);
        getHmrcAuthUrl.set("responses", getResponses);
        hmrcAuthUrl.set("get", getHmrcAuthUrl);
        paths.set("/hmrc/authUrl", hmrcAuthUrl);

        // POST /hmrc/token
        ObjectNode hmrcToken =
                paths.has("/hmrc/token") ? (ObjectNode) paths.get("/hmrc/token") : mapper.createObjectNode();
        ObjectNode postHmrcToken =
                hmrcToken.has("post") ? (ObjectNode) hmrcToken.get("post") : mapper.createObjectNode();
        postHmrcToken.set("tags", hmrcTags);
        postHmrcToken.set("security", cognitoSecurityArr);
        ObjectNode postResponses = mapper.createObjectNode();
        ObjectNode post200 = mapper.createObjectNode();
        post200.put("description", "HMRC token exchanged successfully");
        postResponses.set("200", post200);
        postHmrcToken.set("responses", postResponses);
        hmrcToken.set("post", postHmrcToken);
        paths.set("/hmrc/token", hmrcToken);

        // POST /hmrc/vat/return
        ObjectNode vatReturn =
                paths.has("/hmrc/vat/return") ? (ObjectNode) paths.get("/hmrc/vat/return") : mapper.createObjectNode();
        ObjectNode postVatReturn =
                vatReturn.has("post") ? (ObjectNode) vatReturn.get("post") : mapper.createObjectNode();
        postVatReturn.set("tags", hmrcTags);
        postVatReturn.set("security", hmrcSecurityArr);
        ObjectNode vatReturnResponses = mapper.createObjectNode();
        ObjectNode vatReturn200 = mapper.createObjectNode();
        vatReturn200.put("description", "VAT return submitted successfully");
        vatReturnResponses.set("200", vatReturn200);
        postVatReturn.set("responses", vatReturnResponses);
        vatReturn.set("post", postVatReturn);
        paths.set("/hmrc/vat/return", vatReturn);

        // POST and GET /hmrc/receipt
        ObjectNode hmrcReceipt =
                paths.has("/hmrc/receipt") ? (ObjectNode) paths.get("/hmrc/receipt") : mapper.createObjectNode();

        ObjectNode postReceipt =
                hmrcReceipt.has("post") ? (ObjectNode) hmrcReceipt.get("post") : mapper.createObjectNode();
        postReceipt.set("tags", hmrcTags);
        postReceipt.set("security", cognitoSecurityArr);
        ObjectNode postReceiptResponses = mapper.createObjectNode();
        ObjectNode postReceipt200 = mapper.createObjectNode();
        postReceipt200.put("description", "Receipt logged successfully");
        postReceiptResponses.set("200", postReceipt200);
        postReceipt.set("responses", postReceiptResponses);
        hmrcReceipt.set("post", postReceipt);

        ObjectNode getReceipt =
                hmrcReceipt.has("get") ? (ObjectNode) hmrcReceipt.get("get") : mapper.createObjectNode();
        getReceipt.set("tags", hmrcTags);
        getReceipt.set("security", cognitoSecurityArr);
        getReceipt.set("responses", getResponses);
        hmrcReceipt.set("get", getReceipt);

        paths.set("/hmrc/receipt", hmrcReceipt);
    }

    private static void addAccountEndpoints(ObjectNode paths, ObjectMapper mapper) {
        ArrayNode accountTags = mapper.createArrayNode();
        accountTags.add("Account");

        ArrayNode cognitoSecurity = mapper.createArrayNode();
        ObjectNode cognitoSecurityObj = mapper.createObjectNode();
        cognitoSecurityObj.set("CognitoAuth", mapper.createArrayNode());
        cognitoSecurity.add(cognitoSecurityObj);

        // GET /catalog
        ObjectNode catalog = paths.has("/catalog") ? (ObjectNode) paths.get("/catalog") : mapper.createObjectNode();
        ObjectNode getCatalog = catalog.has("get") ? (ObjectNode) catalog.get("get") : mapper.createObjectNode();
        getCatalog.set("tags", accountTags);
        ObjectNode getResponses = mapper.createObjectNode();
        ObjectNode get200 = mapper.createObjectNode();
        get200.put("description", "Catalog retrieved successfully");
        getResponses.set("200", get200);
        getCatalog.set("responses", getResponses);
        catalog.set("get", getCatalog);
        paths.set("/catalog", catalog);

        // Bundle endpoints
        ObjectNode bundle = paths.has("/bundle") ? (ObjectNode) paths.get("/bundle") : mapper.createObjectNode();

        // POST /bundle
        ObjectNode postBundle = bundle.has("post") ? (ObjectNode) bundle.get("post") : mapper.createObjectNode();
        postBundle.set("tags", accountTags);
        postBundle.set("security", cognitoSecurity);
        ObjectNode postResponses = mapper.createObjectNode();
        ObjectNode post200 = mapper.createObjectNode();
        post200.put("description", "Bundle created successfully");
        postResponses.set("200", post200);
        postBundle.set("responses", postResponses);

        // GET /bundle
        ObjectNode getBundle = bundle.has("get") ? (ObjectNode) bundle.get("get") : mapper.createObjectNode();
        getBundle.set("tags", accountTags);
        getBundle.set("security", cognitoSecurity);
        getBundle.set("responses", getResponses);

        // DELETE /bundle
        ObjectNode deleteBundle = bundle.has("delete") ? (ObjectNode) bundle.get("delete") : mapper.createObjectNode();
        deleteBundle.set("tags", accountTags);
        deleteBundle.set("security", cognitoSecurity);
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
        yaml.append("  title: ")
                .append(openApi.path("info").path("title").asText())
                .append("\n");
        yaml.append("  description: ")
                .append(openApi.path("info").path("description").asText())
                .append("\n");
        yaml.append("  version: ")
                .append(openApi.path("info").path("version").asText())
                .append("\n");
        yaml.append("# Full specification available in openapi.json\n");
        return yaml.toString();
    }

    private static void generateSwaggerUiHtml(Path outputPath) throws IOException {
        String swaggerUiHtml =
                """
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
