package co.uk.diyaccounting.submit.constructs;

import software.amazon.awscdk.Environment;
import software.amazon.awscdk.RemovalPolicy;
import software.amazon.awscdk.StackProps;
import software.amazon.awscdk.services.s3.BlockPublicAccess;
import software.amazon.awscdk.services.s3.ObjectOwnership;

public class LogForwardingBucketProps implements StackProps {
  public final Environment env;
  public final String bucketName;
  public final String functionNamePrefix;
  public final int retentionPeriodDays;
  public final boolean cloudTrailEnabled;
  public final boolean xRayEnabled;
  public final boolean verboseLogging;
  public final RemovalPolicy removalPolicy;
  public final boolean versioned;
  public final BlockPublicAccess blockPublicAccess;
  public final boolean autoDeleteObjects;
  public final ObjectOwnership objectOwnership;

  private LogForwardingBucketProps(Builder b) {
    this.env = b.env;
    this.bucketName = b.bucketName;
    this.functionNamePrefix = b.functionNamePrefix;
    this.retentionPeriodDays = b.retentionPeriodDays;
    this.cloudTrailEnabled = b.cloudTrailEnabled;
    this.xRayEnabled = b.xRayEnabled;
    this.verboseLogging = b.verboseLogging;
    this.removalPolicy = b.removalPolicy;
    this.versioned = b.versioned;
    this.blockPublicAccess = b.blockPublicAccess;
    this.autoDeleteObjects = b.autoDeleteObjects;
    this.objectOwnership = b.objectOwnership;
  }

  @Override
  public Environment getEnv() { return env; }

  public static Builder builder() { return new Builder(); }

  public static class Builder {
    private Environment env;
    private String bucketName;
    private String functionNamePrefix;
    private int retentionPeriodDays = 30;
    private boolean cloudTrailEnabled = false;
    private boolean xRayEnabled = false;
    private boolean verboseLogging = false;
    private RemovalPolicy removalPolicy = RemovalPolicy.DESTROY;
    private boolean versioned = false;
    private BlockPublicAccess blockPublicAccess = BlockPublicAccess.BLOCK_ALL;
    private boolean autoDeleteObjects = true;
    private ObjectOwnership objectOwnership = ObjectOwnership.BUCKET_OWNER_ENFORCED;

    public Builder env(Environment env) { this.env = env; return this; }
    public Builder bucketName(String v) { this.bucketName = v; return this; }
    public Builder functionNamePrefix(String v) { this.functionNamePrefix = v; return this; }
    public Builder retentionPeriodDays(int v) { this.retentionPeriodDays = v; return this; }
    public Builder cloudTrailEnabled(boolean v) { this.cloudTrailEnabled = v; return this; }
    public Builder xRayEnabled(boolean v) { this.xRayEnabled = v; return this; }
    public Builder verboseLogging(boolean v) { this.verboseLogging = v; return this; }
    public Builder removalPolicy(RemovalPolicy v) { this.removalPolicy = v; return this; }
    public Builder versioned(boolean v) { this.versioned = v; return this; }
    public Builder blockPublicAccess(BlockPublicAccess v) { this.blockPublicAccess = v; return this; }
    public Builder autoDeleteObjects(boolean v) { this.autoDeleteObjects = v; return this; }
    public Builder objectOwnership(ObjectOwnership v) { this.objectOwnership = v; return this; }

    public LogForwardingBucketProps build() { return new LogForwardingBucketProps(this); }
  }
}
