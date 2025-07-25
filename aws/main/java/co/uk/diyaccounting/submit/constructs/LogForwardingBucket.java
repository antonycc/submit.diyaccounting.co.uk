package co.uk.diyaccounting.submit.constructs;

import co.uk.diyaccounting.submit.awssdk.RetentionDaysConverter;
import co.uk.diyaccounting.submit.functions.LogS3ObjectEvent;
import co.uk.diyaccounting.submit.utils.ResourceNameUtils;
import com.amazonaws.services.lambda.runtime.RequestHandler;
import com.amazonaws.services.lambda.runtime.events.S3Event;
import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;
import software.amazon.awscdk.Duration;
import software.amazon.awscdk.RemovalPolicy;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.StackProps;
import software.amazon.awscdk.services.lambda.CfnFunction;
import software.amazon.awscdk.services.lambda.Code;
import software.amazon.awscdk.services.lambda.Function;
import software.amazon.awscdk.services.lambda.Runtime;
import software.amazon.awscdk.services.lambda.Version;
import software.amazon.awscdk.services.lambda.VersionProps;
import software.amazon.awscdk.services.logs.LogGroup;
import software.amazon.awscdk.services.s3.Bucket;
import software.amazon.awscdk.services.s3.BucketEncryption;
import software.amazon.awscdk.services.s3.EventType;
import software.amazon.awscdk.services.s3.IBucket;
import software.amazon.awscdk.services.s3.LifecycleRule;
import software.amazon.awscdk.services.s3.ObjectOwnership;
import software.amazon.awscdk.services.s3.notifications.LambdaDestination;
import software.constructs.Construct;

import java.util.List;
import java.util.Map;

public class LogForwardingBucket extends Stack {

    private static final Logger logger = LogManager.getLogger(LogForwardingBucket.class);

    public IBucket logBucket;
    public LogGroup logGroup;
    public Function logForwarder;
    public CfnFunction cfnFunction;

    public LogForwardingBucket(final Construct scope, final String id, final String handlerSource) {
        this(scope, id, null, handlerSource);
    }

    public LogForwardingBucket(final Construct scope, final String id, final StackProps props, final String handlerSource) {
        super(scope, id, props);
        LogForwardingBucket.Builder builder = LogForwardingBucket.Builder
                .create(this, "LogForwarding", handlerSource, LogS3ObjectEvent.class);
        buildFromBuilder(builder);
    }

    private void buildFromBuilder(Builder builder) {
        final String bucketName = builder.buildBucketName();
        final String functionName = builder.buildFunctionName();
        logger.info("Setting expiration period to %d days for %s".formatted(builder.retentionPeriodDays, builder.idPrefix));
        this.logBucket = Bucket.Builder
                .create(builder.scope, "%sLogBucket".formatted(builder.idPrefix))
                .bucketName(bucketName)
                .objectOwnership(ObjectOwnership.OBJECT_WRITER)
                .versioned(false)
                .encryption(BucketEncryption.S3_MANAGED)
                .removalPolicy(RemovalPolicy.DESTROY)
                .autoDeleteObjects(true)
                .lifecycleRules(List.of(LifecycleRule.builder().expiration(Duration.days(builder.retentionPeriodDays)).build()))
                .build();
        logger.info("Created log bucket %s".formatted(this.logBucket.getBucketName()));
        if (builder.handlerSource == null || builder.handlerSource.isBlank() || "none".equals(builder.handlerSource)) {
            logger.warn("Handler source is not set. Log forwarding will not work.");
        } else {
            this.logGroup = LogGroup.Builder
                    .create(builder.scope, "%sLogForwarderLogGroup".formatted(builder.idPrefix))
                    .logGroupName(functionName)
                    .retention(RetentionDaysConverter.daysToRetentionDays(builder.retentionPeriodDays))
                    .removalPolicy(RemovalPolicy.DESTROY)
                    .build();
            this.logForwarder = Function.Builder
                    .create(builder.scope, "%sLogForwarder".formatted(builder.idPrefix))
                    .functionName(functionName)
                    .runtime(Runtime.JAVA_21)
                    .code(Code.fromAsset(builder.handlerSource))
                    .handler(builder.handlerClass.getName())
                    .memorySize(1024)
                    .timeout(Duration.seconds(60))
                    .logGroup(this.logGroup)
                    .retryAttempts(2)
                    .build();
            this.cfnFunction = (CfnFunction) this.logForwarder.getNode().getDefaultChild();
            assert this.cfnFunction != null;
            this.cfnFunction.addPropertyOverride("SnapStart", Map.of("ApplyOn", "PublishedVersions"));
            new Version(builder.scope, "%sLogForwarderVersion".formatted(builder.idPrefix), VersionProps.builder()
                    .lambda(this.logForwarder)
                    .build());
            logger.info("Created log forwarder %s".formatted(this.logForwarder.getFunctionName()));
            this.logBucket.addEventNotification(EventType.OBJECT_CREATED, new LambdaDestination(this.logForwarder));
            this.logBucket.grantReadWrite(this.logForwarder);
        }
    }

