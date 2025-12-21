package co.uk.diyaccounting.submit;

import static co.uk.diyaccounting.submit.utils.ResourceNameUtils.buildDashedDomainName;
import static co.uk.diyaccounting.submit.utils.ResourceNameUtils.convertDotSeparatedToDashSeparated;
import static co.uk.diyaccounting.submit.utils.ResourceNameUtils.generateResourceNamePrefix;

import co.uk.diyaccounting.submit.utils.ResourceNameUtils;
import java.util.ArrayList;
import java.util.List;
import software.amazon.awscdk.services.apigatewayv2.HttpMethod;

public class SubmitSharedNames {

    public static class PublishedLambda {
        public final HttpMethod method;
        public final String urlPath;
        public final String summary;
        public final String description;
        public final String operationId;
        public final List<ApiParameter> parameters;

        public PublishedLambda(
                HttpMethod method, String urlPath, String summary, String description, String operationId) {
            this(method, urlPath, summary, description, operationId, List.of());
        }

        public PublishedLambda(
                HttpMethod method,
                String urlPath,
                String summary,
                String description,
                String operationId,
                List<ApiParameter> parameters) {
            this.method = method;
            this.urlPath = urlPath;
            this.summary = summary;
            this.description = description;
            this.operationId = operationId;
            this.parameters = parameters != null ? parameters : List.of();
        }
    }

    public static class ApiParameter {
        public final String name;
        public final String in;
        public final boolean required;
        public final String description;

        public ApiParameter(String name, String in, boolean required, String description) {
            this.name = name;
            this.in = in;
            this.required = required;
            this.description = description;
        }
    }

    public final List<PublishedLambda> publishedApiLambdas = new ArrayList<>();

    public String hostedZoneName;
    public String deploymentDomainName;
    public String envDomainName;
    public String cognitoDomainName;
    public String holdingDomainName;
    public String baseUrl;
    public String envBaseUrl;
    public String dashedDeploymentDomainName;
    public String cognitoBaseUri;
    public String trailName;

    public String receiptsTableName;
    public String bundlesTableName;
    public String hmrcApiRequestsTableName;
    public String proxyStateTableName;
    public String holdingBucketName;
    public String originBucketName;
    public String originAccessLogBucketName;
    public String distributionAccessLogGroupName;
    public String distributionAccessLogDeliveryHoldingSourceName;
    public String distributionAccessLogDeliveryOriginSourceName;
    public String distributionAccessLogDeliveryHoldingDestinationName;
    public String distributionAccessLogDeliveryOriginDestinationName;
    public String ew2SelfDestructLogGroupName;
    public String ue1SelfDestructLogGroupName;
    public String apiAccessLogGroupName;

    public String envDashedDomainName;
    public String envResourceNamePrefix;
    public String observabilityStackId;
    public String observabilityUE1StackId;
    public String dataStackId;
    public String identityStackId;
    public String apexStackId;

    public String appResourceNamePrefix;
    public String devStackId;
    public String ue1DevStackId;
    public String authStackId;
    public String hmrcStackId;
    public String accountStackId;
    public String apiStackId;
    public String opsStackId;
    public String proxyStackId;
    public String selfDestructStackId;
    public String ecrRepositoryArn;
    public String ecrRepositoryName;
    public String ecrLogGroupName;
    public String ecrPublishRoleName;
    public String ue1EcrRepositoryArn;
    public String ue1EcrRepositoryName;
    public String ue1EcrLogGroupName;
    public String ue1EcrPublishRoleName;

    public String cognitoAuthUrlGetLambdaHandler;
    public String cognitoAuthUrlGetLambdaFunctionName;
    public String cognitoAuthUrlGetLambdaArn;
    public HttpMethod cognitoAuthUrlGetLambdaHttpMethod;
    public String cognitoAuthUrlGetLambdaUrlPath;
    public boolean cognitoAuthUrlGetLambdaJwtAuthorizer;
    public boolean cognitoAuthUrlGetLambdaCustomAuthorizer;

    public String cognitoTokenPostLambdaHandler;
    public String cognitoTokenPostLambdaFunctionName;
    public String cognitoTokenPostLambdaArn;
    public HttpMethod cognitoTokenPostLambdaHttpMethod;
    public String cognitoTokenPostLambdaUrlPath;
    public boolean cognitoTokenPostLambdaJwtAuthorizer;
    public boolean cognitoTokenPostLambdaCustomAuthorizer;

    public String customAuthorizerLambdaHandler;
    public String customAuthorizerLambdaFunctionName;
    public String customAuthorizerLambdaArn;

