package co.uk.diyaccounting.submit.stacks;

import static co.uk.diyaccounting.submit.utils.Kind.infof;
import static co.uk.diyaccounting.submit.utils.KindCdk.cfnOutput;
import static co.uk.diyaccounting.submit.utils.ResourceNameUtils.buildFunctionName;

import co.uk.diyaccounting.submit.SubmitSharedNames;
import co.uk.diyaccounting.submit.aspects.SetAutoDeleteJobLogRetentionAspect;
import co.uk.diyaccounting.submit.constructs.LambdaUrlOrigin;
import co.uk.diyaccounting.submit.constructs.LambdaUrlOriginProps;
import co.uk.diyaccounting.submit.utils.PopulatedMap;
import java.util.List;
import java.util.Optional;
import org.immutables.value.Value;
import software.amazon.awscdk.Aspects;
import software.amazon.awscdk.Duration;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.StackProps;
import software.amazon.awscdk.services.cloudfront.AllowedMethods;
import software.amazon.awscdk.services.iam.Effect;
import software.amazon.awscdk.services.iam.PolicyStatement;
import software.amazon.awscdk.services.lambda.Function;
import software.amazon.awscdk.services.lambda.FunctionUrlAuthType;
import software.amazon.awscdk.services.lambda.FunctionUrlOptions;
import software.amazon.awscdk.services.lambda.InvokeMode;
import software.amazon.awscdk.services.logs.LogGroup;
import software.amazon.awscdk.services.logs.RetentionDays;
import software.amazon.awscdk.services.s3.Bucket;
import software.amazon.awscdk.services.s3.IBucket;
import software.amazon.awscdk.services.secretsmanager.Secret;
import software.amazon.awssdk.utils.StringUtils;
import software.constructs.Construct;

public class HmrcStack extends Stack {

    // CDK resources here
    public Function authUrlHmrcLambda;
    public LogGroup authUrlHmrcLambdaLogGroup;
    public Function exchangeHmrcTokenLambda;
    public LogGroup exchangeHmrcTokenLambdaLogGroup;
    public Function submitVatLambda;
    public LogGroup submitVatLambdaLogGroup;
    public Function logReceiptLambda;
    public LogGroup logReceiptLambdaLogGroup;
    public Function myReceiptsLambda;
    public LogGroup myReceiptsLambdaLogGroup;

    @Value.Immutable
    public interface HmrcStackProps extends StackProps, SubmitStackProps {

        @Override
        Environment getEnv();

        @Override
        @Value.Default
        default Boolean getCrossRegionReferences() {
            return null;
        }

        @Override
        String envName();

        @Override
        String deploymentName();

        @Override
        String resourceNamePrefix();

        @Override
        String compressedResourceNamePrefix();

        @Override
        String cloudTrailEnabled();

        String baseImageTag();

        String lambdaUrlAuthType();

        String lambdaEntry();

        String hmrcBaseUri();

        String hmrcClientId();

        String hmrcClientSecretArn();

        String cognitoUserPoolId();

        @Override
        SubmitSharedNames sharedNames();

        // TODO: Delete these and ensure the tests set environment which the server.js reads
        Optional<String> optionalTestAccessToken(); // {

        Optional<String> optionalTestS3Endpoint(); // {

        Optional<String> optionalTestS3AccessKey(); // {

        Optional<String> optionalTestS3SecretKey(); // {

        static ImmutableHmrcStackProps.Builder builder() {
            return ImmutableHmrcStackProps.builder();
        }
    }

    public HmrcStack(Construct scope, String id, HmrcStackProps props) {
        this(scope, id, null, props);
    }

