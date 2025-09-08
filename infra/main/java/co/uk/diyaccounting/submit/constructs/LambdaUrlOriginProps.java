package co.uk.diyaccounting.submit.constructs;

import software.amazon.awscdk.Duration;
import software.amazon.awscdk.RemovalPolicy;
import software.amazon.awscdk.services.cloudfront.AllowedMethods;
import software.amazon.awscdk.services.cloudfront.CachePolicy;
import software.amazon.awscdk.services.cloudfront.ICachePolicy;
import software.amazon.awscdk.services.cloudfront.IOriginRequestPolicy;
import software.amazon.awscdk.services.cloudfront.IResponseHeadersPolicy;
import software.amazon.awscdk.services.cloudfront.OriginProtocolPolicy;
import software.amazon.awscdk.services.cloudfront.OriginRequestPolicy;
import software.amazon.awscdk.services.cloudfront.ResponseHeadersPolicy;
import software.amazon.awscdk.services.cloudfront.ViewerProtocolPolicy;
import software.amazon.awscdk.services.lambda.FunctionUrlAuthType;
import software.amazon.awscdk.services.lambda.InvokeMode;
import software.amazon.awscdk.services.lambda.Runtime;
import software.amazon.awscdk.services.logs.RetentionDays;

import java.util.Map;

/**
 * Props container for LambdaUrlOrigin construct. Mirrors the previous Builder fields
 * so callers can migrate to props-style configuration.
 */
public class LambdaUrlOriginProps {
    public final String env;
    public final String functionName;
    public final String handler;
    public final Duration timeout;
    public final Map<String, String> environment;
    public final AllowedMethods cloudFrontAllowedMethods;
    public final boolean skipBehaviorOptions;

    public final boolean cloudTrailEnabled;
    public final boolean xRayEnabled;
    public final boolean verboseLogging;

    public final FunctionUrlAuthType functionUrlAuthType;
    public final InvokeMode invokeMode;

    public final RetentionDays logGroupRetention;
    public final RemovalPolicy logGroupRemovalPolicy;

    public final OriginProtocolPolicy protocolPolicy;

    public final IResponseHeadersPolicy responseHeadersPolicy;

    public final ICachePolicy cachePolicy;
    public final ViewerProtocolPolicy viewerProtocolPolicy;
    public final IOriginRequestPolicy originRequestPolicy;

    public final String imageDirectory;
    public final String imageFilename;
    public final Runtime testRuntime;
    public final String baseImageTag;

    public final String ecrRepositoryArn;
    public final String ecrRepositoryName;

    private LambdaUrlOriginProps(Builder b) {
        this.env = b.env;
        this.functionName = b.functionName;
        this.handler = b.handler;
        this.timeout = b.timeout;
        this.environment = b.environment;
        this.cloudFrontAllowedMethods = b.cloudFrontAllowedMethods;
        this.skipBehaviorOptions = b.skipBehaviorOptions;
        this.cloudTrailEnabled = b.cloudTrailEnabled;
        this.xRayEnabled = b.xRayEnabled;
        this.verboseLogging = b.verboseLogging;
        this.functionUrlAuthType = b.functionUrlAuthType;
        this.invokeMode = b.invokeMode;
        this.logGroupRetention = b.logGroupRetention;
        this.logGroupRemovalPolicy = b.logGroupRemovalPolicy;
        this.protocolPolicy = b.protocolPolicy;
        this.responseHeadersPolicy = b.responseHeadersPolicy;
        this.cachePolicy = b.cachePolicy;
        this.viewerProtocolPolicy = b.viewerProtocolPolicy;
        this.originRequestPolicy = b.originRequestPolicy;
        this.imageDirectory = b.imageDirectory;
        this.imageFilename = b.imageFilename;
        this.testRuntime = b.testRuntime;
        this.baseImageTag = b.baseImageTag;
        this.ecrRepositoryArn = b.ecrRepositoryArn;
        this.ecrRepositoryName = b.ecrRepositoryName;
    }

    public static Builder builder() {
        return new Builder();
    }

    public static class Builder {
        private String env = null;
        private String functionName = null;
        private String handler = null;
        private Duration timeout = Duration.seconds(30);
        private Map<String, String> environment = Map.of();
        private AllowedMethods cloudFrontAllowedMethods = AllowedMethods.ALLOW_GET_HEAD_OPTIONS;
        private boolean skipBehaviorOptions = false;

