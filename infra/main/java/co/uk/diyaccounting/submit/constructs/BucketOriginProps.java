package co.uk.diyaccounting.submit.constructs;

import software.amazon.awscdk.services.s3.BlockPublicAccess;
import software.amazon.awscdk.services.s3.BucketEncryption;

public class BucketOriginProps {
  public final String bucketName;
  public final String originAccessLogBucketName;
  public final String functionNamePrefix;
  public final String logS3ObjectEventHandlerSource;
  public final int accessLogGroupRetentionPeriodDays;
  public final boolean retainBucket;
  public final boolean useExistingBucket;
  public final boolean versioned;
  public final BlockPublicAccess blockPublicAccess;
  public final BucketEncryption encryption;
  public final boolean verboseLogging;
  public final boolean cloudTrailEnabled;
  public final boolean xRayEnabled;

  private BucketOriginProps(Builder b) {
    this.bucketName = b.bucketName;
    this.originAccessLogBucketName = b.originAccessLogBucketName;
    this.functionNamePrefix = b.functionNamePrefix;
    this.logS3ObjectEventHandlerSource = b.logS3ObjectEventHandlerSource;
    this.accessLogGroupRetentionPeriodDays = b.accessLogGroupRetentionPeriodDays;
    this.retainBucket = b.retainBucket;
    this.useExistingBucket = b.useExistingBucket;
    this.versioned = b.versioned;
    this.blockPublicAccess = b.blockPublicAccess;
    this.encryption = b.encryption;
    this.verboseLogging = b.verboseLogging;
    this.cloudTrailEnabled = b.cloudTrailEnabled;
    this.xRayEnabled = b.xRayEnabled;
  }

  public static Builder builder() {
    return new Builder();
  }

  public static class Builder {
    private String bucketName;
    private String originAccessLogBucketName;
    private String functionNamePrefix;
    private String logS3ObjectEventHandlerSource;
    private int accessLogGroupRetentionPeriodDays = 30;
    private boolean retainBucket = false;
    private boolean useExistingBucket = false;
    private boolean versioned = false;
    private BlockPublicAccess blockPublicAccess = BlockPublicAccess.BLOCK_ALL;
    private BucketEncryption encryption = BucketEncryption.S3_MANAGED;
    private boolean verboseLogging = false;
    private boolean cloudTrailEnabled = false;
    private boolean xRayEnabled = false;

    public Builder bucketName(String bucketName) {
      this.bucketName = bucketName;
      return this;
    }

    public Builder originAccessLogBucketName(String name) {
      this.originAccessLogBucketName = name;
      return this;
    }

    public Builder functionNamePrefix(String prefix) {
      this.functionNamePrefix = prefix;
      return this;
    }

    public Builder logS3ObjectEventHandlerSource(String src) {
      this.logS3ObjectEventHandlerSource = src;
      return this;
    }

    public Builder accessLogGroupRetentionPeriodDays(int days) {
      this.accessLogGroupRetentionPeriodDays = days;
      return this;
    }

    public Builder retainBucket(boolean retain) {
      this.retainBucket = retain;
      return this;
    }

    public Builder useExistingBucket(boolean existing) {
      this.useExistingBucket = existing;
      return this;
    }

    public Builder versioned(boolean v) {
      this.versioned = v;
      return this;
    }

    public Builder blockPublicAccess(BlockPublicAccess p) {
      this.blockPublicAccess = p;
      return this;
    }

    public Builder encryption(BucketEncryption e) {
      this.encryption = e;
      return this;
    }

    public Builder verboseLogging(boolean v) {
      this.verboseLogging = v;
      return this;
    }

    public Builder cloudTrailEnabled(boolean v) {
      this.cloudTrailEnabled = v;
      return this;
    }

    public Builder xRayEnabled(boolean v) {
      this.xRayEnabled = v;
      return this;
    }

    public BucketOriginProps build() {
      return new BucketOriginProps(this);
    }
  }
}
