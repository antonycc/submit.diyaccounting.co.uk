package co.uk.diyaccounting.submit.stacks;

public class WebStackProps {
    public final String env;
    public final String hostedZoneName;
    public final String hostedZoneId;
    public final String subDomainName;
    public final String certificateArn;
    public final String userPoolArn;
    public final String cloudTrailEnabled;
    public final String xRayEnabled;
    public final String verboseLogging;
    public final String cloudTrailLogGroupRetentionPeriodDays;
    public final String accessLogGroupRetentionPeriodDays;
    public final String s3UseExistingBucket;
    public final String s3RetainOriginBucket;
    public final String s3RetainReceiptsBucket;
    public final String cloudTrailEventSelectorPrefix;
    public final String logS3ObjectEventHandlerSource;
    public final String logGzippedS3ObjectEventHandlerSource;
    public final String docRootPath;
    public final String defaultDocumentAtOrigin;
    public final String error404NotFoundAtDistribution;
    public final String skipLambdaUrlOrigins;
    public final String hmrcClientId;
    public final String hmrcClientSecretArn;
    public final String homeUrl;
    public final String hmrcBaseUri;
    public final String optionalTestAccessToken;
    public final String optionalTestS3Endpoint;
    public final String optionalTestS3AccessKey;
    public final String optionalTestS3SecretKey;
    public final String receiptsBucketPostfix;
    public final String lambdaEntry;
    public final String authUrlHmrcLambdaHandlerFunctionName;
    public final String authUrlHmrcLambdaUrlPath;
    public final String authUrlHmrcLambdaDurationMillis;
    public final String authUrlMockLambdaHandlerFunctionName;
    public final String authUrlMockLambdaUrlPath;
    public final String authUrlMockLambdaDurationMillis;
    public final String authUrlCognitoLambdaHandlerFunctionName;
    public final String authUrlCognitoLambdaUrlPath;
    public final String authUrlCognitoLambdaDurationMillis;
    public final String exchangeHmrcTokenLambdaHandlerFunctionName;
    public final String exchangeHmrcTokenLambdaUrlPath;
    public final String exchangeHmrcTokenLambdaDurationMillis;
    public final String exchangeCognitoTokenLambdaHandlerFunctionName;
    public final String exchangeCognitoTokenLambdaUrlPath;
    public final String exchangeCognitoTokenLambdaDurationMillis;
    public final String submitVatLambdaHandlerFunctionName;
    public final String submitVatLambdaUrlPath;
    public final String submitVatLambdaDurationMillis;
    public final String logReceiptLambdaHandlerFunctionName;
    public final String logReceiptLambdaUrlPath;
    public final String logReceiptLambdaDurationMillis;
    public final String lambdaUrlAuthType;
    public final String commitHash;
    public final String googleClientId;
    public final String googleBaseUri;
    public final String googleClientSecretArn;
    public final String cognitoDomainPrefix;
    public final String bundleExpiryDate;
    public final String bundleUserLimit;
    public final String bundleLambdaHandlerFunctionName;
    public final String bundleLambdaUrlPath;
    public final String bundleLambdaDurationMillis;
    public final String catalogueLambdaHandlerFunctionName;
    public final String catalogueLambdaUrlPath;
    public final String catalogueLambdaDurationMillis;
    public final String myBundlesLambdaHandlerFunctionName;
    public final String myBundlesLambdaUrlPath;
    public final String myBundlesLambdaDurationMillis;
    public final String baseImageTag;
    public final String cognitoFeaturePlan;
    public final String cognitoEnableLogDelivery;
    public final String logCognitoEventHandlerSource;
    public final String myReceiptsLambdaHandlerFunctionName;
    public final String myReceiptsLambdaUrlPath;
    public final String myReceiptsLambdaDurationMillis;
    public final String antonyccClientId;
    public final String antonyccBaseUri;
    public final String cognitoClientId;
    public final String cognitoBaseUri;
    public final String ecrRepositoryArn;
    public final String ecrRepositoryName;

