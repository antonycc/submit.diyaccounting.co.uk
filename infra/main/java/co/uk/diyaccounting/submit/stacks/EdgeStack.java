package co.uk.diyaccounting.submit.stacks;

import software.amazon.awscdk.CfnOutput;
import software.amazon.awscdk.CfnOutputProps;
import software.amazon.awscdk.Fn;
import software.amazon.awscdk.Stack;
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
import software.amazon.awscdk.services.iam.ServicePrincipal;
import software.amazon.awscdk.services.lambda.FunctionUrl;
import software.amazon.awscdk.services.lambda.FunctionUrlAuthType;
import software.amazon.awscdk.services.lambda.Permission;
import software.amazon.awscdk.services.route53.ARecord;
import software.amazon.awscdk.services.route53.ARecordProps;
import software.amazon.awscdk.services.route53.HostedZone;
import software.amazon.awscdk.services.route53.HostedZoneAttributes;
import software.amazon.awscdk.services.route53.IHostedZone;
import software.amazon.awscdk.services.route53.RecordTarget;
import software.amazon.awscdk.services.route53.targets.CloudFrontTarget;
import software.amazon.awscdk.services.s3.Bucket;
import software.amazon.awscdk.services.s3.IBucket;
import software.amazon.awscdk.services.wafv2.CfnWebACL;
import software.constructs.Construct;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class EdgeStack extends Stack {
    public final Distribution distribution;
    public final Permission distributionInvokeFnUrl;
    public final ARecord aliasRecord;
    public final String baseUrl;

    public EdgeStack(final Construct scope, final String id, final EdgeStackProps props) {
        super(scope, id, props);

        // Apply cost allocation tags for all resources in this stack
        Tags.of(this).add("Environment", props.envName);
        Tags.of(this).add("Application", "@antonycc/submit.diyaccounting.co.uk");
        Tags.of(this).add("CostCenter", "@antonycc/submit.diyaccounting.co.uk");
        Tags.of(this).add("Owner", "@antonycc/submit.diyaccounting.co.uk");
        Tags.of(this).add("Project", "@antonycc/submit.diyaccounting.co.uk");
        Tags.of(this).add("DeploymentName", props.deploymentName);
        Tags.of(this).add("Stack", "EdgeStack");
        Tags.of(this).add("ManagedBy", "aws-cdk");

        // Enhanced cost optimization tags
        Tags.of(this).add("BillingPurpose", "authentication-infrastructure");
        Tags.of(this).add("ResourceType", "serverless-web-app");
        Tags.of(this).add("Criticality", "low");
        Tags.of(this).add("DataClassification", "public");
        Tags.of(this).add("BackupRequired", "false");
        Tags.of(this).add("MonitoringEnabled", "true");

        // Use Resources from the passed props
        this.baseUrl = props.baseUrl;
        IBucket logsBucket = Bucket.fromBucketArn(this, props.resourceNamePrefix + "-LogsBucket", props.logsBucketArn);
        IBucket originBucket = Bucket.fromBucketArn(this, props.resourceNamePrefix + "-WebBucket", props.webBucketArn);

        // Hosted zone (must exist)
        IHostedZone zone = HostedZone.fromHostedZoneAttributes(
                this,
                props.resourceNamePrefix + "-Zone",
                HostedZoneAttributes.builder()
                        .hostedZoneId(props.hostedZoneId)
                        .zoneName(props.hostedZoneName)
                        .build());
        String domainName = props.domainName;
        String recordName = props.hostedZoneName.equals(props.domainName)
                ? null
                : (props.domainName.endsWith("." + props.hostedZoneName)
                        ? props.domainName.substring(0, props.domainName.length() - (props.hostedZoneName.length() + 1))
                        : props.domainName);

        // TLS certificate from existing ACM (must be in us-east-1 for CloudFront)
        var cert = Certificate.fromCertificateArn(this, props.resourceNamePrefix + "-WebCert", props.certificateArn);

        // Buckets

        // AWS WAF WebACL for CloudFront protection against common attacks and rate limiting
        CfnWebACL webAcl = CfnWebACL.Builder.create(this, props.resourceNamePrefix + "-WebAcl")
                .name(props.compressedResourceNamePrefix + "-waf")
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
                        .metricName(props.compressedResourceNamePrefix + "-waf")
                        .sampledRequestsEnabled(true)
                        .build())
                .build();

        //S3OriginAccessControl originAccessControl = S3OriginAccessControl.Builder.create(this, props.resourceNamePrefix + "-OAC")
        //        //.name(props.compressedResourceNamePrefix + "-oac")
        //        .originAccessControlName(props.compressedResourceNamePrefix + "-oac")
        //        .description("OAC for " + props.resourceNamePrefix + " CloudFront distribution")
        //        //.originAccessControlOriginType("s3")
        //        //.signingBehavior("always")
        //        //.signingProtocol("sigv4")
        //        .signing(Signing.builder()
        //            .signingBehavior(SigningBehavior.ALWAYS)
        //            .signingProtocol(SigningProtocol.SIGV4)
        //            .build())
        //        .build();

        S3OriginAccessControl oac = S3OriginAccessControl.Builder.create(this, "MyOAC")
            .signing(Signing.SIGV4_ALWAYS) // NEVER // SIGV4_NO_OVERRIDE
            .build();
        IOrigin localOrigin = S3BucketOrigin.withOriginAccessControl(
            originBucket,
            S3BucketOriginWithOACProps.builder()
                .originAccessControl(oac)
                .build()
        );
        //logger.info("Created BucketOrigin with bucket: {}", this.originBucket.getBucketName());

        BehaviorOptions localBehaviorOptions = BehaviorOptions.builder()
            .origin(localOrigin)
            .allowedMethods(AllowedMethods.ALLOW_GET_HEAD_OPTIONS)
            .originRequestPolicy(OriginRequestPolicy.CORS_S3_ORIGIN)
            .viewerProtocolPolicy(ViewerProtocolPolicy.REDIRECT_TO_HTTPS)
            .responseHeadersPolicy(ResponseHeadersPolicy.CORS_ALLOW_ALL_ORIGINS_WITH_PREFLIGHT_AND_SECURITY_HEADERS)
            .compress(true)
            .build();

        // Create additional behaviours for the URL origins using the mappings provided in props
        // Use function createBehaviorOptionsForLambdaUrlHost to transform the lambda URL host into BehaviorOptions
        HashMap<String, BehaviorOptions> additionalBehaviors = //new HashMap<String, BehaviorOptions>();
            props.additionalOriginsBehaviourMappings.entrySet().stream().collect(
                HashMap::new,
                (map, entry) -> map.put(
                    entry.getKey(),
                    createBehaviorOptionsForLambdaUrlHost(entry.getValue())
                ),
                HashMap::putAll
            );

        // CloudFront distribution for the web origin and all the URL Lambdas.
        this.distribution = Distribution.Builder.create(this, props.resourceNamePrefix + "-WebDist")
                .defaultBehavior(localBehaviorOptions) // props.webBehaviorOptions)
                .additionalBehaviors(additionalBehaviors)
                .domainNames(List.of(domainName))
                .certificate(cert)
                .defaultRootObject("index.html")
                .enableLogging(true)
                .logBucket(logsBucket)
                .logFilePrefix("cloudfront/")
                .enableIpv6(true)
                .sslSupportMethod(SSLMethod.SNI)
                .webAclId(webAcl.getAttrArn())
                .build();

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
                props.resourceNamePrefix + "-AliasRecord",
                ARecordProps.builder()
                        .recordName(recordName)
                        .zone(zone)
                        .target(RecordTarget.fromAlias(new CloudFrontTarget(this.distribution)))
                        .build());

        // Outputs
        new CfnOutput(
                this, "BaseUrl", CfnOutputProps.builder().value(this.baseUrl).build());
        new CfnOutput(
            this,
            "CertificateArn",
            CfnOutputProps.builder().value(cert.getCertificateArn()).build());
        new CfnOutput(
            this,
            "WebAclId",
            CfnOutputProps.builder()
                .value(webAcl.getAttrArn())
                .build());
        new CfnOutput(
                this,
                "WebDistributionDomainName",
                CfnOutputProps.builder()
                        .value(this.distribution.getDomainName())
                        .build());
        new CfnOutput(
                this,
                "DistributionId",
                CfnOutputProps.builder()
                        .value(this.distribution.getDistributionId())
                        .build());
        new CfnOutput(
            this,
            "AliasRecord",
            CfnOutputProps.builder().value(this.aliasRecord.getDomainName()).build());

    }

    private String getLambdaUrlHostToken(FunctionUrl functionUrl) {
        String urlHostToken = Fn.select(2, Fn.split("/", functionUrl.getUrl()));
        return urlHostToken;
    }

    public BehaviorOptions createBehaviorOptionsForLambdaUrlHost(String lambdaUrlHost) {
        var origin = HttpOrigin.Builder.create(lambdaUrlHost)
            .protocolPolicy(OriginProtocolPolicy.HTTPS_ONLY)
            .build();
        var behaviorOptions = BehaviorOptions.builder()
            .origin(origin)
            .allowedMethods(AllowedMethods.ALLOW_ALL)
            .cachePolicy(CachePolicy.CACHING_DISABLED)
            .originRequestPolicy(OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER)
            .viewerProtocolPolicy(ViewerProtocolPolicy.REDIRECT_TO_HTTPS)
            .responseHeadersPolicy(ResponseHeadersPolicy.CORS_ALLOW_ALL_ORIGINS_WITH_PREFLIGHT_AND_SECURITY_HEADERS)
            .build();
            ;
        return behaviorOptions;
    }
}