    public String hmrcAuthUrlGetLambdaHandler;
    public String hmrcAuthUrlGetLambdaFunctionName;
    public String hmrcAuthUrlGetLambdaArn;
    public HttpMethod hmrcAuthUrlGetLambdaHttpMethod;
    public String hmrcAuthUrlGetLambdaUrlPath;
    public boolean hmrcAuthUrlGetLambdaJwtAuthorizer;
    public boolean hmrcAuthUrlGetLambdaCustomAuthorizer;

    public String hmrcTokenPostLambdaHandler;
    public String hmrcTokenPostLambdaFunctionName;
    public String hmrcTokenPostLambdaArn;
    public HttpMethod hmrcTokenPostLambdaHttpMethod;
    public String hmrcTokenPostLambdaUrlPath;
    public boolean hmrcTokenPostLambdaJwtAuthorizer;
    public boolean hmrcTokenPostLambdaCustomAuthorizer;

    public String hmrcVatReturnPostLambdaHandler;
    public String hmrcVatReturnPostLambdaFunctionName;
    public String hmrcVatReturnPostLambdaArn;
    public HttpMethod hmrcVatReturnPostLambdaHttpMethod;
    public String hmrcVatReturnPostLambdaUrlPath;
    public boolean hmrcVatReturnPostLambdaJwtAuthorizer;
    public boolean hmrcVatReturnPostLambdaCustomAuthorizer;

    public String hmrcVatObligationGetLambdaHandler;
    public String hmrcVatObligationGetLambdaFunctionName;
    public String hmrcVatObligationGetLambdaArn;
    public HttpMethod hmrcVatObligationGetLambdaHttpMethod;
    public String hmrcVatObligationGetLambdaUrlPath;
    public boolean hmrcVatObligationGetLambdaJwtAuthorizer;
    public boolean hmrcVatObligationGetLambdaCustomAuthorizer;

    public String hmrcVatReturnGetLambdaHandler;
    public String hmrcVatReturnGetLambdaFunctionName;
    public String hmrcVatReturnGetLambdaArn;
    public HttpMethod hmrcVatReturnGetLambdaHttpMethod;
    public String hmrcVatReturnGetLambdaUrlPath;
    public boolean hmrcVatReturnGetLambdaJwtAuthorizer;
    public boolean hmrcVatReturnGetLambdaCustomAuthorizer;

    public String receiptPostLambdaHandler;
    public String receiptPostLambdaFunctionName;
    public String receiptPostLambdaArn;
    public HttpMethod receiptPostLambdaHttpMethod;
    public String receiptPostLambdaUrlPath;
    public boolean receiptPostLambdaJwtAuthorizer;
    public boolean receiptPostLambdaCustomAuthorizer;

    public String receiptGetLambdaHandler;
    public String receiptGetLambdaFunctionName;
    public String receiptGetLambdaArn;
    public HttpMethod receiptGetLambdaHttpMethod;
    public String receiptGetLambdaUrlPath;
    public String receiptGetByNameLambdaUrlPath;
    public boolean receiptGetLambdaJwtAuthorizer;
    public boolean receiptGetLambdaCustomAuthorizer;

    public String catalogGetLambdaHandler;
    public String catalogGetLambdaFunctionName;
    public String catalogGetLambdaArn;
    public HttpMethod catalogGetLambdaHttpMethod;
    public String catalogGetLambdaUrlPath;
    public boolean catalogGetLambdaJwtAuthorizer;
    public boolean catalogGetLambdaCustomAuthorizer;

    public String bundleGetLambdaHandler;
    public String bundleGetLambdaFunctionName;
    public String bundleGetLambdaArn;
    public HttpMethod bundleGetLambdaHttpMethod;
    public String bundleGetLambdaUrlPath;
    public boolean bundleGetLambdaJwtAuthorizer;
    public boolean bundleGetLambdaCustomAuthorizer;

    public String bundlePostLambdaHandler;
    public String bundlePostLambdaFunctionName;
    public String bundlePostLambdaArn;
    public HttpMethod bundlePostLambdaHttpMethod;
    public String bundlePostLambdaUrlPath;
    public boolean bundlePostLambdaJwtAuthorizer;
    public boolean bundlePostLambdaCustomAuthorizer;

    public String bundleDeleteLambdaHandler;
    public String bundleDeleteLambdaFunctionName;
    public String bundleDeleteLambdaArn;
    public HttpMethod bundleDeleteLambdaHttpMethod;
    public String bundleDeleteLambdaUrlPath;
    public boolean bundleDeleteLambdaJwtAuthorizer;
    public boolean bundleDeleteLambdaCustomAuthorizer;

    public String selfDestructLambdaHandler;
    public String selfDestructLambdaFunctionName;
    public String selfDestructLambdaArn;

    public String edgeStackId;
    public String publishStackId;

