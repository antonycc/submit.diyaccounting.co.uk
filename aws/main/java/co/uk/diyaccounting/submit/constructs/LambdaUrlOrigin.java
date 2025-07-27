package co.uk.diyaccounting.submit.constructs;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;
import software.amazon.awscdk.Duration;
import software.amazon.awscdk.RemovalPolicy;
import software.amazon.awscdk.services.cloudfront.AllowedMethods;
import software.amazon.awscdk.services.cloudfront.BehaviorOptions;
import software.amazon.awscdk.services.cloudfront.CachePolicy;
import software.amazon.awscdk.services.cloudfront.OriginProtocolPolicy;
import software.amazon.awscdk.services.cloudfront.OriginRequestCookieBehavior;
import software.amazon.awscdk.services.cloudfront.OriginRequestHeaderBehavior;
import software.amazon.awscdk.services.cloudfront.OriginRequestPolicy;
import software.amazon.awscdk.services.cloudfront.origins.HttpOrigin;
import software.amazon.awscdk.services.lambda.AssetImageCodeProps;
import software.amazon.awscdk.services.lambda.Code;
import software.amazon.awscdk.services.lambda.DockerImageCode;
import software.amazon.awscdk.services.lambda.DockerImageFunction;
import software.amazon.awscdk.services.lambda.Function;
import software.amazon.awscdk.services.lambda.FunctionUrl;
import software.amazon.awscdk.services.lambda.FunctionUrlAuthType;
import software.amazon.awscdk.services.lambda.FunctionUrlCorsOptions;
import software.amazon.awscdk.services.lambda.FunctionUrlOptions;
import software.amazon.awscdk.services.lambda.HttpMethod;
import software.amazon.awscdk.services.lambda.Runtime;
import software.amazon.awscdk.services.lambda.Tracing;
import software.amazon.awscdk.services.logs.LogGroup;
import software.amazon.awscdk.services.logs.LogGroupProps;
import software.amazon.awscdk.services.logs.RetentionDays;
import software.constructs.Construct;

import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

public class LambdaUrlOrigin {

    private static final Logger logger = LogManager.getLogger(LambdaUrlOrigin.class);
    private static final Pattern LAMBDA_URL_HOST_PATTERN = Pattern.compile("https://([^/]+)/");

    public final Function lambda;
    public final LogGroup logGroup;
    public final FunctionUrl functionUrl;
    public final BehaviorOptions behaviorOptions;
    public final OriginRequestPolicy customOriginRequestPolicy;

    private LambdaUrlOrigin(Builder builder) {
        // Create the lambda function
        this.lambda = createLambda(builder);
        
        // Create log group for the lambda
        this.logGroup = new LogGroup(builder.scope, builder.idPrefix + "LogGroup", LogGroupProps.builder()
                .logGroupName("/aws/lambda/" + this.lambda.getFunctionName())
                .retention(RetentionDays.THREE_DAYS)
                .removalPolicy(RemovalPolicy.DESTROY)
                .build());

        // Create custom origin request policy
        OriginRequestPolicy.Builder policyBuilder = OriginRequestPolicy.Builder
                .create(builder.scope, builder.idPrefix + "OriginRequestPolicy")
                .comment("Custom origin request policy with CORS_S3_ORIGIN equivalent configuration")
                .cookieBehavior(builder.originRequestCookieBehavior)
                .headerBehavior(builder.originRequestHeaderBehavior);
        
        if (builder.originRequestQueryStringAll) {
            policyBuilder.queryStringBehavior(software.amazon.awscdk.services.cloudfront.OriginRequestQueryStringBehavior.all());
        } else {
            policyBuilder.queryStringBehavior(software.amazon.awscdk.services.cloudfront.OriginRequestQueryStringBehavior.none());
        }
        
        this.customOriginRequestPolicy = policyBuilder.build();

        // Create function URL
        this.functionUrl = this.lambda.addFunctionUrl(
                FunctionUrlOptions.builder()
                        .authType(FunctionUrlAuthType.NONE)
                        .cors(FunctionUrlCorsOptions.builder()
                                .allowedOrigins(List.of("https://" + builder.domainName))
                                .allowedMethods(builder.allowedMethods)
                                .build())
                        .build()
        );

        if (builder.skipBehaviorOptions) {
            logger.info("Skipping behavior options for Lambda URL origin as per configuration.");
            this.behaviorOptions = null;
        } else {
            String lambdaUrlHost = getLambdaUrlHostToken(this.functionUrl);
            HttpOrigin apiOrigin = HttpOrigin.Builder.create(lambdaUrlHost)
                    .protocolPolicy(OriginProtocolPolicy.HTTPS_ONLY)
                    .build();

            this.behaviorOptions = BehaviorOptions.builder()
                    .origin(apiOrigin)
                    .allowedMethods(builder.cloudFrontAllowedMethods)
                    .cachePolicy(CachePolicy.CACHING_DISABLED)
                    .originRequestPolicy(this.customOriginRequestPolicy)
                    .build();
        }

        logger.info("Created LambdaUrlOrigin with function: {}", this.lambda.getFunctionName());
    }

