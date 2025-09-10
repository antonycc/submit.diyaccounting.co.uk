package co.uk.diyaccounting.submit.stacks;

import co.uk.diyaccounting.submit.awssdk.RetentionDaysConverter;
import co.uk.diyaccounting.submit.constructs.BucketOrigin;
import co.uk.diyaccounting.submit.constructs.DistributionWithLogging;
import co.uk.diyaccounting.submit.constructs.LambdaUrlOrigin;
import co.uk.diyaccounting.submit.constructs.LambdaUrlOriginOpts;
import co.uk.diyaccounting.submit.constructs.LogForwardingBucket;
import co.uk.diyaccounting.submit.functions.LogS3ObjectEvent;
import co.uk.diyaccounting.submit.utils.ResourceNameUtils;
import org.apache.hc.core5.http.HttpStatus;
import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;
import software.amazon.awscdk.AssetHashType;
import software.amazon.awscdk.CfnOutput;
import software.amazon.awscdk.Duration;
import software.amazon.awscdk.Expiration;
import software.amazon.awscdk.RemovalPolicy;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.StackProps;
import software.amazon.awscdk.services.certificatemanager.Certificate;
import software.amazon.awscdk.services.certificatemanager.ICertificate;
import software.amazon.awscdk.services.cloudfront.AllowedMethods;
import software.amazon.awscdk.services.cloudfront.BehaviorOptions;
import software.amazon.awscdk.services.cloudfront.Distribution;
import software.amazon.awscdk.services.cloudfront.IOrigin;
import software.amazon.awscdk.services.cloudfront.OriginAccessIdentity;
import software.amazon.awscdk.services.cloudfront.OriginRequestPolicy;
import software.amazon.awscdk.services.cloudfront.ResponseHeadersPolicy;
import software.amazon.awscdk.services.cloudfront.ViewerProtocolPolicy;
import software.amazon.awscdk.services.cognito.IUserPool;
import software.amazon.awscdk.services.cognito.UserPool;
import software.amazon.awscdk.services.iam.Effect;
import software.amazon.awscdk.services.iam.PolicyStatement;
import software.amazon.awscdk.services.iam.ServicePrincipal;
import software.amazon.awscdk.services.lambda.Function;
import software.amazon.awscdk.services.lambda.FunctionUrl;
import software.amazon.awscdk.services.lambda.FunctionUrlAuthType;
import software.amazon.awscdk.services.lambda.Permission;
import software.amazon.awscdk.services.logs.LogGroup;
import software.amazon.awscdk.services.route53.ARecord;
import software.amazon.awscdk.services.route53.AaaaRecord;
import software.amazon.awscdk.services.route53.HostedZone;
import software.amazon.awscdk.services.route53.HostedZoneAttributes;
import software.amazon.awscdk.services.route53.IHostedZone;
import software.amazon.awscdk.services.route53.RecordTarget;
import software.amazon.awscdk.services.route53.targets.CloudFrontTarget;
import software.amazon.awscdk.services.s3.BlockPublicAccess;
import software.amazon.awscdk.services.s3.IBucket;
import software.amazon.awscdk.services.s3.ObjectOwnership;
import software.amazon.awscdk.services.s3.assets.AssetOptions;
import software.amazon.awscdk.services.s3.deployment.BucketDeployment;
import software.amazon.awscdk.services.s3.deployment.ISource;
import software.amazon.awscdk.services.s3.deployment.Source;
import software.amazon.awscdk.services.secretsmanager.ISecret;
import software.amazon.awscdk.services.secretsmanager.Secret;
import software.amazon.awssdk.utils.StringUtils;
import software.constructs.Construct;

import java.util.AbstractMap;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

public class WebStack extends Stack {

    private static final Logger logger = LogManager.getLogger(WebStack.class);

    public String domainName;
    public IBucket originBucket;
    public IBucket originAccessLogBucket;
    public IOrigin origin;
    public BucketDeployment deployment;
    public IHostedZone hostedZone;
    public ICertificate certificate;
    public ISecret hmrcClientSecretsManagerSecret;
    // public ISecret googleClientSecretsManagerSecret;
    // public ISecret antonyccClientSecretsManagerSecret;
    // public ISecret acCogClientSecretsManagerSecret;
    public IBucket distributionAccessLogBucket;
    public OriginAccessIdentity originIdentity;
    public Distribution distribution;
    public String distributionUrl;
    public ISource docRootSource;
    public ARecord aRecord;
    public AaaaRecord aaaaRecord;
    public Function authUrlHmrcLambda;
    public FunctionUrl authUrlHmrcLambdaUrl;
    public LogGroup authUrlLambdaLogGroup;
    public Function authUrlMockLambda;
    public FunctionUrl authUrlMockLambdaUrl;
    public LogGroup authUrlMockLambdaLogGroup;
    public Function authUrlGoogleLambda;
    public FunctionUrl authUrlGoogleLambdaUrl;
    public LogGroup authUrlGoogleLambdaLogGroup;
    public Function authUrlAntonyccLambda;
    public FunctionUrl authUrlAntonyccLambdaUrl;
    public LogGroup authUrlAntonyccLambdaLogGroup;
    public Function authUrlAcCogLambda;
    public FunctionUrl authUrlAcCogLambdaUrl;
    public LogGroup authUrlAcCogLambdaLogGroup;
    public Function exchangeHmrcTokenLambda;
    public FunctionUrl exchangeHmrcTokenLambdaUrl;
    public LogGroup exchangeHmrcTokenLambdaLogGroup;
    public Function exchangeGoogleTokenLambda;
    public FunctionUrl exchangeGoogleTokenLambdaUrl;
    public LogGroup exchangeGoogleTokenLambdaLogGroup;
    public Function exchangeAntonyccTokenLambda;
    public FunctionUrl exchangeAntonyccTokenLambdaUrl;
    public LogGroup exchangeAntonyccTokenLambdaLogGroup;
    public Function exchangeAcCogTokenLambda;
    public FunctionUrl exchangeAcCogTokenLambdaUrl;
    public LogGroup exchangeAcCogTokenLambdaLogGroup;
    public Function submitVatLambda;
    public FunctionUrl submitVatLambdaUrl;
    public LogGroup submitVatLambdaLogGroup;
    public Function logReceiptLambda;
    public FunctionUrl logReceiptLambdaUrl;
    public LogGroup logReceiptLambdaLogGroup;

    // Cognito URIs
    public String cognitoBaseUri;

    // Bundle management Lambda
    public Function bundleLambda;
    public FunctionUrl bundleLambdaUrl;
    public LogGroup bundleLambdaLogGroup;

    // Catalog Lambda
    public Function catalogLambda;
    public FunctionUrl catalogLambdaUrl;
    public LogGroup catalogLambdaLogGroup;

    // My Bundles Lambda
    public Function myBundlesLambda;
    public FunctionUrl myBundlesLambdaUrl;
    public LogGroup myBundlesLambdaLogGroup;

    public IBucket receiptsBucket;

    public Function myReceiptsLambda;
    public FunctionUrl myReceiptsLambdaUrl;
    public LogGroup myReceiptsLambdaLogGroup;

    public static class Builder {
        public Construct scope;
        public String id;
        public StackProps props;
        public WebStackProps webStackProps;

        public Builder(Construct scope, String id, StackProps props) {
            this.scope = scope;
            this.id = id;
            this.props = props;
        }

