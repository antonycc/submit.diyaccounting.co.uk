package co.uk.diyaccounting.submit.stacks;

import co.uk.diyaccounting.submit.awssdk.RetentionDaysConverter;
import co.uk.diyaccounting.submit.utils.ResourceNameUtils;
import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;
import software.amazon.awscdk.CfnOutput;
import software.amazon.awscdk.Duration;
import software.amazon.awscdk.RemovalPolicy;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.StackProps;
import software.amazon.awscdk.services.cloudtrail.Trail;
import software.amazon.awscdk.services.logs.LogGroup;
import software.amazon.awscdk.services.logs.RetentionDays;
import software.amazon.awscdk.services.s3.BlockPublicAccess;
import software.amazon.awscdk.services.s3.Bucket;
import software.amazon.awscdk.services.s3.BucketEncryption;
import software.amazon.awscdk.services.s3.LifecycleRule;
import software.constructs.Construct;

import java.util.AbstractMap;
import java.util.List;
import java.util.regex.Pattern;

public class ObservabilityStack extends Stack {

  private static final Logger logger = LogManager.getLogger(ObservabilityStack.class);

  public Bucket trailBucket;
  public Trail trail;
    public LogGroup cloudTrailLogGroup;

  public ObservabilityStack(Construct scope, String id, ObservabilityStack.Builder builder) {
    this(scope, id, null, builder);
  }

  public ObservabilityStack(Construct scope, String id, StackProps props, ObservabilityStack.Builder builder) {
    super(scope, id, props);

    // Values are provided via WebApp after context/env resolution

    // Build naming using same patterns as WebStack
    String domainName = 
        Builder.buildDomainName(builder.env, builder.subDomainName, builder.hostedZoneName);
    String dashedDomainName = 
        Builder.buildDashedDomainName(builder.env, builder.subDomainName, builder.hostedZoneName);

      String trailName = WebStack.Builder.buildTrailName(dashedDomainName);
      boolean cloudTrailEnabled = Boolean.parseBoolean(builder.cloudTrailEnabled);
      int cloudTrailLogGroupRetentionPeriodDays =
              Integer.parseInt(builder.cloudTrailLogGroupRetentionPeriodDays);
      boolean xRayEnabled = Boolean.parseBoolean(builder.xRayEnabled);

      // Create a CloudTrail for the stack resources
      RetentionDays cloudTrailLogGroupRetentionPeriod =
              RetentionDaysConverter.daysToRetentionDays(cloudTrailLogGroupRetentionPeriodDays);
      if (cloudTrailEnabled) {
          this.cloudTrailLogGroup =
                  LogGroup.Builder.create(this, "CloudTrailGroup")
                          .logGroupName(
                                  "%s%s-cloud-trail".formatted(builder.cloudTrailLogGroupPrefix, dashedDomainName))
                          .retention(cloudTrailLogGroupRetentionPeriod)
                          .removalPolicy(RemovalPolicy.DESTROY)
                          .build();
          this.trailBucket =
                  Bucket.Builder.create(this, trailName + "CloudTrailBucket")
                          .encryption(BucketEncryption.S3_MANAGED)
                          .blockPublicAccess(BlockPublicAccess.BLOCK_ALL)
                          .versioned(false)
                          .autoDeleteObjects(true)
                          .removalPolicy(RemovalPolicy.DESTROY)
                          .lifecycleRules(
                                  List.of(
                                          LifecycleRule.builder()
                                                  .expiration(Duration.days(cloudTrailLogGroupRetentionPeriodDays))
                                                  .build()))
                          .build();
          this.trail =
                  Trail.Builder.create(this, "Trail")
                          .trailName(trailName)
                          .cloudWatchLogGroup(this.cloudTrailLogGroup)
                          .sendToCloudWatchLogs(true)
                          .cloudWatchLogsRetention(cloudTrailLogGroupRetentionPeriod)
                          .includeGlobalServiceEvents(false)
                          .isMultiRegionTrail(false)
                          .build();

          // Outputs for Observability resources
          if (this.trailBucket != null) {
            CfnOutput.Builder.create(this, "TrailBucketArn").value(this.trailBucket.getBucketArn()).build();
          }
          if (this.trail != null) {
            CfnOutput.Builder.create(this, "TrailArn").value(this.trail.getTrailArn()).build();
          }
      }

    logger.info("ObservabilityStack created successfully for {}", dashedDomainName);
  }