    private WebStackProps(Builder b) {
        this.env = b.env;
        this.hostedZoneName = b.hostedZoneName;
        this.hostedZoneId = b.hostedZoneId;
        this.subDomainName = b.subDomainName;
        this.certificateArn = b.certificateArn;
        this.userPoolArn = b.userPoolArn;
        this.cloudTrailEnabled = b.cloudTrailEnabled;
        this.xRayEnabled = b.xRayEnabled;
        this.verboseLogging = b.verboseLogging;
        this.cloudTrailLogGroupRetentionPeriodDays = b.cloudTrailLogGroupRetentionPeriodDays;
        this.accessLogGroupRetentionPeriodDays = b.accessLogGroupRetentionPeriodDays;
        this.s3UseExistingBucket = b.s3UseExistingBucket;
        this.s3RetainOriginBucket = b.s3RetainOriginBucket;
        this.s3RetainReceiptsBucket = b.s3RetainReceiptsBucket;
        this.cloudTrailEventSelectorPrefix = b.cloudTrailEventSelectorPrefix;
        this.logS3ObjectEventHandlerSource = b.logS3ObjectEventHandlerSource;
        this.logGzippedS3ObjectEventHandlerSource = b.logGzippedS3ObjectEventHandlerSource;
        this.docRootPath = b.docRootPath;
        this.defaultDocumentAtOrigin = b.defaultDocumentAtOrigin;
        this.error404NotFoundAtDistribution = b.error404NotFoundAtDistribution;
        this.skipLambdaUrlOrigins = b.skipLambdaUrlOrigins;
        this.hmrcClientId = b.hmrcClientId;
        this.hmrcClientSecretArn = b.hmrcClientSecretArn;
        this.homeUrl = b.homeUrl;
        this.hmrcBaseUri = b.hmrcBaseUri;
        this.optionalTestAccessToken = b.optionalTestAccessToken;
        this.optionalTestS3Endpoint = b.optionalTestS3Endpoint;
        this.optionalTestS3AccessKey = b.optionalTestS3AccessKey;
        this.optionalTestS3SecretKey = b.optionalTestS3SecretKey;
        this.receiptsBucketPostfix = b.receiptsBucketPostfix;
        this.lambdaEntry = b.lambdaEntry;
        this.authUrlHmrcLambdaHandlerFunctionName = b.authUrlHmrcLambdaHandlerFunctionName;
        this.authUrlHmrcLambdaUrlPath = b.authUrlHmrcLambdaUrlPath;
        this.authUrlHmrcLambdaDurationMillis = b.authUrlHmrcLambdaDurationMillis;
        this.authUrlMockLambdaHandlerFunctionName = b.authUrlMockLambdaHandlerFunctionName;
        this.authUrlMockLambdaUrlPath = b.authUrlMockLambdaUrlPath;
        this.authUrlMockLambdaDurationMillis = b.authUrlMockLambdaDurationMillis;
        this.authUrlCognitoLambdaHandlerFunctionName = b.authUrlCognitoLambdaHandlerFunctionName;
        this.authUrlCognitoLambdaUrlPath = b.authUrlCognitoLambdaUrlPath;
        this.authUrlCognitoLambdaDurationMillis = b.authUrlCognitoLambdaDurationMillis;
        this.exchangeHmrcTokenLambdaHandlerFunctionName = b.exchangeHmrcTokenLambdaHandlerFunctionName;
        this.exchangeHmrcTokenLambdaUrlPath = b.exchangeHmrcTokenLambdaUrlPath;
        this.exchangeHmrcTokenLambdaDurationMillis = b.exchangeHmrcTokenLambdaDurationMillis;
        this.exchangeCognitoTokenLambdaHandlerFunctionName = b.exchangeCognitoTokenLambdaHandlerFunctionName;
        this.exchangeCognitoTokenLambdaUrlPath = b.exchangeCognitoTokenLambdaUrlPath;
        this.exchangeCognitoTokenLambdaDurationMillis = b.exchangeCognitoTokenLambdaDurationMillis;
        this.submitVatLambdaHandlerFunctionName = b.submitVatLambdaHandlerFunctionName;
        this.submitVatLambdaUrlPath = b.submitVatLambdaUrlPath;
        this.submitVatLambdaDurationMillis = b.submitVatLambdaDurationMillis;
        this.logReceiptLambdaHandlerFunctionName = b.logReceiptLambdaHandlerFunctionName;
        this.logReceiptLambdaUrlPath = b.logReceiptLambdaUrlPath;
        this.logReceiptLambdaDurationMillis = b.logReceiptLambdaDurationMillis;
        this.lambdaUrlAuthType = b.lambdaUrlAuthType;
        this.commitHash = b.commitHash;
        this.googleClientId = b.googleClientId;
        this.googleBaseUri = b.googleBaseUri;
        this.googleClientSecretArn = b.googleClientSecretArn;
        this.cognitoDomainPrefix = b.cognitoDomainPrefix;
        this.bundleExpiryDate = b.bundleExpiryDate;
        this.bundleUserLimit = b.bundleUserLimit;
        this.bundleLambdaHandlerFunctionName = b.bundleLambdaHandlerFunctionName;
        this.bundleLambdaUrlPath = b.bundleLambdaUrlPath;
        this.bundleLambdaDurationMillis = b.bundleLambdaDurationMillis;
        this.catalogueLambdaHandlerFunctionName = b.catalogueLambdaHandlerFunctionName;
        this.catalogueLambdaUrlPath = b.catalogueLambdaUrlPath;
        this.catalogueLambdaDurationMillis = b.catalogueLambdaDurationMillis;
        this.myBundlesLambdaHandlerFunctionName = b.myBundlesLambdaHandlerFunctionName;
        this.myBundlesLambdaUrlPath = b.myBundlesLambdaUrlPath;
        this.myBundlesLambdaDurationMillis = b.myBundlesLambdaDurationMillis;
        this.baseImageTag = b.baseImageTag;
        this.cognitoFeaturePlan = b.cognitoFeaturePlan;
        this.cognitoEnableLogDelivery = b.cognitoEnableLogDelivery;
        this.logCognitoEventHandlerSource = b.logCognitoEventHandlerSource;
        this.myReceiptsLambdaHandlerFunctionName = b.myReceiptsLambdaHandlerFunctionName;
        this.myReceiptsLambdaUrlPath = b.myReceiptsLambdaUrlPath;
        this.myReceiptsLambdaDurationMillis = b.myReceiptsLambdaDurationMillis;
        this.antonyccClientId = b.antonyccClientId;
        this.antonyccBaseUri = b.antonyccBaseUri;
        this.cognitoClientId = b.cognitoClientId;
        this.cognitoBaseUri = b.cognitoBaseUri;
        this.ecrRepositoryArn = b.ecrRepositoryArn;
        this.ecrRepositoryName = b.ecrRepositoryName;
    }

