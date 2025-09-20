package co.uk.diyaccounting.submit.constructs;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;
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
import software.amazon.awscdk.services.ecr.IRepository;
import software.amazon.awscdk.services.ecr.Repository;
import software.amazon.awscdk.services.ecr.RepositoryAttributes;
import software.amazon.awscdk.services.lambda.DockerImageCode;
import software.amazon.awscdk.services.lambda.DockerImageFunction;
import software.amazon.awscdk.services.lambda.EcrImageCodeProps;
import software.amazon.awscdk.services.lambda.Function;
import software.amazon.awscdk.services.lambda.FunctionUrlAuthType;
import software.amazon.awscdk.services.lambda.InvokeMode;
import software.amazon.awscdk.services.lambda.Runtime;
import software.amazon.awscdk.services.lambda.Tracing;
import software.amazon.awscdk.services.logs.LogGroup;
import software.amazon.awscdk.services.logs.LogGroupProps;
import software.amazon.awscdk.services.logs.RetentionDays;
import software.constructs.Construct;

import java.util.List;
import java.util.Map;

public class LambdaUrlOrigin {

    private static final Logger logger = LogManager.getLogger(LambdaUrlOrigin.class);
    //private static final Pattern LAMBDA_URL_HOST_PATTERN = Pattern.compile("https://([^/]+)/");

    public final DockerImageCode dockerImage;
    public final Function lambda;
    public final LogGroup logGroup;
    //public final FunctionUrl functionUrl;
    //public final BehaviorOptions behaviorOptions;
    //public final HttpOrigin apiOrigin;
    //public final String lambdaUrlHost;

    private LambdaUrlOrigin(final Construct scope, Builder builder) {

        // Create the lambda function
        var imageCodeProps = EcrImageCodeProps.builder()
            .tagOrDigest(builder.baseImageTag) // e.g. "latest" or specific digest for immutability
            .cmd(List.of(builder.handler))
            .build();
        var repositoryAttributes = RepositoryAttributes.builder()
            .repositoryArn(builder.ecrRepositoryArn)
            .repositoryName(builder.ecrRepositoryName)
            .build();
        IRepository repository =
            Repository.fromRepositoryAttributes(scope, builder.functionName + "-EcrRepo", repositoryAttributes);
        this.dockerImage = DockerImageCode.fromEcr(repository, imageCodeProps);

        // Add X-Ray environment variables if enabled
        var environment = new java.util.HashMap<>(builder.environment);
        if (builder.xRayEnabled) {
            environment.put("AWS_XRAY_TRACING_NAME", builder.functionName);
        }

        var dockerFunctionBuilder = DockerImageFunction.Builder.create(scope, builder.idPrefix + "Fn")
            .code(this.dockerImage)
            .environment(environment)
            .functionName(builder.functionName)
            .timeout(builder.timeout);
        if (builder.xRayEnabled) {
            dockerFunctionBuilder.tracing(Tracing.ACTIVE);
        }

        this.lambda = dockerFunctionBuilder.build();

        // Create log group for the lambda
        this.logGroup = new LogGroup(
                scope,
                builder.idPrefix + "LogGroup",
                LogGroupProps.builder()
                        .logGroupName("/aws/lambda/" + this.lambda.getFunctionName())
                        .retention(builder.logGroupRetention)
                        .removalPolicy(builder.logGroupRemovalPolicy)
                        .build());

        // Create function URL
        //FunctionUrlOptions.Builder functionUrlOptionsBuilder = FunctionUrlOptions.builder()
        //        .authType(builder.functionUrlAuthType)
        //        .invokeMode(builder.invokeMode);

        //this.functionUrl = this.lambda.addFunctionUrl(functionUrlOptionsBuilder.build());

        //this.lambdaUrlHost = getLambdaUrlHostToken(this.functionUrl);
        //this.apiOrigin = HttpOrigin.Builder.create(this.lambdaUrlHost)
        //        .protocolPolicy(builder.protocolPolicy)
        //        .build();

        //BehaviorOptions.Builder behaviorOptionsBuilder = BehaviorOptions.builder()
        //        .origin(this.apiOrigin)
        //        .allowedMethods(builder.cloudFrontAllowedMethods)
        //        .cachePolicy(builder.cachePolicy)
        //        .originRequestPolicy(builder.originRequestPolicy)
        //        .viewerProtocolPolicy(builder.viewerProtocolPolicy);

        //if (builder.responseHeadersPolicy != null) {
        //    behaviorOptionsBuilder.responseHeadersPolicy(builder.responseHeadersPolicy);
        //}

        //this.behaviorOptions = behaviorOptionsBuilder.build();

        logger.info("Created LambdaUrlOrigin with function: {}", this.lambda.getFunctionName());
    }

