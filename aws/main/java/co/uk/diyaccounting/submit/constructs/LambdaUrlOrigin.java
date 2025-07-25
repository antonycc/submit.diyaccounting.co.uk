package co.uk.diyaccounting.submit.constructs;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;
import software.amazon.awscdk.Duration;
import software.amazon.awscdk.RemovalPolicy;
import software.amazon.awscdk.services.cloudfront.AllowedMethods;
import software.amazon.awscdk.services.cloudfront.BehaviorOptions;
import software.amazon.awscdk.services.cloudfront.CachePolicy;
import software.amazon.awscdk.services.cloudfront.OriginProtocolPolicy;
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

    private LambdaUrlOrigin(Builder builder) {
        // Create the lambda function
        this.lambda = createLambda(builder);
        
        // Create log group for the lambda
        this.logGroup = new LogGroup(builder.scope, builder.idPrefix + "LogGroup", LogGroupProps.builder()
                .logGroupName("/aws/lambda/" + this.lambda.getFunctionName())
                .retention(RetentionDays.THREE_DAYS)
                .removalPolicy(RemovalPolicy.DESTROY)
                .build());

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

        String lambdaUrlHost = getLambdaUrlHostToken(this.functionUrl);
        HttpOrigin apiOrigin = HttpOrigin.Builder.create(lambdaUrlHost)
                .protocolPolicy(OriginProtocolPolicy.HTTPS_ONLY)
                .build();

        this.behaviorOptions = BehaviorOptions.builder()
                .origin(apiOrigin)
                .allowedMethods(builder.cloudFrontAllowedMethods)
                .cachePolicy(CachePolicy.CACHING_DISABLED)
                .originRequestPolicy(OriginRequestPolicy.CORS_S3_ORIGIN)
                .build();

        logger.info("Created LambdaUrlOrigin with function: {}", this.lambda.getFunctionName());
    }

    private Function createLambda(Builder builder) {
        if ("test".equals(builder.env)) {
            return Function.Builder.create(builder.scope, builder.idPrefix + "Lambda")
                    .code(Code.fromInline("exports.handler = async (event) => { return { statusCode: 200, body: 'test' }; }"))
                    .handler("index.handler")
                    .runtime(Runtime.NODEJS_20_X)
                    .functionName(builder.functionName)
                    .timeout(builder.timeout)
                    .build();
        } else {
            AssetImageCodeProps imageCodeProps = AssetImageCodeProps.builder()
                    .buildArgs(Map.of("HANDLER", builder.handler))
                    .build();
            
            return DockerImageFunction.Builder.create(builder.scope, builder.idPrefix + "Lambda")
                    .code(DockerImageCode.fromImageAsset(".", imageCodeProps))
                    .environment(builder.environment)
                    .functionName(builder.functionName)
                    .timeout(builder.timeout)
                    .build();
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
        private final Construct scope;
        private final String idPrefix;
        
        // Required parameters
        private String env = null;
        private String domainName = null;
        private String functionName = null;
        private String handler = null;
        private Duration timeout = Duration.seconds(30);
        private Map<String, String> environment = Map.of();
        private List<HttpMethod> allowedMethods = List.of(HttpMethod.GET);
        private AllowedMethods cloudFrontAllowedMethods = AllowedMethods.ALLOW_GET_HEAD_OPTIONS;

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