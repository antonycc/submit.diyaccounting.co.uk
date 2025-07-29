package co.uk.diyaccounting.submit.awssdk;

import org.junit.jupiter.api.Test;
import software.amazon.awssdk.core.ResponseInputStream;
import software.amazon.awssdk.core.sync.ResponseTransformer;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectResponse;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

public class MockableBuilderTest {

    @Test
    void testGetObjectRequest() {
        MockableBuilder mockableBuilder = new MockableBuilder();

        String bucket = "my-bucket";
        String key = "my-key";
        GetObjectRequest request = mockableBuilder.getObjectRequest(bucket, key);

        assertEquals(bucket, request.bucket());
        assertEquals(key, request.key());
    }

    @Test
    void testGetResponseTransformer() {
        MockableBuilder mockableBuilder = new MockableBuilder();

        ResponseTransformer<GetObjectResponse, ResponseInputStream<GetObjectResponse>> responseTransformer
                = mockableBuilder.getResponseTransformer();

        assertNotNull(responseTransformer);
    }
}