    //private String getLambdaUrlHostToken(FunctionUrl functionUrl) {
    //    String urlHostToken = Fn.select(2, Fn.split("/", functionUrl.getUrl()));
    //    return urlHostToken;
    //}

    public static class Builder {
        public final Construct scope;
        public final String idPrefix;

        public String env = null;
        public String functionName = null;
        public String handler = null;
        public Duration timeout = Duration.seconds(30);
        public Map<String, String> environment = Map.of();
        public AllowedMethods cloudFrontAllowedMethods = AllowedMethods.ALLOW_GET_HEAD_OPTIONS;
        public boolean skipBehaviorOptions = false;

        // CloudTrail and X-Ray configuration
        public boolean cloudTrailEnabled = false;
        public boolean xRayEnabled = false;
        public boolean verboseLogging = false;

        // Function URL configuration
        public FunctionUrlAuthType functionUrlAuthType = FunctionUrlAuthType.NONE;
        public InvokeMode invokeMode = InvokeMode.BUFFERED;

        // Log group configuration
        public RetentionDays logGroupRetention = RetentionDays.THREE_DAYS;
        public RemovalPolicy logGroupRemovalPolicy = RemovalPolicy.DESTROY;

        // HttpOrigin configuration
        public OriginProtocolPolicy protocolPolicy = OriginProtocolPolicy.HTTPS_ONLY;

        // ResponseHeadersPolicy configuration
        public IResponseHeadersPolicy responseHeadersPolicy =
                ResponseHeadersPolicy.CORS_ALLOW_ALL_ORIGINS_WITH_PREFLIGHT_AND_SECURITY_HEADERS;

        // BehaviorOptions configuration
        public ICachePolicy cachePolicy = CachePolicy.CACHING_DISABLED;
        public ViewerProtocolPolicy viewerProtocolPolicy = ViewerProtocolPolicy.REDIRECT_TO_HTTPS;
        public IOriginRequestPolicy originRequestPolicy = OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER;

        // Lambda configuration
        public String imageDirectory = ".";
        public String imageFilename = "Dockerfile";
        public Runtime testRuntime = Runtime.NODEJS_22_X;
        public String baseImageTag = null;

        public String ecrRepositoryArn = null;
        public String ecrRepositoryName = null;

        private Builder(final Construct scope, final String idPrefix) {
            this.scope = scope;
            this.idPrefix = idPrefix;
        }

        public static Builder create(final Construct scope, final String idPrefix) {
            return new Builder(scope, idPrefix);
        }

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

        public Builder allowedMethods(AllowedMethods cloudFrontAllowedMethods) {
            this.cloudFrontAllowedMethods = cloudFrontAllowedMethods;
            return this;
        }