    public static Builder builder() {
        return new Builder();
    }

    public static class Builder {
        private String env,
                hostedZoneName,
                hostedZoneId,
                subDomainName,
                certificateArn,
                userPoolArn,
                cloudTrailEnabled,
                xRayEnabled,
                verboseLogging,
                cloudTrailLogGroupRetentionPeriodDays,
                accessLogGroupRetentionPeriodDays,
                s3UseExistingBucket,
                s3RetainOriginBucket,
                s3RetainReceiptsBucket,
                cloudTrailEventSelectorPrefix,
                logS3ObjectEventHandlerSource,
                logGzippedS3ObjectEventHandlerSource,
                docRootPath,
                defaultDocumentAtOrigin,
                error404NotFoundAtDistribution,
                skipLambdaUrlOrigins,
                hmrcClientId,
                hmrcClientSecretArn,
                homeUrl,
                hmrcBaseUri,
                optionalTestAccessToken,
                optionalTestS3Endpoint,
                optionalTestS3AccessKey,
                optionalTestS3SecretKey,
                receiptsBucketPostfix,
                lambdaEntry,
                authUrlHmrcLambdaHandlerFunctionName,
                authUrlHmrcLambdaUrlPath,
                authUrlHmrcLambdaDurationMillis,
                authUrlMockLambdaHandlerFunctionName,
                authUrlMockLambdaUrlPath,
                authUrlMockLambdaDurationMillis,
                authUrlCognitoLambdaHandlerFunctionName,
                authUrlCognitoLambdaUrlPath,
                authUrlCognitoLambdaDurationMillis,
                exchangeHmrcTokenLambdaHandlerFunctionName,
                exchangeHmrcTokenLambdaUrlPath,
                exchangeHmrcTokenLambdaDurationMillis,
                exchangeCognitoTokenLambdaHandlerFunctionName,
                exchangeCognitoTokenLambdaUrlPath,
                exchangeCognitoTokenLambdaDurationMillis,
                submitVatLambdaHandlerFunctionName,
                submitVatLambdaUrlPath,
                submitVatLambdaDurationMillis,
                logReceiptLambdaHandlerFunctionName,
                logReceiptLambdaUrlPath,
                logReceiptLambdaDurationMillis,
                lambdaUrlAuthType,
                commitHash,
                googleClientId,
                googleBaseUri,
                googleClientSecretArn,
                cognitoDomainPrefix,
                bundleExpiryDate,
                bundleUserLimit,
                bundleLambdaHandlerFunctionName,
                bundleLambdaUrlPath,
                bundleLambdaDurationMillis,
                catalogueLambdaHandlerFunctionName,
                catalogueLambdaUrlPath,
                catalogueLambdaDurationMillis,
                myBundlesLambdaHandlerFunctionName,
                myBundlesLambdaUrlPath,
                myBundlesLambdaDurationMillis,
                baseImageTag,
                cognitoFeaturePlan,
                cognitoEnableLogDelivery,
                logCognitoEventHandlerSource,
                myReceiptsLambdaHandlerFunctionName,
                myReceiptsLambdaUrlPath,
                myReceiptsLambdaDurationMillis,
                antonyccClientId,
                antonyccBaseUri,
                cognitoClientId,
                cognitoBaseUri,
                ecrRepositoryArn,
                ecrRepositoryName;

