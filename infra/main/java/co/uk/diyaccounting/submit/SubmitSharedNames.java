package co.uk.diyaccounting.submit;

import software.amazon.awscdk.services.apigatewayv2.HttpMethod;

import static co.uk.diyaccounting.submit.utils.ResourceNameUtils.buildCognitoDomainName;
import static co.uk.diyaccounting.submit.utils.ResourceNameUtils.buildDashedDomainName;
import static co.uk.diyaccounting.submit.utils.ResourceNameUtils.buildEcrRepositoryName;
import static co.uk.diyaccounting.submit.utils.ResourceNameUtils.buildEnvironmentDomainName;
import static co.uk.diyaccounting.submit.utils.ResourceNameUtils.buildFunctionName;
import static co.uk.diyaccounting.submit.utils.ResourceNameUtils.buildVersionedDomainName;
import static co.uk.diyaccounting.submit.utils.ResourceNameUtils.convertDotSeparatedToDashSeparated;
import static co.uk.diyaccounting.submit.utils.ResourceNameUtils.generateCompressedResourceNamePrefix;
import static co.uk.diyaccounting.submit.utils.ResourceNameUtils.generateResourceNamePrefix;

public class SubmitSharedNames {

    public String domainName;
    public String envDomainName;
    public String cognitoDomainName;
    public String holdingDomainName;
    public String baseUrl;
    public String envBaseUrl;
    public String dashedDomainName;

    public String receiptsBucketName;
    public String holdingBucketName;
    public String originBucketName;
    public String originAccessLogBucketName;
    public String distributionAccessLogBucketName;
    public String ew2SelfDestructLogGroupName;
    public String ue1SelfDestructLogGroupName;
    public String webDeploymentLogGroupName;

    public String envDashedDomainName;
    public String envResourceNamePrefix;
    public String envCompressedResourceNamePrefix;
    public String observabilityStackId;
    public String observabilityUE1StackId;
    public String dataStackId;
    public String identityStackId;
    public String apexStackId;

    public String appResourceNamePrefix;
    public String appCompressedResourceNamePrefix;
    public String devStackId;
    public String authStackId;
    public String hmrcStackId;
    public String accountStackId;
    public String apiStackId;
    public String opsStackId;
    public String appSelfDestructStackId;
    public String ecrRepositoryArn;
    public String ecrRepositoryName;

    public String authUrlCognitoLambdaHandler;
    public String authUrlCognitoLambdaFunctionName;
    public String authUrlCognitoLambdaArn;
    public String authUrlCognitoLambdaUrlPath;

    public String exchangeCognitoTokenLambdaHandler;
    public String exchangeCognitoTokenLambdaFunctionName;
    public String exchangeCognitoTokenLambdaArn;
    public String exchangeCognitoTokenLambdaUrlPath;

    public String authUrlHmrcLambdaHandler;
    public String authUrlHmrcLambdaFunctionName;
    public String authUrlHmrcLambdaArn;
    public String authUrlHmrcLambdaUrlPath;

    public String exchangeHmrcTokenLambdaHandler;
    public String exchangeHmrcTokenLambdaFunctionName;
    public String exchangeHmrcTokenLambdaArn;
    public String exchangeHmrcTokenLambdaUrlPath;

    public String submitVatLambdaHandler;
    public String submitVatLambdaFunctionName;
    public String submitVatLambdaArn;
    public String submitVatLambdaUrlPath;

    public String logReceiptLambdaHandler;
    public String logReceiptLambdaFunctionName;
    public String logReceiptLambdaArn;
    public String logReceiptLambdaUrlPath;

    public String myReceiptsLambdaHandler;
    public String myReceiptsLambdaFunctionName;
    public String myReceiptsLambdaArn;
    public String myReceiptsLambdaUrlPath;

    public String catalogLambdaHandler;
    public String catalogLambdaFunctionName;
    public String catalogLambdaArn;
    public HttpMethod catalogLambdaHttpMethod;
    public String catalogLambdaUrlPath;

    public String requestBundlesLambdaHandler;
    public String requestBundlesLambdaFunctionName;
    public String requestBundlesLambdaArn;
    public String requestBundlesLambdaUrlPath;

    public String bundleDeleteLambdaHandler;
    public String bundleDeleteLambdaFunctionName;
    public String bundleDeleteLambdaArn;
    public String bundleDeleteLambdaUrlPath;

    public String myBundlesLambdaHandler;
    public String myBundlesLambdaFunctionName;
    public String myBundlesLambdaArn;
    public String myBundlesLambdaUrlPath;

    java.util.List<String> lambdaArns;

    public String delResourceNamePrefix;
    public String delCompressedResourceNamePrefix;
    public String edgeStackId;
    public String publishStackId;
    public String delSelfDestructStackId;

    public static class SubmitSharedNamesProps {
        public String hostedZoneName;
        public String envName;
        public String subDomainName;
        public String cognitoDomainPrefix;
        public String deploymentName;
        public String regionName;
        public String awsAccount;
    }

    private SubmitSharedNames() {}

