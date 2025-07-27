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
import software.amazon.awscdk.services.lambda.Tracing;
import software.amazon.awscdk.services.lambda.Version;
import software.amazon.awscdk.services.lambda.VersionProps;
import software.amazon.awscdk.services.logs.LogGroup;
import software.amazon.awscdk.services.s3.BlockPublicAccess;
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

    public LogForwardingBucket(final Construct scope, final String id, final String handlerSource) {
        this(scope, id, null, handlerSource);
    }

    public LogForwardingBucket(final Construct scope, final String id, final StackProps props, final String handlerSource) {
        super(scope, id, props);
        LogForwardingBucket.Builder
                .create(this, "LogForwarding", handlerSource, LogS3ObjectEvent.class)
                .build();
    }

    public static class Builder {

        private final Construct scope;
        private final String idPrefix;
        private final String handlerSource;
        private final Class<? extends RequestHandler<S3Event, ?>> handlerClass;
        private String bucketName = null;
        private String functionNamePrefix = null;
        private int retentionPeriodDays = 30;
        private boolean cloudTrailEnabled = false;
        private boolean xRayEnabled = false;
        private RemovalPolicy removalPolicy = RemovalPolicy.DESTROY;
        private boolean versioned = false;
        private BlockPublicAccess blockPublicAccess = BlockPublicAccess.BLOCK_ALL;
        private boolean autoDeleteObjects = true;
        private ObjectOwnership objectOwnership = ObjectOwnership.OBJECT_WRITER;

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
            newBuilder.retentionPeriodDays = retentionPeriodDays;
            newBuilder.cloudTrailEnabled = cloudTrailEnabled;
            newBuilder.xRayEnabled = xRayEnabled;
            newBuilder.removalPolicy = removalPolicy;
            newBuilder.versioned = versioned;
            newBuilder.blockPublicAccess = blockPublicAccess;
            newBuilder.autoDeleteObjects = autoDeleteObjects;
            newBuilder.objectOwnership = objectOwnership;
            return newBuilder;
        }

        public Builder functionNamePrefix(String functionNamePrefix) {
            final Builder newBuilder = new Builder(scope, idPrefix, handlerSource, handlerClass);
            newBuilder.bucketName = bucketName;
            newBuilder.functionNamePrefix = functionNamePrefix;
            newBuilder.retentionPeriodDays = retentionPeriodDays;
            newBuilder.cloudTrailEnabled = cloudTrailEnabled;
            newBuilder.xRayEnabled = xRayEnabled;
            newBuilder.removalPolicy = removalPolicy;
            newBuilder.versioned = versioned;
            newBuilder.blockPublicAccess = blockPublicAccess;
            newBuilder.autoDeleteObjects = autoDeleteObjects;
            newBuilder.objectOwnership = objectOwnership;
            return newBuilder;
        }

        public Builder retentionPeriodDays(int retentionPeriodDays) {
            final Builder newBuilder = new Builder(scope, idPrefix, handlerSource, handlerClass);
            newBuilder.bucketName = bucketName;
            newBuilder.functionNamePrefix = functionNamePrefix;
            newBuilder.retentionPeriodDays = retentionPeriodDays;
            newBuilder.cloudTrailEnabled = cloudTrailEnabled;
            newBuilder.xRayEnabled = xRayEnabled;
            newBuilder.removalPolicy = removalPolicy;
            newBuilder.versioned = versioned;
            newBuilder.blockPublicAccess = blockPublicAccess;
            newBuilder.autoDeleteObjects = autoDeleteObjects;
            newBuilder.objectOwnership = objectOwnership;
            return newBuilder;
        }

        public Builder cloudTrailEnabled(boolean cloudTrailEnabled) {
            final Builder newBuilder = new Builder(scope, idPrefix, handlerSource, handlerClass);
            newBuilder.bucketName = bucketName;
            newBuilder.functionNamePrefix = functionNamePrefix;
            newBuilder.retentionPeriodDays = retentionPeriodDays;
            newBuilder.cloudTrailEnabled = cloudTrailEnabled;
            newBuilder.xRayEnabled = xRayEnabled;
            newBuilder.removalPolicy = removalPolicy;
            newBuilder.versioned = versioned;
            newBuilder.blockPublicAccess = blockPublicAccess;
            newBuilder.autoDeleteObjects = autoDeleteObjects;
            newBuilder.objectOwnership = objectOwnership;
            return newBuilder;
        }

        public Builder xRayEnabled(boolean xRayEnabled) {
            final Builder newBuilder = new Builder(scope, idPrefix, handlerSource, handlerClass);
            newBuilder.bucketName = bucketName;
            newBuilder.functionNamePrefix = functionNamePrefix;
            newBuilder.retentionPeriodDays = retentionPeriodDays;
            newBuilder.cloudTrailEnabled = cloudTrailEnabled;
            newBuilder.xRayEnabled = xRayEnabled;
            newBuilder.removalPolicy = removalPolicy;
            newBuilder.versioned = versioned;
            newBuilder.blockPublicAccess = blockPublicAccess;
            newBuilder.autoDeleteObjects = autoDeleteObjects;
            newBuilder.objectOwnership = objectOwnership;
            return newBuilder;
        }

        public Builder removalPolicy(RemovalPolicy removalPolicy) {
            final Builder newBuilder = new Builder(scope, idPrefix, handlerSource, handlerClass);
            newBuilder.bucketName = bucketName;
            newBuilder.functionNamePrefix = functionNamePrefix;
            newBuilder.retentionPeriodDays = retentionPeriodDays;
            newBuilder.cloudTrailEnabled = cloudTrailEnabled;
            newBuilder.xRayEnabled = xRayEnabled;
            newBuilder.removalPolicy = removalPolicy;
            newBuilder.versioned = versioned;
            newBuilder.blockPublicAccess = blockPublicAccess;
            newBuilder.autoDeleteObjects = autoDeleteObjects;
            newBuilder.objectOwnership = objectOwnership;
            return newBuilder;
        }

        public Builder versioned(boolean versioned) {
            final Builder newBuilder = new Builder(scope, idPrefix, handlerSource, handlerClass);
            newBuilder.bucketName = bucketName;
            newBuilder.functionNamePrefix = functionNamePrefix;
            newBuilder.retentionPeriodDays = retentionPeriodDays;
            newBuilder.cloudTrailEnabled = cloudTrailEnabled;
            newBuilder.xRayEnabled = xRayEnabled;
            newBuilder.removalPolicy = removalPolicy;
            newBuilder.versioned = versioned;
            newBuilder.blockPublicAccess = blockPublicAccess;
            newBuilder.autoDeleteObjects = autoDeleteObjects;
            newBuilder.objectOwnership = objectOwnership;
            return newBuilder;
        }

        public Builder blockPublicAccess(BlockPublicAccess blockPublicAccess) {
            final Builder newBuilder = new Builder(scope, idPrefix, handlerSource, handlerClass);
            newBuilder.bucketName = bucketName;
            newBuilder.functionNamePrefix = functionNamePrefix;
            newBuilder.retentionPeriodDays = retentionPeriodDays;
            newBuilder.cloudTrailEnabled = cloudTrailEnabled;
            newBuilder.xRayEnabled = xRayEnabled;
            newBuilder.removalPolicy = removalPolicy;
            newBuilder.versioned = versioned;
            newBuilder.blockPublicAccess = blockPublicAccess;
            newBuilder.autoDeleteObjects = autoDeleteObjects;
            newBuilder.objectOwnership = objectOwnership;
            return newBuilder;
        }

        public Builder autoDeleteObjects(boolean autoDeleteObjects) {
            final Builder newBuilder = new Builder(scope, idPrefix, handlerSource, handlerClass);
            newBuilder.bucketName = bucketName;
            newBuilder.functionNamePrefix = functionNamePrefix;
            newBuilder.retentionPeriodDays = retentionPeriodDays;
            newBuilder.cloudTrailEnabled = cloudTrailEnabled;
            newBuilder.xRayEnabled = xRayEnabled;
            newBuilder.removalPolicy = removalPolicy;
            newBuilder.versioned = versioned;
            newBuilder.blockPublicAccess = blockPublicAccess;
            newBuilder.autoDeleteObjects = autoDeleteObjects;
            newBuilder.objectOwnership = objectOwnership;
            return newBuilder;
        }

        public Builder objectOwnership(ObjectOwnership objectOwnership) {
            final Builder newBuilder = new Builder(scope, idPrefix, handlerSource, handlerClass);
            newBuilder.bucketName = bucketName;
            newBuilder.functionNamePrefix = functionNamePrefix;
            newBuilder.retentionPeriodDays = retentionPeriodDays;
            newBuilder.cloudTrailEnabled = cloudTrailEnabled;
            newBuilder.xRayEnabled = xRayEnabled;
            newBuilder.removalPolicy = removalPolicy;
            newBuilder.versioned = versioned;
            newBuilder.blockPublicAccess = blockPublicAccess;
            newBuilder.autoDeleteObjects = autoDeleteObjects;
            newBuilder.objectOwnership = objectOwnership;
            return newBuilder;
        }

        public IBucket build() {
            final String bucketName = buildBucketName();
            final String functionName = buildFunctionName();
            logger.info("Setting expiration period to %d days for %s".formatted(retentionPeriodDays, idPrefix));
            final IBucket logBucket = Bucket.Builder
                    .create(scope, "%sLogBucket".formatted(idPrefix))
                    .bucketName(bucketName)
                    .objectOwnership(objectOwnership)
                    .versioned(versioned)
                    .blockPublicAccess(blockPublicAccess)
                    .encryption(BucketEncryption.S3_MANAGED)
                    .removalPolicy(removalPolicy)
                    .autoDeleteObjects(autoDeleteObjects)
                    .lifecycleRules(List.of(LifecycleRule.builder().expiration(Duration.days(retentionPeriodDays)).build()))
                    .build();
            logger.info("Created log bucket %s".formatted(logBucket.getBucketName()));
            if (handlerSource == null || handlerSource.isBlank() || "none".equals(handlerSource)) {
                logger.warn("Handler source is not set. Log forwarding will not work.");
            } else {
                final LogGroup logGroup = LogGroup.Builder
                        .create(scope, "%sLogForwarderLogGroup".formatted(idPrefix))
                        .logGroupName(functionName)
                        .retention(RetentionDaysConverter.daysToRetentionDays(retentionPeriodDays))
                        .removalPolicy(RemovalPolicy.DESTROY)
                        .build();
                var logForwarderBuilder = Function.Builder
                        .create(scope, "%sLogForwarder".formatted(idPrefix))
                        .functionName(functionName)
                        .runtime(Runtime.JAVA_21)
                        .code(Code.fromAsset(handlerSource))
                        .handler(handlerClass.getName())
                        .memorySize(1024)
                        .timeout(Duration.seconds(60))
                        .logGroup(logGroup)
                        .retryAttempts(2);
                if (xRayEnabled) {
                    logForwarderBuilder.tracing(Tracing.ACTIVE);
                }
                final Function logForwarder = logForwarderBuilder.build();
                CfnFunction cfnFunction = (CfnFunction) logForwarder.getNode().getDefaultChild();
                assert cfnFunction != null;
                cfnFunction.addPropertyOverride("SnapStart", Map.of("ApplyOn", "PublishedVersions"));
                new Version(scope, "%sLogForwarderVersion".formatted(idPrefix), VersionProps.builder()
                        .lambda(logForwarder)
                        .build());
                logger.info("Created log forwarder %s".formatted(logForwarder.getFunctionName()));
                logBucket.addEventNotification(EventType.OBJECT_CREATED, new LambdaDestination(logForwarder));
                logBucket.grantReadWrite(logForwarder);
            }
            return logBucket;
        }

        private String buildFunctionName() {
            return functionNamePrefix != null
                    ? "%slog-forwarder".formatted(functionNamePrefix)
                    : "%s-log-forwarder".formatted(ResourceNameUtils.convertCamelCaseToDashSeparated(idPrefix));
        }

        private String buildBucketName() {
            return bucketName != null
                    ? bucketName
                    : "%s-log-bucket".formatted(ResourceNameUtils.convertCamelCaseToDashSeparated(idPrefix));
        }

    }
}
