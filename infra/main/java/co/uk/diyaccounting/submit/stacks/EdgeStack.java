package co.uk.diyaccounting.submit.stacks;

import static co.uk.diyaccounting.submit.utils.Kind.infof;
import static co.uk.diyaccounting.submit.utils.KindCdk.cfnOutput;

import co.uk.diyaccounting.submit.SubmitSharedNames;
import co.uk.diyaccounting.submit.aspects.SetAutoDeleteJobLogRetentionAspect;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.immutables.value.Value;
import software.amazon.awscdk.Aspects;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.RemovalPolicy;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.StackProps;
import software.amazon.awscdk.Tags;
import software.amazon.awscdk.services.certificatemanager.Certificate;
import software.amazon.awscdk.services.cloudfront.AllowedMethods;
import software.amazon.awscdk.services.cloudfront.BehaviorOptions;
import software.amazon.awscdk.services.cloudfront.CachePolicy;
import software.amazon.awscdk.services.cloudfront.Distribution;
import software.amazon.awscdk.services.cloudfront.IOrigin;
import software.amazon.awscdk.services.cloudfront.OriginProtocolPolicy;
import software.amazon.awscdk.services.cloudfront.OriginRequestPolicy;
import software.amazon.awscdk.services.cloudfront.ResponseHeadersPolicy;
import software.amazon.awscdk.services.cloudfront.S3OriginAccessControl;
import software.amazon.awscdk.services.cloudfront.SSLMethod;
import software.amazon.awscdk.services.cloudfront.Signing;
import software.amazon.awscdk.services.cloudfront.ViewerProtocolPolicy;
import software.amazon.awscdk.services.cloudfront.origins.HttpOrigin;
import software.amazon.awscdk.services.cloudfront.origins.S3BucketOrigin;
import software.amazon.awscdk.services.cloudfront.origins.S3BucketOriginWithOACProps;
import software.amazon.awscdk.services.iam.PolicyStatement;
import software.amazon.awscdk.services.iam.ServicePrincipal;
import software.amazon.awscdk.services.lambda.FunctionUrlAuthType;
import software.amazon.awscdk.services.lambda.Permission;
import software.amazon.awscdk.services.logs.RetentionDays;
import software.amazon.awscdk.services.route53.ARecord;
import software.amazon.awscdk.services.route53.ARecordProps;
import software.amazon.awscdk.services.route53.AaaaRecord;
import software.amazon.awscdk.services.route53.AaaaRecordProps;
import software.amazon.awscdk.services.route53.HostedZone;
import software.amazon.awscdk.services.route53.HostedZoneAttributes;
import software.amazon.awscdk.services.route53.IHostedZone;
import software.amazon.awscdk.services.route53.RecordTarget;
import software.amazon.awscdk.services.route53.targets.CloudFrontTarget;
import software.amazon.awscdk.services.s3.BlockPublicAccess;
import software.amazon.awscdk.services.s3.Bucket;
import software.amazon.awscdk.services.s3.BucketEncryption;
import software.amazon.awscdk.services.s3.IBucket;
import software.amazon.awscdk.services.wafv2.CfnWebACL;
import software.constructs.Construct;

public class EdgeStack extends Stack {

    public Bucket originBucket;
    public IBucket originAccessLogBucket;
    public final Distribution distribution;
    public final Permission distributionInvokeFnUrl;
    public final ARecord aliasRecord;
    public final AaaaRecord aliasRecordV6;

    @Value.Immutable
    public interface EdgeStackProps extends StackProps, SubmitStackProps {

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

        @Override
        SubmitSharedNames sharedNames();

        String hostedZoneName();

        String hostedZoneId();

        String certificateArn();

        Map<String, String> pathsToOriginLambdaFunctionUrls();

        int logGroupRetentionPeriodDays();

        String apiGatewayUrl();

        static ImmutableEdgeStackProps.Builder builder() {
            return ImmutableEdgeStackProps.builder();
        }
    }

