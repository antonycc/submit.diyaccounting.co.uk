package co.uk.diyaccounting.submit.stacks;

import static co.uk.diyaccounting.submit.utils.Kind.infof;
import static co.uk.diyaccounting.submit.utils.KindCdk.cfnOutput;

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
import software.amazon.awssdk.utils.StringUtils;
import software.constructs.Construct;

public class HmrcStack extends Stack {

    // CDK resources here
    public Function hmrcAuthUrlGetLambda;
    public LogGroup hmrcAuthUrlGetLambdaLogGroup;
    public Function hmrcTokenPostLambda;
    public LogGroup hmrcTokenPostLambdaLogGroup;
    public Function hmrcVatReturnPostLambda;
    public LogGroup hmrcVatReturnPostLambdaLogGroup;
    public Function receiptPostLambda;
    public LogGroup receiptPostLambdaLogGroup;
    public Function receiptGetLambda;
    public LogGroup receiptGetLambdaLogGroup;

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
        var authUrlHmrcLambdaUrlOrigin = new LambdaUrlOrigin(
                this,
                LambdaUrlOriginProps.builder()
                        .idPrefix(props.sharedNames().hmrcAuthUrlGetLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecrRepositoryArn)
                        .functionName(props.sharedNames().hmrcAuthUrlGetLambdaFunctionName)
                        .cloudFrontAllowedMethods(AllowedMethods.ALLOW_GET_HEAD_OPTIONS)
                        .handler(props.lambdaEntry() + props.sharedNames().hmrcAuthUrlGetLambdaHandler)
                        .environment(authUrlHmrcLambdaEnv)
                        .timeout(Duration.millis(Long.parseLong("30000")))
                        .build());
        this.hmrcAuthUrlGetLambda = authUrlHmrcLambdaUrlOrigin.lambda;
        this.hmrcAuthUrlGetLambdaLogGroup = authUrlHmrcLambdaUrlOrigin.logGroup;
        infof(
                "Created Lambda %s for HMRC auth URL with handler %s",
                this.hmrcAuthUrlGetLambda.getNode().getId(),
                props.lambdaEntry() + props.sharedNames().hmrcAuthUrlGetLambdaHandler);

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

        var exchangeHmrcTokenLambdaUrlOrigin = new LambdaUrlOrigin(
                this,
                LambdaUrlOriginProps.builder()
                        .idPrefix(props.sharedNames().hmrcTokenPostLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecrRepositoryArn)
                        .functionName(props.sharedNames().hmrcTokenPostLambdaFunctionName)
                        .cloudFrontAllowedMethods(AllowedMethods.ALLOW_ALL)
                        .handler(props.lambdaEntry() + props.sharedNames().hmrcTokenPostLambdaHandler)
                        .environment(exchangeHmrcEnvBase)
                        .timeout(Duration.millis(Long.parseLong("30000")))
                        .build());
        this.hmrcTokenPostLambda = exchangeHmrcTokenLambdaUrlOrigin.lambda;
        this.hmrcTokenPostLambdaLogGroup = exchangeHmrcTokenLambdaUrlOrigin.logGroup;

        // Grant access to HMRC client secret in Secrets Manager
        if (StringUtils.isNotBlank(props.hmrcClientSecretArn())) {
            // Use the provided ARN with wildcard suffix to handle AWS Secrets Manager's automatic suffix
            String secretArnWithWildcard = props.hmrcClientSecretArn().endsWith("-*")
                    ? props.hmrcClientSecretArn()
                    : props.hmrcClientSecretArn() + "-*";
            this.hmrcTokenPostLambda.addToRolePolicy(PolicyStatement.Builder.create()
                    .effect(Effect.ALLOW)
                    .actions(List.of("secretsmanager:GetSecretValue"))
                    .resources(List.of(secretArnWithWildcard))
                    .build());
            infof(
                    "Granted Secrets Manager access to %s for secret %s (with wildcard: %s)",
                    this.hmrcTokenPostLambda.getFunctionName(), props.hmrcClientSecretArn(), secretArnWithWildcard);
        }

        infof(
                "Created Lambda %s for HMRC exchange token with handler %s",
                this.hmrcTokenPostLambda.getNode().getId(),
                props.lambdaEntry() + props.sharedNames().hmrcTokenPostLambdaHandler);

