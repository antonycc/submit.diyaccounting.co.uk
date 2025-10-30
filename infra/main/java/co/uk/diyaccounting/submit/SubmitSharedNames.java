package co.uk.diyaccounting.submit;

import co.uk.diyaccounting.submit.utils.ResourceNameUtils;
import software.amazon.awscdk.services.apigatewayv2.HttpMethod;

import java.util.ArrayList;
import java.util.List;

import static co.uk.diyaccounting.submit.utils.ResourceNameUtils.buildDashedDomainName;
import static co.uk.diyaccounting.submit.utils.ResourceNameUtils.convertDotSeparatedToDashSeparated;
import static co.uk.diyaccounting.submit.utils.ResourceNameUtils.generateResourceNamePrefix;

public class SubmitSharedNames {

    public static class PublishedLambda {
        public final HttpMethod method;
        public final String urlPath;
        public final String summary;
        public final String description;
        public final String operationId;

        public PublishedLambda(
                HttpMethod method, String urlPath, String summary, String description, String operationId) {
            this.method = method;
            this.urlPath = urlPath;
            this.summary = summary;
            this.description = description;
            this.operationId = operationId;
        }
    }

    public final List<PublishedLambda> publishedApiLambdas = new ArrayList<>();

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
    //public String envCompressedResourceNamePrefix;
    public String observabilityStackId;
    public String observabilityUE1StackId;
    public String dataStackId;
    public String identityStackId;
    public String apexStackId;

    public String appResourceNamePrefix;
    //public String appCompressedResourceNamePrefix;
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
    //public String delCompressedResourceNamePrefix;
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

    public static SubmitSharedNames forDocs() {
        SubmitSharedNamesProps p = new SubmitSharedNamesProps();
        p.hostedZoneName = "example.com";
        p.envName = "docs";
        p.subDomainName = "submit";
        p.deploymentName = "docs";
        p.regionName = "eu-west-2";
        p.awsAccount = "111111111111";
        return new SubmitSharedNames(p);
    }