    public EdgeStack(final Construct scope, final String id, final EdgeStackProps props) {
        super(scope, id, props);

        // Apply cost allocation tags for all resources in this stack
        Tags.of(this).add("Environment", props.envName());
        Tags.of(this).add("Application", "@antonycc/submit.diyaccounting.co.uk/cdk.json");
        Tags.of(this).add("CostCenter", "@antonycc/submit.diyaccounting.co.uk");
        Tags.of(this).add("Owner", "@antonycc/submit.diyaccounting.co.uk");
        Tags.of(this).add("Project", "@antonycc/submit.diyaccounting.co.uk");
        Tags.of(this).add("DeploymentName", props.deploymentName());
        Tags.of(this).add("Stack", "EdgeStack");
        Tags.of(this).add("ManagedBy", "aws-cdk");

        // Enhanced cost optimization tags
        Tags.of(this).add("BillingPurpose", "authentication-infrastructure");
        Tags.of(this).add("ResourceType", "serverless-web-app");
        Tags.of(this).add("Criticality", "low");
        Tags.of(this).add("DataClassification", "public");
        Tags.of(this).add("BackupRequired", "false");
        Tags.of(this).add("MonitoringEnabled", "true");

        // Hosted zone (must exist)
        IHostedZone zone = HostedZone.fromHostedZoneAttributes(
                this,
                props.resourceNamePrefix() + "-Zone",
                HostedZoneAttributes.builder()
                        .hostedZoneId(props.hostedZoneId())
                        .zoneName(props.hostedZoneName())
                        .build());
        String recordName = props.hostedZoneName().equals(props.sharedNames().domainName)
                ? null
                : (props.sharedNames().domainName.endsWith("." + props.hostedZoneName())
                        ? props.sharedNames()
                                .domainName
                                .substring(
                                        0,
                                        props.sharedNames().domainName.length()
                                                - (props.hostedZoneName().length() + 1))
                        : props.sharedNames().domainName);

        // TLS certificate from existing ACM (must be in us-east-1 for CloudFront)
        var cert =
                Certificate.fromCertificateArn(this, props.resourceNamePrefix() + "-WebCert", props.certificateArn());

        // AWS WAF WebACL for CloudFront protection against common attacks and rate limiting
        CfnWebACL webAcl = CfnWebACL.Builder.create(this, props.resourceNamePrefix() + "-WebAcl")
                .name(props.resourceNamePrefix() + "-waf")
                .scope("CLOUDFRONT")
                .defaultAction(CfnWebACL.DefaultActionProperty.builder()
                        .allow(CfnWebACL.AllowActionProperty.builder().build())
                        .build())
                .rules(List.of(
                        // Rate limiting rule - 2000 requests per 5 minutes per IP
                        CfnWebACL.RuleProperty.builder()
                                .name("RateLimitRule")
                                .priority(1)
                                .statement(CfnWebACL.StatementProperty.builder()
                                        .rateBasedStatement(CfnWebACL.RateBasedStatementProperty.builder()
                                                .limit(2000L) // requests per 5 minutes
                                                .aggregateKeyType("IP")
                                                .build())
                                        .build())
                                .action(CfnWebACL.RuleActionProperty.builder()
                                        .block(CfnWebACL.BlockActionProperty.builder()
                                                .build())
                                        .build())
                                .visibilityConfig(CfnWebACL.VisibilityConfigProperty.builder()
                                        .cloudWatchMetricsEnabled(true)
                                        .metricName("RateLimitRule")
                                        .sampledRequestsEnabled(true)
                                        .build())
                                .build(),
                        // AWS managed rule for known bad inputs
                        CfnWebACL.RuleProperty.builder()
                                .name("AWSManagedRulesKnownBadInputsRuleSet")
                                .priority(2)
                                .statement(CfnWebACL.StatementProperty.builder()
                                        .managedRuleGroupStatement(CfnWebACL.ManagedRuleGroupStatementProperty.builder()
                                                .name("AWSManagedRulesKnownBadInputsRuleSet")
                                                .vendorName("AWS")
                                                .ruleActionOverrides(
                                                        List.of()) // Empty override list to prevent conflicts
                                                .build())
                                        .build())
                                .overrideAction(CfnWebACL.OverrideActionProperty.builder()
                                        .none(Map.of())
                                        .build())
                                .visibilityConfig(CfnWebACL.VisibilityConfigProperty.builder()
                                        .cloudWatchMetricsEnabled(true)
                                        .metricName("AWSManagedRulesKnownBadInputsRuleSet")
                                        .sampledRequestsEnabled(true)
                                        .build())
                                .build(),
                        // AWS managed rule for common rule set (SQL injection, XSS, etc.)
                        CfnWebACL.RuleProperty.builder()
                                .name("AWSManagedRulesCommonRuleSet")
                                .priority(3)
                                .statement(CfnWebACL.StatementProperty.builder()
                                        .managedRuleGroupStatement(CfnWebACL.ManagedRuleGroupStatementProperty.builder()
                                                .name("AWSManagedRulesCommonRuleSet")
                                                .vendorName("AWS")
                                                .ruleActionOverrides(
                                                        List.of()) // Empty override list to prevent conflicts
                                                .build())
                                        .build())
                                .overrideAction(CfnWebACL.OverrideActionProperty.builder()
                                        .none(Map.of())
                                        .build())
                                .visibilityConfig(CfnWebACL.VisibilityConfigProperty.builder()
                                        .cloudWatchMetricsEnabled(true)
                                        .metricName("AWSManagedRulesCommonRuleSet")
                                        .sampledRequestsEnabled(true)
                                        .build())
                                .build()))
                .description(
                        "WAF WebACL for OIDC provider CloudFront distribution - provides rate limiting and protection against common attacks")
                .visibilityConfig(CfnWebACL.VisibilityConfigProperty.builder()
                        .cloudWatchMetricsEnabled(true)
                        .metricName(props.resourceNamePrefix() + "-waf")
                        .sampledRequestsEnabled(true)
                        .build())
                .build();

        // TODO: Find alternative to log buckets for CloudFront distribution logs
        // S3 bucket for origin access logs with specified retention
        //        infof(
        //                "Setting expiration period to %d days for %s",
        //                props.logGroupRetentionPeriodDays(), props.resourceNamePrefix());
        //        this.originAccessLogBucket = Bucket.Builder.create(this, props.resourceNamePrefix() + "-LogBucket")
        //                .bucketName(props.sharedNames().originAccessLogBucketName)
        //                .objectOwnership(ObjectOwnership.OBJECT_WRITER)
        //                .versioned(false)
        //                .blockPublicAccess(BlockPublicAccess.BLOCK_ALL)
        //                .encryption(BucketEncryption.S3_MANAGED)
        //                .removalPolicy(RemovalPolicy.DESTROY)
        //                .autoDeleteObjects(true)
        //                .lifecycleRules(List.of(LifecycleRule.builder()
        //                        .id("%sLogsLifecycleRule".formatted(props.compressedResourceNamePrefix()))
        //                        .enabled(true)
        //                        .expiration(Duration.days(props.logGroupRetentionPeriodDays()))
        //                        .build()))
        //                .build();
        //        infof(
        //                "Created log bucket %s with name",
        //                this.originAccessLogBucket.getNode().getId(), originAccessLogBucket);

        // Create the origin bucket
        this.originBucket = Bucket.Builder.create(this, props.resourceNamePrefix() + "-OriginBucket")
                .bucketName(props.sharedNames().originBucketName)
                .versioned(false)
                .blockPublicAccess(BlockPublicAccess.BLOCK_ALL)
                .encryption(BucketEncryption.S3_MANAGED)
                .removalPolicy(RemovalPolicy.DESTROY)
                .autoDeleteObjects(true)
                // TODO: Find an alternative for access logs
                // .serverAccessLogsBucket(originAccessLogBucket)
                .build();
        infof(
                "Created origin bucket %s with name %s",
                this.originBucket.getNode().getId(), props.sharedNames().originBucketName);

        this.originBucket.addToResourcePolicy(PolicyStatement.Builder.create()
                .sid("AllowCloudFrontReadViaOAC")
                .principals(List.of(new ServicePrincipal("cloudfront.amazonaws.com")))
                .actions(List.of("s3:GetObject"))
                .resources(List.of(this.originBucket.getBucketArn() + "/*"))
                .conditions(Map.of(
                        // Limit to distributions in your account (no distribution ARN token needed)
                        "StringEquals", Map.of("AWS:SourceAccount", this.getAccount()),
                        "ArnLike",
                                Map.of(
                                        "AWS:SourceArn",
                                        "arn:aws:cloudfront::" + this.getAccount() + ":distribution/*")))
                .build());

        S3OriginAccessControl oac = S3OriginAccessControl.Builder.create(this, "MyOAC")
                .signing(Signing.SIGV4_ALWAYS) // NEVER // SIGV4_NO_OVERRIDE
                .build();
        IOrigin localOrigin = S3BucketOrigin.withOriginAccessControl(
                this.originBucket,
                S3BucketOriginWithOACProps.builder().originAccessControl(oac).build());
        // infof("Created BucketOrigin with bucket: %s", this.originBucket.getBucketName());

        BehaviorOptions localBehaviorOptions = BehaviorOptions.builder()
                .origin(localOrigin)
                .allowedMethods(AllowedMethods.ALLOW_GET_HEAD_OPTIONS)
                .originRequestPolicy(OriginRequestPolicy.CORS_S3_ORIGIN)
                .viewerProtocolPolicy(ViewerProtocolPolicy.REDIRECT_TO_HTTPS)
                .responseHeadersPolicy(ResponseHeadersPolicy.CORS_ALLOW_ALL_ORIGINS_WITH_PREFLIGHT_AND_SECURITY_HEADERS)
                .compress(true)
                .build();

        // Create additional behaviours for the URL origins using the Function URL mappings provided in props
        // Use function createBehaviorOptionsForLambdaUrl to transform the Function URL into BehaviorOptions
        HashMap<String, BehaviorOptions> additionalBehaviors = // new HashMap<String, BehaviorOptions>();
                props.pathsToOriginLambdaFunctionUrls().entrySet().stream()
                        .collect(
                                HashMap::new,
                                (map, entry) ->
                                        map.put(entry.getKey(), createBehaviorOptionsForLambdaUrl(entry.getValue())),
                                HashMap::putAll);

        BehaviorOptions apiGatewayBehavior = createBehaviorOptionsForApiGateway(props.apiGatewayUrl());
        additionalBehaviors.put("/api/v1/*", apiGatewayBehavior);
        infof("Added API Gateway behavior for /api/v1/* pointing to %s", props.apiGatewayUrl());

        // Lookup log bucket
        IBucket distributionLogsBucket = Bucket.fromBucketName(
                this,
                props.resourceNamePrefix() + "-ImportedDistributionLogBucket",
                props.sharedNames().distributionAccessLogBucketName);

        // CloudFront distribution for the web origin and all the URL Lambdas.
        this.distribution = Distribution.Builder.create(this, props.resourceNamePrefix() + "-WebDist")
                .defaultBehavior(localBehaviorOptions) // props.webBehaviorOptions)
                .additionalBehaviors(additionalBehaviors)
                .domainNames(List.of(props.sharedNames().domainName, props.sharedNames().envDomainName))
                .certificate(cert)
                .defaultRootObject("index.html")
                .enableLogging(true)
                // TODO: Find an alternative for access logs
                .logBucket(distributionLogsBucket)
                .logFilePrefix("cloudfront/")
                .enableIpv6(true)
                .sslSupportMethod(SSLMethod.SNI)
                .webAclId(webAcl.getAttrArn())
                .build();
        Tags.of(this.distribution).add("OriginFor", props.sharedNames().domainName);

        // Grant CloudFront access to the origin lambdas with compressed names
        this.distributionInvokeFnUrl = Permission.builder()
                .principal(new ServicePrincipal("cloudfront.amazonaws.com"))
                .action("lambda:InvokeFunctionUrl")
                .functionUrlAuthType(FunctionUrlAuthType.NONE)
                .sourceArn(this.distribution.getDistributionArn())
                .build();

        // A record
        this.aliasRecord = new ARecord(
                this,
                props.resourceNamePrefix() + "-AliasRecord",
                ARecordProps.builder()
                        .recordName(recordName)
                        .zone(zone)
                        .target(RecordTarget.fromAlias(new CloudFrontTarget(this.distribution)))
                        //.deleteExisting(true)
                        .build());
        // AAAA record
        this.aliasRecordV6 = new AaaaRecord(
                this,
                props.resourceNamePrefix() + "-AliasRecordV6",
                AaaaRecordProps.builder()
                        .recordName(recordName)
                        .zone(zone)
                        .target(RecordTarget.fromAlias(new CloudFrontTarget(this.distribution)))
                        //.deleteExisting(true)
                        .build());

        Aspects.of(this).add(new SetAutoDeleteJobLogRetentionAspect(props.deploymentName(), RetentionDays.THREE_DAYS));

        // Outputs
        cfnOutput(this, "BaseUrl", props.sharedNames().baseUrl);
        cfnOutput(this, "CertificateArn", cert.getCertificateArn());
        cfnOutput(this, "WebAclId", webAcl.getAttrArn());
        cfnOutput(this, "WebDistributionDomainName", this.distribution.getDomainName());
        cfnOutput(this, "DistributionId", this.distribution.getDistributionId());
        cfnOutput(this, "AliasRecord", this.aliasRecord.getDomainName());
        cfnOutput(this, "AliasRecordV6", this.aliasRecordV6.getDomainName());
        cfnOutput(this, "OriginBucketName", this.originBucket.getBucketName());

        infof("EdgeStack %s created successfully for %s", this.getNode().getId(), props.sharedNames().baseUrl);
    }