        // submitVat
        var submitVatLambdaEnv = new PopulatedMap<String, String>()
                .with("DIY_SUBMIT_BASE_URL", props.sharedNames().envBaseUrl)
                .with("COGNITO_USER_POOL_ID", props.cognitoUserPoolId())
                .with("HMRC_BASE_URI", props.hmrcBaseUri());
        var submitVatLambdaUrlOrigin = new LambdaUrlOrigin(
                this,
                LambdaUrlOriginProps.builder()
                        .idPrefix(props.sharedNames().hmrcVatReturnPostLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecrRepositoryArn)
                        .functionName(props.sharedNames().hmrcVatReturnPostLambdaFunctionName)
                        .cloudFrontAllowedMethods(AllowedMethods.ALLOW_ALL)
                        .handler(props.lambdaEntry() + props.sharedNames().hmrcVatReturnPostLambdaHandler)
                        .environment(submitVatLambdaEnv)
                        .timeout(Duration.millis(Long.parseLong("60000")))
                        .build());
        this.hmrcVatReturnPostLambda = submitVatLambdaUrlOrigin.lambda;
        this.hmrcVatReturnPostLambdaLogGroup = submitVatLambdaUrlOrigin.logGroup;
        infof(
                "Created Lambda %s for VAT submission with handler %s",
                this.hmrcVatReturnPostLambda.getNode().getId(),
                props.lambdaEntry() + props.sharedNames().hmrcVatReturnPostLambdaHandler);

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
                        .idPrefix(props.sharedNames().receiptPostLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecrRepositoryArn)
                        .functionName(props.sharedNames().receiptPostLambdaFunctionName)
                        .cloudFrontAllowedMethods(AllowedMethods.ALLOW_ALL)
                        .handler(props.lambdaEntry() + props.sharedNames().receiptPostLambdaHandler)
                        .environment(logReceiptLambdaEnv)
                        .timeout(Duration.millis(Long.parseLong("30000")))
                        .build());
        this.receiptPostLambda = logReceiptLambdaUrlOrigin.lambda;
        this.receiptPostLambdaLogGroup = logReceiptLambdaUrlOrigin.logGroup;
        infof(
                "Created Lambda %s for logging receipts with handler %s",
                this.receiptPostLambda.getNode().getId(),
                props.lambdaEntry() + props.sharedNames().receiptPostLambdaHandler);

        // myReceipts Lambda
        var myReceiptsLambdaEnv = new PopulatedMap<String, String>()
                .with("DIY_SUBMIT_BASE_URL", props.sharedNames().envBaseUrl)
                .with("DIY_SUBMIT_RECEIPTS_BUCKET_NAME", props.sharedNames().receiptsBucketName);
        var myReceiptsLambdaUrlOrigin = new LambdaUrlOrigin(
                this,
                LambdaUrlOriginProps.builder()
                        .idPrefix(props.sharedNames().receiptGetLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecrRepositoryArn)
                        .functionName(props.sharedNames().receiptGetLambdaFunctionName)
                        .cloudFrontAllowedMethods(AllowedMethods.ALLOW_ALL)
                        .handler(props.lambdaEntry() + props.sharedNames().receiptGetLambdaHandler)
                        .environment(myReceiptsLambdaEnv)
                        .timeout(Duration.millis(Long.parseLong("30000")))
                        .build());
        this.receiptGetLambda = myReceiptsLambdaUrlOrigin.lambda;
        this.receiptGetLambdaLogGroup = myReceiptsLambdaUrlOrigin.logGroup;
        infof(
                "Created Lambda %s for my receipts retrieval with handler %s",
                this.receiptGetLambda.getNode().getId(),
                props.lambdaEntry() + props.sharedNames().receiptGetLambdaHandler);

        // Grant the LogReceiptLambda and MyReceiptsLambda write and read access respectively to the receipts S3 bucket
        IBucket receiptsBucket = Bucket.fromBucketName(
                this, props.resourceNamePrefix() + "-ImportedReceiptsBucket", props.sharedNames().receiptsBucketName);
        receiptsBucket.grantWrite(this.receiptPostLambda);
        receiptsBucket.grantRead(this.receiptGetLambda);

        // Create Function URLs for cross-region access
        var authUrlHmrcUrl = this.hmrcAuthUrlGetLambda.addFunctionUrl(FunctionUrlOptions.builder()
                .authType(functionUrlAuthType)
                .invokeMode(InvokeMode.BUFFERED)
                .build());
        var exchangeHmrcTokenUrl = this.hmrcTokenPostLambda.addFunctionUrl(FunctionUrlOptions.builder()
                .authType(functionUrlAuthType)
                .invokeMode(InvokeMode.BUFFERED)
                .build());
        var submitVatUrl = this.hmrcVatReturnPostLambda.addFunctionUrl(FunctionUrlOptions.builder()
                .authType(functionUrlAuthType)
                .invokeMode(InvokeMode.BUFFERED)
                .build());
        var logReceiptUrl = this.receiptPostLambda.addFunctionUrl(FunctionUrlOptions.builder()
                .authType(functionUrlAuthType)
                .invokeMode(InvokeMode.BUFFERED)
                .build());
        var myReceiptsUrl = this.receiptGetLambda.addFunctionUrl(FunctionUrlOptions.builder()
                .authType(functionUrlAuthType)
                .invokeMode(InvokeMode.BUFFERED)
                .build());

        Aspects.of(this).add(new SetAutoDeleteJobLogRetentionAspect(props.deploymentName(), RetentionDays.THREE_DAYS));

        cfnOutput(this, "AuthUrlHmrcLambdaArn", this.hmrcAuthUrlGetLambda.getFunctionArn());
        cfnOutput(this, "ExchangeHmrcTokenLambdaArn", this.hmrcTokenPostLambda.getFunctionArn());
        cfnOutput(this, "SubmitVatLambdaArn", this.hmrcVatReturnPostLambda.getFunctionArn());
        cfnOutput(this, "LogReceiptLambdaArn", this.receiptPostLambda.getFunctionArn());
        cfnOutput(this, "MyReceiptsLambdaArn", this.receiptGetLambda.getFunctionArn());

        // Output Function URLs for EdgeStack to use as HTTP origins
        cfnOutput(this, "AuthUrlHmrcLambdaUrl", authUrlHmrcUrl.getUrl());
        cfnOutput(this, "ExchangeHmrcTokenLambdaUrl", exchangeHmrcTokenUrl.getUrl());
        cfnOutput(this, "SubmitVatLambdaUrl", submitVatUrl.getUrl());
        cfnOutput(this, "LogReceiptLambdaUrl", logReceiptUrl.getUrl());
        cfnOutput(this, "MyReceiptsLambdaUrl", myReceiptsUrl.getUrl());

        infof("HmrcStack %s created successfully for %s", this.getNode().getId(), props.sharedNames().dashedDomainName);
    }
}