        private boolean cloudTrailEnabled = false;
        private boolean xRayEnabled = false;
        private boolean verboseLogging = false;

        private FunctionUrlAuthType functionUrlAuthType = FunctionUrlAuthType.NONE;
        private InvokeMode invokeMode = InvokeMode.BUFFERED;

        private RetentionDays logGroupRetention = RetentionDays.THREE_DAYS;
        private RemovalPolicy logGroupRemovalPolicy = RemovalPolicy.DESTROY;

        private OriginProtocolPolicy protocolPolicy = OriginProtocolPolicy.HTTPS_ONLY;

        private IResponseHeadersPolicy responseHeadersPolicy =
                ResponseHeadersPolicy.CORS_ALLOW_ALL_ORIGINS_WITH_PREFLIGHT_AND_SECURITY_HEADERS;

        private ICachePolicy cachePolicy = CachePolicy.CACHING_DISABLED;
        private ViewerProtocolPolicy viewerProtocolPolicy = ViewerProtocolPolicy.REDIRECT_TO_HTTPS;
        private IOriginRequestPolicy originRequestPolicy = OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER;

        private String imageDirectory = ".";
        private String imageFilename = "Dockerfile";
        private Runtime testRuntime = Runtime.NODEJS_22_X;
        private String baseImageTag = null;
        private String ecrRepositoryArn = null;
        private String ecrRepositoryName = null;

        public Builder env(String env) {
            this.env = env;
            return this;
        }

        public Builder functionName(String functionName) {
            this.functionName = functionName;
            return this;
        }

        public Builder handler(String handler) {
            this.handler = handler;
            return this;
        }

        public Builder timeout(Duration timeout) {
            this.timeout = timeout;
            return this;
        }

        public Builder environment(Map<String, String> environment) {
            this.environment = environment;
            return this;
        }

        public Builder allowedMethods(AllowedMethods methods) {
            this.cloudFrontAllowedMethods = methods;
            return this;
        }

        public Builder skipBehaviorOptions(boolean skip) {
            this.skipBehaviorOptions = skip;
            return this;
        }

        public Builder cloudTrailEnabled(boolean cloudTrailEnabled) {
            this.cloudTrailEnabled = cloudTrailEnabled;
            return this;
        }

        public Builder xRayEnabled(boolean xRayEnabled) {
            this.xRayEnabled = xRayEnabled;
            return this;
        }

        public Builder verboseLogging(boolean verboseLogging) {
            this.verboseLogging = verboseLogging;
            return this;
        }

        public Builder functionUrlAuthType(FunctionUrlAuthType t) {
            this.functionUrlAuthType = t;
            return this;
        }

        public Builder invokeMode(InvokeMode mode) {
            this.invokeMode = mode;
            return this;
        }

        public Builder logGroupRetention(RetentionDays d) {
            this.logGroupRetention = d;
            return this;
        }

        public Builder logGroupRemovalPolicy(RemovalPolicy p) {
            this.logGroupRemovalPolicy = p;
            return this;
        }

        public Builder protocolPolicy(OriginProtocolPolicy p) {
            this.protocolPolicy = p;
            return this;
        }

        public Builder responseHeadersPolicy(IResponseHeadersPolicy p) {
            this.responseHeadersPolicy = p;
            return this;
        }

        public Builder cachePolicy(ICachePolicy p) {
            this.cachePolicy = p;
            return this;
        }

        public Builder viewerProtocolPolicy(ViewerProtocolPolicy p) {
            this.viewerProtocolPolicy = p;
            return this;
        }

        public Builder originRequestPolicy(IOriginRequestPolicy p) {
            this.originRequestPolicy = p;
            return this;
        }

        public Builder imageDirectory(String d) {
            this.imageDirectory = d;
            return this;
        }

        public Builder imageFilename(String f) {
            this.imageFilename = f;
            return this;
        }

        public Builder testRuntime(Runtime r) {
            this.testRuntime = r;
            return this;
        }

        public Builder baseImageTag(String tag) {
            this.baseImageTag = tag;
            return this;
        }

        public Builder ecrRepositoryArn(String arn) {
            this.ecrRepositoryArn = arn;
            return this;
        }

        public Builder ecrRepositoryName(String name) {
            this.ecrRepositoryName = name;
            return this;
        }

        public LambdaUrlOriginProps build() {
            return new LambdaUrlOriginProps(this);
        }
    }
}
