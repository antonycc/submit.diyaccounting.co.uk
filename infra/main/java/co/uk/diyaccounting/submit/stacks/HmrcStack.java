package co.uk.diyaccounting.submit.stacks;

import co.uk.diyaccounting.submit.constructs.LambdaUrlOrigin;
import co.uk.diyaccounting.submit.constructs.LambdaUrlOriginProps;
import org.immutables.value.Value;
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
import software.amazon.awscdk.services.s3.Bucket;
import software.amazon.awscdk.services.s3.IBucket;
import software.amazon.awscdk.services.secretsmanager.Secret;
import software.amazon.awssdk.utils.StringUtils;
import software.constructs.Construct;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static co.uk.diyaccounting.submit.utils.Kind.infof;
import static co.uk.diyaccounting.submit.utils.KindCdk.cfnOutput;
import static co.uk.diyaccounting.submit.utils.ResourceNameUtils.buildFunctionName;

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
        String dashedDomainName();

        @Override
        String domainName();

        @Override
        String baseUrl();

        @Override
        String cloudTrailEnabled();

        String baseImageTag();

        String ecrRepositoryArn();

        String ecrRepositoryName();

        String lambdaUrlAuthType();

        String lambdaEntry();

        String hmrcBaseUri();

        String hmrcClientId();

        String hmrcClientSecretArn();

        String receiptsBucketFullName();

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
        var authUrlHmrcLambdaEnv = new HashMap<>(Map.of(
                "DIY_SUBMIT_BASE_URL", props.baseUrl(),
                "HMRC_BASE_URI", props.hmrcBaseUri(),
                "HMRC_CLIENT_ID", props.hmrcClientId()));
        var authUrlHmrcLambdaUrlOriginFunctionHandler = "authUrl.httpGetHmrc";
        var authUrlHmrcLambdaUrlOriginFunctionName = buildFunctionName(props.compressedResourceNamePrefix(), authUrlHmrcLambdaUrlOriginFunctionHandler);
        var authUrlHmrcLambdaUrlOrigin = new LambdaUrlOrigin(
                this,
                LambdaUrlOriginProps.builder()
                        .idPrefix(authUrlHmrcLambdaUrlOriginFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.ecrRepositoryName())
                        .ecrRepositoryArn(props.ecrRepositoryArn())
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
                this.authUrlHmrcLambda.getNode().getId(), props.lambdaEntry() + authUrlHmrcLambdaUrlOriginFunctionHandler);

        // exchangeToken - HMRC
        Map<String, String> exchangeHmrcEnvBase = new HashMap<>(Map.of(
                "DIY_SUBMIT_BASE_URL", props.baseUrl(),
                "HMRC_BASE_URI", props.hmrcBaseUri(),
                "HMRC_CLIENT_ID", props.hmrcClientId()));
        if (StringUtils.isNotBlank(props.hmrcClientSecretArn())) {
            exchangeHmrcEnvBase.put("HMRC_CLIENT_SECRET_ARN", props.hmrcClientSecretArn());
        }
        if (props.optionalTestAccessToken().isPresent()
                && StringUtils.isNotBlank(props.optionalTestAccessToken().get())) {
            exchangeHmrcEnvBase.put(
                    "TEST_ACCESS_TOKEN",
                    props.optionalTestAccessToken().get());
        }
        var exchangeHmrcTokenLambdaUrlOriginFunctionHandler = "exchangeToken.httpPostHmrc";
        var exchangeHmrcTokenLambdaUrlOriginFunctionName =
                buildFunctionName(props.compressedResourceNamePrefix(), exchangeHmrcTokenLambdaUrlOriginFunctionHandler);
        var exchangeHmrcTokenLambdaUrlOrigin = new LambdaUrlOrigin(
                this,
                LambdaUrlOriginProps.builder()
                        .idPrefix(exchangeHmrcTokenLambdaUrlOriginFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.ecrRepositoryName())
                        .ecrRepositoryArn(props.ecrRepositoryArn())
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
                this.exchangeHmrcTokenLambda.getNode().getId(), props.lambdaEntry() + exchangeHmrcTokenLambdaUrlOriginFunctionHandler);

        // submitVat
        var submitVatLambdaEnv = new HashMap<>(Map.of(
                "DIY_SUBMIT_BASE_URL", props.baseUrl(),
                "HMRC_BASE_URI", props.hmrcBaseUri()));
        var submitVatLambdaUrlOriginFunctionHandler = "submitVat.httpPost";
        var submitVatLambdaUrlOriginFunctionName = buildFunctionName(props.compressedResourceNamePrefix(), submitVatLambdaUrlOriginFunctionHandler);
        var submitVatLambdaUrlOrigin = new LambdaUrlOrigin(
                this,
                LambdaUrlOriginProps.builder()
                        .idPrefix(submitVatLambdaUrlOriginFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.ecrRepositoryName())
                        .ecrRepositoryArn(props.ecrRepositoryArn())
                        .functionName(submitVatLambdaUrlOriginFunctionName)
                        .cloudFrontAllowedMethods(AllowedMethods.ALLOW_ALL)
                        .handler(props.lambdaEntry() + submitVatLambdaUrlOriginFunctionHandler)
                        .environment(submitVatLambdaEnv)
                        .timeout(Duration.millis(Long.parseLong("60000")))
                        .build());
        this.submitVatLambda = submitVatLambdaUrlOrigin.lambda;
        this.submitVatLambdaLogGroup = submitVatLambdaUrlOrigin.logGroup;
        infof(
                "Created Lambda %s for VAT submission with handler %s",
                this.submitVatLambda.getNode().getId(), props.lambdaEntry() + submitVatLambdaUrlOriginFunctionHandler);

        var logReceiptLambdaEnv = new HashMap<>(Map.of(
            "DIY_SUBMIT_BASE_URL", props.baseUrl(),
            "DIY_SUBMIT_RECEIPTS_BUCKET_FULL_NAME", props.receiptsBucketFullName()));
        if (props.optionalTestS3Endpoint().isPresent()
            && StringUtils.isNotBlank(props.optionalTestS3Endpoint().get())
            && props.optionalTestS3AccessKey().isPresent()
            && StringUtils.isNotBlank(props.optionalTestS3AccessKey().get())
            && props.optionalTestS3SecretKey().isPresent()
            && StringUtils.isNotBlank(props.optionalTestS3SecretKey().get())) {
            // For production like integrations without AWS we can use test S3 credentials
            var logReceiptLambdaTestEnv = new HashMap<>(Map.of(
                "TEST_S3_ENDPOINT",
                props.optionalTestS3Endpoint().get(),
                "TEST_S3_ACCESS_KEY",
                props.optionalTestS3AccessKey().get(),
                "TEST_S3_SECRET_KEY",
                props.optionalTestS3SecretKey().get()));
            logReceiptLambdaEnv.putAll(logReceiptLambdaTestEnv);
        }
        var logReceiptLambdaUrlOriginFunctionHandler = "logReceipt.httpPost";
        var logReceiptLambdaUrlOriginFunctionName =
            buildFunctionName(props.compressedResourceNamePrefix(), logReceiptLambdaUrlOriginFunctionHandler);
        var logReceiptLambdaUrlOrigin = new LambdaUrlOrigin(
            this,
            LambdaUrlOriginProps.builder()
                .idPrefix(logReceiptLambdaUrlOriginFunctionName)
                .baseImageTag(props.baseImageTag())
                .ecrRepositoryName(props.ecrRepositoryName())
                .ecrRepositoryArn(props.ecrRepositoryArn())
                .functionName(logReceiptLambdaUrlOriginFunctionName)
                .cloudFrontAllowedMethods(AllowedMethods.ALLOW_ALL)
                .handler(props.lambdaEntry() + logReceiptLambdaUrlOriginFunctionHandler)
                .environment(logReceiptLambdaEnv)
                .timeout(Duration.millis(Long.parseLong("30000")))
                .build());
        this.logReceiptLambda = logReceiptLambdaUrlOrigin.lambda;
        this.logReceiptLambdaLogGroup = logReceiptLambdaUrlOrigin.logGroup;
        infof(
            "Created Lambda %s for logging receipts with handler %s",
            this.logReceiptLambda.getNode().getId(), props.lambdaEntry() + logReceiptLambdaUrlOriginFunctionHandler);

        // myReceipts Lambda
        var myReceiptsLambdaEnv = new HashMap<>(Map.of(
                "DIY_SUBMIT_BASE_URL", props.baseUrl(),
                "DIY_SUBMIT_RECEIPTS_BUCKET_FULL_NAME", props.receiptsBucketFullName()));
        var myReceiptsLambdaUrlOriginFunctionHandler = "myReceipts.httpGet";
        var myReceiptsLambdaUrlOriginFunctionName = buildFunctionName(props.compressedResourceNamePrefix(), myReceiptsLambdaUrlOriginFunctionHandler);
        var myReceiptsLambdaUrlOrigin = new LambdaUrlOrigin(
                this,
                LambdaUrlOriginProps.builder()
                        .idPrefix(myReceiptsLambdaUrlOriginFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.ecrRepositoryName())
                        .ecrRepositoryArn(props.ecrRepositoryArn())
                        .functionName(myReceiptsLambdaUrlOriginFunctionName)
                        .cloudFrontAllowedMethods(AllowedMethods.ALLOW_ALL)
                        .handler(props.lambdaEntry() + myReceiptsLambdaUrlOriginFunctionHandler)
                        .environment(myReceiptsLambdaEnv)
                        .timeout(Duration.millis(Long.parseLong("30000")))
                        .build());
        this.myReceiptsLambda = myReceiptsLambdaUrlOrigin.lambda;
        this.myReceiptsLambdaLogGroup = myReceiptsLambdaUrlOrigin.logGroup;
        infof(
                "Created Lambda %s for my receipts retrieval with handler %s",
                this.myReceiptsLambda.getNode().getId(), props.lambdaEntry() + myReceiptsLambdaUrlOriginFunctionHandler);

        // Grant the LogReceiptLambda and MyReceiptsLambda write and read access respectively to the receipts S3 bucket
        IBucket receiptsBucket = Bucket.fromBucketName(
                this,
                props.resourceNamePrefix() + "-ImportedReceiptsBucket",
                props.receiptsBucketFullName());
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

        infof("HmrcStack %s created successfully for %s", this.getNode().getId(), props.dashedDomainName());
    }
}
