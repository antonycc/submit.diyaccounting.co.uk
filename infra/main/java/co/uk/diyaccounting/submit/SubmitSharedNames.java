package co.uk.diyaccounting.submit;

import co.uk.diyaccounting.submit.utils.ResourceNameUtils;
import software.amazon.awscdk.services.apigatewayv2.HttpMethod;

import static co.uk.diyaccounting.submit.utils.ResourceNameUtils.buildDashedDomainName;
import static co.uk.diyaccounting.submit.utils.ResourceNameUtils.convertDotSeparatedToDashSeparated;
import static co.uk.diyaccounting.submit.utils.ResourceNameUtils.generateCompressedResourceNamePrefix;
import static co.uk.diyaccounting.submit.utils.ResourceNameUtils.generateResourceNamePrefix;

public class SubmitSharedNames {

    public String deploymentDomainName;
    public String envDomainName;
    public String cognitoDomainName;
    public String holdingDomainName;
    public String baseUrl;
    public String envBaseUrl;
    public String dashedDeploymentDomainName;
    public String cognitoBaseUri;
    public String trailName;

    public String receiptsBucketName;
    public String holdingBucketName;
    public String originBucketName;
    public String originAccessLogBucketName;
    public String distributionAccessLogBucketName;
    public String ew2SelfDestructLogGroupName;
    public String ue1SelfDestructLogGroupName;
    public String webDeploymentLogGroupName;
    public String apiAccessLogGroupName;

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
    public String ecrLogGroupName;
    public String ecrPublishRoleName;

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

    public String hmrcVatObligationGetLambdaHandler;
    public String hmrcVatObligationGetLambdaFunctionName;
    public String hmrcVatObligationGetLambdaArn;
    public HttpMethod hmrcVatObligationGetLambdaHttpMethod;
    public String hmrcVatObligationGetLambdaUrlPath;

    public String hmrcVatLiabilityGetLambdaHandler;
    public String hmrcVatLiabilityGetLambdaFunctionName;
    public String hmrcVatLiabilityGetLambdaArn;
    public HttpMethod hmrcVatLiabilityGetLambdaHttpMethod;
    public String hmrcVatLiabilityGetLambdaUrlPath;

    public String hmrcVatPaymentGetLambdaHandler;
    public String hmrcVatPaymentGetLambdaFunctionName;
    public String hmrcVatPaymentGetLambdaArn;
    public HttpMethod hmrcVatPaymentGetLambdaHttpMethod;
    public String hmrcVatPaymentGetLambdaUrlPath;

    public String hmrcVatPenaltyGetLambdaHandler;
    public String hmrcVatPenaltyGetLambdaFunctionName;
    public String hmrcVatPenaltyGetLambdaArn;
    public HttpMethod hmrcVatPenaltyGetLambdaHttpMethod;
    public String hmrcVatPenaltyGetLambdaUrlPath;

    public String hmrcVatReturnGetLambdaHandler;
    public String hmrcVatReturnGetLambdaFunctionName;
    public String hmrcVatReturnGetLambdaArn;
    public HttpMethod hmrcVatReturnGetLambdaHttpMethod;
    public String hmrcVatReturnGetLambdaUrlPath;

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

    public String delResourceNamePrefix;
    public String delCompressedResourceNamePrefix;
    public String edgeStackId;
    public String publishStackId;
    public String delSelfDestructStackId;

    public static class SubmitSharedNamesProps {
        public String hostedZoneName;
        public String envName;
        public String subDomainName;
        public String deploymentName;
        public String regionName;
        public String awsAccount;
    }

    private SubmitSharedNames() {}

