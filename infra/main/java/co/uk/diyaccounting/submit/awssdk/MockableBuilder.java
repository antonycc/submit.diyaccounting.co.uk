package co.uk.diyaccounting.submit.awssdk;

import software.amazon.awssdk.core.ResponseInputStream;
import software.amazon.awssdk.core.sync.ResponseTransformer;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectResponse;

public class MockableBuilder {

  public GetObjectRequest getObjectRequest(String originBucketName, String s3ObjectKey) {
    return GetObjectRequest.builder().bucket(originBucketName).key(s3ObjectKey).build();
  }

  public ResponseTransformer<GetObjectResponse, ResponseInputStream<GetObjectResponse>>
      getResponseTransformer() {
    return ResponseTransformer.toInputStream();
  }
}