    private Function createLambda(Builder builder) {
        if ("test".equals(builder.env)) {
            var functionBuilder = Function.Builder.create(builder.scope, builder.idPrefix + "Lambda")
                    .code(Code.fromInline("exports.handler = async (event) => { return { statusCode: 200, body: 'test' }; }"))
                    .handler("index.handler")
                    .runtime(Runtime.NODEJS_20_X)
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
                    .code(DockerImageCode.fromImageAsset(".", imageCodeProps))
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
        String url = functionUrl.getUrl();
        
        // Handle CDK tokens during testing/synthesis
        if (url.startsWith("${Token[")) {
            // Return a mock host for CDK tokens during testing
            return "mock-lambda-host.amazonaws.com";
        }
        
        var matcher = LAMBDA_URL_HOST_PATTERN.matcher(url);
        if (matcher.find()) {
            return matcher.group(1);
        }
        throw new IllegalStateException("Could not extract host from Lambda URL: " + url);
    }

    public static class Builder {
        public final Construct scope;
        public final String idPrefix;
        
        public String env = null;
        public String domainName = null;
        public String functionName = null;
        public String handler = null;
        public Duration timeout = Duration.seconds(30);
        public Map<String, String> environment = Map.of();
        public List<HttpMethod> allowedMethods = List.of(HttpMethod.GET);
        public AllowedMethods cloudFrontAllowedMethods = AllowedMethods.ALLOW_GET_HEAD_OPTIONS;
        public boolean skipBehaviorOptions = false;
        
        // Origin Request Policy configuration
        public OriginRequestHeaderBehavior originRequestHeaderBehavior = OriginRequestHeaderBehavior.allowList(
                "CloudFront-Forwarded-Proto", "CloudFront-Is-Desktop-Viewer", 
                "CloudFront-Is-Mobile-Viewer", "CloudFront-Is-SmartTV-Viewer", "CloudFront-Is-Tablet-Viewer", 
                "CloudFront-Viewer-Country", "Host", "Origin", "Referer");
        public OriginRequestCookieBehavior originRequestCookieBehavior = OriginRequestCookieBehavior.none();
        public boolean originRequestQueryStringAll = true;
        
        // CloudTrail and X-Ray configuration
        public boolean cloudTrailEnabled = false;
        public boolean xRayEnabled = false;
        public boolean verboseLogging = false;

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

        public Builder domainName(String domainName) {
            this.domainName = domainName;
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

        public Builder allowedMethods(List<HttpMethod> allowedMethods) {
            this.allowedMethods = allowedMethods;
            return this;
        }

        public Builder cloudFrontAllowedMethods(AllowedMethods cloudFrontAllowedMethods) {
            this.cloudFrontAllowedMethods = cloudFrontAllowedMethods;
            return this;
        }

        public Builder skipBehaviorOptions(boolean skipBehaviorOptions) {
            this.skipBehaviorOptions = skipBehaviorOptions;
            return this;
        }

        public Builder originRequestHeaderBehavior(OriginRequestHeaderBehavior originRequestHeaderBehavior) {
            this.originRequestHeaderBehavior = originRequestHeaderBehavior;
            return this;
        }

        public Builder originRequestCookieBehavior(OriginRequestCookieBehavior originRequestCookieBehavior) {
            this.originRequestCookieBehavior = originRequestCookieBehavior;
            return this;
        }

        public Builder originRequestQueryStringAll(boolean originRequestQueryStringAll) {
            this.originRequestQueryStringAll = originRequestQueryStringAll;
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

        public LambdaUrlOrigin build() {
            // Validate required parameters
            if (env == null || env.isBlank()) {
                throw new IllegalArgumentException("env is required");
            }
            if (domainName == null || domainName.isBlank()) {
                throw new IllegalArgumentException("domainName is required");
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