        public Builder skipBehaviorOptions(boolean skipBehaviorOptions) {
            this.skipBehaviorOptions = skipBehaviorOptions;
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

        // Function URL configuration methods
        public Builder functionUrlAuthType(FunctionUrlAuthType functionUrlAuthType) {
            this.functionUrlAuthType = functionUrlAuthType;
            return this;
        }

        public Builder invokeMode(InvokeMode invokeMode) {
            this.invokeMode = invokeMode;
            return this;
        }

        // Log group configuration methods
        public Builder logGroupRetention(RetentionDays logGroupRetention) {
            this.logGroupRetention = logGroupRetention;
            return this;
        }

        public Builder logGroupRemovalPolicy(RemovalPolicy logGroupRemovalPolicy) {
            this.logGroupRemovalPolicy = logGroupRemovalPolicy;
            return this;
        }

        // HttpOrigin configuration methods
        public Builder protocolPolicy(OriginProtocolPolicy protocolPolicy) {
            this.protocolPolicy = protocolPolicy;
            return this;
        }

        // ResponseHeadersPolicy configuration methods
        public Builder responseHeadersPolicy(IResponseHeadersPolicy responseHeadersPolicy) {
            this.responseHeadersPolicy = responseHeadersPolicy;
            return this;
        }

        // BehaviorOptions configuration methods
        public Builder cachePolicy(ICachePolicy cachePolicy) {
            this.cachePolicy = cachePolicy;
            return this;
        }

        public Builder viewerProtocolPolicy(ViewerProtocolPolicy viewerProtocolPolicy) {
            this.viewerProtocolPolicy = viewerProtocolPolicy;
            return this;
        }

        public Builder originRequestPolicy(IOriginRequestPolicy originRequestPolicy) {
            this.originRequestPolicy = originRequestPolicy;
            return this;
        }

        // Lambda configuration methods
        public Builder imageDirectory(String imageDirectory) {
            this.imageDirectory = imageDirectory;
            return this;
        }

        public Builder imageFilename(String imageFilename) {
            this.imageFilename = imageFilename;
            return this;
        }

        public Builder runtime(Runtime runtime) {
            this.testRuntime = runtime;
            return this;
        }

        public Builder baseImageTag(String baseImageTag) {
            this.baseImageTag = baseImageTag;
            return this;
        }

        public Builder ecrRepositoryArn(String ecrRepositoryArn) {
            this.ecrRepositoryArn = ecrRepositoryArn;
            return this;
        }

        public Builder ecrRepositoryName(String ecrRepositoryName) {
            this.ecrRepositoryName = ecrRepositoryName;
            return this;
        }

        public Builder options(LambdaUrlOriginOpts opts) {
            if (opts == null) return this;
            if (opts.env != null) this.env = opts.env;
            if (opts.imageDirectory != null) this.imageDirectory = opts.imageDirectory;
            if (opts.functionUrlAuthType != null) this.functionUrlAuthType = opts.functionUrlAuthType;
            this.cloudTrailEnabled = opts.cloudTrailEnabled;
            this.xRayEnabled = opts.xRayEnabled;
            this.verboseLogging = opts.verboseLogging;
            if (opts.baseImageTag != null) this.baseImageTag = opts.baseImageTag;
            return this;
        }

        public Builder props(LambdaUrlOriginProps props) {
            if (props == null) return this;
            this.env = props.env;
            this.functionName = props.functionName;
            this.handler = props.handler;
            this.timeout = props.timeout;
            this.environment = props.environment;
            this.cloudFrontAllowedMethods = props.cloudFrontAllowedMethods;
            this.skipBehaviorOptions = props.skipBehaviorOptions;
            this.cloudTrailEnabled = props.cloudTrailEnabled;
            this.xRayEnabled = props.xRayEnabled;
            this.verboseLogging = props.verboseLogging;
            this.functionUrlAuthType = props.functionUrlAuthType;
            this.invokeMode = props.invokeMode;
            this.logGroupRetention = props.logGroupRetention;
            this.logGroupRemovalPolicy = props.logGroupRemovalPolicy;
            this.protocolPolicy = props.protocolPolicy;
            this.responseHeadersPolicy = props.responseHeadersPolicy;
            this.cachePolicy = props.cachePolicy;
            this.viewerProtocolPolicy = props.viewerProtocolPolicy;
            this.originRequestPolicy = props.originRequestPolicy;
            this.imageDirectory = props.imageDirectory;
            this.imageFilename = props.imageFilename;
            this.testRuntime = props.testRuntime;
            this.baseImageTag = props.baseImageTag;
            this.ecrRepositoryArn = props.ecrRepositoryArn;
            this.ecrRepositoryName = props.ecrRepositoryName;
            return this;
        }

        public LambdaUrlOrigin build(final Construct scope) {
            // Validate required parameters
            if (env == null || env.isBlank()) {
                throw new IllegalArgumentException("env is required");
            }
            if (functionName == null || functionName.isBlank()) {
                throw new IllegalArgumentException("functionName is required");
            }
            if (!"test".equals(env) && (handler == null || handler.isBlank())) {
                throw new IllegalArgumentException("handler is required for non-test environments");
            }

            return new LambdaUrlOrigin(scope, this);
        }
    }
}