    public String outboundProxyFunctionName;
    public String outboundProxyFunctionArn;
    public String proxyApiName;
    public String hmrcApiProxyMappedUrl;
    public String hmrcSandboxApiProxyMappedUrl;

    public static class SubmitSharedNamesProps {
        public String hostedZoneName;
        public String envName;
        public String subDomainName;
        public String deploymentName;
        public String regionName;
        public String awsAccount;
    }

    private SubmitSharedNames() {}

    // Common HTTP response codes to be referenced across infra generators and stacks
    public static class Responses {
        public static final String OK = "200";
        public static final String UNAUTHORIZED = "401";
        public static final String FORBIDDEN = "403";
        public static final String NOT_FOUND = "404";
        public static final String SERVER_ERROR = "500";
    }

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
        this.hostedZoneName = props.hostedZoneName;
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
        this.observabilityStackId = "%s-env-ObservabilityStack".formatted(props.envName);
        this.observabilityUE1StackId = "%s-env-ObservabilityUE1Stack".formatted(props.envName);
        this.dataStackId = "%s-env-DataStack".formatted(props.envName);
        this.identityStackId = "%s-env-IdentityStack".formatted(props.envName);
        this.apexStackId = "%s-env-ApexStack".formatted(props.envName);
        this.proxyStackId = "%s-env-ProxyStack".formatted(props.envName);
        this.cognitoBaseUri = "https://%s".formatted(this.cognitoDomainName);

        this.receiptsTableName = "%s-receipts".formatted(this.envDashedDomainName);
        this.bundlesTableName = "%s-bundles".formatted(this.envDashedDomainName);
        this.hmrcApiRequestsTableName = "%s-hmrc-api-requests".formatted(this.envDashedDomainName);
        this.proxyStateTableName = "%s-proxy-state".formatted(this.envDashedDomainName);
        this.distributionAccessLogGroupName = "distribution-%s-logs".formatted(this.envDashedDomainName);
        this.distributionAccessLogDeliveryHoldingSourceName =
                "%s-holding-dist-logs-src".formatted(this.envDashedDomainName);
        this.distributionAccessLogDeliveryOriginSourceName = "%s-orig-dist-l-src".formatted(props.deploymentName); // x
        this.distributionAccessLogDeliveryHoldingDestinationName =
                "%s-holding-logs-dest".formatted(this.envDashedDomainName);
        this.distributionAccessLogDeliveryOriginDestinationName = "%s-orig-l-dst".formatted(props.deploymentName); // x

        this.ew2SelfDestructLogGroupName =
                "/aws/lambda/%s-self-destruct-eu-west-2".formatted(this.envResourceNamePrefix);
        this.ue1SelfDestructLogGroupName =
                "/aws/lambda/%s-self-destruct-us-east-1".formatted(this.envResourceNamePrefix);
        this.apiAccessLogGroupName = "/aws/apigw/%s/access".formatted(this.envResourceNamePrefix);

        this.appResourceNamePrefix = "%s-app".formatted(generateResourceNamePrefix(this.deploymentDomainName));
        this.devStackId = "%s-app-DevStack".formatted(props.deploymentName);
        this.ue1DevStackId = "%s-app-DevUE1Stack".formatted(props.deploymentName);
        this.authStackId = "%s-app-AuthStack".formatted(props.deploymentName);
        this.hmrcStackId = "%s-app-HmrcStack".formatted(props.deploymentName);
        this.accountStackId = "%s-app-AccountStack".formatted(props.deploymentName);
        this.apiStackId = "%s-app-ApiStack".formatted(props.deploymentName);
        this.opsStackId = "%s-app-OpsStack".formatted(props.deploymentName);
        this.selfDestructStackId = "%s-app-SelfDestructStack".formatted(props.deploymentName);
        this.ecrRepositoryArn = "arn:aws:ecr:%s:%s:repository/%s-ecr"
                .formatted(props.regionName, props.awsAccount, this.appResourceNamePrefix);
        this.ecrRepositoryName = "%s-ecr".formatted(this.appResourceNamePrefix);
        this.ecrLogGroupName = "/aws/ecr/%s".formatted(this.appResourceNamePrefix);
        this.ecrPublishRoleName = "%s-ecr-publish-role".formatted(appResourceNamePrefix);
        this.ue1EcrRepositoryArn =
                "arn:aws:ecr:us-east-1:%s:repository/%s-ecr".formatted(props.awsAccount, this.appResourceNamePrefix);
        this.ue1EcrRepositoryName = "%s-ecr-us-east-1".formatted(this.appResourceNamePrefix);
        this.ue1EcrLogGroupName = "/aws/ecr/%s-us-east-1".formatted(this.appResourceNamePrefix);
        this.ue1EcrPublishRoleName = "%s-ecr-publish-role-us-east-1".formatted(appResourceNamePrefix);