    public SubmitSharedNames(SubmitSharedNamesProps props) {
        this();
        this.domainName = buildVersionedDomainName(props.deploymentName, props.subDomainName, props.hostedZoneName);
        this.cognitoDomainName = buildCognitoDomainName(
                props.envName, props.cognitoDomainPrefix, props.subDomainName, props.hostedZoneName);
        this.holdingDomainName = buildVersionedDomainName(
                "%s-holding".formatted(props.envName), props.subDomainName, props.hostedZoneName);
        this.baseUrl = "https://%s/".formatted(this.domainName);
        this.dashedDomainName = buildDashedDomainName(this.domainName);

        this.envDomainName = buildEnvironmentDomainName(props.envName, props.subDomainName, props.hostedZoneName);
        this.envBaseUrl = "https://%s/".formatted(this.envDomainName);
        this.envDashedDomainName = buildDashedDomainName(this.envDomainName);
        this.envResourceNamePrefix = "env-%s".formatted(generateResourceNamePrefix(this.envDomainName));
        this.envCompressedResourceNamePrefix =
                "e-%s".formatted(generateCompressedResourceNamePrefix(this.envDomainName));
        this.observabilityStackId = "env-%s-ObservabilityStack".formatted(props.envName);
        this.observabilityUE1StackId = "env-%s-ObservabilityUE1Stack".formatted(props.envName);
        this.dataStackId = "env-%s-DataStack".formatted(props.envName);
        this.identityStackId = "env-%s-IdentityStack".formatted(props.envName);
        this.apexStackId = "env-%s-ApexStack".formatted(props.envName);

        this.receiptsBucketName = "%s-receipts".formatted(this.envDashedDomainName);
        this.distributionAccessLogBucketName = "distribution-%s-logs".formatted(this.envDashedDomainName);

        this.ew2SelfDestructLogGroupName =
                "/aws/lambda/%s-self-destruct-eu-west-2".formatted(this.envResourceNamePrefix);
        this.ue1SelfDestructLogGroupName =
                "/aws/lambda/%s-self-destruct-us-east-1".formatted(this.envResourceNamePrefix);
        this.webDeploymentLogGroupName = "/deployment/%s-web-deployment".formatted(this.envResourceNamePrefix);

        this.appResourceNamePrefix = "app-%s".formatted(generateResourceNamePrefix(this.domainName));
        this.appCompressedResourceNamePrefix = "a-%s".formatted(generateCompressedResourceNamePrefix(this.domainName));
        this.devStackId = "app-%s-DevStack".formatted(props.deploymentName);
        this.authStackId = "app-%s-AuthStack".formatted(props.deploymentName);
        this.hmrcStackId = "app-%s-HmrcStack".formatted(props.deploymentName);
        this.accountStackId = "app-%s-AccountStack".formatted(props.deploymentName);
        this.apiStackId = "app-%s-ApiStack".formatted(props.deploymentName);
        this.opsStackId = "app-%s-OpsStack".formatted(props.deploymentName);
        this.appSelfDestructStackId = "app-%s-SelfDestructStack".formatted(props.deploymentName);
        this.ecrRepositoryArn = "arn:aws:ecr:%s:%s:repository/%s-ecr"
                .formatted(props.regionName, props.awsAccount, this.appResourceNamePrefix);
        this.ecrRepositoryName = buildEcrRepositoryName(this.appResourceNamePrefix);

        var appLambdaArnPrefix = "arn:aws:lambda:%s:%s:function:%s-"
                .formatted(props.regionName, props.awsAccount, this.appResourceNamePrefix);

        this.authUrlCognitoLambdaHandler = "cognitoAuthUrlGet.handler";
        this.authUrlCognitoLambdaFunctionName =
                buildFunctionName(this.appResourceNamePrefix, this.authUrlCognitoLambdaHandler);
        this.authUrlCognitoLambdaArn = "%s-cognito-auth-url-get".formatted(appLambdaArnPrefix);
        this.authUrlCognitoLambdaUrlPath = "/api/cognito/authUrl-get";

        this.exchangeCognitoTokenLambdaHandler = "cognitoTokenPost.handler";
        this.exchangeCognitoTokenLambdaFunctionName =
                buildFunctionName(this.appResourceNamePrefix, this.exchangeCognitoTokenLambdaHandler);
        this.exchangeCognitoTokenLambdaArn = "%s-cognito-token-post".formatted(appLambdaArnPrefix);
        this.exchangeCognitoTokenLambdaUrlPath = "/api/cognito/token-post";

        this.authUrlHmrcLambdaHandler = "hmrcAuthUrlGet.handler";
        this.authUrlHmrcLambdaFunctionName =
                buildFunctionName(this.appResourceNamePrefix, this.authUrlHmrcLambdaHandler);
        this.authUrlHmrcLambdaArn = "%s-hmrc-auth-url-get".formatted(appLambdaArnPrefix);
        this.authUrlHmrcLambdaUrlPath = "/api/hmrc/authUrl-get";

        this.exchangeHmrcTokenLambdaHandler = "hmrcTokenPost.handler";
        this.exchangeHmrcTokenLambdaFunctionName =
                buildFunctionName(this.appResourceNamePrefix, this.exchangeHmrcTokenLambdaHandler);
        this.exchangeHmrcTokenLambdaArn = "%s-hmrc-token-post".formatted(appLambdaArnPrefix);
        this.exchangeHmrcTokenLambdaUrlPath = "/api/hmrc/token-post";

        this.submitVatLambdaHandler = "hmrcVatReturnPost.handler";
        this.submitVatLambdaFunctionName = buildFunctionName(this.appResourceNamePrefix, this.submitVatLambdaHandler);
        this.submitVatLambdaArn = "%s-hmrc-vat-return".formatted(appLambdaArnPrefix);
        this.submitVatLambdaUrlPath = "/api/hmrc/vat/return-post";

        this.logReceiptLambdaHandler = "hmrcReceiptPost.handler";
        this.logReceiptLambdaFunctionName = buildFunctionName(this.appResourceNamePrefix, this.logReceiptLambdaHandler);
        this.logReceiptLambdaArn = "%s-hmrc-receipt-post".formatted(appLambdaArnPrefix);
        this.logReceiptLambdaUrlPath = "/api/hmrc/receipt-post";

        this.myReceiptsLambdaHandler = "hmrcReceiptGet.handler";
        this.myReceiptsLambdaFunctionName = buildFunctionName(this.appResourceNamePrefix, this.myReceiptsLambdaHandler);
        this.myReceiptsLambdaArn = "%s-hmrc-receipt-get".formatted(appLambdaArnPrefix);
        this.myReceiptsLambdaUrlPath = "/api/hmrc/receipt-get";

        this.catalogLambdaHandler = "catalogGet.handler";
        this.catalogLambdaFunctionName = buildFunctionName(this.appResourceNamePrefix, this.catalogLambdaHandler);
        this.catalogLambdaArn = "%s-catalog-get".formatted(appLambdaArnPrefix);
        this.catalogLambdaHttpMethod = HttpMethod.GET;
        this.catalogLambdaUrlPath = "/catalog";

        this.requestBundlesLambdaHandler = "bundlePost.handler";
        this.requestBundlesLambdaFunctionName =
                buildFunctionName(this.appResourceNamePrefix, this.requestBundlesLambdaHandler);
        this.requestBundlesLambdaArn = "%s-bundle-post".formatted(appLambdaArnPrefix);
        this.requestBundlesLambdaUrlPath = "/api/bundle-post";

        this.bundleDeleteLambdaHandler = "bundleDelete.handler";
        this.bundleDeleteLambdaFunctionName =
                buildFunctionName(this.appResourceNamePrefix, this.bundleDeleteLambdaHandler);
        this.bundleDeleteLambdaArn = "%s-bundle-delete".formatted(appLambdaArnPrefix);
        this.bundleDeleteLambdaUrlPath = "/api/bundle-delete";

        this.myBundlesLambdaHandler = "bundleGet.handler";
        this.myBundlesLambdaFunctionName = buildFunctionName(this.appResourceNamePrefix, this.myBundlesLambdaHandler);
        this.myBundlesLambdaArn = "%s-bundle-get".formatted(appLambdaArnPrefix);
        this.myBundlesLambdaUrlPath = "/api/bundle-get";

        this.lambdaArns = new java.util.ArrayList<>();
        this.lambdaArns.add(this.authUrlCognitoLambdaArn);
        this.lambdaArns.add(this.exchangeCognitoTokenLambdaArn);
        this.lambdaArns.add(this.authUrlHmrcLambdaArn);
        this.lambdaArns.add(this.exchangeHmrcTokenLambdaArn);
        this.lambdaArns.add(this.submitVatLambdaArn);
        this.lambdaArns.add(this.logReceiptLambdaArn);
        this.lambdaArns.add(this.myReceiptsLambdaArn);
        this.lambdaArns.add(this.catalogLambdaArn);
        this.lambdaArns.add(this.requestBundlesLambdaArn);
        this.lambdaArns.add(this.bundleDeleteLambdaArn);
        this.lambdaArns.add(this.myBundlesLambdaArn);

        this.delResourceNamePrefix = "del-%s".formatted(generateResourceNamePrefix(this.domainName));
        this.delCompressedResourceNamePrefix = "d-%s".formatted(generateCompressedResourceNamePrefix(this.domainName));
        this.edgeStackId = "del-%s-EdgeStack".formatted(props.deploymentName);
        this.publishStackId = "del-%s-PublishStack".formatted(props.deploymentName);
        this.delSelfDestructStackId = "del-%s-SelfDestructStack".formatted(props.deploymentName);

        this.holdingBucketName = convertDotSeparatedToDashSeparated("holding-" + this.envResourceNamePrefix);
        this.originBucketName = convertDotSeparatedToDashSeparated("origin-" + this.delResourceNamePrefix);
        this.originAccessLogBucketName = "origin-%s-access-logs".formatted(this.delResourceNamePrefix);
    }
}
