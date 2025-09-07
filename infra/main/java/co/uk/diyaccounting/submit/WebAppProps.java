package co.uk.diyaccounting.submit;

public class WebAppProps {
  // common
  public String ENV_NAME;
  public String HOSTED_ZONE_NAME;
  public String HOSTED_ZONE_ID;
  public String SUB_DOMAIN_NAME;
  public String CERTIFICATE_ARN;
  public String CLOUD_TRAIL_ENABLED;
  public String X_RAY_ENABLED;
  public String VERBOSE_LOGGING;
  public String CLOUD_TRAIL_LOG_GROUP_PREFIX;
  public String CLOUD_TRAIL_LOG_GROUP_RETENTION_PERIOD_DAYS;
  public String ACCESS_LOG_GROUP_RETENTION_PERIOD_DAYS;
  public String USE_EXISTING_BUCKET;
  public String RETAIN_ORIGIN_BUCKET;
  public String RETAIN_RECEIPTS_BUCKET;
  public String OBJECT_PREFIX;
  public String LOG_S3_OBJECT_EVENT_HANDLER_SOURCE;
  public String LOG_GZIPPED_S3_OBJECT_EVENT_HANDLER_SOURCE;
  public String DOC_ROOT_PATH;
  public String DEFAULT_HTML_DOCUMENT;
  public String ERROR_HTML_DOCUMENT;
  public String SKIP_LAMBDA_URL_ORIGINS;
  // OAuth/HMRC
  public String DIY_SUBMIT_HMRC_CLIENT_ID;
  public String DIY_SUBMIT_HMRC_CLIENT_SECRET_ARN;
  public String DIY_SUBMIT_HOME_URL;
  public String DIY_SUBMIT_HMRC_BASE_URI;
  public String DIY_SUBMIT_TEST_ACCESS_TOKEN;
  public String DIY_SUBMIT_TEST_S3_ENDPOINT;
  public String DIY_SUBMIT_TEST_S3_ACCESS_KEY;
  public String DIY_SUBMIT_TEST_S3_SECRET_KEY;
  public String DIY_SUBMIT_RECEIPTS_BUCKET_POSTFIX;
  // Lambda entry and function config
  public String LAMBDA_ENTRY;
  public String AUTH_URL_LAMBDA_HANDLER_FUNCTION_NAME;
  public String AUTH_URL_LAMBDA_URL_PATH;
  public String AUTH_URL_LAMBDA_DURATION;
  public String AUTH_URL_MOCK_LAMBDA_HANDLER_FUNCTION_NAME;
  public String AUTH_URL_MOCK_LAMBDA_URL_PATH;
  public String AUTH_URL_MOCK_LAMBDA_DURATION;
  public String AUTH_URL_GOOGLE_LAMBDA_HANDLER_FUNCTION_NAME;
  public String AUTH_URL_GOOGLE_LAMBDA_URL_PATH;
  public String AUTH_URL_GOOGLE_LAMBDA_DURATION;
  public String AUTH_URL_ANTONYCC_LAMBDA_HANDLER_FUNCTION_NAME;
  public String AUTH_URL_ANTONYCC_LAMBDA_URL_PATH;
  public String AUTH_URL_ANTONYCC_LAMBDA_DURATION;
  public String AUTH_URL_AC_COG_LAMBDA_HANDLER_FUNCTION_NAME;
  public String AUTH_URL_AC_COG_LAMBDA_URL_PATH;
  public String AUTH_URL_AC_COG_LAMBDA_DURATION;
  public String EXCHANGE_HMRC_TOKEN_LAMBDA_HANDLER_FUNCTION_NAME;
  public String EXCHANGE_HMRC_TOKEN_LAMBDA_URL_PATH;
  public String EXCHANGE_HMRC_TOKEN_LAMBDA_DURATION;
  public String EXCHANGE_GOOGLE_TOKEN_LAMBDA_HANDLER_FUNCTION_NAME;
  public String EXCHANGE_GOOGLE_TOKEN_LAMBDA_URL_PATH;
  public String EXCHANGE_GOOGLE_TOKEN_LAMBDA_DURATION;
  public String EXCHANGE_ANTONYCC_TOKEN_LAMBDA_HANDLER_FUNCTION_NAME;
  public String EXCHANGE_ANTONYCC_TOKEN_LAMBDA_URL_PATH;
  public String EXCHANGE_ANTONYCC_TOKEN_LAMBDA_DURATION;
  public String SUBMIT_VAT_LAMBDA_HANDLER_FUNCTION_NAME;
  public String SUBMIT_VAT_LAMBDA_URL_PATH;
  public String SUBMIT_VAT_LAMBDA_DURATION;
  public String LOG_RECEIPT_LAMBDA_HANDLER_FUNCTION_NAME;
  public String LOG_RECEIPT_LAMBDA_URL_PATH;
  public String LOG_RECEIPT_LAMBDA_DURATION;
  public String LAMBDA_URL_AUTH_TYPE;
  public String COMMIT_HASH;
  // Cognito / Google
  public String DIY_SUBMIT_GOOGLE_CLIENT_ID;
  public String DIY_SUBMIT_GOOGLE_BASE_URI;
  public String DIY_SUBMIT_GOOGLE_CLIENT_SECRET_ARN;
  public String DIY_SUBMIT_COGNITO_DOMAIN_PREFIX;
  public String DIY_SUBMIT_BUNDLE_EXPIRY_DATE;
  public String DIY_SUBMIT_BUNDLE_USER_LIMIT;
  public String BUNDLE_LAMBDA_HANDLER_FUNCTION_NAME;
  public String BUNDLE_LAMBDA_URL_PATH;
  public String BUNDLE_LAMBDA_DURATION;
  public String BASE_IMAGE_TAG;
  public String DIY_SUBMIT_COGNITO_FEATURE_PLAN;
  public String DIY_SUBMIT_ENABLE_LOG_DELIVERY;
  public String LOG_COGNITO_EVENT_HANDLER_SOURCE;
  public String MY_RECEIPTS_LAMBDA_HANDLER_FUNCTION_NAME;
  public String MY_RECEIPTS_LAMBDA_URL_PATH;
  public String MY_RECEIPTS_LAMBDA_DURATION;
  public String DIY_SUBMIT_ANTONYCC_CLIENT_ID;
  public String DIY_SUBMIT_ANTONYCC_BASE_URI;
  public String DIY_SUBMIT_AC_COG_CLIENT_ID;
  public String DIY_SUBMIT_AC_COG_BASE_URI;
  public String AUTH_CERTIFICATE_ARN;

  public static class Builder {
    private final WebAppProps p = new WebAppProps();
    public static Builder create(){return new Builder();}
    public WebAppProps build(){return p;}
    // provide fluent setters for env/context override stage
    public Builder set(String key, String value){
      try {
        var f = WebAppProps.class.getDeclaredField(key);
        f.setAccessible(true);
        f.set(p, value);
      } catch (Exception ignored) {}
      return this;
    }
  }
}