        this.edgeStackId = "%s-app-EdgeStack".formatted(props.deploymentName);
        this.publishStackId = "%s-app-PublishStack".formatted(props.deploymentName);

        this.outboundProxyFunctionName = "%s-outbound-proxy".formatted(this.envResourceNamePrefix);
        this.outboundProxyFunctionArn = "arn:aws:lambda:%s:%s:function:%s"
                .formatted(props.regionName, props.awsAccount, this.outboundProxyFunctionName);
        this.proxyApiName = "%s-proxy-api".formatted(this.envResourceNamePrefix);
        this.hmrcApiProxyMappedUrl =
                "%s-hmrc-api-proxy.%s.%s".formatted(props.envName, props.subDomainName, props.hostedZoneName);
        this.hmrcSandboxApiProxyMappedUrl =
                "%s-hmrc-sandbox-api-proxy.%s.%s".formatted(props.envName, props.subDomainName, props.hostedZoneName);

        this.trailName = "%s-trail".formatted(this.envResourceNamePrefix);
        this.holdingBucketName =
                convertDotSeparatedToDashSeparated("%s-holding-us-east-1".formatted(this.envResourceNamePrefix));
        this.originBucketName =
                convertDotSeparatedToDashSeparated("%s-origin-us-east-1".formatted(this.appResourceNamePrefix));
        this.originAccessLogBucketName = "%s-origin-access-logs".formatted(this.appResourceNamePrefix);

        var appLambdaHandlerPrefix = "app/functions";
        var appLambdaArnPrefix = "arn:aws:lambda:%s:%s:function:%s"
                .formatted(props.regionName, props.awsAccount, this.appResourceNamePrefix);

        this.cognitoAuthUrlGetLambdaHttpMethod = HttpMethod.GET;
        this.cognitoAuthUrlGetLambdaUrlPath = "/api/v1/cognito/authUrl";
        this.cognitoAuthUrlGetLambdaJwtAuthorizer = false;
        this.cognitoAuthUrlGetLambdaCustomAuthorizer = false;
        var cognitoAuthUrlGetLambdaHandlerName = "cognitoAuthUrlGet.handler";
        var cognitoAuthUrlGetLambdaHandlerDashed =
                ResourceNameUtils.convertCamelCaseToDashSeparated(cognitoAuthUrlGetLambdaHandlerName);
        this.cognitoAuthUrlGetLambdaFunctionName =
                "%s-%s".formatted(this.appResourceNamePrefix, cognitoAuthUrlGetLambdaHandlerDashed);
        this.cognitoAuthUrlGetLambdaHandler =
                "%s/auth/%s".formatted(appLambdaHandlerPrefix, cognitoAuthUrlGetLambdaHandlerName);
        this.cognitoAuthUrlGetLambdaArn = "%s-%s".formatted(appLambdaArnPrefix, cognitoAuthUrlGetLambdaHandlerDashed);
        publishedApiLambdas.add(new PublishedLambda(
                this.cognitoAuthUrlGetLambdaHttpMethod,
                this.cognitoAuthUrlGetLambdaUrlPath,
                "Get Cognito authentication URL",
                "Returns the Cognito OAuth2 authorization URL for user login",
                "getCognitoAuthUrl",
                List.of(new ApiParameter("state", "query", true, "Opaque state value to mitigate CSRF attacks"))));

        this.cognitoTokenPostLambdaHttpMethod = HttpMethod.POST;
        this.cognitoTokenPostLambdaUrlPath = "/api/v1/cognito/token";
        this.cognitoTokenPostLambdaJwtAuthorizer = false;
        this.cognitoTokenPostLambdaCustomAuthorizer = false;
        var cognitoTokenPostLambdaHandlerName = "cognitoTokenPost.handler";
        var cognitoTokenPostLambdaHandlerDashed =
                ResourceNameUtils.convertCamelCaseToDashSeparated(cognitoTokenPostLambdaHandlerName);
        this.cognitoTokenPostLambdaFunctionName =
                "%s-%s".formatted(this.appResourceNamePrefix, cognitoTokenPostLambdaHandlerDashed);
        this.cognitoTokenPostLambdaHandler =
                "%s/auth/%s".formatted(appLambdaHandlerPrefix, cognitoTokenPostLambdaHandlerName);
        this.cognitoTokenPostLambdaArn = "%s-%s".formatted(appLambdaArnPrefix, cognitoTokenPostLambdaHandlerDashed);
        publishedApiLambdas.add(new PublishedLambda(
                this.cognitoTokenPostLambdaHttpMethod,
                this.cognitoTokenPostLambdaUrlPath,
                "Exchange Cognito authorization code for access token",
                "Exchanges an authorization code for a Cognito access token",
                "exchangeCognitoToken"));

