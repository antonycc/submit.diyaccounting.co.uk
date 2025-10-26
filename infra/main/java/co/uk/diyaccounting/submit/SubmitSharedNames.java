package co.uk.diyaccounting.submit;

import static co.uk.diyaccounting.submit.utils.ResourceNameUtils.buildCognitoDomainName;
import static co.uk.diyaccounting.submit.utils.ResourceNameUtils.buildDashedDomainName;
import static co.uk.diyaccounting.submit.utils.ResourceNameUtils.buildEcrRepositoryName;
import static co.uk.diyaccounting.submit.utils.ResourceNameUtils.buildEnvironmentDomainName;
import static co.uk.diyaccounting.submit.utils.ResourceNameUtils.buildFunctionName;
import static co.uk.diyaccounting.submit.utils.ResourceNameUtils.buildVersionedDomainName;
import static co.uk.diyaccounting.submit.utils.ResourceNameUtils.convertDotSeparatedToDashSeparated;
import static co.uk.diyaccounting.submit.utils.ResourceNameUtils.generateCompressedResourceNamePrefix;
import static co.uk.diyaccounting.submit.utils.ResourceNameUtils.generateResourceNamePrefix;

import software.amazon.awscdk.services.apigatewayv2.HttpMethod;

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

    public String cognitoAuthUrlGetLambdaHandler;
    public String cognitoAuthUrlGetLambdaFunctionName;
    public String cognitoAuthUrlGetLambdaArn;
    public HttpMethod cognitoAuthUrlGetLambdaHttpMethod;
    public String cognitoAuthUrlGetLambdaUrlPath;

    public String cognitoTokenPostLambdaHandler;
    public String cognitoTokenPostLambdaFunctionName;
    public String cognitoTokenPostLambdaArn;
    public HttpMethod cognitoTokenPostLambdaHttpMethod;
    public String cognitoTokenPostLambdaUrlPath;

    public String hmrcAuthUrlGetLambdaHandler;
    public String hmrcAuthUrlGetLambdaFunctionName;
    public String hmrcAuthUrlGetLambdaArn;
    public HttpMethod hmrcAuthUrlGetLambdaHttpMethod;
    public String hmrcAuthUrlGetLambdaUrlPath;

    public String hmrcTokenPostLambdaHandler;
    public String hmrcTokenPostLambdaFunctionName;
    public String hmrcTokenPostLambdaArn;
    public HttpMethod hmrcTokenPostLambdaHttpMethod;
    public String hmrcTokenPostLambdaUrlPath;

    public String hmrcVatReturnPostLambdaHandler;
    public String hmrcVatReturnPostLambdaFunctionName;
    public String hmrcVatReturnPostLambdaArn;
    public HttpMethod hmrcVatReturnPostLambdaHttpMethod;
    public String hmrcVatReturnPostLambdaUrlPath;

    public String receiptPostLambdaHandler;
    public String receiptPostLambdaFunctionName;
    public String receiptPostLambdaArn;
    public HttpMethod receiptPostLambdaHttpMethod;
    public String receiptPostLambdaUrlPath;

    public String receiptGetLambdaHandler;
    public String receiptGetLambdaFunctionName;
    public String receiptGetLambdaArn;
    public HttpMethod receiptGetLambdaHttpMethod;
    public String receiptGetLambdaUrlPath;

    public String catalogGetLambdaHandler;
    public String catalogGetLambdaFunctionName;
    public String catalogGetLambdaArn;
    public HttpMethod catalogGetLambdaHttpMethod;
    public String catalogGetLambdaUrlPath;

    public String bundleGetLambdaHandler;
    public String bundleGetLambdaFunctionName;
    public String bundleGetLambdaArn;
    public HttpMethod bundleGetLambdaHttpMethod;
    public String bundleGetLambdaUrlPath;

    public String bundlePostLambdaHandler;
    public String bundlePostLambdaFunctionName;
    public String bundlePostLambdaArn;
    public HttpMethod bundlePostLambdaHttpMethod;
    public String bundlePostLambdaUrlPath;

    public String bundleDeleteLambdaHandler;
    public String bundleDeleteLambdaFunctionName;
    public String bundleDeleteLambdaArn;
    public HttpMethod bundleDeleteLambdaHttpMethod;
    public String bundleDeleteLambdaUrlPath;

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

        this.cognitoAuthUrlGetLambdaHandler = "cognitoAuthUrlGet.handler";
        this.cognitoAuthUrlGetLambdaFunctionName =
                buildFunctionName(this.appResourceNamePrefix, this.cognitoAuthUrlGetLambdaHandler);
        this.cognitoAuthUrlGetLambdaArn = "%s-cognito-auth-url-get".formatted(appLambdaArnPrefix);
        this.cognitoAuthUrlGetLambdaHttpMethod = HttpMethod.GET;
        this.cognitoAuthUrlGetLambdaUrlPath = "/api/cognito/authUrl-get";

        this.cognitoTokenPostLambdaHandler = "cognitoTokenPost.handler";
        this.cognitoTokenPostLambdaFunctionName =
                buildFunctionName(this.appResourceNamePrefix, this.cognitoTokenPostLambdaHandler);
        this.cognitoTokenPostLambdaArn = "%s-cognito-token-post".formatted(appLambdaArnPrefix);
        this.cognitoTokenPostLambdaHttpMethod = HttpMethod.POST;
        this.cognitoTokenPostLambdaUrlPath = "/api/cognito/token-post";

        this.hmrcAuthUrlGetLambdaHandler = "hmrcAuthUrlGet.handler";
        this.hmrcAuthUrlGetLambdaFunctionName =
                buildFunctionName(this.appResourceNamePrefix, this.hmrcAuthUrlGetLambdaHandler);
        this.hmrcAuthUrlGetLambdaArn = "%s-hmrc-auth-url-get".formatted(appLambdaArnPrefix);
        this.hmrcAuthUrlGetLambdaHttpMethod = HttpMethod.GET;
        this.hmrcAuthUrlGetLambdaUrlPath = "/api/hmrc/authUrl-get";

        this.hmrcTokenPostLambdaHandler = "hmrcTokenPost.handler";
        this.hmrcTokenPostLambdaFunctionName =
                buildFunctionName(this.appResourceNamePrefix, this.hmrcTokenPostLambdaHandler);
        this.hmrcTokenPostLambdaArn = "%s-hmrc-token-post".formatted(appLambdaArnPrefix);
        this.hmrcTokenPostLambdaHttpMethod = HttpMethod.POST;
        this.hmrcTokenPostLambdaUrlPath = "/api/hmrc/token-post";

        this.hmrcVatReturnPostLambdaHandler = "hmrcVatReturnPost.handler";
        this.hmrcVatReturnPostLambdaFunctionName =
                buildFunctionName(this.appResourceNamePrefix, this.hmrcVatReturnPostLambdaHandler);
        this.hmrcVatReturnPostLambdaArn = "%s-hmrc-vat-return".formatted(appLambdaArnPrefix);
        this.hmrcVatReturnPostLambdaHttpMethod = HttpMethod.POST;
        this.hmrcVatReturnPostLambdaUrlPath = "/api/hmrc/vat/return-post";

        this.receiptPostLambdaHandler = "hmrcReceiptPost.handler";
        this.receiptPostLambdaFunctionName =
                buildFunctionName(this.appResourceNamePrefix, this.receiptPostLambdaHandler);
        this.receiptPostLambdaArn = "%s-hmrc-receipt-post".formatted(appLambdaArnPrefix);
        this.receiptPostLambdaHttpMethod = HttpMethod.POST;
        this.receiptPostLambdaUrlPath = "/api/hmrc/receipt-post";

        this.receiptGetLambdaHandler = "hmrcReceiptGet.handler";
        this.receiptGetLambdaFunctionName = buildFunctionName(this.appResourceNamePrefix, this.receiptGetLambdaHandler);
        this.receiptGetLambdaArn = "%s-hmrc-receipt-get".formatted(appLambdaArnPrefix);
        this.receiptGetLambdaHttpMethod = HttpMethod.GET;
        this.receiptGetLambdaUrlPath = "/api/hmrc/receipt-get";

        this.catalogGetLambdaHandler = "catalogGet.handler";
        this.catalogGetLambdaFunctionName = buildFunctionName(this.appResourceNamePrefix, this.catalogGetLambdaHandler);
        this.catalogGetLambdaArn = "%s-catalog-get".formatted(appLambdaArnPrefix);
        this.catalogGetLambdaHttpMethod = HttpMethod.GET;
        this.catalogGetLambdaUrlPath = "/api/v1/catalog";

        this.bundleGetLambdaHandler = "bundleGet.handler";
        this.bundleGetLambdaFunctionName = buildFunctionName(this.appResourceNamePrefix, this.bundleGetLambdaHandler);
        this.bundleGetLambdaArn = "%s-bundle-get".formatted(appLambdaArnPrefix);
        this.bundleGetLambdaHttpMethod = HttpMethod.GET;
        this.bundleGetLambdaUrlPath = "/api/v1/bundle";

        this.bundlePostLambdaHandler = "bundlePost.handler";
        this.bundlePostLambdaFunctionName = buildFunctionName(this.appResourceNamePrefix, this.bundlePostLambdaHandler);
        this.bundlePostLambdaArn = "%s-bundle-post".formatted(appLambdaArnPrefix);
        this.bundlePostLambdaHttpMethod = HttpMethod.POST;
        this.bundlePostLambdaUrlPath = "/api/v1/bundle";

        this.bundleDeleteLambdaHandler = "bundleDelete.handler";
        this.bundleDeleteLambdaFunctionName =
                buildFunctionName(this.appResourceNamePrefix, this.bundleDeleteLambdaHandler);
        this.bundleDeleteLambdaArn = "%s-bundle-delete".formatted(appLambdaArnPrefix);
        this.bundleDeleteLambdaHttpMethod = HttpMethod.DELETE;
        this.bundleDeleteLambdaUrlPath = "/api/v1/bundle";

        this.lambdaArns = new java.util.ArrayList<>();
        this.lambdaArns.add(this.cognitoAuthUrlGetLambdaArn);
        this.lambdaArns.add(this.cognitoTokenPostLambdaArn);
        this.lambdaArns.add(this.hmrcAuthUrlGetLambdaArn);
        this.lambdaArns.add(this.hmrcTokenPostLambdaArn);
        this.lambdaArns.add(this.hmrcVatReturnPostLambdaArn);
        this.lambdaArns.add(this.receiptPostLambdaArn);
        this.lambdaArns.add(this.receiptGetLambdaArn);
        this.lambdaArns.add(this.catalogGetLambdaArn);
        this.lambdaArns.add(this.bundlePostLambdaArn);
        this.lambdaArns.add(this.bundleDeleteLambdaArn);
        this.lambdaArns.add(this.bundleGetLambdaArn);

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