        public Builder env(String v) {
            this.env = v;
            return this;
        }

        public Builder hostedZoneName(String v) {
            this.hostedZoneName = v;
            return this;
        }

        public Builder hostedZoneId(String v) {
            this.hostedZoneId = v;
            return this;
        }

        public Builder subDomainName(String v) {
            this.subDomainName = v;
            return this;
        }

        public Builder certificateArn(String v) {
            this.certificateArn = v;
            return this;
        }

        public Builder userPoolArn(String v) {
            this.userPoolArn = v;
            return this;
        }

        public Builder cloudTrailEnabled(String v) {
            this.cloudTrailEnabled = v;
            return this;
        }

        public Builder xRayEnabled(String v) {
            this.xRayEnabled = v;
            return this;
        }

        public Builder verboseLogging(String v) {
            this.verboseLogging = v;
            return this;
        }

        public Builder cloudTrailLogGroupRetentionPeriodDays(String v) {
            this.cloudTrailLogGroupRetentionPeriodDays = v;
            return this;
        }

        public Builder accessLogGroupRetentionPeriodDays(String v) {
            this.accessLogGroupRetentionPeriodDays = v;
            return this;
        }

        public Builder s3UseExistingBucket(String v) {
            this.s3UseExistingBucket = v;
            return this;
        }

        public Builder s3RetainOriginBucket(String v) {
            this.s3RetainOriginBucket = v;
            return this;
        }

        public Builder s3RetainReceiptsBucket(String v) {
            this.s3RetainReceiptsBucket = v;
            return this;
        }

        public Builder cloudTrailEventSelectorPrefix(String v) {
            this.cloudTrailEventSelectorPrefix = v;
            return this;
        }

        public Builder logS3ObjectEventHandlerSource(String v) {
            this.logS3ObjectEventHandlerSource = v;
            return this;
        }

        public Builder logGzippedS3ObjectEventHandlerSource(String v) {
            this.logGzippedS3ObjectEventHandlerSource = v;
            return this;
        }

        public Builder docRootPath(String v) {
            this.docRootPath = v;
            return this;
        }

        public Builder defaultDocumentAtOrigin(String v) {
            this.defaultDocumentAtOrigin = v;
            return this;
        }

        public Builder error404NotFoundAtDistribution(String v) {
            this.error404NotFoundAtDistribution = v;
            return this;
        }