        // Custom authorizer for HMRC VAT endpoints
        var customAuthorizerHandlerName = "customAuthorizer.handler";
        var customAuthorizerHandlerDashed =
                ResourceNameUtils.convertCamelCaseToDashSeparated(customAuthorizerHandlerName);
        this.customAuthorizerLambdaFunctionName =
                "%s-%s".formatted(this.appResourceNamePrefix, customAuthorizerHandlerDashed);
        this.customAuthorizerLambdaHandler =
                "%s/auth/%s".formatted(appLambdaHandlerPrefix, customAuthorizerHandlerName);
        this.customAuthorizerLambdaArn = "%s-%s".formatted(appLambdaArnPrefix, customAuthorizerHandlerDashed);

        this.hmrcAuthUrlGetLambdaHttpMethod = HttpMethod.GET;
        this.hmrcAuthUrlGetLambdaUrlPath = "/api/v1/hmrc/authUrl";
        this.hmrcAuthUrlGetLambdaJwtAuthorizer = false;
        this.hmrcAuthUrlGetLambdaCustomAuthorizer = false;
        var hmrcAuthUrlGetLambdaHandlerName = "hmrcAuthUrlGet.handler";
        var hmrcAuthUrlGetLambdaHandlerDashed =
                ResourceNameUtils.convertCamelCaseToDashSeparated(hmrcAuthUrlGetLambdaHandlerName);
        this.hmrcAuthUrlGetLambdaFunctionName =
                "%s-%s".formatted(this.appResourceNamePrefix, hmrcAuthUrlGetLambdaHandlerDashed);
        this.hmrcAuthUrlGetLambdaHandler =
                "%s/hmrc/%s".formatted(appLambdaHandlerPrefix, hmrcAuthUrlGetLambdaHandlerName);
        this.hmrcAuthUrlGetLambdaArn = "%s-%s".formatted(appLambdaArnPrefix, hmrcAuthUrlGetLambdaHandlerDashed);
        publishedApiLambdas.add(new PublishedLambda(
                this.hmrcAuthUrlGetLambdaHttpMethod,
                this.hmrcAuthUrlGetLambdaUrlPath,
                "Get HMRC authentication URL",
                "Returns the HMRC OAuth2 authorization URL for accessing HMRC APIs",
                "getHmrcAuthUrl",
                List.of(
                        new ApiParameter("state", "query", true, "Opaque state value to mitigate CSRF attacks"),
                        new ApiParameter("scope", "query", false, "OAuth scopes: write:vat, read:vat or both"))));

        this.hmrcTokenPostLambdaHttpMethod = HttpMethod.POST;
        this.hmrcTokenPostLambdaUrlPath = "/api/v1/hmrc/token";
        this.hmrcTokenPostLambdaJwtAuthorizer = false;
        this.hmrcTokenPostLambdaCustomAuthorizer = false;
        var hmrcTokenPostLambdaHandlerName = "hmrcTokenPost.handler";
        var hmrcTokenPostLambdaHandlerDashed =
                ResourceNameUtils.convertCamelCaseToDashSeparated(hmrcTokenPostLambdaHandlerName);
        this.hmrcTokenPostLambdaFunctionName =
                "%s-%s".formatted(this.appResourceNamePrefix, hmrcTokenPostLambdaHandlerDashed);
        this.hmrcTokenPostLambdaHandler =
                "%s/hmrc/%s".formatted(appLambdaHandlerPrefix, hmrcTokenPostLambdaHandlerName);
        this.hmrcTokenPostLambdaArn = "%s-%s".formatted(appLambdaArnPrefix, hmrcTokenPostLambdaHandlerDashed);
        publishedApiLambdas.add(new PublishedLambda(
                this.hmrcTokenPostLambdaHttpMethod,
                this.hmrcTokenPostLambdaUrlPath,
                "Exchange HMRC authorization code for access token",
                "Exchanges an HMRC authorization code for an access token",
                "exchangeHmrcToken"));