    public SubmitSharedNames(SubmitSharedNamesProps props) {
        this();
        this.envDomainName = props.envName.equals("prod")
            ? "%s.%s".formatted(props.subDomainName, props.hostedZoneName)
            : "%s.%s.%s".formatted(props.envName, props.subDomainName, props.hostedZoneName);
        this.cognitoDomainName = "%s-auth.%s.%s".formatted(props.envName, props.subDomainName, props.hostedZoneName);
        this.holdingDomainName = "%s-holding.%s.%s".formatted(props.envName, props.subDomainName, props.hostedZoneName);
        this.deploymentDomainName = "%s.%s.%s".formatted(props.deploymentName, props.subDomainName, props.hostedZoneName); // TODO -> deploymentDomainName

        this.baseUrl = "https://%s/".formatted(this.deploymentDomainName);
        this.dashedDeploymentDomainName = buildDashedDomainName(this.deploymentDomainName);

        this.envBaseUrl = "https://%s/".formatted(this.envDomainName);
        this.envDashedDomainName = buildDashedDomainName(this.envDomainName);
        this.envResourceNamePrefix = "%s-env".formatted(generateResourceNamePrefix(this.envDomainName));
        this.envCompressedResourceNamePrefix = "%s-e".formatted(generateCompressedResourceNamePrefix(this.envDomainName));
        this.observabilityStackId = "%s-env-ObservabilityStack".formatted(props.envName);
        this.observabilityUE1StackId = "%s-env-ObservabilityUE1Stack".formatted(props.envName);
        this.dataStackId = "%s-env-DataStack".formatted(props.envName);
        this.identityStackId = "%s-env-IdentityStack".formatted(props.envName);
        this.apexStackId = "%s-env-ApexStack".formatted(props.envName);
        this.cognitoBaseUri = "https://%s".formatted(this.cognitoDomainName);

        this.receiptsBucketName = "%s-receipts".formatted(this.envDashedDomainName);
        this.distributionAccessLogBucketName = "distribution-%s-logs".formatted(this.envDashedDomainName);

        this.ew2SelfDestructLogGroupName = "/aws/lambda/%s-self-destruct-eu-west-2".formatted(this.envResourceNamePrefix);
        this.ue1SelfDestructLogGroupName = "/aws/lambda/%s-self-destruct-us-east-1".formatted(this.envResourceNamePrefix);
        this.webDeploymentLogGroupName = "/deployment/%s-web-deployment".formatted(this.envResourceNamePrefix);
        this.apiAccessLogGroupName = "/aws/apigw/%s/access".formatted(this.envResourceNamePrefix);

        this.appResourceNamePrefix = "%s-app".formatted(generateResourceNamePrefix(this.deploymentDomainName));
        this.appCompressedResourceNamePrefix = "%s-a".formatted(generateCompressedResourceNamePrefix(this.deploymentDomainName));
        this.devStackId = "%s-app-DevStack".formatted(props.deploymentName);
        this.authStackId = "%s-app-AuthStack".formatted(props.deploymentName);
        this.hmrcStackId = "%s-app-HmrcStack".formatted(props.deploymentName);
        this.accountStackId = "%s-app-AccountStack".formatted(props.deploymentName);
        this.apiStackId = "%s-app-ApiStack".formatted(props.deploymentName);
        this.opsStackId = "%s-app-OpsStack".formatted(props.deploymentName);
        this.appSelfDestructStackId = "%s-app-SelfDestructStack".formatted(props.deploymentName);
        this.ecrRepositoryArn = "arn:aws:ecr:%s:%s:repository/%s-ecr".formatted(props.regionName, props.awsAccount, this.appResourceNamePrefix);
        this.ecrRepositoryName = "%s-ecr".formatted(this.appResourceNamePrefix);
        this.ecrLogGroupName = "/aws/ecr/%s".formatted(this.appResourceNamePrefix);
        this.ecrPublishRoleName = "%s-ecr-publish-role".formatted(appResourceNamePrefix);

        this.delResourceNamePrefix = "%s-del".formatted(generateResourceNamePrefix(this.deploymentDomainName));
        this.delCompressedResourceNamePrefix = "%s-d".formatted(generateCompressedResourceNamePrefix(this.deploymentDomainName));
        this.edgeStackId = "%s-del-EdgeStack".formatted(props.deploymentName);
        this.publishStackId = "%s-del-PublishStack".formatted(props.deploymentName);
        this.delSelfDestructStackId = "%s-del-SelfDestructStack".formatted(props.deploymentName);

        this.trailName = "%s-trail".formatted(this.envResourceNamePrefix );
        this.holdingBucketName = convertDotSeparatedToDashSeparated("holding-" + this.envResourceNamePrefix);
        this.originBucketName = convertDotSeparatedToDashSeparated("origin-" + this.delResourceNamePrefix);
        this.originAccessLogBucketName = "%s-origin-access-logs".formatted(this.delResourceNamePrefix);

        var appLambdaHandlerPrefix = "app/functions";
        var appLambdaArnPrefix = "arn:aws:lambda:%s:%s:function:%s".formatted(props.regionName, props.awsAccount, this.appResourceNamePrefix);
        var appCompressedLambdaArnPrefix = "arn:aws:lambda:%s:%s:function:%s".formatted(props.regionName, props.awsAccount, this.appCompressedResourceNamePrefix);

        this.cognitoAuthUrlGetLambdaHttpMethod = HttpMethod.GET;
        this.cognitoAuthUrlGetLambdaUrlPath = "/api/v1/cognito/authUrl";
        var cognitoAuthUrlGetLambdaHandlerName = "cognitoAuthUrlGet.handler";
        var cognitoAuthUrlGetLambdaHandlerDashed = ResourceNameUtils.convertCamelCaseToDashSeparated(cognitoAuthUrlGetLambdaHandlerName);
        this.cognitoAuthUrlGetLambdaFunctionName = "%s-%s".formatted(this.appResourceNamePrefix, cognitoAuthUrlGetLambdaHandlerDashed);
        this.cognitoAuthUrlGetLambdaHandler = "%s/auth/%s".formatted(appLambdaHandlerPrefix, cognitoAuthUrlGetLambdaHandlerName);
        this.cognitoAuthUrlGetLambdaArn = "%s-%s".formatted(appLambdaArnPrefix, cognitoAuthUrlGetLambdaHandlerDashed);

        var cognitoTokenPostLambdaHandlerName = "cognitoTokenPost.handler";
        var cognitoTokenPostLambdaHandlerDashed = ResourceNameUtils.convertCamelCaseToDashSeparated(cognitoTokenPostLambdaHandlerName);
        this.cognitoTokenPostLambdaFunctionName = "%s-%s".formatted(this.appResourceNamePrefix, cognitoTokenPostLambdaHandlerDashed);
        this.cognitoTokenPostLambdaHandler = "%s/auth/%s".formatted(appLambdaHandlerPrefix, cognitoTokenPostLambdaHandlerName);
        this.cognitoTokenPostLambdaArn = "%s-cognito-token-post".formatted(appLambdaArnPrefix);
        this.cognitoTokenPostLambdaHttpMethod = HttpMethod.POST;
        this.cognitoTokenPostLambdaUrlPath = "/api/v1/cognito/token";

        var hmrcAuthUrlGetLambdaHandlerName = "hmrcAuthUrlGet.handler";
        var hmrcAuthUrlGetLambdaHandlerDashed = ResourceNameUtils.convertCamelCaseToDashSeparated(hmrcAuthUrlGetLambdaHandlerName);
        this.hmrcAuthUrlGetLambdaFunctionName = "%s-%s".formatted(this.appResourceNamePrefix, hmrcAuthUrlGetLambdaHandlerDashed);
        this.hmrcAuthUrlGetLambdaHandler = "%s/hmrc/%s".formatted(appLambdaHandlerPrefix, hmrcAuthUrlGetLambdaHandlerName);
        this.hmrcAuthUrlGetLambdaArn = "%s-hmrc-auth-url-get".formatted(appLambdaArnPrefix);
        this.hmrcAuthUrlGetLambdaHttpMethod = HttpMethod.GET;
        this.hmrcAuthUrlGetLambdaUrlPath = "/api/v1/hmrc/authUrl";

        var hmrcTokenPostLambdaHandlerName = "hmrcTokenPost.handler";
        var hmrcTokenPostLambdaHandlerDashed = ResourceNameUtils.convertCamelCaseToDashSeparated(hmrcTokenPostLambdaHandlerName);
        this.hmrcTokenPostLambdaFunctionName = "%s-%s".formatted(this.appResourceNamePrefix, hmrcTokenPostLambdaHandlerDashed);
        this.hmrcTokenPostLambdaHandler = "%s/hmrc/%s".formatted(appLambdaHandlerPrefix, hmrcTokenPostLambdaHandlerName);
        this.hmrcTokenPostLambdaArn = "%s-hmrc-token-post".formatted(appLambdaArnPrefix);
        this.hmrcTokenPostLambdaHttpMethod = HttpMethod.POST;
        this.hmrcTokenPostLambdaUrlPath = "/api/v1/hmrc/token";

        var hmrcVatReturnPostLambdaHandlerName = "hmrcVatReturnPost.handler";
        var hmrcVatReturnPostLambdaHandlerDashed = ResourceNameUtils.convertCamelCaseToDashSeparated(hmrcVatReturnPostLambdaHandlerName);
        this.hmrcVatReturnPostLambdaFunctionName = "%s-%s".formatted(this.appResourceNamePrefix, hmrcVatReturnPostLambdaHandlerDashed);
        this.hmrcVatReturnPostLambdaHandler = "%s/hmrc/%s".formatted(appLambdaHandlerPrefix, hmrcVatReturnPostLambdaHandlerName);
        this.hmrcVatReturnPostLambdaArn = "%s-hmrc-vat-return".formatted(appLambdaArnPrefix);
        this.hmrcVatReturnPostLambdaHttpMethod = HttpMethod.POST;
        this.hmrcVatReturnPostLambdaUrlPath = "/api/v1/hmrc/vat/return";

        var hmrcVatObligationGetLambdaHandlerName = "hmrcVatObligationGet.handler";
        var hmrcVatObligationGetLambdaHandlerDashed = ResourceNameUtils.convertCamelCaseToDashSeparated(hmrcVatObligationGetLambdaHandlerName);
        this.hmrcVatObligationGetLambdaFunctionName = "%s-%s".formatted(this.appCompressedResourceNamePrefix, hmrcVatObligationGetLambdaHandlerDashed);
        this.hmrcVatObligationGetLambdaHandler = "%s/hmrc/%s".formatted(appLambdaHandlerPrefix, hmrcVatObligationGetLambdaHandlerName);
        this.hmrcVatObligationGetLambdaArn = "%s-hmrc-vat-obligation-get".formatted(appCompressedLambdaArnPrefix);
        this.hmrcVatObligationGetLambdaHttpMethod = HttpMethod.GET;
        this.hmrcVatObligationGetLambdaUrlPath = "/api/v1/hmrc/vat/obligation";

        var hmrcVatLiabilityGetLambdaHandlerName = "hmrcVatLiabilityGet.handler";
        var hmrcVatLiabilityGetLambdaHandlerDashed = ResourceNameUtils.convertCamelCaseToDashSeparated(hmrcVatLiabilityGetLambdaHandlerName);
        this.hmrcVatLiabilityGetLambdaFunctionName = "%s-%s".formatted(this.appCompressedResourceNamePrefix, hmrcVatLiabilityGetLambdaHandlerDashed);
        this.hmrcVatLiabilityGetLambdaHandler = "%s/hmrc/%s".formatted(appLambdaHandlerPrefix, hmrcVatLiabilityGetLambdaHandlerName);
        this.hmrcVatLiabilityGetLambdaArn = "%s-hmrc-vat-liability-get".formatted(appCompressedLambdaArnPrefix);
        this.hmrcVatLiabilityGetLambdaHttpMethod = HttpMethod.GET;
        this.hmrcVatLiabilityGetLambdaUrlPath = "/api/v1/hmrc/vat/liability";

        var hmrcVatPaymentGetLambdaHandlerName = "hmrcVatPaymentGet.handler";
        var hmrcVatPaymentGetLambdaHandlerDashed = ResourceNameUtils.convertCamelCaseToDashSeparated(hmrcVatPaymentGetLambdaHandlerName);
        this.hmrcVatPaymentGetLambdaFunctionName = "%s-%s".formatted(this.appCompressedResourceNamePrefix, hmrcVatPaymentGetLambdaHandlerDashed);
        this.hmrcVatPaymentGetLambdaHandler = "%s/hmrc/%s".formatted(appLambdaHandlerPrefix, hmrcVatPaymentGetLambdaHandlerName);
        this.hmrcVatPaymentGetLambdaArn = "%s-hmrc-vat-payments-get".formatted(appCompressedLambdaArnPrefix);
        this.hmrcVatPaymentGetLambdaHttpMethod = HttpMethod.GET;
        this.hmrcVatPaymentGetLambdaUrlPath = "/api/v1/hmrc/vat/payments";

        var hmrcVatPenaltyGetLambdaHandlerName = "hmrcVatPenaltyGet.handler";
        var hmrcVatPenaltyGetLambdaHandlerDashed = ResourceNameUtils.convertCamelCaseToDashSeparated(hmrcVatPenaltyGetLambdaHandlerName);
        this.hmrcVatPenaltyGetLambdaFunctionName = "%s-%s".formatted(this.appCompressedResourceNamePrefix, hmrcVatPenaltyGetLambdaHandlerDashed);
        this.hmrcVatPenaltyGetLambdaHandler = "%s/hmrc/%s".formatted(appLambdaHandlerPrefix, hmrcVatPenaltyGetLambdaHandlerName);
        this.hmrcVatPenaltyGetLambdaArn = "%s-hmrc-vat-penalty-get".formatted(appCompressedLambdaArnPrefix);
        this.hmrcVatPenaltyGetLambdaHttpMethod = HttpMethod.GET;
        this.hmrcVatPenaltyGetLambdaUrlPath = "/api/v1/hmrc/vat/penalty";

        var hmrcVatReturnGetLambdaHandlerName = "hmrcVatReturnGet.handler";
        var hmrcVatReturnGetLambdaHandlerDashed = ResourceNameUtils.convertCamelCaseToDashSeparated(hmrcVatReturnGetLambdaHandlerName);
        this.hmrcVatReturnGetLambdaFunctionName = "%s-%s".formatted(this.appCompressedResourceNamePrefix, hmrcVatReturnGetLambdaHandlerDashed);
        this.hmrcVatReturnGetLambdaHandler = "%s/hmrc/%s".formatted(appLambdaHandlerPrefix, hmrcVatReturnGetLambdaHandlerName);
        this.hmrcVatReturnGetLambdaArn = "%s-hmrc-vat-return-get".formatted(appCompressedLambdaArnPrefix);
        this.hmrcVatReturnGetLambdaHttpMethod = HttpMethod.GET;
        this.hmrcVatReturnGetLambdaUrlPath = "/api/v1/hmrc/vat/return";

        var receiptPostLambdaHandlerName = "hmrcReceiptPost.handler";
        var receiptPostLambdaHandlerDashed = ResourceNameUtils.convertCamelCaseToDashSeparated(receiptPostLambdaHandlerName);
        this.receiptPostLambdaFunctionName = "%s-%s".formatted(this.appResourceNamePrefix, receiptPostLambdaHandlerDashed);
        this.receiptPostLambdaHandler = "%s/hmrc/%s".formatted(appLambdaHandlerPrefix, receiptPostLambdaHandlerName);
        this.receiptPostLambdaArn = "%s-hmrc-receipt-post".formatted(appLambdaArnPrefix);
        this.receiptPostLambdaHttpMethod = HttpMethod.POST;
        this.receiptPostLambdaUrlPath = "/api/v1/hmrc/receipt";

        var receiptGetLambdaHandlerName = "hmrcReceiptGet.handler";
        var receiptGetLambdaHandlerDashed = ResourceNameUtils.convertCamelCaseToDashSeparated(receiptGetLambdaHandlerName);
        this.receiptGetLambdaFunctionName = "%s-%s".formatted(this.appResourceNamePrefix, receiptGetLambdaHandlerDashed);
        this.receiptGetLambdaHandler = "%s/hmrc/%s".formatted(appLambdaHandlerPrefix, receiptGetLambdaHandlerName);
        this.receiptGetLambdaArn = "%s-hmrc-receipt-get".formatted(appLambdaArnPrefix);
        this.receiptGetLambdaHttpMethod = HttpMethod.GET;
        this.receiptGetLambdaUrlPath = "/api/v1/hmrc/receipt";

        var catalogGetLambdaHandlerName = "catalogGet.handler";
        var catalogGetLambdaHandlerDashed = ResourceNameUtils.convertCamelCaseToDashSeparated(catalogGetLambdaHandlerName);
        this.catalogGetLambdaFunctionName = "%s-%s".formatted(this.appResourceNamePrefix, catalogGetLambdaHandlerDashed);
        this.catalogGetLambdaHandler = "%s/account/%s".formatted(appLambdaHandlerPrefix, catalogGetLambdaHandlerName);
        this.catalogGetLambdaArn = "%s-catalog-get".formatted(appLambdaArnPrefix);
        this.catalogGetLambdaHttpMethod = HttpMethod.GET;
        this.catalogGetLambdaUrlPath = "/api/v1/catalog";

        var bundleGetLambdaHandlerName = "bundleGet.handler";
        var bundleGetLambdaHandlerDashed = ResourceNameUtils.convertCamelCaseToDashSeparated(bundleGetLambdaHandlerName);
        this.bundleGetLambdaFunctionName = "%s-%s".formatted(this.appResourceNamePrefix, bundleGetLambdaHandlerDashed);
        this.bundleGetLambdaHandler = "%s/account/%s".formatted(appLambdaHandlerPrefix, bundleGetLambdaHandlerName);
        this.bundleGetLambdaArn = "%s-bundle-get".formatted(appLambdaArnPrefix);
        this.bundleGetLambdaHttpMethod = HttpMethod.GET;
        this.bundleGetLambdaUrlPath = "/api/v1/bundle";

        var bundlePostLambdaHandlerName = "bundlePost.handler";
        var bundlePostLambdaHandlerDashed = ResourceNameUtils.convertCamelCaseToDashSeparated(bundlePostLambdaHandlerName);
        this.bundlePostLambdaFunctionName = "%s-%s".formatted(this.appResourceNamePrefix, bundlePostLambdaHandlerDashed);
        this.bundlePostLambdaHandler = "%s/account/%s".formatted(appLambdaHandlerPrefix, bundlePostLambdaHandlerName);
        this.bundlePostLambdaArn = "%s-bundle-post".formatted(appLambdaArnPrefix);
        this.bundlePostLambdaHttpMethod = HttpMethod.POST;
        this.bundlePostLambdaUrlPath = "/api/v1/bundle";

        var bundleDeleteLambdaHandlerName = "bundleDelete.handler";
        var bundleDeleteLambdaHandlerDashed = ResourceNameUtils.convertCamelCaseToDashSeparated(bundleDeleteLambdaHandlerName);
        this.bundleDeleteLambdaFunctionName = "%s-%s".formatted(this.appResourceNamePrefix, bundleDeleteLambdaHandlerDashed);
        this.bundleDeleteLambdaHandler = "%s/account/%s".formatted(appLambdaHandlerPrefix, bundleDeleteLambdaHandlerName);
        this.bundleDeleteLambdaArn = "%s-bundle-delete".formatted(appLambdaArnPrefix);
        this.bundleDeleteLambdaHttpMethod = HttpMethod.DELETE;
        this.bundleDeleteLambdaUrlPath = "/api/v1/bundle";
    }
}
