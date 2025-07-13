package co.uk.diyaccounting.submit.awssdk;

import com.amazonaws.services.lambda.runtime.events.models.s3.S3EventNotification;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mockito;
import software.amazon.awssdk.core.ResponseInputStream;
import software.amazon.awssdk.core.sync.ResponseTransformer;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectResponse;
import uk.org.webcompere.systemstubs.environment.EnvironmentVariables;
import uk.org.webcompere.systemstubs.jupiter.SystemStub;
import uk.org.webcompere.systemstubs.jupiter.SystemStubsExtension;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.fail;
import static org.mockito.Mockito.when;

@ExtendWith(SystemStubsExtension.class)
public class S3ClientTest {

    private static final String testAccount = "111111111111";
    private final String bucketName = "test-bucket";
    private final String objectKey = "test-key";

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

    private final GetObjectRequest objectRequest = new MockableBuilder().getObjectRequest(bucketName, objectKey);
    private final ResponseTransformer<GetObjectResponse, ResponseInputStream<GetObjectResponse>> responseTransformer
            = new MockableBuilder().getResponseTransformer();
    private S3Client mockedS3Client;
    private MockableBuilder mockedBuilder;

    @BeforeEach
    public void setUp() {
        mockedS3Client = Mockito.mock(S3Client.class);
        mockedBuilder = Mockito.mock(MockableBuilder.class);
        when(mockedBuilder.getObjectRequest(bucketName, objectKey)).thenReturn(objectRequest);
        when(mockedBuilder.getResponseTransformer()).thenReturn(responseTransformer);
    }

    @Test
    public void testGetObjectContentAsString() throws IOException {

        // Test parameters
        var objectContents = UUID.randomUUID().toString();
        var objectContentsAsBytes = objectContents.getBytes();
        ResponseInputStream<GetObjectResponse> ris = new ResponseInputStream<>(
                GetObjectResponse.builder().build(),
                new ByteArrayInputStream(objectContentsAsBytes));

        // Expected results
        var expectedMessage = objectContents;

        // Mocks
        S3EventNotification.S3Entity s3Entity = createMockS3Entity(bucketName);
        when(mockedS3Client.getObject(objectRequest, responseTransformer)).thenReturn(ris);

        // Execute
        assertEquals(bucketName, s3Entity.getBucket().getName());
        assertEquals(objectKey, s3Entity.getObject().getKey());
        var s3 = new S3();
        s3.client = mockedS3Client;
        s3.builder = mockedBuilder;
        String result = s3.getObjectContentAsString(s3Entity);

        // Verify
        assertEquals(expectedMessage, result);
    }

    @Test
    public void testGetZippedObjectContentAsString() throws IOException {

        // Test parameters
        var objectContents = UUID.randomUUID().toString();
        var objectContentsAsBytes = Gzip.zip(objectContents.getBytes());
        ResponseInputStream<GetObjectResponse> ris = new ResponseInputStream<>(
                GetObjectResponse.builder().build(),
                new ByteArrayInputStream(objectContentsAsBytes));

        // Expected results
        var expectedMessage = objectContents;

        // Mocks
        S3EventNotification.S3Entity s3Entity = createMockS3Entity(bucketName);
        when(mockedS3Client.getObject(objectRequest, responseTransformer)).thenReturn(ris);

        // Execute
        var s3 = new S3();
        s3.client = mockedS3Client;
        s3.builder = mockedBuilder;
        String result = s3.getZippedObjectContentAsString(s3Entity);

        // Verify
        assertEquals(expectedMessage, result);
    }

    @Test
    public void testGetIncorrectlyZippedObjectContentAsString() throws IOException {

        // Test parameters
        var objectContentsAsBytes = UUID.randomUUID().toString().getBytes();
        ResponseInputStream<GetObjectResponse> ris = new ResponseInputStream<>(
                GetObjectResponse.builder().build(),
                new ByteArrayInputStream(objectContentsAsBytes));

        // Expected results
        var expectedMessage ="java.util.zip.ZipException: Not in GZIP format";

        // Mocks
        S3EventNotification.S3Entity s3Entity = createMockS3Entity(bucketName);
        when(mockedS3Client.getObject(objectRequest, responseTransformer)).thenReturn(ris);

        // Execute
        try {
            var s3 = new S3();
            s3.client = mockedS3Client;
            s3.builder = mockedBuilder;
            s3.getZippedObjectContentAsString(s3Entity);
            fail("Expected an Exception to be thrown");
        } catch (Exception e) {
            // Verify
            assertEquals(expectedMessage, e.getMessage());
        }

    }

    private S3EventNotification.S3Entity createMockS3Entity(String bucketName) {
        var schemaVersion = "1";
        var configurationId = "configurationId";
        var principle = "principle";
        S3EventNotification.UserIdentityEntity identity = new S3EventNotification.UserIdentityEntity(principle);
        S3EventNotification.S3BucketEntity bucket = new S3EventNotification.S3BucketEntity(
                bucketName,
                identity,
                "eu-west-2");
        S3EventNotification.S3ObjectEntity object = new S3EventNotification.S3ObjectEntity(
                objectKey,
                1L,
                null,
                null,
                null);
        return new S3EventNotification.S3Entity(
                configurationId,
                bucket,
                object,
                schemaVersion);
    }
}