        public static Builder create(Construct scope, String id) {
            return new Builder(scope, id, null);
        }

        public static Builder create(Construct scope, String id, StackProps props) {
            return new Builder(scope, id, props);
        }

        public Builder props(WebStackProps webStackProps) {
            this.webStackProps = webStackProps;
            return this;
        }

        // TODO: Split into Development(<Dev), Observability, Identity, Application, and Web (also
        // fronting Application). See:
        // _developers/backlog/diverse-versions-at-origin.md

        public WebStack build() {
            return new WebStack(this.scope, this.id, this.props, this.webStackProps);
        }

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

        public static String buildOriginBucketName(String dashedDomainName) {
            return dashedDomainName;
        }

        public static String buildTrailName(String dashedDomainName) {
            return "%s-cloud-trail".formatted(dashedDomainName);
        }

        public static String buildOriginAccessLogBucketName(String dashedDomainName) {
            return "%s-origin-access-logs".formatted(dashedDomainName);
        }

        public static String buildDistributionAccessLogBucketName(String dashedDomainName) {
            return "%s-dist-access-logs".formatted(dashedDomainName);
        }

        private static String buildFunctionName(String dashedDomainName, String functionName) {
            if (functionName == null || functionName.isBlank()) {
                throw new IllegalArgumentException("Function name cannot be null or blank");
            }
            return "%s-%s".formatted(dashedDomainName, ResourceNameUtils.convertCamelCaseToDashSeparated(functionName));
        }

        private static String buildBucketName(String dashedDomainName, String bucketName) {
            return "%s-%s".formatted(dashedDomainName, bucketName);
        }
    }

    public static final List<AbstractMap.SimpleEntry<Pattern, String>> domainNameMappings = List.of();

    public WebStack(Construct scope, String id, WebStackProps builder) {
        this(scope, id, null, builder);
    }