    public SubmitSharedNames(SubmitSharedNamesProps props) {
        this();
        this.envDomainName = props.envName.equals("prod")
                ? "%s.%s".formatted(props.subDomainName, props.hostedZoneName)
                : "%s.%s.%s".formatted(props.envName, props.subDomainName, props.hostedZoneName);
        this.cognitoDomainName = "%s-auth.%s.%s".formatted(props.envName, props.subDomainName, props.hostedZoneName);
        this.holdingDomainName = "%s-holding.%s.%s".formatted(props.envName, props.subDomainName, props.hostedZoneName);
        this.deploymentDomainName = "%s.%s.%s"
                .formatted(
                        props.deploymentName,
                        props.subDomainName,
                        props.hostedZoneName); // TODO -> deploymentDomainName

        this.baseUrl = "https://%s/".formatted(this.deploymentDomainName);
        this.dashedDeploymentDomainName = buildDashedDomainName(this.deploymentDomainName);

        this.envBaseUrl = "https://%s/".formatted(this.envDomainName);
        this.envDashedDomainName = buildDashedDomainName(this.envDomainName);
        this.envResourceNamePrefix = "%s-env".formatted(generateResourceNamePrefix(this.envDomainName));
        //this.envCompressedResourceNamePrefix =
        //        "%s-e".formatted(generateCompressedResourceNamePrefix(this.envDomainName));
        this.observabilityStackId = "%s-env-ObservabilityStack".formatted(props.envName);
        this.observabilityUE1StackId = "%s-env-ObservabilityUE1Stack".formatted(props.envName);
        this.dataStackId = "%s-env-DataStack".formatted(props.envName);
        this.identityStackId = "%s-env-IdentityStack".formatted(props.envName);
        this.apexStackId = "%s-env-ApexStack".formatted(props.envName);
        this.cognitoBaseUri = "https://%s".formatted(this.cognitoDomainName);

        this.receiptsBucketName = "%s-receipts".formatted(this.envDashedDomainName);
        this.distributionAccessLogBucketName = "distribution-%s-logs".formatted(this.envDashedDomainName);

        this.ew2SelfDestructLogGroupName =
                "/aws/lambda/%s-self-destruct-eu-west-2".formatted(this.envResourceNamePrefix);
        this.ue1SelfDestructLogGroupName =
                "/aws/lambda/%s-self-destruct-us-east-1".formatted(this.envResourceNamePrefix);
        this.webDeploymentLogGroupName = "/deployment/%s-web-deployment".formatted(this.envResourceNamePrefix);
        this.apiAccessLogGroupName = "/aws/apigw/%s/access".formatted(this.envResourceNamePrefix);

        this.appResourceNamePrefix = "%s-app".formatted(generateResourceNamePrefix(this.deploymentDomainName));
        //this.appCompressedResourceNamePrefix =
        //        "%s-a".formatted(generateCompressedResourceNamePrefix(this.deploymentDomainName));
        this.devStackId = "%s-app-DevStack".formatted(props.deploymentName);
        this.authStackId = "%s-app-AuthStack".formatted(props.deploymentName);
        this.hmrcStackId = "%s-app-HmrcStack".formatted(props.deploymentName);
        this.accountStackId = "%s-app-AccountStack".formatted(props.deploymentName);
        this.apiStackId = "%s-app-ApiStack".formatted(props.deploymentName);
        this.opsStackId = "%s-app-OpsStack".formatted(props.deploymentName);
        this.appSelfDestructStackId = "%s-app-SelfDestructStack".formatted(props.deploymentName);
        this.ecrRepositoryArn = "arn:aws:ecr:%s:%s:repository/%s-ecr"
                .formatted(props.regionName, props.awsAccount, this.appResourceNamePrefix);
        this.ecrRepositoryName = "%s-ecr".formatted(this.appResourceNamePrefix);
        this.ecrLogGroupName = "/aws/ecr/%s".formatted(this.appResourceNamePrefix);
        this.ecrPublishRoleName = "%s-ecr-publish-role".formatted(appResourceNamePrefix);

        this.delResourceNamePrefix = "%s-del".formatted(generateResourceNamePrefix(this.deploymentDomainName));
        //this.delCompressedResourceNamePrefix =
        //        "%s-d".formatted(generateCompressedResourceNamePrefix(this.deploymentDomainName));
        this.edgeStackId = "%s-del-EdgeStack".formatted(props.deploymentName);
        this.publishStackId = "%s-del-PublishStack".formatted(props.deploymentName);
        this.delSelfDestructStackId = "%s-del-SelfDestructStack".formatted(props.deploymentName);

        this.trailName = "%s-trail".formatted(this.envResourceNamePrefix);
        this.holdingBucketName = convertDotSeparatedToDashSeparated("holding-" + this.envResourceNamePrefix);
        this.originBucketName = convertDotSeparatedToDashSeparated("origin-" + this.delResourceNamePrefix);
        this.originAccessLogBucketName = "%s-origin-access-logs".formatted(this.delResourceNamePrefix);

        var appLambdaHandlerPrefix = "app/functions";
        var appLambdaArnPrefix = "arn:aws:lambda:%s:%s:function:%s"
                .formatted(props.regionName, props.awsAccount, this.appResourceNamePrefix);
        //var appCompressedLambdaArnPrefix = "arn:aws:lambda:%s:%s:function:%s"
        //        .formatted(props.regionName, props.awsAccount, this.appCompressedResourceNamePrefix);

        this.cognitoAuthUrlGetLambdaHttpMethod = HttpMethod.GET;
        this.cognitoAuthUrlGetLambdaUrlPath = "/api/v1/cognito/authUrl";
        var cognitoAuthUrlGetLambdaHandlerName = "cognitoAuthUrlGet.handler";
        var cognitoAuthUrlGetLambdaHandlerDashed =
                ResourceNameUtils.convertCamelCaseToDashSeparated(cognitoAuthUrlGetLambdaHandlerName);
        this.cognitoAuthUrlGetLambdaFunctionName =
                "%s-%s".formatted(this.appResourceNamePrefix, cognitoAuthUrlGetLambdaHandlerDashed);
        this.cognitoAuthUrlGetLambdaHandler =
                "%s/auth/%s".formatted(appLambdaHandlerPrefix, cognitoAuthUrlGetLambdaHandlerName);
        this.cognitoAuthUrlGetLambdaArn = "%s-%s".formatted(appLambdaArnPrefix, cognitoAuthUrlGetLambdaHandlerDashed);

        this.cognitoTokenPostLambdaHttpMethod = HttpMethod.POST;
        this.cognitoTokenPostLambdaUrlPath = "/api/v1/cognito/token";
        var cognitoTokenPostLambdaHandlerName = "cognitoTokenPost.handler";
        var cognitoTokenPostLambdaHandlerDashed =
                ResourceNameUtils.convertCamelCaseToDashSeparated(cognitoTokenPostLambdaHandlerName);
        this.cognitoTokenPostLambdaFunctionName =
                "%s-%s".formatted(this.appResourceNamePrefix, cognitoTokenPostLambdaHandlerDashed);
        this.cognitoTokenPostLambdaHandler =
                "%s/auth/%s".formatted(appLambdaHandlerPrefix, cognitoTokenPostLambdaHandlerName);
        this.cognitoTokenPostLambdaArn = "%s-%s".formatted(appLambdaArnPrefix, cognitoTokenPostLambdaHandlerDashed);

        this.hmrcAuthUrlGetLambdaHttpMethod = HttpMethod.GET;
        this.hmrcAuthUrlGetLambdaUrlPath = "/api/v1/hmrc/authUrl";
        var hmrcAuthUrlGetLambdaHandlerName = "hmrcAuthUrlGet.handler";
        var hmrcAuthUrlGetLambdaHandlerDashed =
                ResourceNameUtils.convertCamelCaseToDashSeparated(hmrcAuthUrlGetLambdaHandlerName);
        this.hmrcAuthUrlGetLambdaFunctionName =
                "%s-%s".formatted(this.appResourceNamePrefix, hmrcAuthUrlGetLambdaHandlerDashed);
        this.hmrcAuthUrlGetLambdaHandler =
                "%s/hmrc/%s".formatted(appLambdaHandlerPrefix, hmrcAuthUrlGetLambdaHandlerName);
        this.hmrcAuthUrlGetLambdaArn = "%s-%s".formatted(appLambdaArnPrefix, hmrcAuthUrlGetLambdaHandlerDashed);

        this.hmrcTokenPostLambdaHttpMethod = HttpMethod.POST;
        this.hmrcTokenPostLambdaUrlPath = "/api/v1/hmrc/token";
        var hmrcTokenPostLambdaHandlerName = "hmrcTokenPost.handler";
        var hmrcTokenPostLambdaHandlerDashed =
                ResourceNameUtils.convertCamelCaseToDashSeparated(hmrcTokenPostLambdaHandlerName);
        this.hmrcTokenPostLambdaFunctionName =
                "%s-%s".formatted(this.appResourceNamePrefix, hmrcTokenPostLambdaHandlerDashed);
        this.hmrcTokenPostLambdaHandler =
                "%s/hmrc/%s".formatted(appLambdaHandlerPrefix, hmrcTokenPostLambdaHandlerName);
        this.hmrcTokenPostLambdaArn = "%s-%s".formatted(appLambdaArnPrefix, hmrcTokenPostLambdaHandlerDashed);

        this.hmrcVatReturnPostLambdaHttpMethod = HttpMethod.POST;
        this.hmrcVatReturnPostLambdaUrlPath = "/api/v1/hmrc/vat/return";
        var hmrcVatReturnPostLambdaHandlerName = "hmrcVatReturnPost.handler";
        var hmrcVatReturnPostLambdaHandlerDashed =
                ResourceNameUtils.convertCamelCaseToDashSeparated(hmrcVatReturnPostLambdaHandlerName);
        this.hmrcVatReturnPostLambdaFunctionName =
                "%s-%s".formatted(this.appResourceNamePrefix, hmrcVatReturnPostLambdaHandlerDashed);
        this.hmrcVatReturnPostLambdaHandler =
                "%s/hmrc/%s".formatted(appLambdaHandlerPrefix, hmrcVatReturnPostLambdaHandlerName);
        this.hmrcVatReturnPostLambdaArn = "%s-%s".formatted(appLambdaArnPrefix, hmrcVatReturnPostLambdaHandlerDashed);

        this.hmrcVatObligationGetLambdaHttpMethod = HttpMethod.GET;
        this.hmrcVatObligationGetLambdaUrlPath = "/api/v1/hmrc/vat/obligation";
        var hmrcVatObligationGetLambdaHandlerName = "hmrcVatObligationGet.handler";
        var hmrcVatObligationGetLambdaHandlerDashed =
                ResourceNameUtils.convertCamelCaseToDashSeparated(hmrcVatObligationGetLambdaHandlerName);
        this.hmrcVatObligationGetLambdaFunctionName =
                "%s-%s".formatted(this.appResourceNamePrefix, hmrcVatObligationGetLambdaHandlerDashed);
        this.hmrcVatObligationGetLambdaHandler =
                "%s/hmrc/%s".formatted(appLambdaHandlerPrefix, hmrcVatObligationGetLambdaHandlerName);
        this.hmrcVatObligationGetLambdaArn =
                "%s-%s".formatted(appLambdaArnPrefix, hmrcVatObligationGetLambdaHandlerDashed);

        this.hmrcVatLiabilityGetLambdaHttpMethod = HttpMethod.GET;
        this.hmrcVatLiabilityGetLambdaUrlPath = "/api/v1/hmrc/vat/liability";
        var hmrcVatLiabilityGetLambdaHandlerName = "hmrcVatLiabilityGet.handler";
        var hmrcVatLiabilityGetLambdaHandlerDashed =
                ResourceNameUtils.convertCamelCaseToDashSeparated(hmrcVatLiabilityGetLambdaHandlerName);
        this.hmrcVatLiabilityGetLambdaFunctionName =
                "%s-%s".formatted(this.appResourceNamePrefix, hmrcVatLiabilityGetLambdaHandlerDashed);
        this.hmrcVatLiabilityGetLambdaHandler =
                "%s/hmrc/%s".formatted(appLambdaHandlerPrefix, hmrcVatLiabilityGetLambdaHandlerName);
        this.hmrcVatLiabilityGetLambdaArn =
                "%s-%s".formatted(appLambdaArnPrefix, hmrcVatLiabilityGetLambdaHandlerDashed);

        this.hmrcVatPaymentGetLambdaHttpMethod = HttpMethod.GET;
        this.hmrcVatPaymentGetLambdaUrlPath = "/api/v1/hmrc/vat/payments";
        var hmrcVatPaymentGetLambdaHandlerName = "hmrcVatPaymentGet.handler";
        var hmrcVatPaymentGetLambdaHandlerDashed =
                ResourceNameUtils.convertCamelCaseToDashSeparated(hmrcVatPaymentGetLambdaHandlerName);
        this.hmrcVatPaymentGetLambdaFunctionName =
                "%s-%s".formatted(this.appResourceNamePrefix, hmrcVatPaymentGetLambdaHandlerDashed);
        this.hmrcVatPaymentGetLambdaHandler =
                "%s/hmrc/%s".formatted(appLambdaHandlerPrefix, hmrcVatPaymentGetLambdaHandlerName);
        this.hmrcVatPaymentGetLambdaArn =
                "%s-%s".formatted(appLambdaArnPrefix, hmrcVatPaymentGetLambdaHandlerDashed);

        this.hmrcVatPenaltyGetLambdaHttpMethod = HttpMethod.GET;
        this.hmrcVatPenaltyGetLambdaUrlPath = "/api/v1/hmrc/vat/penalty";
        var hmrcVatPenaltyGetLambdaHandlerName = "hmrcVatPenaltyGet.handler";
        var hmrcVatPenaltyGetLambdaHandlerDashed =
                ResourceNameUtils.convertCamelCaseToDashSeparated(hmrcVatPenaltyGetLambdaHandlerName);
        this.hmrcVatPenaltyGetLambdaFunctionName =
                "%s-%s".formatted(this.appResourceNamePrefix, hmrcVatPenaltyGetLambdaHandlerDashed);
        this.hmrcVatPenaltyGetLambdaHandler =
                "%s/hmrc/%s".formatted(appLambdaHandlerPrefix, hmrcVatPenaltyGetLambdaHandlerName);
        this.hmrcVatPenaltyGetLambdaArn =
                "%s-%s".formatted(appLambdaArnPrefix, hmrcVatPenaltyGetLambdaHandlerDashed);

        this.hmrcVatReturnGetLambdaHttpMethod = HttpMethod.GET;
        this.hmrcVatReturnGetLambdaUrlPath = "/api/v1/hmrc/vat/return";
        var hmrcVatReturnGetLambdaHandlerName = "hmrcVatReturnGet.handler";
        var hmrcVatReturnGetLambdaHandlerDashed =
                ResourceNameUtils.convertCamelCaseToDashSeparated(hmrcVatReturnGetLambdaHandlerName);
        this.hmrcVatReturnGetLambdaFunctionName =
                "%s-%s".formatted(this.appResourceNamePrefix, hmrcVatReturnGetLambdaHandlerDashed);
        this.hmrcVatReturnGetLambdaHandler =
                "%s/hmrc/%s".formatted(appLambdaHandlerPrefix, hmrcVatReturnGetLambdaHandlerName);
        this.hmrcVatReturnGetLambdaArn =
                "%s-%s".formatted(appLambdaArnPrefix, hmrcVatReturnGetLambdaHandlerDashed);

        this.receiptPostLambdaHttpMethod = HttpMethod.POST;
        this.receiptPostLambdaUrlPath = "/api/v1/hmrc/receipt";
        var receiptPostLambdaHandlerName = "hmrcReceiptPost.handler";
        var receiptPostLambdaHandlerDashed =
                ResourceNameUtils.convertCamelCaseToDashSeparated(receiptPostLambdaHandlerName);
        this.receiptPostLambdaFunctionName =
                "%s-%s".formatted(this.appResourceNamePrefix, receiptPostLambdaHandlerDashed);
        this.receiptPostLambdaHandler = "%s/hmrc/%s".formatted(appLambdaHandlerPrefix, receiptPostLambdaHandlerName);
        this.receiptPostLambdaArn = "%s-%s".formatted(appLambdaArnPrefix, receiptPostLambdaHandlerDashed);

        this.receiptGetLambdaHttpMethod = HttpMethod.GET;
        this.receiptGetLambdaUrlPath = "/api/v1/hmrc/receipt";
        var receiptGetLambdaHandlerName = "hmrcReceiptGet.handler";
        var receiptGetLambdaHandlerDashed =
                ResourceNameUtils.convertCamelCaseToDashSeparated(receiptGetLambdaHandlerName);
        this.receiptGetLambdaFunctionName =
                "%s-%s".formatted(this.appResourceNamePrefix, receiptGetLambdaHandlerDashed);
        this.receiptGetLambdaHandler = "%s/hmrc/%s".formatted(appLambdaHandlerPrefix, receiptGetLambdaHandlerName);
        this.receiptGetLambdaArn = "%s-%s".formatted(appLambdaArnPrefix, receiptGetLambdaHandlerDashed);

        this.catalogGetLambdaHttpMethod = HttpMethod.GET;
        this.catalogGetLambdaUrlPath = "/api/v1/catalog";
        var catalogGetLambdaHandlerName = "catalogGet.handler";
        var catalogGetLambdaHandlerDashed =
                ResourceNameUtils.convertCamelCaseToDashSeparated(catalogGetLambdaHandlerName);
        this.catalogGetLambdaFunctionName =
                "%s-%s".formatted(this.appResourceNamePrefix, catalogGetLambdaHandlerDashed);
        this.catalogGetLambdaHandler = "%s/account/%s".formatted(appLambdaHandlerPrefix, catalogGetLambdaHandlerName);
        this.catalogGetLambdaArn = "%s-%s".formatted(appLambdaArnPrefix, catalogGetLambdaHandlerDashed);

        this.bundleGetLambdaHttpMethod = HttpMethod.GET;
        this.bundleGetLambdaUrlPath = "/api/v1/bundle";
        var bundleGetLambdaHandlerName = "bundleGet.handler";
        var bundleGetLambdaHandlerDashed =
                ResourceNameUtils.convertCamelCaseToDashSeparated(bundleGetLambdaHandlerName);
        this.bundleGetLambdaFunctionName = "%s-%s".formatted(this.appResourceNamePrefix, bundleGetLambdaHandlerDashed);
        this.bundleGetLambdaHandler = "%s/account/%s".formatted(appLambdaHandlerPrefix, bundleGetLambdaHandlerName);
        this.bundleGetLambdaArn = "%s-%s".formatted(appLambdaArnPrefix, bundleGetLambdaHandlerDashed);

        this.bundlePostLambdaHttpMethod = HttpMethod.POST;
        this.bundlePostLambdaUrlPath = "/api/v1/bundle";
        var bundlePostLambdaHandlerName = "bundlePost.handler";
        var bundlePostLambdaHandlerDashed =
                ResourceNameUtils.convertCamelCaseToDashSeparated(bundlePostLambdaHandlerName);
        this.bundlePostLambdaFunctionName =
                "%s-%s".formatted(this.appResourceNamePrefix, bundlePostLambdaHandlerDashed);
        this.bundlePostLambdaHandler = "%s/account/%s".formatted(appLambdaHandlerPrefix, bundlePostLambdaHandlerName);
        this.bundlePostLambdaArn = "%s-%s".formatted(appLambdaArnPrefix, bundlePostLambdaHandlerDashed);

        this.bundleDeleteLambdaHttpMethod = HttpMethod.DELETE;
        this.bundleDeleteLambdaUrlPath = "/api/v1/bundle";

        // Published API Lambdas used by OpenAPI generator (only published to end users)
        // Note: Paths include /api/v1 prefix; OpenApiGenerator strips it because server.url already ends with /api/v1/
        publishedApiLambdas.add(new PublishedLambda(
                this.cognitoAuthUrlGetLambdaHttpMethod,
                this.cognitoAuthUrlGetLambdaUrlPath,
                "Get Cognito authentication URL",
                "Returns the Cognito OAuth2 authorization URL for user login",
                "getCognitoAuthUrl"));
        publishedApiLambdas.add(new PublishedLambda(
                this.cognitoTokenPostLambdaHttpMethod,
                this.cognitoTokenPostLambdaUrlPath,
                "Exchange Cognito authorization code for access token",
                "Exchanges an authorization code for a Cognito access token",
                "exchangeCognitoToken"));
        publishedApiLambdas.add(new PublishedLambda(
                this.hmrcAuthUrlGetLambdaHttpMethod,
                this.hmrcAuthUrlGetLambdaUrlPath,
                "Get HMRC authentication URL",
                "Returns the HMRC OAuth2 authorization URL for accessing HMRC APIs",
                "getHmrcAuthUrl"));
        publishedApiLambdas.add(new PublishedLambda(
                this.hmrcTokenPostLambdaHttpMethod,
                this.hmrcTokenPostLambdaUrlPath,
                "Exchange HMRC authorization code for access token",
                "Exchanges an HMRC authorization code for an access token",
                "exchangeHmrcToken"));
        publishedApiLambdas.add(new PublishedLambda(
                this.hmrcVatReturnPostLambdaHttpMethod,
                this.hmrcVatReturnPostLambdaUrlPath,
                "Submit VAT return to HMRC",
                "Submits a VAT return to HMRC on behalf of the authenticated user",
                "submitVatReturn"));
        publishedApiLambdas.add(new PublishedLambda(
                this.receiptPostLambdaHttpMethod,
                this.receiptPostLambdaUrlPath,
                "Log receipt to storage",
                "Logs a transaction receipt to secure storage",
                "logReceipt"));
        publishedApiLambdas.add(new PublishedLambda(
                this.receiptGetLambdaHttpMethod,
                this.receiptGetLambdaUrlPath,
                "Retrieve stored receipts",
                "Retrieves previously stored receipts for the authenticated user",
                "getReceipts"));
        publishedApiLambdas.add(new PublishedLambda(
                this.catalogGetLambdaHttpMethod,
                this.catalogGetLambdaUrlPath,
                "Get product catalog",
                "Retrieves the available product catalog",
                "getCatalog"));
        publishedApiLambdas.add(new PublishedLambda(
                this.bundlePostLambdaHttpMethod,
                this.bundlePostLambdaUrlPath,
                "Request new bundle",
                "Creates a new bundle request for the authenticated user",
                "requestBundle"));
        publishedApiLambdas.add(new PublishedLambda(
                this.bundleGetLambdaHttpMethod,
                this.bundleGetLambdaUrlPath,
                "Get user bundles",
                "Retrieves bundles for the authenticated user",
                "getBundles"));
        publishedApiLambdas.add(new PublishedLambda(
                this.bundleDeleteLambdaHttpMethod,
                this.bundleDeleteLambdaUrlPath,
                "Delete bundle",
                "Deletes a bundle for the authenticated user",
                "deleteBundle"));
        var bundleDeleteLambdaHandlerName = "bundleDelete.handler";
        var bundleDeleteLambdaHandlerDashed =
                ResourceNameUtils.convertCamelCaseToDashSeparated(bundleDeleteLambdaHandlerName);
        this.bundleDeleteLambdaFunctionName =
                "%s-%s".formatted(this.appResourceNamePrefix, bundleDeleteLambdaHandlerDashed);
        this.bundleDeleteLambdaHandler =
                "%s/account/%s".formatted(appLambdaHandlerPrefix, bundleDeleteLambdaHandlerName);
        this.bundleDeleteLambdaArn = "%s-%s".formatted(appLambdaArnPrefix, bundleDeleteLambdaHandlerDashed);
    }
}