    public BehaviorOptions createBehaviorOptionsForLambdaUrl(String lambdaFunctionUrl) {
        // Extract the host from the Function URL (e.g., "https://abc123.lambda-url.us-east-1.on.aws/" ->
        // "abc123.lambda-url.us-east-1.on.aws")
        var lambdaUrlHost = getHostFromUrl(lambdaFunctionUrl);
        var origin = HttpOrigin.Builder.create(lambdaUrlHost)
                .protocolPolicy(OriginProtocolPolicy.HTTPS_ONLY)
                .build();
        return BehaviorOptions.builder()
                .origin(origin)
                .allowedMethods(AllowedMethods.ALLOW_ALL)
                .cachePolicy(CachePolicy.CACHING_DISABLED)
                .originRequestPolicy(OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER)
                .viewerProtocolPolicy(ViewerProtocolPolicy.REDIRECT_TO_HTTPS)
                .responseHeadersPolicy(ResponseHeadersPolicy.CORS_ALLOW_ALL_ORIGINS_WITH_PREFLIGHT_AND_SECURITY_HEADERS)
                .build();
    }

    public BehaviorOptions createBehaviorOptionsForApiGateway(String apiGatewayUrl) {
        // Extract the host from the API Gateway URL (e.g., "https://abc123.execute-api.us-east-1.amazonaws.com/" ->
        // "abc123.execute-api.us-east-1.amazonaws.com")
        var apiGatewayHost = getHostFromUrl(apiGatewayUrl);
        var origin = HttpOrigin.Builder.create(apiGatewayHost)
                .protocolPolicy(OriginProtocolPolicy.HTTPS_ONLY)
                .build();
        return BehaviorOptions.builder()
                .origin(origin)
                .allowedMethods(AllowedMethods.ALLOW_ALL)
                .cachePolicy(CachePolicy.CACHING_DISABLED)
                .originRequestPolicy(OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER)
                .viewerProtocolPolicy(ViewerProtocolPolicy.REDIRECT_TO_HTTPS)
                .responseHeadersPolicy(ResponseHeadersPolicy.CORS_ALLOW_ALL_ORIGINS_WITH_PREFLIGHT_AND_SECURITY_HEADERS)
                .build();
    }

    private String getHostFromUrl(String url) {
        // Extract host from URL (e.g., "https://example.com/path" -> "example.com")
        if (url.startsWith("https://")) {
            String withoutProtocol = url.substring(8);
            int slashIndex = withoutProtocol.indexOf('/');
            if (slashIndex > 0) {
                return withoutProtocol.substring(0, slashIndex);
            }
            return withoutProtocol;
        }
        return url; // fallback if format unexpected
    }
}
