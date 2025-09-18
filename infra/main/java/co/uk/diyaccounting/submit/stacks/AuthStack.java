package co.uk.diyaccounting.submit.stacks;

import co.uk.diyaccounting.submit.constructs.LambdaUrlOrigin;
import co.uk.diyaccounting.submit.constructs.LambdaUrlOriginOpts;
import co.uk.diyaccounting.submit.utils.ResourceNameUtils;
import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;
import software.amazon.awscdk.CfnOutput;
import software.amazon.awscdk.Duration;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.StackProps;
import software.amazon.awscdk.services.cloudfront.AllowedMethods;
import software.amazon.awscdk.services.cloudfront.BehaviorOptions;
import software.amazon.awscdk.services.lambda.Function;
import software.amazon.awscdk.services.lambda.FunctionUrl;
import software.amazon.awscdk.services.lambda.FunctionUrlAuthType;
import software.amazon.awscdk.services.logs.LogGroup;
import software.constructs.Construct;

import java.util.AbstractMap;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

public class AuthStack extends Stack {

    private static final Logger logger = LogManager.getLogger(AuthStack.class);

    // CDK resources here
    public Function authUrlMockLambda;
    public FunctionUrl authUrlMockLambdaUrl;
    public LogGroup authUrlMockLambdaLogGroup;
    public Function authUrlCognitoLambda;
    public FunctionUrl authUrlCognitoLambdaUrl;
    public LogGroup authUrlCognitoLambdaLogGroup;
    public Function exchangeCognitoTokenLambda;
    public FunctionUrl exchangeCognitoTokenLambdaUrl;
    public LogGroup exchangeCognitoTokenLambdaLogGroup;
    public Map<String, BehaviorOptions> additionalOriginsBehaviourMappings;

    public AuthStack(Construct scope, String id, AuthStack.Builder builder) {
        this(scope, id, null, builder);
    }