        this.hmrcVatReturnPostLambdaHttpMethod = HttpMethod.POST;
        this.hmrcVatReturnPostLambdaUrlPath = "/api/v1/hmrc/vat/return";
        this.hmrcVatReturnPostLambdaJwtAuthorizer = false;
        this.hmrcVatReturnPostLambdaCustomAuthorizer = true;
        var hmrcVatReturnPostLambdaHandlerName = "hmrcVatReturnPost.handler";
        var hmrcVatReturnPostLambdaHandlerDashed =
                ResourceNameUtils.convertCamelCaseToDashSeparated(hmrcVatReturnPostLambdaHandlerName);
        this.hmrcVatReturnPostLambdaFunctionName =
                "%s-%s".formatted(this.appResourceNamePrefix, hmrcVatReturnPostLambdaHandlerDashed);
        this.hmrcVatReturnPostLambdaHandler =
                "%s/hmrc/%s".formatted(appLambdaHandlerPrefix, hmrcVatReturnPostLambdaHandlerName);
        this.hmrcVatReturnPostLambdaArn = "%s-%s".formatted(appLambdaArnPrefix, hmrcVatReturnPostLambdaHandlerDashed);
        publishedApiLambdas.add(new PublishedLambda(
                this.hmrcVatReturnPostLambdaHttpMethod,
                this.hmrcVatReturnPostLambdaUrlPath,
                "Submit VAT return to HMRC",
                "Submits a VAT return to HMRC on behalf of the authenticated user",
                "submitVatReturn",
                List.of(new ApiParameter("Gov-Test-Scenario", "header", false, "HMRC sandbox test scenario"))));

        this.hmrcVatObligationGetLambdaHttpMethod = HttpMethod.GET;
        this.hmrcVatObligationGetLambdaUrlPath = "/api/v1/hmrc/vat/obligation";
        this.hmrcVatObligationGetLambdaJwtAuthorizer = false;
        this.hmrcVatObligationGetLambdaCustomAuthorizer = true;
        var hmrcVatObligationGetLambdaHandlerName = "hmrcVatObligationGet.handler";
        var hmrcVatObligationGetLambdaHandlerDashed =
                ResourceNameUtils.convertCamelCaseToDashSeparated(hmrcVatObligationGetLambdaHandlerName);
        this.hmrcVatObligationGetLambdaFunctionName =
                "%s-%s".formatted(this.appResourceNamePrefix, hmrcVatObligationGetLambdaHandlerDashed);
        this.hmrcVatObligationGetLambdaHandler =
                "%s/hmrc/%s".formatted(appLambdaHandlerPrefix, hmrcVatObligationGetLambdaHandlerName);
        this.hmrcVatObligationGetLambdaArn =
                "%s-%s".formatted(appLambdaArnPrefix, hmrcVatObligationGetLambdaHandlerDashed);
        publishedApiLambdas.add(new PublishedLambda(
                this.hmrcVatObligationGetLambdaHttpMethod,
                this.hmrcVatObligationGetLambdaUrlPath,
                "Get VAT obligations from HMRC",
                "Retrieves VAT obligations from HMRC for the authenticated user",
                "getVatObligations",
                List.of(
                        new ApiParameter("vrn", "query", true, "VAT Registration Number (9 digits)"),
                        new ApiParameter("from", "query", false, "From date in YYYY-MM-DD format"),
                        new ApiParameter("to", "query", false, "To date in YYYY-MM-DD format"),
                        new ApiParameter("status", "query", false, "Obligation status: O (Open) or F (Fulfilled)"),
                        new ApiParameter("Gov-Test-Scenario", "query", false, "HMRC sandbox test scenario"))));

        this.hmrcVatReturnGetLambdaHttpMethod = HttpMethod.GET;
        this.hmrcVatReturnGetLambdaUrlPath = "/api/v1/hmrc/vat/return/{periodKey}";
        this.hmrcVatReturnGetLambdaJwtAuthorizer = false;
        this.hmrcVatReturnGetLambdaCustomAuthorizer = true;
        var hmrcVatReturnGetLambdaHandlerName = "hmrcVatReturnGet.handler";
        var hmrcVatReturnGetLambdaHandlerDashed =
                ResourceNameUtils.convertCamelCaseToDashSeparated(hmrcVatReturnGetLambdaHandlerName);
        this.hmrcVatReturnGetLambdaFunctionName =
                "%s-%s".formatted(this.appResourceNamePrefix, hmrcVatReturnGetLambdaHandlerDashed);
        this.hmrcVatReturnGetLambdaHandler =
                "%s/hmrc/%s".formatted(appLambdaHandlerPrefix, hmrcVatReturnGetLambdaHandlerName);
        this.hmrcVatReturnGetLambdaArn = "%s-%s".formatted(appLambdaArnPrefix, hmrcVatReturnGetLambdaHandlerDashed);
        publishedApiLambdas.add(new PublishedLambda(
                this.hmrcVatReturnGetLambdaHttpMethod,
                this.hmrcVatReturnGetLambdaUrlPath,
                "Get submitted VAT returns from HMRC",
                "Retrieves previously submitted VAT returns from HMRC for the authenticated user",
                "getVatReturns",
                List.of(
                        new ApiParameter("periodKey", "path", true, "The VAT period key to retrieve"),
                        new ApiParameter("vrn", "query", true, "VAT Registration Number (9 digits)"),
                        new ApiParameter("Gov-Test-Scenario", "query", false, "HMRC sandbox test scenario"))));

