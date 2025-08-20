package co.uk.diyaccounting.submit.constructs;

import co.uk.diyaccounting.submit.functions.LogGzippedS3ObjectEvent;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import software.amazon.awscdk.services.certificatemanager.ICertificate;
import software.amazon.awscdk.services.cloudfront.BehaviorOptions;
import software.amazon.awscdk.services.cloudfront.Distribution;
import software.amazon.awscdk.services.cloudfront.ErrorResponse;
import software.amazon.awscdk.services.cloudfront.HttpVersion;
import software.amazon.awscdk.services.cloudfront.SSLMethod;
import software.amazon.awscdk.services.s3.IBucket;
import software.constructs.Construct;

/**
 * Thin coordinator that creates the DistributionAccess log bucket and the Distribution
 * at the top level scope using the exact same child ids as before to avoid logical ID drift.
 */
public class DistributionWithLogging {

  public final IBucket logBucket;
  public final Distribution distribution;

  private DistributionWithLogging(Builder b) {
    // Create log bucket with same id
    IBucket distAccess =
        LogForwardingBucket.Builder.create(
                b.scope, "DistributionAccess", b.logHandlerSource, LogGzippedS3ObjectEvent.class)
            .bucketName(b.logBucketName)
            .functionNamePrefix(b.logFunctionNamePrefix)
            .retentionPeriodDays(b.logRetentionDays)
            .cloudTrailEnabled(b.cloudTrailEnabled)
            .verboseLogging(b.logIncludesCookies)
            .build();

    this.logBucket = distAccess;

    // Create distribution with same id and props
    this.distribution =
        Distribution.Builder.create(b.scope, "Distribution")
            .domainNames(Collections.singletonList(b.domainName))
            .defaultBehavior(b.defaultBehavior)
            .additionalBehaviors(b.additionalBehaviors)
            .defaultRootObject(b.defaultRootObject)
            .errorResponses(
                List.of(
                    ErrorResponse.builder()
                        .httpStatus(b.errorStatusCode)
                        .responseHttpStatus(b.errorStatusCode)
                        .responsePagePath("/" + b.errorPageKey)
                        .build()))
            .certificate(b.certificate)
            .enableIpv6(true)
            .sslSupportMethod(SSLMethod.SNI)
            .httpVersion(HttpVersion.HTTP2_AND_3)
            .enableLogging(true)
            .logBucket(distAccess)
            .logIncludesCookies(b.logIncludesCookies)
            .build();
  }

  public static class Builder {
    private final Construct scope;
    private String domainName;
    private BehaviorOptions defaultBehavior;
    private Map<String, BehaviorOptions> additionalBehaviors = Map.of();
    private String defaultRootObject = "index.html";
    private String errorPageKey = "error.html";
    private int errorStatusCode = 404;
    private ICertificate certificate;
    private String logBucketName;
    private String logFunctionNamePrefix;
    private int logRetentionDays = 3;
    private boolean cloudTrailEnabled = false;
    private boolean logIncludesCookies = false;
    private String logHandlerSource;

    private Builder(Construct scope) {
      this.scope = scope;
    }

    public static Builder create(Construct scope) {
      return new Builder(scope);
    }

    public Builder domainName(String domainName) {
      this.domainName = domainName;
      return this;
    }

    public Builder defaultBehavior(BehaviorOptions defaultBehavior) {
      this.defaultBehavior = defaultBehavior;
      return this;
    }

    public Builder additionalBehaviors(Map<String, BehaviorOptions> additionalBehaviors) {
      this.additionalBehaviors = additionalBehaviors;
      return this;
    }

    public Builder defaultRootObject(String defaultRootObject) {
      this.defaultRootObject = defaultRootObject;
      return this;
    }

    public Builder errorPageKey(String errorPageKey) {
      this.errorPageKey = errorPageKey;
      return this;
    }

    public Builder errorStatusCode(int code) {
      this.errorStatusCode = code;
      return this;
    }

    public Builder certificate(ICertificate certificate) {
      this.certificate = certificate;
      return this;
    }

    public Builder logBucketName(String name) {
      this.logBucketName = name;
      return this;
    }

    public Builder logFunctionNamePrefix(String prefix) {
      this.logFunctionNamePrefix = prefix;
      return this;
    }

    public Builder logRetentionDays(int days) {
      this.logRetentionDays = days;
      return this;
    }

    public Builder cloudTrailEnabled(boolean enabled) {
      this.cloudTrailEnabled = enabled;
      return this;
    }

    public Builder logIncludesCookies(boolean includes) {
      this.logIncludesCookies = includes;
      return this;
    }

    public Builder logHandlerSource(String source) {
      this.logHandlerSource = source;
      return this;
    }

    public DistributionWithLogging build() {
      if (domainName == null || domainName.isBlank())
        throw new IllegalArgumentException("domainName is required");
      if (defaultBehavior == null)
        throw new IllegalArgumentException("defaultBehavior is required");
      if (certificate == null) throw new IllegalArgumentException("certificate is required");
      if (logBucketName == null || logBucketName.isBlank())
        throw new IllegalArgumentException("logBucketName is required");
      if (logFunctionNamePrefix == null || logFunctionNamePrefix.isBlank())
        throw new IllegalArgumentException("logFunctionNamePrefix is required");
      if (logHandlerSource == null || logHandlerSource.isBlank())
        throw new IllegalArgumentException("logHandlerSource is required");
      return new DistributionWithLogging(this);
    }
  }
}
