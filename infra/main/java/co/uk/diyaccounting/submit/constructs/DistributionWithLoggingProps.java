package co.uk.diyaccounting.submit.constructs;

import java.util.Map;
import software.amazon.awscdk.services.certificatemanager.ICertificate;
import software.amazon.awscdk.services.cloudfront.BehaviorOptions;

public class DistributionWithLoggingProps {
  public final String domainName;
  public final BehaviorOptions defaultBehavior;
  public final Map<String, BehaviorOptions> additionalBehaviors;
  public final String defaultRootObject;
  public final String errorPageKey;
  public final int errorStatusCode;
  public final ICertificate certificate;
  public final String logBucketName;
  public final String logFunctionNamePrefix;
  public final int logRetentionDays;
  public final boolean cloudTrailEnabled;
  public final boolean logIncludesCookies;
  public final String logHandlerSource;

  private DistributionWithLoggingProps(Builder b) {
    this.domainName = b.domainName;
    this.defaultBehavior = b.defaultBehavior;
    this.additionalBehaviors = b.additionalBehaviors;
    this.defaultRootObject = b.defaultRootObject;
    this.errorPageKey = b.errorPageKey;
    this.errorStatusCode = b.errorStatusCode;
    this.certificate = b.certificate;
    this.logBucketName = b.logBucketName;
    this.logFunctionNamePrefix = b.logFunctionNamePrefix;
    this.logRetentionDays = b.logRetentionDays;
    this.cloudTrailEnabled = b.cloudTrailEnabled;
    this.logIncludesCookies = b.logIncludesCookies;
    this.logHandlerSource = b.logHandlerSource;
  }

  public static Builder builder() {
    return new Builder();
  }

  public static class Builder {
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

    public Builder domainName(String domainName) {
      this.domainName = domainName;
      return this;
    }

    public Builder defaultBehavior(BehaviorOptions defaultBehavior) {
      this.defaultBehavior = defaultBehavior;
      return this;
    }

    public Builder additionalBehaviors(Map<String, BehaviorOptions> m) {
      this.additionalBehaviors = m;
      return this;
    }

    public Builder defaultRootObject(String s) {
      this.defaultRootObject = s;
      return this;
    }

    public Builder errorPageKey(String s) {
      this.errorPageKey = s;
      return this;
    }

    public Builder errorStatusCode(int c) {
      this.errorStatusCode = c;
      return this;
    }

    public Builder certificate(ICertificate c) {
      this.certificate = c;
      return this;
    }

    public Builder logBucketName(String s) {
      this.logBucketName = s;
      return this;
    }

    public Builder logFunctionNamePrefix(String s) {
      this.logFunctionNamePrefix = s;
      return this;
    }

    public Builder logRetentionDays(int d) {
      this.logRetentionDays = d;
      return this;
    }

    public Builder cloudTrailEnabled(boolean e) {
      this.cloudTrailEnabled = e;
      return this;
    }

    public Builder logIncludesCookies(boolean e) {
      this.logIncludesCookies = e;
      return this;
    }

    public Builder logHandlerSource(String s) {
      this.logHandlerSource = s;
      return this;
    }

    public DistributionWithLoggingProps build() {
      return new DistributionWithLoggingProps(this);
    }
  }
}
