package co.uk.diyaccounting.submit.awssdk;

import co.uk.diyaccounting.submit.constructs.WebStack;
import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.MockedStatic;
import software.amazon.awscdk.App;
import software.amazon.awscdk.assertions.Template;
import uk.org.webcompere.systemstubs.environment.EnvironmentVariables;
import uk.org.webcompere.systemstubs.jupiter.SystemStub;
import uk.org.webcompere.systemstubs.jupiter.SystemStubsExtension;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.net.HttpURLConnection;
import java.net.URI;
import java.net.URL;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.mockStatic;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(SystemStubsExtension.class)
public class WebStackTest {

    private static final Logger logger = LogManager.getLogger(WebStackTest.class);
    private static final String testAccount = "111111111111";

    @SystemStub
    private EnvironmentVariables environmentVariables =
            new EnvironmentVariables(
                    //"JSII_SILENCE_WARNING_UNTESTED_NODE_VERSION", "true",
                    //"JSII_SILENCE_WARNING_DEPRECATED_NODE_VERSION", "true",
                    "TARGET_ENV", "test",
                    "AWS_REGION", "eu-west-2",
                    "CDK_DEFAULT_ACCOUNT", testAccount,
                    "CDK_DEFAULT_REGION", "eu-west-2"
            );

    @Test
    public void testStackResources() {
        logger.info("Starting WebStack test - this should be visible in console output");
        App app = new App();

        /*WebStack stack = WebStack.Builder.create(app, "SubmitWebStack")
                .env("test")
                .hostedZoneName("test.submit.diyaccounting.co.uk")
                .hostedZoneId("test")
                .subDomainName("test")
                .useExistingHostedZone("false")
                .certificateArn("test")
                .useExistingCertificate("false")
                .cloudTrailEnabled("true")
                .cloudTrailLogGroupPrefix("/aws/s3/")
                .cloudTrailLogGroupRetentionPeriodDays("3")
                .accessLogGroupRetentionPeriodDays("30")
                .s3UseExistingBucket("false")
                .s3RetainOriginBucket("false")
                .s3RetainReceiptsBucket("false")
                .cloudTrailEventSelectorPrefix("none")
                .logS3ObjectEventHandlerSource("none")
                .logGzippedS3ObjectEventHandlerSource("none")
                .docRootPath("public/")
                .defaultDocumentAtOrigin("404-error-origin.html")
                .error404NotFoundAtDistribution("404-error-distribution.html")
                .skipLambdaUrlOrigins("false")
                .hmrcClientId("test-client-id")
                .homeUrl("https://test.submit.diyaccounting.co.uk/callback")
                .hmrcBaseUri("https://test-api.service.hmrc.gov.uk")
                .optionalTestRedirectUri("https://test.submit.diyaccounting.co.uk/test-callback")
                .optionalTestAccessToken("test access token")
                .optionalTestS3Endpoint("https://s3.amazonaws.com")
                .optionalTestS3AccessKey("test-access-key")
                .optionalTestS3SecretKey("test-secret-key")
                .receiptsBucketPostfix("test-receipts-bucket")
                .lambdaEntry("co.uk.diyaccounting.submit.handlers.")
                .authUrlLambdaHandlerFunctionName("AuthUrlHandler")
                .authUrlLambdaDurationMillis("30000")
                .exchangeTokenLambdaHandlerFunctionName("ExchangeTokenHandler")
                .exchangeTokenLambdaDurationMillis("30000")
                .submitVatLambdaHandlerFunctionName("SubmitVatHandler")
                .submitVatLambdaDurationMillis("60000")
                .logReceiptLambdaHandlerFunctionName("LogReceiptHandler")
                .logReceiptLambdaDurationMillis("30000")
                .build();
        */
        WebStack stack = createTestWebStack(app);

        Template template = Template.fromStack(stack);
        template.resourceCountIs("AWS::S3::Bucket", 5);
        logger.info("WebStack test completed successfully - logging is working!");
    }