    public WebStack(Construct scope, String id, StackProps props, WebStackProps builder) {
        super(scope, id, props);

        this.hostedZone = HostedZone.fromHostedZoneAttributes(
                this,
                "HostedZone",
                HostedZoneAttributes.builder()
                        .zoneName(builder.hostedZoneName)
                        .hostedZoneId(builder.hostedZoneId)
                        .build());

        this.domainName = Builder.buildDomainName(builder.env, builder.subDomainName, builder.hostedZoneName);
        String dashedDomainName =
                Builder.buildDashedDomainName(builder.env, builder.subDomainName, builder.hostedZoneName);
        String originBucketName = Builder.buildOriginBucketName(dashedDomainName);

        boolean s3UseExistingBucket = Boolean.parseBoolean(builder.s3UseExistingBucket);
        boolean s3RetainOriginBucket = Boolean.parseBoolean(builder.s3RetainOriginBucket);
        boolean s3RetainReceiptsBucket = Boolean.parseBoolean(builder.s3RetainReceiptsBucket);

        boolean cloudTrailEnabled = Boolean.parseBoolean(builder.cloudTrailEnabled);
        boolean xRayEnabled = Boolean.parseBoolean(builder.xRayEnabled);

        int accessLogGroupRetentionPeriodDays = Integer.parseInt(builder.accessLogGroupRetentionPeriodDays);
        String originAccessLogBucketName = Builder.buildOriginAccessLogBucketName(dashedDomainName);

        String distributionAccessLogBucketName = Builder.buildDistributionAccessLogBucketName(dashedDomainName);

        boolean verboseLogging = builder.verboseLogging == null || Boolean.parseBoolean(builder.verboseLogging);

        // Origin bucket for the CloudFront distribution
        String receiptsBucketFullName = Builder.buildBucketName(dashedDomainName, builder.receiptsBucketPostfix);
        BucketOrigin bucketOrigin;
        if (s3UseExistingBucket) {
            bucketOrigin = BucketOrigin.Builder.create(this, "Origin")
                    .bucketName(originBucketName)
                    .useExistingBucket(true)
                    .build();
        } else {
            bucketOrigin = BucketOrigin.Builder.create(this, "Origin")
                    .bucketName(originBucketName)
                    .originAccessLogBucketName(originAccessLogBucketName)
                    .functionNamePrefix("%s-origin-access-".formatted(dashedDomainName))
                    .logS3ObjectEventHandlerSource(builder.logS3ObjectEventHandlerSource)
                    .accessLogGroupRetentionPeriodDays(accessLogGroupRetentionPeriodDays)
                    .retainBucket(s3RetainOriginBucket)
                    .verboseLogging(verboseLogging)
                    .useExistingBucket(false)
                    .build();
        }
        this.originBucket = bucketOrigin.originBucket;
        this.originAccessLogBucket = bucketOrigin.originAccessLogBucket;
        this.originIdentity = bucketOrigin.originIdentity;
        this.origin = bucketOrigin.origin;

        // Create the CloudFront distribution with a bucket as an origin
        // final OriginRequestPolicy s3BucketOriginRequestPolicy = OriginRequestPolicy.Builder
        //        .create(this, "S3BucketOriginRequestPolicy")
        //        .comment("Policy to allow content headers but no cookies from the origin")
        //        .cookieBehavior(OriginRequestCookieBehavior.none())
        //        .headerBehavior(OriginRequestHeaderBehavior.allowList("Accept", "Accept-Language",
        // "Origin"))
        //        .build();
        final BehaviorOptions s3BucketOriginBehaviour = BehaviorOptions.builder()
                .origin(this.origin)
                .allowedMethods(AllowedMethods.ALLOW_GET_HEAD_OPTIONS)
                // .originRequestPolicy(s3BucketOriginRequestPolicy)
                .originRequestPolicy(OriginRequestPolicy.CORS_S3_ORIGIN)
                .viewerProtocolPolicy(ViewerProtocolPolicy.REDIRECT_TO_HTTPS)
                .responseHeadersPolicy(ResponseHeadersPolicy.CORS_ALLOW_ALL_ORIGINS_WITH_PREFLIGHT_AND_SECURITY_HEADERS)
                .compress(true)
                .build();
        // Distribution access log bucket creation moved to DistributionWithLogging

        // Add cloud trail to the origin bucket if enabled
        // CloudTrail for the origin bucket
        // if (builder.trail != null && cloudTrailEnabled) {
        //  // Add S3 event selector to the CloudTrail
        //  if (builder.cloudTrailEventSelectorPrefix == null
        //      || builder.cloudTrailEventSelectorPrefix.isBlank()
        //      || "none".equals(builder.cloudTrailEventSelectorPrefix)) {
        //    builder.trail.addS3EventSelector(
        //        List.of(S3EventSelector.builder().bucket(this.originBucket).build()));
        //  } else {
        //    builder.trail.addS3EventSelector(
        //        List.of(
        //            S3EventSelector.builder()
        //                .bucket(this.originBucket)
        //                .objectPrefix(builder.cloudTrailEventSelectorPrefix)
        //                .build()));
        //  }
        // } else {
        //  logger.info("CloudTrail is not enabled for the origin bucket.");
        // }

        IUserPool userPool = UserPool.fromUserPoolArn(this, "UserPool", builder.userPoolArn);

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

        // authUrl - HMRC
        var authUrlHmrcLambdaEnv = new HashMap<>(Map.of(
                "DIY_SUBMIT_HOME_URL", builder.homeUrl,
                "DIY_SUBMIT_HMRC_BASE_URI", builder.hmrcBaseUri,
                "DIY_SUBMIT_HMRC_CLIENT_ID", builder.hmrcClientId));
        var authUrlHmrcLambdaUrlOrigin = LambdaUrlOrigin.Builder.create(this, "AuthUrlHmrc")
                .imageFilename("authUrlHmrc.Dockerfile")
                .ecrRepositoryName(builder.ecrRepositoryName)
                .ecrRepositoryArn(builder.ecrRepositoryArn)
                .functionName(Builder.buildFunctionName(dashedDomainName, builder.authUrlHmrcLambdaHandlerFunctionName))
                .allowedMethods(AllowedMethods.ALLOW_GET_HEAD_OPTIONS)
                .handler(builder.lambdaEntry + builder.authUrlHmrcLambdaHandlerFunctionName)
                .environment(authUrlHmrcLambdaEnv)
                .timeout(Duration.millis(Long.parseLong(builder.authUrlHmrcLambdaDurationMillis)))
                .options(lambdaCommonOpts)
                .build();
        this.authUrlHmrcLambda = authUrlHmrcLambdaUrlOrigin.lambda;
        this.authUrlHmrcLambdaUrl = authUrlHmrcLambdaUrlOrigin.functionUrl;
        this.authUrlLambdaLogGroup = authUrlHmrcLambdaUrlOrigin.logGroup;
        lambdaUrlToOriginsBehaviourMappings.put(
                builder.authUrlHmrcLambdaUrlPath + "*", authUrlHmrcLambdaUrlOrigin.behaviorOptions);

        // authUrl - mock
        var authUrlMockLambdaEnv = new HashMap<>(Map.of("DIY_SUBMIT_HOME_URL", builder.homeUrl));
        var authUrlMockLambdaUrlOrigin = LambdaUrlOrigin.Builder.create(this, "AuthUrlMock")
                .options(lambdaCommonOpts)
                .imageFilename("authUrlMock.Dockerfile")
                .functionName(Builder.buildFunctionName(dashedDomainName, builder.authUrlMockLambdaHandlerFunctionName))
                .allowedMethods(AllowedMethods.ALLOW_GET_HEAD_OPTIONS)
                .handler(builder.lambdaEntry + builder.authUrlMockLambdaHandlerFunctionName)
                .environment(authUrlMockLambdaEnv)
                .timeout(Duration.millis(Long.parseLong(builder.authUrlMockLambdaDurationMillis)))
                .build();
        this.authUrlMockLambda = authUrlMockLambdaUrlOrigin.lambda;
        this.authUrlMockLambdaUrl = authUrlMockLambdaUrlOrigin.functionUrl;
        this.authUrlMockLambdaLogGroup = authUrlMockLambdaUrlOrigin.logGroup;
        lambdaUrlToOriginsBehaviourMappings.put(
                builder.authUrlMockLambdaUrlPath + "*", authUrlMockLambdaUrlOrigin.behaviorOptions);

        // authUrl - Google
        var authUrlGoogleLambdaEnv = new HashMap<>(Map.of(
                "DIY_SUBMIT_HOME_URL",
                builder.homeUrl,
                "DIY_SUBMIT_COGNITO_CLIENT_ID",
                builder.googleClientId,
                "DIY_SUBMIT_COGNITO_BASE_URI",
                builder.googleBaseUri));
        // Provide Google client ID for direct-Google fallback when Cognito is not configured
        if (StringUtils.isNotBlank(builder.googleClientId)) {
            authUrlGoogleLambdaEnv.put("DIY_SUBMIT_GOOGLE_CLIENT_ID", builder.googleClientId);
        }
        var authUrlGoogleLambdaUrlOrigin = LambdaUrlOrigin.Builder.create(this, "AuthUrlGoogle")
                .options(lambdaCommonOpts)
                .imageFilename("authUrlGoogle.Dockerfile")
                .functionName(
                        Builder.buildFunctionName(dashedDomainName, builder.authUrlGoogleLambdaHandlerFunctionName))
                .allowedMethods(AllowedMethods.ALLOW_GET_HEAD_OPTIONS)
                .handler(builder.lambdaEntry + builder.authUrlGoogleLambdaHandlerFunctionName)
                .environment(authUrlGoogleLambdaEnv)
                .timeout(Duration.millis(Long.parseLong(builder.authUrlGoogleLambdaDurationMillis)))
                .build();
        this.authUrlGoogleLambda = authUrlGoogleLambdaUrlOrigin.lambda;
        this.authUrlGoogleLambdaUrl = authUrlGoogleLambdaUrlOrigin.functionUrl;
        this.authUrlGoogleLambdaLogGroup = authUrlGoogleLambdaUrlOrigin.logGroup;
        lambdaUrlToOriginsBehaviourMappings.put(
                builder.authUrlGoogleLambdaUrlPath + "*", authUrlGoogleLambdaUrlOrigin.behaviorOptions);

        // authUrl - Antonycc
        var authUrlAntonyccLambdaEnv = new HashMap<>(Map.of("DIY_SUBMIT_HOME_URL", builder.homeUrl));
        if (StringUtils.isNotBlank(builder.antonyccBaseUri)) {
            authUrlAntonyccLambdaEnv.put("DIY_SUBMIT_ANTONYCC_BASE_URI", builder.antonyccBaseUri);
        }
        if (StringUtils.isNotBlank(builder.antonyccClientId)) {
            authUrlAntonyccLambdaEnv.put("DIY_SUBMIT_ANTONYCC_CLIENT_ID", builder.antonyccClientId);
        }
        var authUrlAntonyccLambdaUrlOrigin = LambdaUrlOrigin.Builder.create(this, "AuthUrlAntonycc")
                .options(lambdaCommonOpts)
                .imageFilename("authUrlAntonycc.Dockerfile")
                .functionName(
                        Builder.buildFunctionName(dashedDomainName, builder.authUrlAntonyccLambdaHandlerFunctionName))
                .allowedMethods(AllowedMethods.ALLOW_GET_HEAD_OPTIONS)
                .handler(builder.lambdaEntry + builder.authUrlAntonyccLambdaHandlerFunctionName)
                .environment(authUrlAntonyccLambdaEnv)
                .timeout(Duration.millis(Long.parseLong(builder.authUrlAntonyccLambdaDurationMillis)))
                .build();
        this.authUrlAntonyccLambda = authUrlAntonyccLambdaUrlOrigin.lambda;
        this.authUrlAntonyccLambdaUrl = authUrlAntonyccLambdaUrlOrigin.functionUrl;
        this.authUrlAntonyccLambdaLogGroup = authUrlAntonyccLambdaUrlOrigin.logGroup;
        lambdaUrlToOriginsBehaviourMappings.put(
                builder.authUrlAntonyccLambdaUrlPath + "*", authUrlAntonyccLambdaUrlOrigin.behaviorOptions);

        // authUrl - Antonycc via Cognito
        var authUrlAcCogLambdaEnv = new HashMap<>(Map.of(
                "DIY_SUBMIT_HOME_URL",
                builder.homeUrl,
                "DIY_SUBMIT_AC_COG_CLIENT_ID",
                builder.acCogClientId,
                "DIY_SUBMIT_AC_COG_BASE_URI",
                builder.acCogBaseUri));
        var authUrlAcCogLambdaUrlOrigin = LambdaUrlOrigin.Builder.create(this, "AuthUrlAcCog")
                .options(lambdaCommonOpts)
                .imageFilename("authUrlAcCog.Dockerfile")
                .functionName(
                        Builder.buildFunctionName(dashedDomainName, builder.authUrlAcCogLambdaHandlerFunctionName))
                .allowedMethods(AllowedMethods.ALLOW_GET_HEAD_OPTIONS)
                .handler(builder.lambdaEntry + builder.authUrlAcCogLambdaHandlerFunctionName)
                .environment(authUrlAcCogLambdaEnv)
                .timeout(Duration.millis(Long.parseLong(builder.authUrlAcCogLambdaDurationMillis)))
                .build();
        this.authUrlAcCogLambda = authUrlAcCogLambdaUrlOrigin.lambda;
        this.authUrlAcCogLambdaUrl = authUrlAcCogLambdaUrlOrigin.functionUrl;
        this.authUrlAcCogLambdaLogGroup = authUrlAcCogLambdaUrlOrigin.logGroup;
        lambdaUrlToOriginsBehaviourMappings.put(
                builder.authUrlAcCogLambdaUrlPath + "*", authUrlAcCogLambdaUrlOrigin.behaviorOptions);

        // exchangeToken - HMRC
        // Create a secret for the HMRC client secret and set the ARN to be used in the Lambda
        // environment variable
        // this.hmrcClientSecretsManagerSecret = Secret.Builder.create(this, "HmrcClientSecret")
        //        .secretStringValue(SecretValue.unsafePlainText(builder.hmrcClientSecret))
        //        .description("HMRC Client Secret for OAuth authentication")
        //        .build();
        // Look up the client secret by arn
        this.hmrcClientSecretsManagerSecret =
                Secret.fromSecretPartialArn(this, "HmrcClientSecret", builder.hmrcClientSecretArn);
        var hmrcClientSecretArn = this.hmrcClientSecretsManagerSecret.getSecretArn();
        var exchangeHmrcTokenLambdaEnv = new HashMap<>(Map.of(
                "DIY_SUBMIT_HOME_URL", builder.homeUrl,
                "DIY_SUBMIT_HMRC_BASE_URI", builder.hmrcBaseUri,
                "DIY_SUBMIT_HMRC_CLIENT_ID", builder.hmrcClientId,
                "DIY_SUBMIT_HMRC_CLIENT_SECRET_ARN", hmrcClientSecretArn));
        if (StringUtils.isNotBlank(builder.optionalTestAccessToken)) {
            exchangeHmrcTokenLambdaEnv.put("DIY_SUBMIT_TEST_ACCESS_TOKEN", builder.optionalTestAccessToken);
        }
        var exchangeHmrcTokenLambdaUrlOrigin = LambdaUrlOrigin.Builder.create(this, "ExchangeHmrcToken")
                .options(lambdaCommonOpts)
                .imageFilename("exchangeHmrcToken.Dockerfile")
                .functionName(
                        Builder.buildFunctionName(dashedDomainName, builder.exchangeHmrcTokenLambdaHandlerFunctionName))
                .allowedMethods(AllowedMethods.ALLOW_ALL)
                .handler(builder.lambdaEntry + builder.exchangeHmrcTokenLambdaHandlerFunctionName)
                .environment(exchangeHmrcTokenLambdaEnv)
                .timeout(Duration.millis(Long.parseLong(builder.exchangeHmrcTokenLambdaDurationMillis)))
                .build();
        this.exchangeHmrcTokenLambda = exchangeHmrcTokenLambdaUrlOrigin.lambda;
        this.exchangeHmrcTokenLambdaUrl = exchangeHmrcTokenLambdaUrlOrigin.functionUrl;
        this.exchangeHmrcTokenLambdaLogGroup = exchangeHmrcTokenLambdaUrlOrigin.logGroup;
        lambdaUrlToOriginsBehaviourMappings.put(
                builder.exchangeHmrcTokenLambdaUrlPath + "*", exchangeHmrcTokenLambdaUrlOrigin.behaviorOptions);
        this.hmrcClientSecretsManagerSecret.grantRead(this.exchangeHmrcTokenLambda);

        // exchangeToken - Google
        var exchangeGoogleTokenLambdaEnv = new HashMap<>(Map.of(
                "DIY_SUBMIT_HOME_URL",
                builder.homeUrl,
                "DIY_SUBMIT_COGNITO_BASE_URI",
                builder.googleBaseUri,
                "DIY_SUBMIT_COGNITO_CLIENT_ID",
                builder.googleClientId,
                "DIY_SUBMIT_GOOGLE_CLIENT_SECRET_ARN",
                builder.googleClientSecretArn));
        // Provide Google client ID for direct-Google fallback when Cognito is not configured
        if (StringUtils.isNotBlank(builder.googleClientId)) {
            exchangeGoogleTokenLambdaEnv.put("DIY_SUBMIT_GOOGLE_CLIENT_ID", builder.googleClientId);
        }
        if (StringUtils.isNotBlank(builder.optionalTestAccessToken)) {
            exchangeGoogleTokenLambdaEnv.put("DIY_SUBMIT_TEST_ACCESS_TOKEN", builder.optionalTestAccessToken);
        }
        var exchangeGoogleTokenLambdaUrlOrigin = LambdaUrlOrigin.Builder.create(this, "ExchangeGoogleToken")
                .options(lambdaCommonOpts)
                .imageFilename("exchangeGoogleToken.Dockerfile")
                .functionName(Builder.buildFunctionName(
                        dashedDomainName, builder.exchangeGoogleTokenLambdaHandlerFunctionName))
                .allowedMethods(AllowedMethods.ALLOW_ALL)
                .handler(builder.lambdaEntry + builder.exchangeGoogleTokenLambdaHandlerFunctionName)
                .environment(exchangeGoogleTokenLambdaEnv)
                .timeout(Duration.millis(Long.parseLong(
                        builder.exchangeGoogleTokenLambdaDurationMillis != null
                                ? builder.exchangeGoogleTokenLambdaDurationMillis
                                : "30000")))
                .build();
        this.exchangeGoogleTokenLambda = exchangeGoogleTokenLambdaUrlOrigin.lambda;
        this.exchangeGoogleTokenLambdaUrl = exchangeGoogleTokenLambdaUrlOrigin.functionUrl;
        this.exchangeGoogleTokenLambdaLogGroup = exchangeGoogleTokenLambdaUrlOrigin.logGroup;
        lambdaUrlToOriginsBehaviourMappings.put(
                builder.exchangeGoogleTokenLambdaUrlPath + "*", exchangeGoogleTokenLambdaUrlOrigin.behaviorOptions);
        var googleClientSecretsManagerSecret =
                Secret.fromSecretPartialArn(this, "GoogleClientSecret", builder.googleClientSecretArn);
        googleClientSecretsManagerSecret.grantRead(this.exchangeGoogleTokenLambda);

        // exchangeToken - Antonycc
        var exchangeAntonyccTokenLambdaEnv = new HashMap<>(Map.of("DIY_SUBMIT_HOME_URL", builder.homeUrl));
        if (StringUtils.isNotBlank(builder.antonyccBaseUri)) {
            exchangeAntonyccTokenLambdaEnv.put("DIY_SUBMIT_ANTONYCC_BASE_URI", builder.antonyccBaseUri);
        }
        if (StringUtils.isNotBlank(builder.antonyccClientId)) {
            exchangeAntonyccTokenLambdaEnv.put("DIY_SUBMIT_ANTONYCC_CLIENT_ID", builder.antonyccClientId);
        }
        // if (StringUtils.isNotBlank(builder.antonyccClientSecretArn)) {
        //  exchangeAntonyccTokenLambdaEnv.put("DIY_SUBMIT_ANTONYCC_CLIENT_SECRET_ARN",
        // antonyccClientSecretArn);
        // }
        if (StringUtils.isNotBlank(builder.optionalTestAccessToken)) {
            exchangeAntonyccTokenLambdaEnv.put("DIY_SUBMIT_TEST_ACCESS_TOKEN", builder.optionalTestAccessToken);
        }
        var exchangeAntonyccTokenLambdaUrlOrigin = LambdaUrlOrigin.Builder.create(this, "ExchangeAntonyccToken")
                .options(lambdaCommonOpts)
                .imageFilename("exchangeAntonyccToken.Dockerfile")
                .functionName(Builder.buildFunctionName(
                        dashedDomainName, builder.exchangeAntonyccTokenLambdaHandlerFunctionName))
                .allowedMethods(AllowedMethods.ALLOW_ALL)
                .handler(builder.lambdaEntry + builder.exchangeAntonyccTokenLambdaHandlerFunctionName)
                .environment(exchangeAntonyccTokenLambdaEnv)
                .timeout(Duration.millis(Long.parseLong(
                        builder.exchangeAntonyccTokenLambdaDurationMillis != null
                                ? builder.exchangeAntonyccTokenLambdaDurationMillis
                                : "30000")))
                .build();
        this.exchangeAntonyccTokenLambda = exchangeAntonyccTokenLambdaUrlOrigin.lambda;
        this.exchangeAntonyccTokenLambdaUrl = exchangeAntonyccTokenLambdaUrlOrigin.functionUrl;
        this.exchangeAntonyccTokenLambdaLogGroup = exchangeAntonyccTokenLambdaUrlOrigin.logGroup;
        lambdaUrlToOriginsBehaviourMappings.put(
                builder.exchangeAntonyccTokenLambdaUrlPath + "*", exchangeAntonyccTokenLambdaUrlOrigin.behaviorOptions);
        // var antonyccClientSecretsManagerSecret = null;
        // if (builder.antonyccClientSecretArn != null) {
        //  var antonyccClientSecretsManagerSecret = Secret.fromSecretPartialArn(this,
        // "AntonyccClientSecret", builder.antonyccClientSecretArn);
        //  antonyccClientSecretsManagerSecret.grantRead(this.exchangeAntonyccTokenLambda);
        // }

        // exchangeToken - Antonycc Cognito
        var exchangeAcCogTokenLambdaEnv = new HashMap<>(Map.of("DIY_SUBMIT_HOME_URL", builder.homeUrl));
        if (StringUtils.isNotBlank(builder.acCogBaseUri)) {
            exchangeAcCogTokenLambdaEnv.put("DIY_SUBMIT_AC_COG_BASE_URI", builder.acCogBaseUri);
        }
        if (StringUtils.isNotBlank(builder.acCogClientId)) {
            exchangeAcCogTokenLambdaEnv.put("DIY_SUBMIT_AC_COG_CLIENT_ID", builder.acCogClientId);
        }
        // if (StringUtils.isNotBlank(builder.acCogClientSecretArn)) {
        //    exchangeAcCogTokenLambdaEnv.put("DIY_SUBMIT_AC_COG_CLIENT_SECRET_ARN",
        // acCogClientSecretArn);
        // }
        if (StringUtils.isNotBlank(builder.optionalTestAccessToken)) {
            exchangeAcCogTokenLambdaEnv.put("DIY_SUBMIT_TEST_ACCESS_TOKEN", builder.optionalTestAccessToken);
        }
        var exchangeAcCogTokenLambdaUrlOrigin = LambdaUrlOrigin.Builder.create(this, "ExchangeAcCogToken")
                .options(lambdaCommonOpts)
                .imageFilename("exchangeAcCogToken.Dockerfile")
                .functionName(Builder.buildFunctionName(
                        dashedDomainName, builder.exchangeAcCogTokenLambdaHandlerFunctionName))
                .allowedMethods(AllowedMethods.ALLOW_ALL)
                .handler(builder.lambdaEntry + builder.exchangeAcCogTokenLambdaHandlerFunctionName)
                .environment(exchangeAcCogTokenLambdaEnv)
                .timeout(Duration.millis(Long.parseLong(
                        builder.exchangeAcCogTokenLambdaDurationMillis != null
                                ? builder.exchangeAcCogTokenLambdaDurationMillis
                                : "30000")))
                .build();
        this.exchangeAcCogTokenLambda = exchangeAcCogTokenLambdaUrlOrigin.lambda;
        this.exchangeAcCogTokenLambdaUrl = exchangeAcCogTokenLambdaUrlOrigin.functionUrl;
        this.exchangeAcCogTokenLambdaLogGroup = exchangeAcCogTokenLambdaUrlOrigin.logGroup;
        lambdaUrlToOriginsBehaviourMappings.put(
                builder.exchangeAcCogTokenLambdaUrlPath + "*", exchangeAcCogTokenLambdaUrlOrigin.behaviorOptions);
        // if (this.acCogClientSecretsManagerSecret != null) {
        //    this.acCogClientSecretsManagerSecret.grantRead(this.exchangeAcCogTokenLambda);
        // }

        // submitVat
        var submitVatLambdaEnv = new HashMap<>(Map.of(
                "DIY_SUBMIT_HOME_URL", builder.homeUrl,
                "DIY_SUBMIT_HMRC_BASE_URI", builder.hmrcBaseUri));
        var submitVatLambdaUrlOrigin = LambdaUrlOrigin.Builder.create(this, "SubmitVat")
                .options(lambdaCommonOpts)
                .imageFilename("submitVat.Dockerfile")
                .functionName(Builder.buildFunctionName(dashedDomainName, builder.submitVatLambdaHandlerFunctionName))
                .allowedMethods(AllowedMethods.ALLOW_ALL)
                .handler(builder.lambdaEntry + builder.submitVatLambdaHandlerFunctionName)
                .environment(submitVatLambdaEnv)
                .timeout(Duration.millis(Long.parseLong(builder.submitVatLambdaDurationMillis)))
                .build();
        this.submitVatLambda = submitVatLambdaUrlOrigin.lambda;
        this.submitVatLambdaUrl = submitVatLambdaUrlOrigin.functionUrl;
        this.submitVatLambdaLogGroup = submitVatLambdaUrlOrigin.logGroup;
        lambdaUrlToOriginsBehaviourMappings.put(
                builder.submitVatLambdaUrlPath + "*", submitVatLambdaUrlOrigin.behaviorOptions);

        var logReceiptLambdaEnv = new HashMap<>(Map.of(
                "DIY_SUBMIT_HOME_URL", builder.homeUrl,
                "DIY_SUBMIT_RECEIPTS_BUCKET_POSTFIX", builder.receiptsBucketPostfix));
        if (StringUtils.isNotBlank(builder.optionalTestS3Endpoint)
                        && StringUtils.isNotBlank(builder.optionalTestS3AccessKey)
                || StringUtils.isNotBlank(builder.optionalTestS3SecretKey)) {
            // For production like integrations without AWS we can use test S3 credentials
            var logReceiptLambdaTestEnv = new HashMap<>(Map.of(
                    "DIY_SUBMIT_TEST_S3_ENDPOINT", builder.optionalTestS3Endpoint,
                    "DIY_SUBMIT_TEST_S3_ACCESS_KEY", builder.optionalTestS3AccessKey,
                    "DIY_SUBMIT_TEST_S3_SECRET_KEY", builder.optionalTestS3SecretKey));
            logReceiptLambdaEnv.putAll(logReceiptLambdaTestEnv);
        }
        var logReceiptLambdaUrlOrigin = LambdaUrlOrigin.Builder.create(this, "LogReceipt")
                .options(lambdaCommonOpts)
                .imageFilename("logReceipt.Dockerfile")
                .functionName(Builder.buildFunctionName(dashedDomainName, builder.logReceiptLambdaHandlerFunctionName))
                .allowedMethods(AllowedMethods.ALLOW_ALL)
                .handler(builder.lambdaEntry + builder.logReceiptLambdaHandlerFunctionName)
                .environment(logReceiptLambdaEnv)
                .timeout(Duration.millis(Long.parseLong(builder.logReceiptLambdaDurationMillis)))
                .build();
        this.logReceiptLambda = logReceiptLambdaUrlOrigin.lambda;
        this.logReceiptLambdaUrl = logReceiptLambdaUrlOrigin.functionUrl;
        this.logReceiptLambdaLogGroup = logReceiptLambdaUrlOrigin.logGroup;
        lambdaUrlToOriginsBehaviourMappings.put(
                builder.logReceiptLambdaUrlPath + "*", logReceiptLambdaUrlOrigin.behaviorOptions);

        // Create Bundle Management Lambda
        if (StringUtils.isNotBlank(builder.bundleLambdaHandlerFunctionName)) {
            var bundleLambdaEnv = new HashMap<>(Map.of(
                    "DIY_SUBMIT_HOME_URL",
                    builder.homeUrl,
                    "DIY_SUBMIT_USER_POOL_ID",
                    userPool.getUserPoolId(),
                    "DIY_SUBMIT_BUNDLE_EXPIRY_DATE",
                    builder.bundleExpiryDate != null ? builder.bundleExpiryDate : "2025-12-31",
                    "DIY_SUBMIT_BUNDLE_USER_LIMIT",
                    builder.bundleUserLimit != null ? builder.bundleUserLimit : "1000"));
            var bundleLambdaUrlOrigin = LambdaUrlOrigin.Builder.create(this, "BundleLambda")
                    .options(lambdaCommonOpts)
                    .imageFilename("bundle.Dockerfile")
                    .functionName(Builder.buildFunctionName(dashedDomainName, builder.bundleLambdaHandlerFunctionName))
                    .allowedMethods(AllowedMethods.ALLOW_ALL)
                    .handler(builder.lambdaEntry + builder.bundleLambdaHandlerFunctionName)
                    .environment(bundleLambdaEnv)
                    .timeout(Duration.millis(Long.parseLong(
                            builder.bundleLambdaDurationMillis != null ? builder.bundleLambdaDurationMillis : "30000")))
                    .build();
            this.bundleLambda = bundleLambdaUrlOrigin.lambda;
            this.bundleLambdaUrl = bundleLambdaUrlOrigin.functionUrl;
            this.bundleLambdaLogGroup = bundleLambdaUrlOrigin.logGroup;
            lambdaUrlToOriginsBehaviourMappings.put(
                    builder.bundleLambdaUrlPath + "*", bundleLambdaUrlOrigin.behaviorOptions);

            // Grant Cognito permissions to the bundle Lambda
            this.bundleLambda.addToRolePolicy(PolicyStatement.Builder.create()
                    .effect(Effect.ALLOW)
                    .actions(List.of(
                            "cognito-idp:AdminGetUser",
                            "cognito-idp:AdminUpdateUserAttributes",
                            "cognito-idp:ListUsers"))
                    .resources(List.of(userPool.getUserPoolArn()))
                    .build());
        }

        // Catalog Lambda
        // if (StringUtils.isNotBlank(builder.catalogLambdaHandlerFunctionName)) {
        var catalogLambdaEnv = new HashMap<>(Map.of("DIY_SUBMIT_HOME_URL", builder.homeUrl));
        var catalogLambdaUrlOrigin = LambdaUrlOrigin.Builder.create(this, "Catalog")
                .options(lambdaCommonOpts)
                .imageFilename("getCatalog.Dockerfile")
                .functionName(Builder.buildFunctionName(dashedDomainName, builder.catalogueLambdaHandlerFunctionName))
                .allowedMethods(AllowedMethods.ALLOW_ALL)
                .handler(builder.lambdaEntry + builder.catalogueLambdaHandlerFunctionName)
                .environment(catalogLambdaEnv)
                .timeout(Duration.millis(Long.parseLong(
                        builder.catalogueLambdaDurationMillis != null ? builder.catalogueLambdaDurationMillis : "30000")))
                .build();
        this.catalogLambda = catalogLambdaUrlOrigin.lambda;
        this.catalogLambdaUrl = catalogLambdaUrlOrigin.functionUrl;
        this.catalogLambdaLogGroup = catalogLambdaUrlOrigin.logGroup;
        lambdaUrlToOriginsBehaviourMappings.put(
                builder.catalogueLambdaUrlPath + "*", catalogLambdaUrlOrigin.behaviorOptions);
        // }

        // My Bundles Lambda
        // if (StringUtils.isNotBlank(builder.myBundlesLambdaHandlerFunctionName)) {
        var myBundlesLambdaEnv = new HashMap<>(Map.of("DIY_SUBMIT_HOME_URL", builder.homeUrl));
        var myBundlesLambdaUrlOrigin = LambdaUrlOrigin.Builder.create(this, "MyBundles")
                .options(lambdaCommonOpts)
                .imageFilename("myBundles.Dockerfile")
                .functionName(Builder.buildFunctionName(dashedDomainName, builder.myBundlesLambdaHandlerFunctionName))
                .allowedMethods(AllowedMethods.ALLOW_ALL)
                .handler(builder.lambdaEntry + builder.myBundlesLambdaHandlerFunctionName)
                .environment(myBundlesLambdaEnv)
                .timeout(Duration.millis(Long.parseLong(
                        builder.myBundlesLambdaDurationMillis != null ? builder.myBundlesLambdaDurationMillis : "30000")))
                .build();
        this.myBundlesLambda = myBundlesLambdaUrlOrigin.lambda;
        this.myBundlesLambdaUrl = myBundlesLambdaUrlOrigin.functionUrl;
        this.myBundlesLambdaLogGroup = myBundlesLambdaUrlOrigin.logGroup;
        lambdaUrlToOriginsBehaviourMappings.put(
                builder.myBundlesLambdaUrlPath + "*", myBundlesLambdaUrlOrigin.behaviorOptions);
        // }

        // myReceipts Lambda
        // if (StringUtils.isNotBlank(builder.myReceiptsLambdaHandlerFunctionName)) {
        var myReceiptsLambdaEnv = new HashMap<>(Map.of(
                "DIY_SUBMIT_HOME_URL", builder.homeUrl,
                "DIY_SUBMIT_RECEIPTS_BUCKET_POSTFIX", builder.receiptsBucketPostfix));
        var myReceiptsLambdaUrlOrigin = LambdaUrlOrigin.Builder.create(this, "MyReceipts")
                .options(lambdaCommonOpts)
                .imageFilename("myReceipts.Dockerfile")
                .functionName(Builder.buildFunctionName(dashedDomainName, builder.myReceiptsLambdaHandlerFunctionName))
                .allowedMethods(AllowedMethods.ALLOW_ALL)
                .handler(builder.lambdaEntry + builder.myReceiptsLambdaHandlerFunctionName)
                .environment(myReceiptsLambdaEnv)
                .timeout(Duration.millis(Long.parseLong(
                        builder.myReceiptsLambdaDurationMillis != null ? builder.myReceiptsLambdaDurationMillis : "30000")))
                .build();
        this.myReceiptsLambda = myReceiptsLambdaUrlOrigin.lambda;
        this.myReceiptsLambdaUrl = myReceiptsLambdaUrlOrigin.functionUrl;
        this.myReceiptsLambdaLogGroup = myReceiptsLambdaUrlOrigin.logGroup;
        lambdaUrlToOriginsBehaviourMappings.put(
                builder.myReceiptsLambdaUrlPath + "*", myReceiptsLambdaUrlOrigin.behaviorOptions);
        // }

        // Create receipts bucket for storing VAT submission receipts
        this.receiptsBucket = LogForwardingBucket.Builder.create(
                        this, "ReceiptsBucket", builder.logS3ObjectEventHandlerSource, LogS3ObjectEvent.class)
                .bucketName(receiptsBucketFullName)
                .versioned(true)
                .blockPublicAccess(BlockPublicAccess.BLOCK_ALL)
                .objectOwnership(ObjectOwnership.OBJECT_WRITER)
                .autoDeleteObjects(!s3RetainReceiptsBucket)
                .functionNamePrefix("%s-receipts-bucket-".formatted(dashedDomainName))
                .retentionPeriodDays(2555) // 7 years for tax records as per HMRC requirements
                .cloudTrailEnabled(cloudTrailEnabled)
                .verboseLogging(verboseLogging)
                .removalPolicy(s3RetainReceiptsBucket ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY)
                .build();
        this.receiptsBucket.grantWrite(this.logReceiptLambda);
        this.receiptsBucket.grantRead(this.myReceiptsLambda);

        // Add S3 event selector to the CloudTrail for receipts bucket
        // TODO Move to the LogForwardingBucket
        // if (builder.trail != null && cloudTrailEnabled) {
        //  if (builder.cloudTrailEventSelectorPrefix == null
        //      || builder.cloudTrailEventSelectorPrefix.isBlank()
        //      || "none".equals(builder.cloudTrailEventSelectorPrefix)) {
        //      builder.trail.addS3EventSelector(
        //        List.of(S3EventSelector.builder().bucket(this.receiptsBucket).build()));
        //  } else {
        //      builder.trail.addS3EventSelector(
        //        List.of(
        //            S3EventSelector.builder()
        //                .bucket(this.receiptsBucket)
        //                .objectPrefix(builder.cloudTrailEventSelectorPrefix)
        //                .build()));
        //  }
        // } else {
        //  logger.info("CloudTrail is not enabled for the bucket.");
        // }

        // Create a certificate for the website domain
        this.certificate = Certificate.fromCertificateArn(this, "Certificate", builder.certificateArn);

        // Create the CloudFront distribution using a helper to preserve IDs and reduce inline noise
        var distWithLogging = DistributionWithLogging.Builder.create(this)
                .domainName(this.domainName)
                .defaultBehavior(s3BucketOriginBehaviour)
                .additionalBehaviors(lambdaUrlToOriginsBehaviourMappings)
                .defaultRootObject(builder.defaultDocumentAtOrigin)
                .errorPageKey(builder.error404NotFoundAtDistribution)
                .errorStatusCode(HttpStatus.SC_NOT_FOUND)
                .certificate(this.certificate)
                .logBucketName(distributionAccessLogBucketName)
                .logFunctionNamePrefix("%s-dist-access-".formatted(dashedDomainName))
                .logRetentionDays(accessLogGroupRetentionPeriodDays)
                .cloudTrailEnabled(cloudTrailEnabled)
                .logIncludesCookies(verboseLogging)
                .logHandlerSource(builder.logGzippedS3ObjectEventHandlerSource)
                .build();
        this.distributionAccessLogBucket = distWithLogging.logBucket;
        this.distribution = distWithLogging.distribution;

        Permission invokeFunctionUrlPermission = Permission.builder()
                .principal(new ServicePrincipal("cloudfront.amazonaws.com"))
                .action("lambda:InvokeFunctionUrl")
                .functionUrlAuthType(functionUrlAuthType)
                .sourceArn(this.distribution.getDistributionArn()) // restrict to your distribution
                .build();
        authUrlHmrcLambda.addPermission("AuthLambdaAllowCloudFrontInvoke", invokeFunctionUrlPermission);
        exchangeHmrcTokenLambda.addPermission("ExchangeTokenLambdaAllowCloudFrontInvoke", invokeFunctionUrlPermission);
        submitVatLambda.addPermission("SubmitVatLambdaAllowCloudFrontInvoke", invokeFunctionUrlPermission);
        logReceiptLambda.addPermission("LogReceiptLambdaAllowCloudFrontInvoke", invokeFunctionUrlPermission);
        if (this.bundleLambda != null)
            this.bundleLambda.addPermission("BundleLambdaAllowCloudFrontInvoke", invokeFunctionUrlPermission);
        if (this.catalogLambda != null)
            this.catalogLambda.addPermission("CatalogLambdaAllowCloudFrontInvoke", invokeFunctionUrlPermission);
        if (this.myBundlesLambda != null)
            this.myBundlesLambda.addPermission("MyBundlesLambdaAllowCloudFrontInvoke", invokeFunctionUrlPermission);

        this.distributionUrl = "https://%s/".formatted(this.distribution.getDomainName());
        logger.info("Distribution URL: %s".formatted(distributionUrl));

        // Generate submit.version file with commit hash if provided
        if (builder.commitHash != null && !builder.commitHash.isBlank()) {
            try {
                java.nio.file.Path sourceFilePath = java.nio.file.Paths.get(builder.docRootPath, "submit.version");
                java.nio.file.Files.writeString(sourceFilePath, builder.commitHash.trim());
                logger.info("Created submit.version file with commit hash: %s".formatted(builder.commitHash));
            } catch (Exception e) {
                logger.warn("Failed to create submit.version file: %s".formatted(e.getMessage()));
            }
        } else {
            logger.info("No commit hash provided, skipping submit.version generation");
        }

        // Deploy the web website files to the web website bucket and invalidate distribution
        this.docRootSource = Source.asset(
                builder.docRootPath,
                AssetOptions.builder().assetHashType(AssetHashType.SOURCE).build());
        logger.info("Will deploy files from: %s".formatted(builder.docRootPath));

        // Create LogGroup for BucketDeployment
        var bucketDeploymentRetentionPeriodDays = Integer.parseInt(builder.cloudTrailLogGroupRetentionPeriodDays);
        var bucketDeploymentRetentionPeriod =
                RetentionDaysConverter.daysToRetentionDays(bucketDeploymentRetentionPeriodDays);
        LogGroup bucketDeploymentLogGroup = LogGroup.Builder.create(this, "BucketDeploymentLogGroup")
                .logGroupName("/aws/lambda/bucket-deployment-%s".formatted(dashedDomainName))
                .retention(bucketDeploymentRetentionPeriod)
                .removalPolicy(s3RetainOriginBucket ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY)
                .build();

        this.deployment = BucketDeployment.Builder.create(this, "DocRootToOriginDeployment")
                .sources(List.of(this.docRootSource))
                .destinationBucket(this.originBucket)
                .distribution(this.distribution)
                .distributionPaths(List.of("/*"))
                .retainOnDelete(false)
                .logGroup(bucketDeploymentLogGroup)
                .expires(Expiration.after(Duration.minutes(5)))
                .prune(true)
                .build();

        // Create Route53 record for use with CloudFront distribution
        this.aRecord = ARecord.Builder.create(this, "ARecord-%s".formatted(dashedDomainName))
                .zone(this.hostedZone)
                .recordName(this.domainName)
                .deleteExisting(true)
                .target(RecordTarget.fromAlias(new CloudFrontTarget(this.distribution)))
                .build();
        this.aaaaRecord = AaaaRecord.Builder.create(this, "AaaaRecord-%s".formatted(dashedDomainName))
                .zone(this.hostedZone)
                .recordName(this.domainName)
                .deleteExisting(true)
                .target(RecordTarget.fromAlias(new CloudFrontTarget(this.distribution)))
                .build();

        // Stack Outputs for Web resources
        if (this.originBucket != null) {
            CfnOutput.Builder.create(this, "OriginBucketArn")
                    .value(this.originBucket.getBucketArn())
                    .build();
        }
        if (this.originAccessLogBucket != null) {
            CfnOutput.Builder.create(this, "OriginAccessLogBucketArn")
                    .value(this.originAccessLogBucket.getBucketArn())
                    .build();
        }
        if (this.distributionAccessLogBucket != null) {
            CfnOutput.Builder.create(this, "DistributionAccessLogBucketArn")
                    .value(this.distributionAccessLogBucket.getBucketArn())
                    .build();
        }
        if (this.distribution != null) {
            CfnOutput.Builder.create(this, "DistributionId")
                    .value(this.distribution.getDistributionId())
                    .build();
        }
        if (this.hostedZone != null) {
            CfnOutput.Builder.create(this, "HostedZoneId")
                    .value(this.hostedZone.getHostedZoneId())
                    .build();
        }
        if (this.certificate != null) {
            CfnOutput.Builder.create(this, "CertificateArn")
                    .value(this.certificate.getCertificateArn())
                    .build();
        }
        if (this.hmrcClientSecretsManagerSecret != null) {
            CfnOutput.Builder.create(this, "HmrcClientSecretsManagerSecretArn")
                    .value(this.hmrcClientSecretsManagerSecret.getSecretArn())
                    .build();
        }
        if (this.cognitoBaseUri != null) {
            CfnOutput.Builder.create(this, "CognitoBaseUri")
                    .value(this.cognitoBaseUri)
                    .build();
            CfnOutput.Builder.create(this, "CognitoGoogleIdpRedirectUri")
                    .value(this.cognitoBaseUri + "/oauth2/idpresponse")
                    .build();
        }
        if (this.aRecord != null) {
            CfnOutput.Builder.create(this, "ARecord")
                    .value(this.aRecord.getDomainName())
                    .build();
        }
        if (this.aaaaRecord != null) {
            CfnOutput.Builder.create(this, "AaaaRecord")
                    .value(this.aaaaRecord.getDomainName())
                    .build();
        }

        if (this.authUrlHmrcLambda != null) {
            CfnOutput.Builder.create(this, "AuthUrlHmrcLambdaArn")
                    .value(this.authUrlHmrcLambda.getFunctionArn())
                    .build();
            CfnOutput.Builder.create(this, "AuthUrlHmrcLambdaUrl")
                    .value(this.authUrlHmrcLambdaUrl.getUrl())
                    .build();
        }
        if (this.authUrlMockLambda != null) {
            CfnOutput.Builder.create(this, "AuthUrlMockLambdaArn")
                    .value(this.authUrlMockLambda.getFunctionArn())
                    .build();
            CfnOutput.Builder.create(this, "AuthUrlMockLambdaUrl")
                    .value(this.authUrlMockLambdaUrl.getUrl())
                    .build();
        }
        if (this.authUrlGoogleLambda != null) {
            CfnOutput.Builder.create(this, "AuthUrlGoogleLambdaArn")
                    .value(this.authUrlGoogleLambda.getFunctionArn())
                    .build();
            CfnOutput.Builder.create(this, "AuthUrlGoogleLambdaUrl")
                    .value(this.authUrlGoogleLambdaUrl.getUrl())
                    .build();
        }
        if (this.exchangeHmrcTokenLambda != null) {
            CfnOutput.Builder.create(this, "ExchangeHmrcTokenLambdaArn")
                    .value(this.exchangeHmrcTokenLambda.getFunctionArn())
                    .build();
            CfnOutput.Builder.create(this, "ExchangeHmrcTokenLambdaUrl")
                    .value(this.exchangeHmrcTokenLambdaUrl.getUrl())
                    .build();
        }
        if (this.exchangeGoogleTokenLambda != null) {
            CfnOutput.Builder.create(this, "ExchangeGoogleTokenLambdaArn")
                    .value(this.exchangeGoogleTokenLambda.getFunctionArn())
                    .build();
            CfnOutput.Builder.create(this, "ExchangeGoogleTokenLambdaUrl")
                    .value(this.exchangeGoogleTokenLambdaUrl.getUrl())
                    .build();
        }
        if (this.submitVatLambda != null) {
            CfnOutput.Builder.create(this, "SubmitVatLambdaArn")
                    .value(this.submitVatLambda.getFunctionArn())
                    .build();
            CfnOutput.Builder.create(this, "SubmitVatLambdaUrl")
                    .value(this.submitVatLambdaUrl.getUrl())
                    .build();
        }
        if (this.logReceiptLambda != null) {
            CfnOutput.Builder.create(this, "LogReceiptLambdaArn")
                    .value(this.logReceiptLambda.getFunctionArn())
                    .build();
            CfnOutput.Builder.create(this, "LogReceiptLambdaUrl")
                    .value(this.logReceiptLambdaUrl.getUrl())
                    .build();
        }
        if (this.bundleLambda != null) {
            CfnOutput.Builder.create(this, "BundleLambdaArn")
                    .value(this.bundleLambda.getFunctionArn())
                    .build();
            CfnOutput.Builder.create(this, "BundleLambdaUrl")
                    .value(this.bundleLambdaUrl.getUrl())
                    .build();
        }
        if (this.myReceiptsLambda != null) {
            CfnOutput.Builder.create(this, "MyReceiptsLambdaArn")
                    .value(this.myReceiptsLambda.getFunctionArn())
                    .build();
            CfnOutput.Builder.create(this, "MyReceiptsLambdaUrl")
                    .value(this.myReceiptsLambdaUrl.getUrl())
                    .build();
        }
    }
}