        public Builder skipLambdaUrlOrigins(String v) {
            this.skipLambdaUrlOrigins = v;
            return this;
        }

        public Builder hmrcClientId(String v) {
            this.hmrcClientId = v;
            return this;
        }

        public Builder hmrcClientSecretArn(String v) {
            this.hmrcClientSecretArn = v;
            return this;
        }

        public Builder homeUrl(String v) {
            this.homeUrl = v;
            return this;
        }

        public Builder hmrcBaseUri(String v) {
            this.hmrcBaseUri = v;
            return this;
        }

        public Builder optionalTestAccessToken(String v) {
            this.optionalTestAccessToken = v;
            return this;
        }

        public Builder optionalTestS3Endpoint(String v) {
            this.optionalTestS3Endpoint = v;
            return this;
        }

        public Builder optionalTestS3AccessKey(String v) {
            this.optionalTestS3AccessKey = v;
            return this;
        }

        public Builder optionalTestS3SecretKey(String v) {
            this.optionalTestS3SecretKey = v;
            return this;
        }

        public Builder receiptsBucketPostfix(String v) {
            this.receiptsBucketPostfix = v;
            return this;
        }

        public Builder lambdaEntry(String v) {
            this.lambdaEntry = v;
            return this;
        }

        public Builder authUrlHmrcLambdaHandlerFunctionName(String v) {
            this.authUrlHmrcLambdaHandlerFunctionName = v;
            return this;
        }

        public Builder authUrlHmrcLambdaUrlPath(String v) {
            this.authUrlHmrcLambdaUrlPath = v;
            return this;
        }

        public Builder authUrlHmrcLambdaDurationMillis(String v) {
            this.authUrlHmrcLambdaDurationMillis = v;
            return this;
        }

        public Builder authUrlMockLambdaHandlerFunctionName(String v) {
            this.authUrlMockLambdaHandlerFunctionName = v;
            return this;
        }

        public Builder authUrlMockLambdaUrlPath(String v) {
            this.authUrlMockLambdaUrlPath = v;
            return this;
        }

        public Builder authUrlMockLambdaDurationMillis(String v) {
            this.authUrlMockLambdaDurationMillis = v;
            return this;
        }

        public Builder authUrlCognitoLambdaHandlerFunctionName(String v) {
            this.authUrlCognitoLambdaHandlerFunctionName = v;
            return this;
        }

        public Builder authUrlCognitoLambdaUrlPath(String v) {
            this.authUrlCognitoLambdaUrlPath = v;
            return this;
        }

        public Builder authUrlCognitoLambdaDurationMillis(String v) {
            this.authUrlCognitoLambdaDurationMillis = v;
            return this;
        }

        public Builder exchangeHmrcTokenLambdaHandlerFunctionName(String v) {
            this.exchangeHmrcTokenLambdaHandlerFunctionName = v;
            return this;
        }

        public Builder exchangeHmrcTokenLambdaUrlPath(String v) {
            this.exchangeHmrcTokenLambdaUrlPath = v;
            return this;
        }

        public Builder exchangeHmrcTokenLambdaDurationMillis(String v) {
            this.exchangeHmrcTokenLambdaDurationMillis = v;
            return this;
        }

        public Builder exchangeCognitoTokenLambdaHandlerFunctionName(String v) {
            this.exchangeCognitoTokenLambdaHandlerFunctionName = v;
            return this;
        }

        public Builder exchangeCognitoTokenLambdaUrlPath(String v) {
            this.exchangeCognitoTokenLambdaUrlPath = v;
            return this;
        }

        public Builder exchangeCognitoTokenLambdaDurationMillis(String v) {
            this.exchangeCognitoTokenLambdaDurationMillis = v;
            return this;
        }

        public Builder submitVatLambdaHandlerFunctionName(String v) {
            this.submitVatLambdaHandlerFunctionName = v;
            return this;
        }

        public Builder submitVatLambdaUrlPath(String v) {
            this.submitVatLambdaUrlPath = v;
            return this;
        }

        public Builder submitVatLambdaDurationMillis(String v) {
            this.submitVatLambdaDurationMillis = v;
            return this;
        }

