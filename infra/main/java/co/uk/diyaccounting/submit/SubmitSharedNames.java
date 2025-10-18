package co.uk.diyaccounting.submit;

import static co.uk.diyaccounting.submit.utils.ResourceNameUtils.buildCognitoDomainName;
import static co.uk.diyaccounting.submit.utils.ResourceNameUtils.buildDashedDomainName;
import static co.uk.diyaccounting.submit.utils.ResourceNameUtils.buildDomainName;
import static co.uk.diyaccounting.submit.utils.ResourceNameUtils.buildEcrRepositoryName;
import static co.uk.diyaccounting.submit.utils.ResourceNameUtils.buildFunctionName;
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
    public String opsStackId;
    public String appSelfDestructStackId;
    public String ecrRepositoryArn;
    public String ecrRepositoryName;

    public String authUrlMockLambdaHandler;
    public String authUrlMockLambdaFunctionName;
    public String authUrlMockLambdaArn;
    public String authUrlMockLambdaUrlPath;

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
    public String catalogLambdaUrlPath;

    public String requestBundlesLambdaHandler;
    public String requestBundlesLambdaFunctionName;
    public String requestBundlesLambdaArn;
    public String requestBundlesLambdaUrlPath;

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
        this.domainName = buildDomainName(props.deploymentName, props.subDomainName, props.hostedZoneName);
        this.cognitoDomainName = buildCognitoDomainName(
                props.envName, props.cognitoDomainPrefix, props.subDomainName, props.hostedZoneName);
        this.holdingDomainName = buildDomainName("%s-holding".formatted(props.envName), props.subDomainName, props.hostedZoneName);
        this.baseUrl = "https://%s/".formatted(this.domainName);
        this.envBaseUrl = "https://%s/".formatted(this.envDomainName);
        this.dashedDomainName = buildDashedDomainName(this.domainName);

        this.envDomainName = buildDomainName(props.envName, props.subDomainName, props.hostedZoneName);
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
        this.opsStackId = "app-%s-OpsStack".formatted(props.deploymentName);
        this.appSelfDestructStackId = "app-%s-SelfDestructStack".formatted(props.deploymentName);
        this.ecrRepositoryArn = "arn:aws:ecr:%s:%s:repository/%s-ecr"
                .formatted(props.regionName, props.awsAccount, this.appResourceNamePrefix);
        this.ecrRepositoryName = buildEcrRepositoryName(this.appResourceNamePrefix);

        var appLambdaArnPrefix = "arn:aws:lambda:%s:%s:function:%s-"
                .formatted(props.regionName, props.awsAccount, this.appResourceNamePrefix);

        this.authUrlMockLambdaHandler = "authUrl.httpGetMock";
        this.authUrlMockLambdaFunctionName =
                buildFunctionName(this.appResourceNamePrefix, this.authUrlMockLambdaHandler);
        this.authUrlMockLambdaArn = "%s-auth-url-mock".formatted(appLambdaArnPrefix);
        this.authUrlMockLambdaUrlPath = "/api/mock/auth-url";

        this.authUrlCognitoLambdaHandler = "authUrl.httpGetCognito";
        this.authUrlCognitoLambdaFunctionName =
                buildFunctionName(this.appResourceNamePrefix, this.authUrlCognitoLambdaHandler);
        this.authUrlCognitoLambdaArn = "%s-auth-url-cognito".formatted(appLambdaArnPrefix);
        this.authUrlCognitoLambdaUrlPath = "/api/cognito/auth-url";

        this.exchangeCognitoTokenLambdaHandler = "token.httpPostCognito";
        this.exchangeCognitoTokenLambdaFunctionName =
                buildFunctionName(this.appResourceNamePrefix, this.exchangeCognitoTokenLambdaHandler);
        this.exchangeCognitoTokenLambdaArn = "%s-exchange-cognito-token".formatted(appLambdaArnPrefix);
        this.exchangeCognitoTokenLambdaUrlPath = "/api/cognito/exchange-token";

        this.authUrlHmrcLambdaHandler = "authUrl.httpGetHmrc";
        this.authUrlHmrcLambdaFunctionName =
                buildFunctionName(this.appResourceNamePrefix, this.authUrlHmrcLambdaHandler);
        this.authUrlHmrcLambdaArn = "%s-auth-url-hmrc".formatted(appLambdaArnPrefix);
        this.authUrlHmrcLambdaUrlPath = "/api/hmrc/auth-url";

        this.exchangeHmrcTokenLambdaHandler = "token.httpPostHmrc";
        this.exchangeHmrcTokenLambdaFunctionName =
                buildFunctionName(this.appResourceNamePrefix, this.exchangeHmrcTokenLambdaHandler);
        this.exchangeHmrcTokenLambdaArn = "%s-exchange-hmrc-token".formatted(appLambdaArnPrefix);
        this.exchangeHmrcTokenLambdaUrlPath = "/api/hmrc/exchange-token";

        this.submitVatLambdaHandler = "submitVat.httpPost";
        this.submitVatLambdaFunctionName = buildFunctionName(this.appResourceNamePrefix, this.submitVatLambdaHandler);
        this.submitVatLambdaArn = "%s-submit-vat".formatted(appLambdaArnPrefix);
        this.submitVatLambdaUrlPath = "/api/submit-vat";

        this.logReceiptLambdaHandler = "logReceipt.httpPost";
        this.logReceiptLambdaFunctionName = buildFunctionName(this.appResourceNamePrefix, this.logReceiptLambdaHandler);
        this.logReceiptLambdaArn = "%s-log-receipt".formatted(appLambdaArnPrefix);
        this.logReceiptLambdaUrlPath = "/api/log-receipt";

        this.myReceiptsLambdaHandler = "myReceipts.httpGet";
        this.myReceiptsLambdaFunctionName = buildFunctionName(this.appResourceNamePrefix, this.myReceiptsLambdaHandler);
        this.myReceiptsLambdaArn = "%s-my-receipts".formatted(appLambdaArnPrefix);
        this.myReceiptsLambdaUrlPath = "/api/my-receipts";

        this.catalogLambdaHandler = "catalogGet.handle";
        this.catalogLambdaFunctionName = buildFunctionName(this.appResourceNamePrefix, this.catalogLambdaHandler);
        this.catalogLambdaArn = "%s-catalog".formatted(appLambdaArnPrefix);
        this.catalogLambdaUrlPath = "/api/catalog"; // TODO change to /api/catalog-get to support verbs.

        this.requestBundlesLambdaHandler = "bundle.httpPost";
        this.requestBundlesLambdaFunctionName =
                buildFunctionName(this.appResourceNamePrefix, this.requestBundlesLambdaHandler);
        this.requestBundlesLambdaArn = "%s-request-bundles".formatted(appLambdaArnPrefix);
        this.requestBundlesLambdaUrlPath = "/api/request-bundle";

        this.myBundlesLambdaHandler = "myBundles.httpGet";
        this.myBundlesLambdaFunctionName = buildFunctionName(this.appResourceNamePrefix, this.myBundlesLambdaHandler);
        this.myBundlesLambdaArn = "%s-my-bundles".formatted(appLambdaArnPrefix);
        this.myBundlesLambdaUrlPath = "/api/my-bundles";

        this.lambdaArns = new java.util.ArrayList<>();
        this.lambdaArns.add(this.authUrlMockLambdaArn);
        this.lambdaArns.add(this.authUrlCognitoLambdaArn);
        this.lambdaArns.add(this.exchangeCognitoTokenLambdaArn);
        this.lambdaArns.add(this.authUrlHmrcLambdaArn);
        this.lambdaArns.add(this.exchangeHmrcTokenLambdaArn);
        this.lambdaArns.add(this.submitVatLambdaArn);
        this.lambdaArns.add(this.logReceiptLambdaArn);
        this.lambdaArns.add(this.myReceiptsLambdaArn);
        this.lambdaArns.add(this.catalogLambdaArn);
        this.lambdaArns.add(this.requestBundlesLambdaArn);
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