    public static class Builder {

        public final Construct scope;
        public final String idPrefix;
        public final String handlerSource;
        public final Class<? extends RequestHandler<S3Event, ?>> handlerClass;
        public String bucketName = null;
        public String functionNamePrefix = null;
        public int retentionPeriodDays = 30;

        private Builder(
                final Construct scope,
                final String idPrefix,
                final String handlerSource,
                final Class<? extends RequestHandler<S3Event, ?>> handlerClass) {
            this.scope = scope;
            this.idPrefix = idPrefix;
            this.handlerSource = handlerSource;
            this.handlerClass = handlerClass;
        }

        public static Builder create(
                final Construct scope,
                final String idPrefix,
                final String handlerSource,
                final Class<? extends RequestHandler<S3Event, ?>> handlerClass) {
            return new Builder(scope, idPrefix, handlerSource, handlerClass);
        }

        public Builder bucketName(String bucketName) {
            final Builder newBuilder = new Builder(scope, idPrefix, handlerSource, handlerClass);
            newBuilder.functionNamePrefix = functionNamePrefix;
            newBuilder.bucketName = bucketName;
            return newBuilder;
        }

        public Builder functionNamePrefix(String functionNamePrefix) {
            final Builder newBuilder = new Builder(scope, idPrefix, handlerSource, handlerClass);
            newBuilder.bucketName = bucketName;
            newBuilder.functionNamePrefix = functionNamePrefix;
            return newBuilder;
        }

        public Builder retentionPeriodDays(int retentionPeriodDays) {
            final Builder newBuilder = new Builder(scope, idPrefix, handlerSource, handlerClass);
            newBuilder.bucketName = bucketName;
            newBuilder.functionNamePrefix = functionNamePrefix;
            newBuilder.retentionPeriodDays = retentionPeriodDays;
            return newBuilder;
        }

        public IBucket build() {
            // This method is kept for backward compatibility
            // The actual building is done in the constructor via buildFromBuilder()
            if (scope instanceof LogForwardingBucket) {
                return ((LogForwardingBucket) scope).logBucket;
            }
            throw new IllegalStateException("Builder can only be used with LogForwardingBucket scope");
        }

        public String buildFunctionName() {
            return functionNamePrefix != null
                    ? "%slog-forwarder".formatted(functionNamePrefix)
                    : "%s-log-forwarder".formatted(ResourceNameUtils.convertCamelCaseToDashSeparated(idPrefix));
        }

        public String buildBucketName() {
            return bucketName != null
                    ? bucketName
                    : "%s-log-bucket".formatted(ResourceNameUtils.convertCamelCaseToDashSeparated(idPrefix));
        }

    }
}
