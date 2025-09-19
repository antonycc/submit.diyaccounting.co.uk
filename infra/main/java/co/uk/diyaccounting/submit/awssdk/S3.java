package co.uk.diyaccounting.submit.awssdk;

import com.amazonaws.services.lambda.runtime.events.models.s3.S3EventNotification;
import software.amazon.awscdk.Duration;
import software.amazon.awscdk.services.s3.LifecycleRule;
import software.amazon.awscdk.services.s3.StorageClass;
import software.amazon.awscdk.services.s3.Transition;
import software.amazon.awssdk.core.ResponseInputStream;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.GetObjectResponse;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.List;

public class S3 {

    public S3Client client = S3Client.create();
    public MockableBuilder builder = new MockableBuilder();

    public String getZippedObjectContentAsString(S3EventNotification.S3Entity s3Entity) {
        var is = getObjectInputStream(s3Entity);
        return Gzip.unzip(is);
    }

    public String getObjectContentAsString(S3EventNotification.S3Entity s3Entity) {
        try {
            return new String(getObjectInputStream(s3Entity).readAllBytes(), StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new RuntimeException(e);
        }
    }

    public ResponseInputStream<GetObjectResponse> getObjectInputStream(S3EventNotification.S3Entity s3Entity) {
        return client.getObject(
                builder.getObjectRequest(
                        s3Entity.getBucket().getName(), s3Entity.getObject().getKey()),
                builder.getResponseTransformer());
    }

    /**
     * Create lifecycle rules based on bucket purpose and retention period
     * For receipts buckets (7 years): Intelligent Tiering to IA after 30 days, Glacier after 90 days
     * For log buckets (short term): Simple expiration
     */
    public static List<LifecycleRule> createLifecycleRules(int retentionDays) {
        // Long-term storage (receipts) - use intelligent tiering for cost optimization
        return List.of(LifecycleRule.builder()
            .id("ReceiptsLifecycleRule")
            .enabled(true)
            .transitions(List.of(
                // Move to IA after 30 days
                Transition.builder()
                    .storageClass(StorageClass.INFREQUENT_ACCESS)
                    .transitionAfter(Duration.days(30))
                    .build(),
                // Move to Glacier after 90 days
                Transition.builder()
                    .storageClass(StorageClass.GLACIER)
                    .transitionAfter(Duration.days(90))
                    .build(),
                // Move to Deep Archive after 1 year for maximum cost savings
                Transition.builder()
                    .storageClass(StorageClass.DEEP_ARCHIVE)
                    .transitionAfter(Duration.days(365))
                    .build()))
            .expiration(Duration.days(retentionDays))
            .build());
    }
}