        public Builder logReceiptLambdaHandlerFunctionName(String v) {
            this.logReceiptLambdaHandlerFunctionName = v;
            return this;
        }

        public Builder logReceiptLambdaUrlPath(String v) {
            this.logReceiptLambdaUrlPath = v;
            return this;
        }

        public Builder logReceiptLambdaDurationMillis(String v) {
            this.logReceiptLambdaDurationMillis = v;
            return this;
        }

        public Builder lambdaUrlAuthType(String v) {
            this.lambdaUrlAuthType = v;
            return this;
        }

        public Builder commitHash(String v) {
            this.commitHash = v;
            return this;
        }

        public Builder googleClientId(String v) {
            this.googleClientId = v;
            return this;
        }

        public Builder googleBaseUri(String v) {
            this.googleBaseUri = v;
            return this;
        }

        public Builder googleClientSecretArn(String v) {
            this.googleClientSecretArn = v;
            return this;
        }

        public Builder cognitoDomainPrefix(String v) {
            this.cognitoDomainPrefix = v;
            return this;
        }

        public Builder bundleExpiryDate(String v) {
            this.bundleExpiryDate = v;
            return this;
        }

        public Builder bundleUserLimit(String v) {
            this.bundleUserLimit = v;
            return this;
        }

        public Builder bundleLambdaHandlerFunctionName(String v) {
            this.bundleLambdaHandlerFunctionName = v;
            return this;
        }

        public Builder bundleLambdaUrlPath(String v) {
            this.bundleLambdaUrlPath = v;
            return this;
        }

        public Builder bundleLambdaDurationMillis(String v) {
            this.bundleLambdaDurationMillis = v;
            return this;
        }

        public Builder catalogueLambdaHandlerFunctionName(String v) {
            this.catalogueLambdaHandlerFunctionName = v;
            return this;
        }

        public Builder catalogueLambdaUrlPath(String v) {
            this.catalogueLambdaUrlPath = v;
            return this;
        }

        public Builder catalogueLambdaDurationMillis(String v) {
            this.catalogueLambdaDurationMillis = v;
            return this;
        }

        public Builder myBundlesLambdaHandlerFunctionName(String v) {
            this.myBundlesLambdaHandlerFunctionName = v;
            return this;
        }

        public Builder myBundlesLambdaUrlPath(String v) {
            this.myBundlesLambdaUrlPath = v;
            return this;
        }

        public Builder myBundlesLambdaDurationMillis(String v) {
            this.myBundlesLambdaDurationMillis = v;
            return this;
        }

        public Builder baseImageTag(String v) {
            this.baseImageTag = v;
            return this;
        }

        public Builder cognitoFeaturePlan(String v) {
            this.cognitoFeaturePlan = v;
            return this;
        }

        public Builder cognitoEnableLogDelivery(String v) {
            this.cognitoEnableLogDelivery = v;
            return this;
        }

        public Builder logCognitoEventHandlerSource(String v) {
            this.logCognitoEventHandlerSource = v;
            return this;
        }

        public Builder myReceiptsLambdaHandlerFunctionName(String v) {
            this.myReceiptsLambdaHandlerFunctionName = v;
            return this;
        }

        public Builder myReceiptsLambdaUrlPath(String v) {
            this.myReceiptsLambdaUrlPath = v;
            return this;
        }

        public Builder myReceiptsLambdaDurationMillis(String v) {
            this.myReceiptsLambdaDurationMillis = v;
            return this;
        }

        public Builder antonyccClientId(String v) {
            this.antonyccClientId = v;
            return this;
        }

        public Builder antonyccBaseUri(String v) {
            this.antonyccBaseUri = v;
            return this;
        }

        public Builder cognitoClientId(String v) {
            this.cognitoClientId = v;
            return this;
        }

        public Builder cognitoBaseUri(String v) {
            this.cognitoBaseUri = v;
            return this;
        }

        public Builder ecrRepositoryArn(String v) {
            this.ecrRepositoryArn = v;
            return this;
        }

        public Builder ecrRepositoryName(String v) {
            this.ecrRepositoryName = v;
            return this;
        }

        public WebStackProps build() {
            return new WebStackProps(this);
        }
    }
}