    public HmrcStack(Construct scope, String id, StackProps stackProps, HmrcStackProps props) {
        super(scope, id, stackProps);

        // Lambdas

        // Determine Lambda URL authentication type
        FunctionUrlAuthType functionUrlAuthType = "AWS_IAM".equalsIgnoreCase(props.lambdaUrlAuthType())
                ? FunctionUrlAuthType.AWS_IAM
                : FunctionUrlAuthType.NONE;

        // authUrl - HMRC
        var authUrlHmrcLambdaEnv = new PopulatedMap<String, String>()
                .with("DIY_SUBMIT_BASE_URL", props.sharedNames().envBaseUrl)
                .with("HMRC_BASE_URI", props.hmrcBaseUri())
                .with("HMRC_CLIENT_ID", props.hmrcClientId());
        var authUrlHmrcLambdaUrlOriginFunctionHandler = "authUrl.httpGetHmrc";
        var authUrlHmrcLambdaUrlOriginFunctionName =
                buildFunctionName(props.resourceNamePrefix(), authUrlHmrcLambdaUrlOriginFunctionHandler);
        var authUrlHmrcLambdaUrlOrigin = new LambdaUrlOrigin(
                this,
                LambdaUrlOriginProps.builder()
                        .idPrefix(authUrlHmrcLambdaUrlOriginFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecrRepositoryArn)
                        .functionName(authUrlHmrcLambdaUrlOriginFunctionName)
                        .cloudFrontAllowedMethods(AllowedMethods.ALLOW_GET_HEAD_OPTIONS)
                        .handler(props.lambdaEntry() + authUrlHmrcLambdaUrlOriginFunctionHandler)
                        .environment(authUrlHmrcLambdaEnv)
                        .timeout(Duration.millis(Long.parseLong("30000")))
                        .build());
        this.authUrlHmrcLambda = authUrlHmrcLambdaUrlOrigin.lambda;
        this.authUrlHmrcLambdaLogGroup = authUrlHmrcLambdaUrlOrigin.logGroup;
        infof(
                "Created Lambda %s for HMRC auth URL with handler %s",
                this.authUrlHmrcLambda.getNode().getId(),
                props.lambdaEntry() + authUrlHmrcLambdaUrlOriginFunctionHandler);

        // exchangeToken - HMRC
        var exchangeHmrcEnvBase = new PopulatedMap<String, String>()
                .with("DIY_SUBMIT_BASE_URL", props.sharedNames().envBaseUrl)
                .with("HMRC_BASE_URI", props.hmrcBaseUri())
                .with("HMRC_CLIENT_ID", props.hmrcClientId());
        if (StringUtils.isNotBlank(props.hmrcClientSecretArn())) {
            exchangeHmrcEnvBase.with("HMRC_CLIENT_SECRET_ARN", props.hmrcClientSecretArn());
        }
        if (props.optionalTestAccessToken().isPresent()
                && StringUtils.isNotBlank(props.optionalTestAccessToken().get())) {
            exchangeHmrcEnvBase.with(
                    "TEST_ACCESS_TOKEN", props.optionalTestAccessToken().get());
        }
        var exchangeHmrcTokenLambdaUrlOriginFunctionHandler = "token.httpPostHmrc";
        var exchangeHmrcTokenLambdaUrlOriginFunctionName =
                buildFunctionName(props.resourceNamePrefix(), exchangeHmrcTokenLambdaUrlOriginFunctionHandler);
        var exchangeHmrcTokenLambdaUrlOrigin = new LambdaUrlOrigin(
                this,
                LambdaUrlOriginProps.builder()
                        .idPrefix(exchangeHmrcTokenLambdaUrlOriginFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecrRepositoryArn)
                        .functionName(exchangeHmrcTokenLambdaUrlOriginFunctionName)
                        .cloudFrontAllowedMethods(AllowedMethods.ALLOW_ALL)
                        .handler(props.lambdaEntry() + exchangeHmrcTokenLambdaUrlOriginFunctionHandler)
                        .environment(exchangeHmrcEnvBase)
                        .timeout(Duration.millis(Long.parseLong("30000")))
                        .build());
        this.exchangeHmrcTokenLambda = exchangeHmrcTokenLambdaUrlOrigin.lambda;
        this.exchangeHmrcTokenLambdaLogGroup = exchangeHmrcTokenLambdaUrlOrigin.logGroup;

        // Grant access to HMRC client secret in Secrets Manager
        if (StringUtils.isNotBlank(props.hmrcClientSecretArn())) {
            var hmrcSecret = Secret.fromSecretPartialArn(
                    this, props.resourceNamePrefix() + "-HmrcClientSecret", props.hmrcClientSecretArn());
            // Use the provided ARN with wildcard suffix to handle AWS Secrets Manager's automatic suffix
            String secretArnWithWildcard = props.hmrcClientSecretArn().endsWith("-*")
                    ? props.hmrcClientSecretArn()
                    : props.hmrcClientSecretArn() + "-*";
            this.exchangeHmrcTokenLambda.addToRolePolicy(PolicyStatement.Builder.create()
                    .effect(Effect.ALLOW)
                    .actions(List.of("secretsmanager:GetSecretValue"))
                    .resources(List.of(secretArnWithWildcard))
                    .build());
            infof(
                    "Granted Secrets Manager access to %s for secret %s (with wildcard: %s)",
                    this.exchangeHmrcTokenLambda.getFunctionName(), props.hmrcClientSecretArn(), secretArnWithWildcard);
        }

        infof(
                "Created Lambda %s for HMRC exchange token with handler %s",
                this.exchangeHmrcTokenLambda.getNode().getId(),
                props.lambdaEntry() + exchangeHmrcTokenLambdaUrlOriginFunctionHandler);

        // submitVat
        var submitVatLambdaEnv = new PopulatedMap<String, String>()
                .with("DIY_SUBMIT_BASE_URL", props.sharedNames().envBaseUrl)
                .with("COGNITO_USER_POOL_ID", props.cognitoUserPoolId())
                .with("HMRC_BASE_URI", props.hmrcBaseUri());
        var submitVatLambdaUrlOrigin = new LambdaUrlOrigin(
                this,
                LambdaUrlOriginProps.builder()
                        .idPrefix(props.sharedNames().submitVatLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecrRepositoryArn)
                        .functionName(props.sharedNames().submitVatLambdaFunctionName)
                        .cloudFrontAllowedMethods(AllowedMethods.ALLOW_ALL)
                        .handler(props.lambdaEntry() + props.sharedNames().submitVatLambdaHandler)
                        .environment(submitVatLambdaEnv)
                        .timeout(Duration.millis(Long.parseLong("60000")))
                        .build());
        this.submitVatLambda = submitVatLambdaUrlOrigin.lambda;
        this.submitVatLambdaLogGroup = submitVatLambdaUrlOrigin.logGroup;
        infof(
                "Created Lambda %s for VAT submission with handler %s",
                this.submitVatLambda.getNode().getId(),
                props.lambdaEntry() + props.sharedNames().submitVatLambdaHandler);

        var logReceiptLambdaEnv = new PopulatedMap<String, String>()
                .with("DIY_SUBMIT_BASE_URL", props.sharedNames().envBaseUrl)
                .with("DIY_SUBMIT_RECEIPTS_BUCKET_NAME", props.sharedNames().receiptsBucketName);
        if (props.optionalTestS3Endpoint().isPresent()
                && StringUtils.isNotBlank(props.optionalTestS3Endpoint().get())
                && props.optionalTestS3AccessKey().isPresent()
                && StringUtils.isNotBlank(props.optionalTestS3AccessKey().get())
                && props.optionalTestS3SecretKey().isPresent()
                && StringUtils.isNotBlank(props.optionalTestS3SecretKey().get())) {
            // For production like integrations without AWS we can use test S3 credentials
            logReceiptLambdaEnv
                    .with("TEST_S3_ENDPOINT", props.optionalTestS3Endpoint().get())
                    .with("TEST_S3_ACCESS_KEY", props.optionalTestS3AccessKey().get())
                    .with("TEST_S3_SECRET_KEY", props.optionalTestS3SecretKey().get());
        }
        var logReceiptLambdaUrlOrigin = new LambdaUrlOrigin(
                this,
                LambdaUrlOriginProps.builder()
                        .idPrefix(props.sharedNames().logReceiptLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecrRepositoryArn)
                        .functionName(props.sharedNames().logReceiptLambdaFunctionName)
                        .cloudFrontAllowedMethods(AllowedMethods.ALLOW_ALL)
                        .handler(props.lambdaEntry() + props.sharedNames().logReceiptLambdaHandler)
                        .environment(logReceiptLambdaEnv)
                        .timeout(Duration.millis(Long.parseLong("30000")))
                        .build());
        this.logReceiptLambda = logReceiptLambdaUrlOrigin.lambda;
        this.logReceiptLambdaLogGroup = logReceiptLambdaUrlOrigin.logGroup;
        infof(
                "Created Lambda %s for logging receipts with handler %s",
                this.logReceiptLambda.getNode().getId(),
                props.lambdaEntry() + props.sharedNames().logReceiptLambdaHandler);

        // myReceipts Lambda
        var myReceiptsLambdaEnv = new PopulatedMap<String, String>()
                .with("DIY_SUBMIT_BASE_URL", props.sharedNames().envBaseUrl)
                .with("DIY_SUBMIT_RECEIPTS_BUCKET_NAME", props.sharedNames().receiptsBucketName);
        var myReceiptsLambdaUrlOrigin = new LambdaUrlOrigin(
                this,
                LambdaUrlOriginProps.builder()
                        .idPrefix(props.sharedNames().myReceiptsLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecrRepositoryArn)
                        .functionName(props.sharedNames().myReceiptsLambdaFunctionName)
                        .cloudFrontAllowedMethods(AllowedMethods.ALLOW_ALL)
                        .handler(props.lambdaEntry() + props.sharedNames().myReceiptsLambdaHandler)
                        .environment(myReceiptsLambdaEnv)
                        .timeout(Duration.millis(Long.parseLong("30000")))
                        .build());
        this.myReceiptsLambda = myReceiptsLambdaUrlOrigin.lambda;
        this.myReceiptsLambdaLogGroup = myReceiptsLambdaUrlOrigin.logGroup;
        infof(
                "Created Lambda %s for my receipts retrieval with handler %s",
                this.myReceiptsLambda.getNode().getId(),
                props.lambdaEntry() + props.sharedNames().myReceiptsLambdaHandler);

        // Grant the LogReceiptLambda and MyReceiptsLambda write and read access respectively to the receipts S3 bucket
        IBucket receiptsBucket = Bucket.fromBucketName(
                this, props.resourceNamePrefix() + "-ImportedReceiptsBucket", props.sharedNames().receiptsBucketName);
        receiptsBucket.grantWrite(this.logReceiptLambda);
        receiptsBucket.grantRead(this.myReceiptsLambda);

        // Create Function URLs for cross-region access
        var authUrlHmrcUrl = this.authUrlHmrcLambda.addFunctionUrl(FunctionUrlOptions.builder()
                .authType(functionUrlAuthType)
                .invokeMode(InvokeMode.BUFFERED)
                .build());
        var exchangeHmrcTokenUrl = this.exchangeHmrcTokenLambda.addFunctionUrl(FunctionUrlOptions.builder()
                .authType(functionUrlAuthType)
                .invokeMode(InvokeMode.BUFFERED)
                .build());
        var submitVatUrl = this.submitVatLambda.addFunctionUrl(FunctionUrlOptions.builder()
                .authType(functionUrlAuthType)
                .invokeMode(InvokeMode.BUFFERED)
                .build());
        var logReceiptUrl = this.logReceiptLambda.addFunctionUrl(FunctionUrlOptions.builder()
                .authType(functionUrlAuthType)
                .invokeMode(InvokeMode.BUFFERED)
                .build());
        var myReceiptsUrl = this.myReceiptsLambda.addFunctionUrl(FunctionUrlOptions.builder()
                .authType(functionUrlAuthType)
                .invokeMode(InvokeMode.BUFFERED)
                .build());

        Aspects.of(this).add(new SetAutoDeleteJobLogRetentionAspect(props.deploymentName(), RetentionDays.THREE_DAYS));

        cfnOutput(this, "AuthUrlHmrcLambdaArn", this.authUrlHmrcLambda.getFunctionArn());
        cfnOutput(this, "ExchangeHmrcTokenLambdaArn", this.exchangeHmrcTokenLambda.getFunctionArn());
        cfnOutput(this, "SubmitVatLambdaArn", this.submitVatLambda.getFunctionArn());
        cfnOutput(this, "LogReceiptLambdaArn", this.logReceiptLambda.getFunctionArn());
        cfnOutput(this, "MyReceiptsLambdaArn", this.myReceiptsLambda.getFunctionArn());

        // Output Function URLs for EdgeStack to use as HTTP origins
        cfnOutput(this, "AuthUrlHmrcLambdaUrl", authUrlHmrcUrl.getUrl());
        cfnOutput(this, "ExchangeHmrcTokenLambdaUrl", exchangeHmrcTokenUrl.getUrl());
        cfnOutput(this, "SubmitVatLambdaUrl", submitVatUrl.getUrl());
        cfnOutput(this, "LogReceiptLambdaUrl", logReceiptUrl.getUrl());
        cfnOutput(this, "MyReceiptsLambdaUrl", myReceiptsUrl.getUrl());

        infof("HmrcStack %s created successfully for %s", this.getNode().getId(), props.sharedNames().dashedDomainName);
    }
}