    @Test
    public void testGetCloudFrontIpCondition_Success() throws Exception {
        logger.info("Testing getCloudFrontIpCondition with successful response");
        
        // Mock JSON response from AWS IP ranges API
        String mockJsonResponse = """
            {
                "prefixes": [
                    {
                        "ip_prefix": "13.32.0.0/15",
                        "region": "GLOBAL",
                        "service": "CLOUDFRONT",
                        "network_border_group": "us-east-1"
                    },
                    {
                        "ip_prefix": "13.35.0.0/16",
                        "region": "GLOBAL",
                        "service": "CLOUDFRONT",
                        "network_border_group": "us-east-1"
                    },
                    {
                        "ip_prefix": "10.0.0.0/8",
                        "region": "us-east-1",
                        "service": "EC2",
                        "network_border_group": "us-east-1"
                    }
                ]
            }
            """;

        // Create WebStack instance
        App app = new App();
        WebStack stack = createTestWebStack(app);

        // Mock the HTTP connection
        try (MockedStatic<URI> uriMock = mockStatic(URI.class)) {
            URI mockUri = mock(URI.class);
            URL mockUrl = mock(URL.class);
            HttpURLConnection mockConnection = mock(HttpURLConnection.class);

            uriMock.when(() -> URI.create("https://ip-ranges.amazonaws.com/ip-ranges.json"))
                   .thenReturn(mockUri);
            when(mockUri.toURL()).thenReturn(mockUrl);
            when(mockUrl.openConnection()).thenReturn(mockConnection);
            when(mockConnection.getResponseCode()).thenReturn(200);
            when(mockConnection.getInputStream())
                .thenReturn(new ByteArrayInputStream(mockJsonResponse.getBytes()));

            // Execute the method
            Map<String, Object> result = stack.getCloudFrontIpCondition();

            // Verify the result structure
            assertNotNull(result);
            assertTrue(result.containsKey("IpAddress"));
            
            @SuppressWarnings("unchecked")
            Map<String, Object> ipAddressMap = (Map<String, Object>) result.get("IpAddress");
            assertNotNull(ipAddressMap);
            assertTrue(ipAddressMap.containsKey("aws:SourceIp"));
            
            @SuppressWarnings("unchecked")
            List<String> cloudFrontIps = (List<String>) ipAddressMap.get("aws:SourceIp");
            assertNotNull(cloudFrontIps);
            assertEquals(2, cloudFrontIps.size());
            assertTrue(cloudFrontIps.contains("13.32.0.0/15"));
            assertTrue(cloudFrontIps.contains("13.35.0.0/16"));
            assertFalse(cloudFrontIps.contains("10.0.0.0/8")); // EC2 service should be filtered out

            // Verify HTTP connection setup
            verify(mockConnection).setRequestMethod("GET");
            verify(mockConnection).setConnectTimeout(5000);
            verify(mockConnection).setReadTimeout(5000);
        }
    }

    @Test
    public void testGetCloudFrontIpCondition_HttpError() throws Exception {
        logger.info("Testing getCloudFrontIpCondition with HTTP error");
        
        App app = new App();
        WebStack stack = createTestWebStack(app);

        // Mock the HTTP connection to return 404
        try (MockedStatic<URI> uriMock = mockStatic(URI.class)) {
            URI mockUri = mock(URI.class);
            URL mockUrl = mock(URL.class);
            HttpURLConnection mockConnection = mock(HttpURLConnection.class);

            uriMock.when(() -> URI.create("https://ip-ranges.amazonaws.com/ip-ranges.json"))
                   .thenReturn(mockUri);
            when(mockUri.toURL()).thenReturn(mockUrl);
            when(mockUrl.openConnection()).thenReturn(mockConnection);
            when(mockConnection.getResponseCode()).thenReturn(404);

            // Execute and verify exception
            RuntimeException exception = assertThrows(RuntimeException.class, 
                () -> stack.getCloudFrontIpCondition());
            
            assertEquals("Error fetching/parsing CloudFront IP ranges", exception.getMessage());
            assertTrue(exception.getCause() instanceof RuntimeException);
            assertTrue(exception.getCause().getMessage().contains("Failed to fetch IP ranges: HTTP 404"));
        }
    }

    @Test
    public void testGetCloudFrontIpCondition_NetworkError() throws Exception {
        logger.info("Testing getCloudFrontIpCondition with network error");
        
        App app = new App();
        WebStack stack = createTestWebStack(app);

        // Mock the HTTP connection to throw IOException
        try (MockedStatic<URI> uriMock = mockStatic(URI.class)) {
            URI mockUri = mock(URI.class);
            URL mockUrl = mock(URL.class);

            uriMock.when(() -> URI.create("https://ip-ranges.amazonaws.com/ip-ranges.json"))
                   .thenReturn(mockUri);
            when(mockUri.toURL()).thenReturn(mockUrl);
            when(mockUrl.openConnection()).thenThrow(new IOException("Network connection failed"));

            // Execute and verify exception
            RuntimeException exception = assertThrows(RuntimeException.class, 
                () -> stack.getCloudFrontIpCondition());
            
            assertEquals("Error fetching/parsing CloudFront IP ranges", exception.getMessage());
            assertTrue(exception.getCause() instanceof IOException);
            assertEquals("Network connection failed", exception.getCause().getMessage());
        }
    }