        this.receiptPostLambdaHttpMethod = HttpMethod.POST;
        this.receiptPostLambdaUrlPath = "/api/v1/hmrc/receipt";
        this.receiptPostLambdaJwtAuthorizer = true;
        this.receiptPostLambdaCustomAuthorizer = false;
        var receiptPostLambdaHandlerName = "hmrcReceiptPost.handler";
        var receiptPostLambdaHandlerDashed =
                ResourceNameUtils.convertCamelCaseToDashSeparated(receiptPostLambdaHandlerName);
        this.receiptPostLambdaFunctionName =
                "%s-%s".formatted(this.appResourceNamePrefix, receiptPostLambdaHandlerDashed);
        this.receiptPostLambdaHandler = "%s/hmrc/%s".formatted(appLambdaHandlerPrefix, receiptPostLambdaHandlerName);
        this.receiptPostLambdaArn = "%s-%s".formatted(appLambdaArnPrefix, receiptPostLambdaHandlerDashed);
        publishedApiLambdas.add(new PublishedLambda(
                this.receiptPostLambdaHttpMethod,
                this.receiptPostLambdaUrlPath,
                "Log receipt to storage",
                "Logs a transaction receipt to secure storage",
                "logReceipt"));

        this.receiptGetLambdaHttpMethod = HttpMethod.GET;
        this.receiptGetLambdaUrlPath = "/api/v1/hmrc/receipt";
        this.receiptGetLambdaJwtAuthorizer = true;
        this.receiptGetLambdaCustomAuthorizer = false;
        this.receiptGetByNameLambdaUrlPath = "/api/v1/hmrc/receipt/{name}";
        var receiptGetLambdaHandlerName = "hmrcReceiptGet.handler";
        var receiptGetLambdaHandlerDashed =
                ResourceNameUtils.convertCamelCaseToDashSeparated(receiptGetLambdaHandlerName);
        this.receiptGetLambdaFunctionName =
                "%s-%s".formatted(this.appResourceNamePrefix, receiptGetLambdaHandlerDashed);
        this.receiptGetLambdaHandler = "%s/hmrc/%s".formatted(appLambdaHandlerPrefix, receiptGetLambdaHandlerName);
        this.receiptGetLambdaArn = "%s-%s".formatted(appLambdaArnPrefix, receiptGetLambdaHandlerDashed);
        publishedApiLambdas.add(new PublishedLambda(
                this.receiptGetLambdaHttpMethod,
                this.receiptGetLambdaUrlPath,
                "Retrieve stored receipts",
                "Retrieves previously stored receipts for the authenticated user",
                "getReceipts",
                List.of(
                        new ApiParameter("name", "query", false, "Receipt file name including .json"),
                        new ApiParameter("key", "query", false, "Full DynamoDB Item key"))));
        publishedApiLambdas.add(new PublishedLambda(
                this.receiptGetLambdaHttpMethod,
                this.receiptGetByNameLambdaUrlPath,
                "Retrieve a stored receipt by name",
                "Retrieves a specific stored receipt for the authenticated user by file name",
                "getReceiptByName",
                List.of(new ApiParameter("name", "path", true, "The receipt file name including .json"))));

        this.catalogGetLambdaHttpMethod = HttpMethod.GET;
        this.catalogGetLambdaUrlPath = "/api/v1/catalog";
        this.catalogGetLambdaJwtAuthorizer = false;
        this.catalogGetLambdaCustomAuthorizer = false;
        var catalogGetLambdaHandlerName = "catalogGet.handler";
        var catalogGetLambdaHandlerDashed =
                ResourceNameUtils.convertCamelCaseToDashSeparated(catalogGetLambdaHandlerName);
        this.catalogGetLambdaFunctionName =
                "%s-%s".formatted(this.appResourceNamePrefix, catalogGetLambdaHandlerDashed);
        this.catalogGetLambdaHandler = "%s/account/%s".formatted(appLambdaHandlerPrefix, catalogGetLambdaHandlerName);
        this.catalogGetLambdaArn = "%s-%s".formatted(appLambdaArnPrefix, catalogGetLambdaHandlerDashed);
        publishedApiLambdas.add(new PublishedLambda(
                this.catalogGetLambdaHttpMethod,
                this.catalogGetLambdaUrlPath,
                "Get product catalog",
                "Retrieves the available product catalog",
                "getCatalog"));