    public AuthStack(Construct scope, String id, StackProps props, AuthStack.Builder builder) {
        super(scope, id, props);

        // Values are provided via WebApp after context/env resolution

        // Build naming using same patterns as WebStack
        String domainName = Builder.buildDomainName(builder.env, builder.subDomainName, builder.hostedZoneName);
        String dashedDomainName =
                Builder.buildDashedDomainName(builder.env, builder.subDomainName, builder.hostedZoneName);

        boolean cloudTrailEnabled = Boolean.parseBoolean(builder.cloudTrailEnabled);
        boolean xRayEnabled = Boolean.parseBoolean(builder.xRayEnabled);
        boolean verboseLogging = builder.verboseLogging == null || Boolean.parseBoolean(builder.verboseLogging);

        // Lambdas

        // Determine Lambda URL authentication type
        FunctionUrlAuthType functionUrlAuthType = "AWS_IAM".equalsIgnoreCase(builder.lambdaUrlAuthType)
            ? FunctionUrlAuthType.AWS_IAM
            : FunctionUrlAuthType.NONE;

        // Common options for all Lambda URL origins to reduce repetition
        var lambdaCommonOpts = LambdaUrlOriginOpts.Builder.create()
            .env(builder.env)
            .imageDirectory("infra/runtimes")
            .functionUrlAuthType(functionUrlAuthType)
            .cloudTrailEnabled(cloudTrailEnabled)
            .xRayEnabled(xRayEnabled)
            .verboseLogging(verboseLogging)
            .baseImageTag(builder.baseImageTag)
            .build();

        var lambdaUrlToOriginsBehaviourMappings = new HashMap<String, BehaviorOptions>();

        // authUrl - mock
        var authUrlMockLambdaEnv = new HashMap<String, String>();
        //if (StringUtils.isNotBlank(builder.homeUrl)) {
            authUrlMockLambdaEnv.put("DIY_SUBMIT_HOME_URL", builder.homeUrl);
        //}
        var authUrlMockLambdaUrlOrigin = LambdaUrlOrigin.Builder.create(this, "AuthUrlMock")
            .options(lambdaCommonOpts)
            .baseImageTag(builder.baseImageTag)
            .ecrRepositoryName(builder.ecrRepositoryName)
            .ecrRepositoryArn(builder.ecrRepositoryArn)
            .imageFilename("authUrlMock.Dockerfile")
            .functionName(WebStack.Builder.buildFunctionName(dashedDomainName, "authUrl.httpGetMock"))
            .allowedMethods(AllowedMethods.ALLOW_GET_HEAD_OPTIONS)
            .handler(builder.lambdaEntry + "authUrl.httpGetMock")
            .environment(authUrlMockLambdaEnv)
            .timeout(Duration.millis(Long.parseLong("30000")))
            .build(this);
        this.authUrlMockLambda = authUrlMockLambdaUrlOrigin.lambda;
        this.authUrlMockLambdaUrl = authUrlMockLambdaUrlOrigin.functionUrl;
        this.authUrlMockLambdaLogGroup = authUrlMockLambdaUrlOrigin.logGroup;
        lambdaUrlToOriginsBehaviourMappings.put(
            "/api/mock/auth-url" + "*", authUrlMockLambdaUrlOrigin.behaviorOptions);

        // authUrl - Google or Antonycc via Cognito
        var authUrlCognitoLambdaEnv = new HashMap<String, String>();
        //if (StringUtils.isNotBlank(builder.homeUrl)) {
            authUrlCognitoLambdaEnv.put("DIY_SUBMIT_HOME_URL", builder.homeUrl);
        //}
        //if (StringUtils.isNotBlank(builder.cognitoClientId)) {
            authUrlCognitoLambdaEnv.put("DIY_SUBMIT_COGNITO_CLIENT_ID", builder.cognitoClientId);
        //}
        //if (StringUtils.isNotBlank(builder.cognitoBaseUri)) {
            authUrlCognitoLambdaEnv.put("DIY_SUBMIT_COGNITO_BASE_URI", builder.cognitoBaseUri);
        //}
        var authUrlCognitoLambdaUrlOrigin = LambdaUrlOrigin.Builder.create(this, "AuthUrlCognito")
            .options(lambdaCommonOpts)
            .baseImageTag(builder.baseImageTag)
            .ecrRepositoryName(builder.ecrRepositoryName)
            .ecrRepositoryArn(builder.ecrRepositoryArn)
            .imageFilename("authUrlCognito.Dockerfile")
            .functionName(
                WebStack.Builder.buildFunctionName(dashedDomainName, "authUrl.httpGetCognito"))
            .allowedMethods(AllowedMethods.ALLOW_GET_HEAD_OPTIONS)
            .handler(builder.lambdaEntry + "authUrl.httpGetCognito")
            .environment(authUrlCognitoLambdaEnv)
            .timeout(Duration.millis(Long.parseLong("30000")))
            .build(this);
        this.authUrlCognitoLambda = authUrlCognitoLambdaUrlOrigin.lambda;
        this.authUrlCognitoLambdaUrl = authUrlCognitoLambdaUrlOrigin.functionUrl;
        this.authUrlCognitoLambdaLogGroup = authUrlCognitoLambdaUrlOrigin.logGroup;
        lambdaUrlToOriginsBehaviourMappings.put(
            "/api/cognito/auth-url" + "*", authUrlCognitoLambdaUrlOrigin.behaviorOptions);

        // exchangeToken - Google or Antonycc via Cognito
        var exchangeCognitoTokenLambdaEnv = new HashMap<String, String>();
        //if (StringUtils.isNotBlank(builder.homeUrl)) {
            exchangeCognitoTokenLambdaEnv.put("DIY_SUBMIT_HOME_URL", builder.homeUrl);
        //}
        //if (StringUtils.isNotBlank(builder.cognitoBaseUri)) {
            exchangeCognitoTokenLambdaEnv.put("DIY_SUBMIT_COGNITO_BASE_URI", builder.cognitoBaseUri);
        //}
        //if (StringUtils.isNotBlank(builder.cognitoClientId)) {
            exchangeCognitoTokenLambdaEnv.put("DIY_SUBMIT_COGNITO_CLIENT_ID", builder.cognitoClientId);
        //}
        //if (StringUtils.isNotBlank(builder.optionalTestAccessToken)) {
            exchangeCognitoTokenLambdaEnv.put("DIY_SUBMIT_TEST_ACCESS_TOKEN", builder.optionalTestAccessToken);
        //}
        var exchangeCognitoTokenLambdaUrlOrigin = LambdaUrlOrigin.Builder.create(this, "ExchangeCognitoToken")
            .options(lambdaCommonOpts)
            .baseImageTag(builder.baseImageTag)
            .ecrRepositoryName(builder.ecrRepositoryName)
            .ecrRepositoryArn(builder.ecrRepositoryArn)
            .imageFilename("exchangeCognitoToken.Dockerfile")
            .functionName(WebStack.Builder.buildFunctionName(
                dashedDomainName, "exchangeToken.httpPostCognito"))
            .allowedMethods(AllowedMethods.ALLOW_ALL)
            .handler(builder.lambdaEntry + "exchangeToken.httpPostCognito")
            .environment(exchangeCognitoTokenLambdaEnv)
            .timeout(Duration.millis(Long.parseLong("30000")))
            .build(this);
        this.exchangeCognitoTokenLambda = exchangeCognitoTokenLambdaUrlOrigin.lambda;
        this.exchangeCognitoTokenLambdaUrl = exchangeCognitoTokenLambdaUrlOrigin.functionUrl;
        this.exchangeCognitoTokenLambdaLogGroup = exchangeCognitoTokenLambdaUrlOrigin.logGroup;
        lambdaUrlToOriginsBehaviourMappings.put(
            "/api/cognito/exchange-token" + "*", exchangeCognitoTokenLambdaUrlOrigin.behaviorOptions);



        if (this.authUrlMockLambda != null) {
            CfnOutput.Builder.create(this, "AuthUrlMockLambdaArn")
                .value(this.authUrlMockLambda.getFunctionArn())
                .build();
            CfnOutput.Builder.create(this, "AuthUrlMockLambdaUrl")
                .value(this.authUrlMockLambdaUrl.getUrl())
                .build();
        }

        this.additionalOriginsBehaviourMappings = lambdaUrlToOriginsBehaviourMappings;

        logger.info("AuthStack created successfully for {}", dashedDomainName);
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
        public String xRayEnabled;
        public String baseImageTag;
        public String ecrRepositoryArn;
        public String ecrRepositoryName;
        public String lambdaEntry;
        public String homeUrl;
        public String cognitoClientId;
        public String cognitoBaseUri;
        public String optionalTestAccessToken;
        public String verboseLogging;
        public String lambdaUrlAuthType;

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

        public Builder xRayEnabled(String xRayEnabled) {
            this.xRayEnabled = xRayEnabled;
            return this;
        }

        public Builder props(AuthStackProps p) {
            if (p == null) return this;
            this.env = p.env;
            this.subDomainName = p.subDomainName;
            this.hostedZoneName = p.hostedZoneName;
            this.cloudTrailEnabled = p.cloudTrailEnabled;
            this.xRayEnabled = p.xRayEnabled;
            this.baseImageTag = p.baseImageTag;
            this.ecrRepositoryArn = p.ecrRepositoryArn;
            this.ecrRepositoryName = p.ecrRepositoryName;
            this.homeUrl = p.homeUrl;
            this.cognitoClientId = p.cognitoClientId;
            this.cognitoBaseUri = p.cognitoBaseUri;
            this.optionalTestAccessToken = p.optionalTestAccessToken;

            return this;
        }

        public AuthStack build() {
            return new AuthStack(this.scope, this.id, this.props, this);
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

        public static String buildNonProdDomainName(String env, String subDomainName, String hostedZoneName) {
            return "%s.%s.%s".formatted(env, subDomainName, hostedZoneName);
        }

        public static String buildDashedDomainName(String env, String subDomainName, String hostedZoneName) {
            return ResourceNameUtils.convertDotSeparatedToDashSeparated(
                    "%s.%s.%s".formatted(env, subDomainName, hostedZoneName), domainNameMappings);
        }
    }

    // Use same domain name mappings as WebStack
    public static final List<AbstractMap.SimpleEntry<Pattern, String>> domainNameMappings = List.of();
}
