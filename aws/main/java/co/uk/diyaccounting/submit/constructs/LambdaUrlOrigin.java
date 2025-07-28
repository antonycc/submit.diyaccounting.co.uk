package co.uk.diyaccounting.submit.constructs;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;
import software.amazon.awscdk.Duration;
import software.amazon.awscdk.Fn;
import software.amazon.awscdk.RemovalPolicy;
import software.amazon.awscdk.services.cloudfront.AllowedMethods;
import software.amazon.awscdk.services.cloudfront.BehaviorOptions;
import software.amazon.awscdk.services.cloudfront.CachePolicy;
import software.amazon.awscdk.services.cloudfront.ICachePolicy;
import software.amazon.awscdk.services.cloudfront.IOriginRequestPolicy;
import software.amazon.awscdk.services.cloudfront.IResponseHeadersPolicy;
import software.amazon.awscdk.services.cloudfront.OriginProtocolPolicy;
import software.amazon.awscdk.services.cloudfront.OriginRequestPolicy;
import software.amazon.awscdk.services.cloudfront.ResponseHeadersPolicy;
import software.amazon.awscdk.services.cloudfront.ViewerProtocolPolicy;
import software.amazon.awscdk.services.cloudfront.origins.HttpOrigin;
import software.amazon.awscdk.services.lambda.AssetImageCodeProps;
import software.amazon.awscdk.services.lambda.Code;
import software.amazon.awscdk.services.lambda.DockerImageCode;
import software.amazon.awscdk.services.lambda.DockerImageFunction;
import software.amazon.awscdk.services.lambda.Function;
import software.amazon.awscdk.services.lambda.FunctionUrl;
import software.amazon.awscdk.services.lambda.FunctionUrlAuthType;
import software.amazon.awscdk.services.lambda.FunctionUrlOptions;
import software.amazon.awscdk.services.lambda.InvokeMode;
import software.amazon.awscdk.services.lambda.Runtime;
import software.amazon.awscdk.services.lambda.Tracing;
import software.amazon.awscdk.services.logs.LogGroup;
import software.amazon.awscdk.services.logs.LogGroupProps;
import software.amazon.awscdk.services.logs.RetentionDays;
import software.constructs.Construct;

import java.util.Map;
import java.util.regex.Pattern;

public class LambdaUrlOrigin {

    private static final Logger logger = LogManager.getLogger(LambdaUrlOrigin.class);
    private static final Pattern LAMBDA_URL_HOST_PATTERN = Pattern.compile("https://([^/]+)/");

    public final Function lambda;
    public final LogGroup logGroup;
    public final FunctionUrl functionUrl;
    public final BehaviorOptions behaviorOptions;
    public final HttpOrigin apiOrigin;

    private LambdaUrlOrigin(Builder builder) {
        // Create the lambda function
        this.lambda = createLambda(builder);
        
        // Create log group for the lambda
        this.logGroup = new LogGroup(builder.scope, builder.idPrefix + "LogGroup", LogGroupProps.builder()
                .logGroupName("/aws/lambda/" + this.lambda.getFunctionName())
                .retention(builder.logGroupRetention)
                .removalPolicy(builder.logGroupRemovalPolicy)
                .build());

        // Create function URL
        FunctionUrlOptions.Builder functionUrlOptionsBuilder = FunctionUrlOptions.builder()
                .authType(builder.functionUrlAuthType)
                .invokeMode(builder.invokeMode);
        
        this.functionUrl = this.lambda.addFunctionUrl(functionUrlOptionsBuilder.build());

        String lambdaUrlHost = getLambdaUrlHostToken(this.functionUrl);
        this.apiOrigin = HttpOrigin.Builder.create(lambdaUrlHost)
                .protocolPolicy(builder.protocolPolicy)
                .build();

        BehaviorOptions.Builder behaviorOptionsBuilder = BehaviorOptions.builder()
                .origin(this.apiOrigin)
                .allowedMethods(builder.cloudFrontAllowedMethods)
                .cachePolicy(builder.cachePolicy)
                .originRequestPolicy(builder.originRequestPolicy)
                .viewerProtocolPolicy(builder.viewerProtocolPolicy);

        if (builder.responseHeadersPolicy != null) {
            behaviorOptionsBuilder.responseHeadersPolicy(builder.responseHeadersPolicy);
        }

        this.behaviorOptions = behaviorOptionsBuilder.build();

        logger.info("Created LambdaUrlOrigin with function: {}", this.lambda.getFunctionName());
    }

    private Function createLambda(Builder builder) {
        if ("test".equals(builder.env)) {
            var functionBuilder = Function.Builder.create(builder.scope, builder.idPrefix + "Lambda")
                    .code(Code.fromInline("exports.handler = async (event) => { return { statusCode: 200, body: 'test' }; }"))
                    .handler("index.handler")
                    .runtime(builder.testRuntime)
                    .functionName(builder.functionName)
                    .timeout(builder.timeout);
            if (builder.xRayEnabled) {
                functionBuilder.tracing(Tracing.ACTIVE);
            }
            return functionBuilder.build();
        } else {
            AssetImageCodeProps imageCodeProps = AssetImageCodeProps.builder()
                    .buildArgs(Map.of("HANDLER", builder.handler))
                    .build();
            
            // Add X-Ray environment variables if enabled
            var environment = new java.util.HashMap<>(builder.environment);
            if (builder.xRayEnabled) {
                environment.put("AWS_XRAY_TRACING_NAME", builder.functionName);
            }
            
            var dockerFunctionBuilder = DockerImageFunction.Builder.create(builder.scope, builder.idPrefix + "Lambda")
                    .code(DockerImageCode.fromImageAsset(builder.imageDirectory, imageCodeProps))
                    .environment(environment)
                    .functionName(builder.functionName)
                    .timeout(builder.timeout);
            if (builder.xRayEnabled) {
                dockerFunctionBuilder.tracing(Tracing.ACTIVE);
            }
            return dockerFunctionBuilder.build();
        }
    }

    private String getLambdaUrlHostToken(FunctionUrl functionUrl) {
        String urlHostToken = Fn.select(2, Fn.split("/", functionUrl.getUrl()));
        return urlHostToken;
    }

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
        public IResponseHeadersPolicy responseHeadersPolicy = ResponseHeadersPolicy.CORS_ALLOW_ALL_ORIGINS_WITH_PREFLIGHT_AND_SECURITY_HEADERS;
        
        // BehaviorOptions configuration
        public ICachePolicy cachePolicy = CachePolicy.CACHING_DISABLED;
        public ViewerProtocolPolicy viewerProtocolPolicy = ViewerProtocolPolicy.REDIRECT_TO_HTTPS;
        public IOriginRequestPolicy originRequestPolicy = OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER;
        
        // Lambda configuration
        public String imageDirectory = ".";
        public Runtime testRuntime = Runtime.NODEJS_22_X;

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

        public Builder runtime(Runtime runtime) {
            this.testRuntime = runtime;
            return this;
        }

        public LambdaUrlOrigin build() {
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
            
            return new LambdaUrlOrigin(this);
        }
    }
}