        this.bundleGetLambdaHttpMethod = HttpMethod.GET;
        this.bundleGetLambdaUrlPath = "/api/v1/bundle";
        this.bundleGetLambdaJwtAuthorizer = true;
        this.bundleGetLambdaCustomAuthorizer = false;
        var bundleGetLambdaHandlerName = "bundleGet.handler";
        var bundleGetLambdaHandlerDashed =
                ResourceNameUtils.convertCamelCaseToDashSeparated(bundleGetLambdaHandlerName);
        this.bundleGetLambdaFunctionName = "%s-%s".formatted(this.appResourceNamePrefix, bundleGetLambdaHandlerDashed);
        this.bundleGetLambdaHandler = "%s/account/%s".formatted(appLambdaHandlerPrefix, bundleGetLambdaHandlerName);
        this.bundleGetLambdaArn = "%s-%s".formatted(appLambdaArnPrefix, bundleGetLambdaHandlerDashed);
        publishedApiLambdas.add(new PublishedLambda(
                this.bundleGetLambdaHttpMethod,
                this.bundleGetLambdaUrlPath,
                "Get user bundles",
                "Retrieves all bundles for the authenticated user",
                "getBundles"));

        this.bundlePostLambdaHttpMethod = HttpMethod.POST;
        this.bundlePostLambdaUrlPath = "/api/v1/bundle";
        this.bundlePostLambdaJwtAuthorizer = true;
        this.bundlePostLambdaCustomAuthorizer = false;
        var bundlePostLambdaHandlerName = "bundlePost.handler";
        var bundlePostLambdaHandlerDashed =
                ResourceNameUtils.convertCamelCaseToDashSeparated(bundlePostLambdaHandlerName);
        this.bundlePostLambdaFunctionName =
                "%s-%s".formatted(this.appResourceNamePrefix, bundlePostLambdaHandlerDashed);
        this.bundlePostLambdaHandler = "%s/account/%s".formatted(appLambdaHandlerPrefix, bundlePostLambdaHandlerName);
        this.bundlePostLambdaArn = "%s-%s".formatted(appLambdaArnPrefix, bundlePostLambdaHandlerDashed);
        publishedApiLambdas.add(new PublishedLambda(
                this.bundlePostLambdaHttpMethod,
                this.bundlePostLambdaUrlPath,
                "Request new bundle",
                "Creates a new bundle request for the authenticated user",
                "requestBundle"));

        this.bundleDeleteLambdaHttpMethod = HttpMethod.DELETE;
        this.bundleDeleteLambdaUrlPath = "/api/v1/bundle";
        this.bundleDeleteLambdaJwtAuthorizer = true;
        this.bundleDeleteLambdaCustomAuthorizer = false;
        var bundleDeleteLambdaHandlerName = "bundleDelete.handler";
        var bundleDeleteLambdaHandlerDashed =
                ResourceNameUtils.convertCamelCaseToDashSeparated(bundleDeleteLambdaHandlerName);
        this.bundleDeleteLambdaFunctionName =
                "%s-%s".formatted(this.appResourceNamePrefix, bundleDeleteLambdaHandlerDashed);
        this.bundleDeleteLambdaHandler =
                "%s/account/%s".formatted(appLambdaHandlerPrefix, bundleDeleteLambdaHandlerName);
        this.bundleDeleteLambdaArn = "%s-%s".formatted(appLambdaArnPrefix, bundleDeleteLambdaHandlerDashed);
        publishedApiLambdas.add(new PublishedLambda(
                this.bundleDeleteLambdaHttpMethod,
                this.bundleDeleteLambdaUrlPath,
                "Delete bundle",
                "Deletes a bundle for the authenticated user",
                "deleteBundle",
                List.of(
                        new ApiParameter("bundleId", "query", false, "The bundle id (or name) to delete"),
                        new ApiParameter("removeAll", "query", false, "When true, removes all bundles"))));
        publishedApiLambdas.add(new PublishedLambda(
                this.bundleDeleteLambdaHttpMethod,
                "/api/v1/bundle/{id}",
                "Delete bundle by id",
                "Deletes a bundle for the authenticated user using a path parameter",
                "deleteBundleById",
                List.of(new ApiParameter("id", "path", true, "The bundle id (or name) to delete"))));

        var appSelfDestructLambdaHandlerName = "selfDestruct.handler";
        var appSelfDestructLambdaHandlerDashed =
                ResourceNameUtils.convertCamelCaseToDashSeparated(appSelfDestructLambdaHandlerName);
        this.selfDestructLambdaFunctionName =
                "%s-app-%s".formatted(this.appResourceNamePrefix, appSelfDestructLambdaHandlerDashed);
        this.selfDestructLambdaHandler =
                "%s/infra/%s".formatted(appLambdaHandlerPrefix, appSelfDestructLambdaHandlerName);
        this.selfDestructLambdaArn = "%s-%s".formatted(appLambdaArnPrefix, appSelfDestructLambdaHandlerDashed);
    }
}
