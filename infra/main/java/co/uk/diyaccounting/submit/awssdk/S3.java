package co.uk.diyaccounting.submit.awssdk;

import com.amazonaws.services.lambda.runtime.events.models.s3.S3EventNotification;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import software.amazon.awssdk.core.ResponseInputStream;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.GetObjectResponse;

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

  private ResponseInputStream<GetObjectResponse> getObjectInputStream(
      S3EventNotification.S3Entity s3Entity) {
    return client.getObject(
        builder.getObjectRequest(s3Entity.getBucket().getName(), s3Entity.getObject().getKey()),
        builder.getResponseTransformer());
  }
}