  /**
   * Builder class following the same pattern as WebStack.Builder
   */
  public static class Builder {
    private Construct scope;
    private String id;
    private StackProps props;
    
    // Environment configuration
    public String env;
    public String subDomainName;
    public String hostedZoneName;
      public String cloudTrailEnabled;
      public String cloudTrailLogGroupPrefix;
      public String cloudTrailLogGroupRetentionPeriodDays;
      public String accessLogGroupRetentionPeriodDays;
      public String xRayEnabled;

    private Builder() {}

    public static Builder create(Construct scope, String id) {
      Builder builder = new Builder();
      builder.scope = scope;
      builder.id = id;
      return builder;
    }

    public Builder props(StackProps props) {
      this.props = props;
      return this;
    }

    public Builder env(String env) {
      this.env = env;
      return this;
    }

    public Builder subDomainName(String subDomainName) {
      this.subDomainName = subDomainName;
      return this;
    }

    public Builder hostedZoneName(String hostedZoneName) {
      this.hostedZoneName = hostedZoneName;
      return this;
    }

      public Builder cloudTrailEnabled(String cloudTrailEnabled) {
          this.cloudTrailEnabled = cloudTrailEnabled;
          return this;
      }

      public Builder cloudTrailLogGroupPrefix(String cloudTrailLogGroupPrefix) {
          this.cloudTrailLogGroupPrefix = cloudTrailLogGroupPrefix;
          return this;
      }

      public Builder cloudTrailLogGroupRetentionPeriodDays(
              String cloudTrailLogGroupRetentionPeriodDays) {
          this.cloudTrailLogGroupRetentionPeriodDays = cloudTrailLogGroupRetentionPeriodDays;
          return this;
      }

      public Builder accessLogGroupRetentionPeriodDays(String accessLogGroupRetentionPeriodDays) {
          this.accessLogGroupRetentionPeriodDays = accessLogGroupRetentionPeriodDays;
          return this;
      }

      public Builder xRayEnabled(String xRayEnabled) {
          this.xRayEnabled = xRayEnabled;
          return this;
      }

      public Builder props(ObservabilityStackProps p) {
          if (p == null) return this;
          this.env = p.env;
          this.subDomainName = p.subDomainName;
          this.hostedZoneName = p.hostedZoneName;
          this.cloudTrailEnabled = p.cloudTrailEnabled;
          this.cloudTrailLogGroupPrefix = p.cloudTrailLogGroupPrefix;
          this.cloudTrailLogGroupRetentionPeriodDays = p.cloudTrailLogGroupRetentionPeriodDays;
          this.accessLogGroupRetentionPeriodDays = p.accessLogGroupRetentionPeriodDays;
          this.xRayEnabled = p.xRayEnabled;
          return this;
      }

    public ObservabilityStack build() {
      return new ObservabilityStack(this.scope, this.id, this.props, this);
    }

    // Naming utility methods following WebStack patterns
    public static String buildDomainName(String env, String subDomainName, String hostedZoneName) {
      return env.equals("prod")
          ? Builder.buildProdDomainName(subDomainName, hostedZoneName)
          : Builder.buildNonProdDomainName(env, subDomainName, hostedZoneName);
    }

    public static String buildProdDomainName(String subDomainName, String hostedZoneName) {
      return "%s.%s".formatted(subDomainName, hostedZoneName);
    }

    public static String buildNonProdDomainName(
        String env, String subDomainName, String hostedZoneName) {
      return "%s.%s.%s".formatted(env, subDomainName, hostedZoneName);
    }

    public static String buildDashedDomainName(
        String env, String subDomainName, String hostedZoneName) {
      return ResourceNameUtils.convertDotSeparatedToDashSeparated(
          "%s.%s.%s".formatted(env, subDomainName, hostedZoneName), domainNameMappings);
    }
  }

  // Use same domain name mappings as WebStack
  public static final List<AbstractMap.SimpleEntry<Pattern, String>> domainNameMappings = List.of();
}