    @Test
    public void testGetCloudFrontIpCondition_InvalidJson() throws Exception {
        logger.info("Testing getCloudFrontIpCondition with invalid JSON");
        
        String invalidJsonResponse = "{ invalid json }";
        
        App app = new App();
        WebStack stack = createTestWebStack(app);

        // Mock the HTTP connection
        try (MockedStatic<URI> uriMock = mockStatic(URI.class)) {
            URI mockUri = mock(URI.class);
            URL mockUrl = mock(URL.class);
            HttpURLConnection mockConnection = mock(HttpURLConnection.class);

            uriMock.when(() -> URI.create("https://ip-ranges.amazonaws.com/ip-ranges.json"))
                   .thenReturn(mockUri);
            when(mockUri.toURL()).thenReturn(mockUrl);
            when(mockUrl.openConnection()).thenReturn(mockConnection);
            when(mockConnection.getResponseCode()).thenReturn(200);
            when(mockConnection.getInputStream())
                .thenReturn(new ByteArrayInputStream(invalidJsonResponse.getBytes()));

            // Execute and verify exception
            RuntimeException exception = assertThrows(RuntimeException.class, 
                () -> stack.getCloudFrontIpCondition());
            
            assertEquals("Error fetching/parsing CloudFront IP ranges", exception.getMessage());
            assertNotNull(exception.getCause());
        }
    }

    @Test
    public void testGetCloudFrontIpCondition_EmptyPrefixes() throws Exception {
        logger.info("Testing getCloudFrontIpCondition with empty prefixes");
        
        String emptyPrefixesResponse = """
            {
                "prefixes": []
            }
            """;
        
        App app = new App();
        WebStack stack = createTestWebStack(app);

        // Mock the HTTP connection
        try (MockedStatic<URI> uriMock = mockStatic(URI.class)) {
            URI mockUri = mock(URI.class);
            URL mockUrl = mock(URL.class);
            HttpURLConnection mockConnection = mock(HttpURLConnection.class);

            uriMock.when(() -> URI.create("https://ip-ranges.amazonaws.com/ip-ranges.json"))
                   .thenReturn(mockUri);
            when(mockUri.toURL()).thenReturn(mockUrl);
            when(mockUrl.openConnection()).thenReturn(mockConnection);
            when(mockConnection.getResponseCode()).thenReturn(200);
            when(mockConnection.getInputStream())
                .thenReturn(new ByteArrayInputStream(emptyPrefixesResponse.getBytes()));

            // Execute the method
            Map<String, Object> result = stack.getCloudFrontIpCondition();

            // Verify the result structure with empty list
            assertNotNull(result);
            assertTrue(result.containsKey("IpAddress"));
            
            @SuppressWarnings("unchecked")
            Map<String, Object> ipAddressMap = (Map<String, Object>) result.get("IpAddress");
            assertNotNull(ipAddressMap);
            assertTrue(ipAddressMap.containsKey("aws:SourceIp"));
            
            @SuppressWarnings("unchecked")
            List<String> cloudFrontIps = (List<String>) ipAddressMap.get("aws:SourceIp");
            assertNotNull(cloudFrontIps);
            assertTrue(cloudFrontIps.isEmpty());
        }
    }

    private WebStack createTestWebStack(App app) {
        return WebStack.Builder.create(app, "TestWebStack")
                .env("test")
                .hostedZoneName("test.submit.diyaccounting.co.uk")
                .hostedZoneId("test")
                .subDomainName("test")
                .useExistingHostedZone("false")
                .certificateArn("test")
                .useExistingCertificate("false")
                .cloudTrailEnabled("true")
                .cloudTrailLogGroupPrefix("/aws/s3/")
                .cloudTrailLogGroupRetentionPeriodDays("3")
                .accessLogGroupRetentionPeriodDays("30")
                .s3UseExistingBucket("false")
                .s3RetainOriginBucket("false")
                .s3RetainReceiptsBucket("false")
                .cloudTrailEventSelectorPrefix("none")
                .logS3ObjectEventHandlerSource("none")
                .logGzippedS3ObjectEventHandlerSource("none")
                .docRootPath("public/")
                .defaultDocumentAtOrigin("404-error-origin.html")
                .error404NotFoundAtDistribution("404-error-distribution.html")
                .skipLambdaUrlOrigins("false")
                .hmrcClientId("test-client-id")
                .homeUrl("https://test.submit.diyaccounting.co.uk/callback")
                .hmrcBaseUri("https://test-api.service.hmrc.gov.uk")
                .optionalTestRedirectUri("https://test.submit.diyaccounting.co.uk/test-callback")
                .optionalTestAccessToken("test access token")
                .optionalTestS3Endpoint("https://s3.amazonaws.com")
                .optionalTestS3AccessKey("test-access-key")
                .optionalTestS3SecretKey("test-secret-key")
                .receiptsBucketPostfix("test-receipts-bucket")
                .lambdaEntry("co.uk.diyaccounting.submit.handlers.")
                .authUrlLambdaHandlerFunctionName("AuthUrlHandler")
                .authUrlLambdaDurationMillis("30000")
                .exchangeTokenLambdaHandlerFunctionName("ExchangeTokenHandler")
                .exchangeTokenLambdaDurationMillis("30000")
                .submitVatLambdaHandlerFunctionName("SubmitVatHandler")
                .submitVatLambdaDurationMillis("60000")
                .logReceiptLambdaHandlerFunctionName("LogReceiptHandler")
                .logReceiptLambdaDurationMillis("30000")
                .build();
    }
}
