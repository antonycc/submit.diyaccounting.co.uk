package co.uk.diyaccounting.submit.stacks;

import co.uk.diyaccounting.submit.SubmitSharedNames;
import co.uk.diyaccounting.submit.aspects.SetAutoDeleteJobLogRetentionAspect;
import org.immutables.value.Value;
import software.amazon.awscdk.ArnComponents;
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
import software.amazon.awscdk.services.cloudfront.CfnDistribution;
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
import software.amazon.awscdk.services.logs.CfnDelivery;
import software.amazon.awscdk.services.logs.CfnDeliveryDestination;
import software.amazon.awscdk.services.logs.CfnDeliveryDestinationProps;
import software.amazon.awscdk.services.logs.CfnDeliveryProps;
import software.amazon.awscdk.services.logs.CfnDeliverySource;
import software.amazon.awscdk.services.logs.CfnDeliverySourceProps;
import software.amazon.awscdk.services.logs.ILogGroup;
import software.amazon.awscdk.services.logs.LogGroup;
import software.amazon.awscdk.services.logs.RetentionDays;
import software.amazon.awscdk.services.route53.HostedZone;
import software.amazon.awscdk.services.route53.HostedZoneAttributes;
import software.amazon.awscdk.services.route53.IHostedZone;
import software.amazon.awscdk.services.s3.BlockPublicAccess;
import software.amazon.awscdk.services.s3.Bucket;
import software.amazon.awscdk.services.s3.BucketEncryption;
import software.amazon.awscdk.services.s3.IBucket;
import software.amazon.awscdk.services.wafv2.CfnWebACL;
import software.constructs.Construct;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static co.uk.diyaccounting.submit.utils.Kind.infof;
import static co.uk.diyaccounting.submit.utils.KindCdk.cfnOutput;

public class EdgeStack extends Stack {

    public Bucket originBucket;
    public IBucket originAccessLogBucket;
    public final Distribution distribution;
    public final Permission distributionInvokeFnUrl;
    public final String aliasRecordDomainName;
    public final String aliasRecordV6DomainName;

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
        String cloudTrailEnabled();

        @Override
        SubmitSharedNames sharedNames();

        String hostedZoneName();

        String hostedZoneId();

        String certificateArn();

        String apiGatewayUrl();

        static ImmutableEdgeStackProps.Builder builder() {
            return ImmutableEdgeStackProps.builder();
        }
    }

    public EdgeStack(final Construct scope, final String id, final EdgeStackProps props) {
        this(scope, id, null, props);
    }

    public EdgeStack(final Construct scope, final String id, final StackProps stackProps, final EdgeStackProps props) {
        super(scope, id, StackProps.builder()
            .env(props.getEnv()) // enforce region from props
            .description(stackProps != null ? stackProps.getDescription() : null)
            .stackName(stackProps != null ? stackProps.getStackName() : null)
            .terminationProtection(stackProps != null ? stackProps.getTerminationProtection() : null)
            .analyticsReporting(stackProps != null ? stackProps.getAnalyticsReporting() : null)
            .synthesizer(stackProps != null ? stackProps.getSynthesizer() : null)
            .crossRegionReferences(stackProps != null ? stackProps.getCrossRegionReferences() : null)
            .build());

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
        String recordName = props.hostedZoneName().equals(props.sharedNames().deploymentDomainName)
                ? null
                : (props.sharedNames().deploymentDomainName.endsWith("." + props.hostedZoneName())
                        ? props.sharedNames()
                                .deploymentDomainName
                                .substring(
                                        0,
                                        props.sharedNames().deploymentDomainName.length()
                                                - (props.hostedZoneName().length() + 1))
                        : props.sharedNames().deploymentDomainName);

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

        // Create additional behaviours for the API Gateway Lambda origins
        HashMap<String, BehaviorOptions> additionalBehaviors = new HashMap<String, BehaviorOptions>();
        BehaviorOptions apiGatewayBehavior = createBehaviorOptionsForApiGateway(props.apiGatewayUrl());
        additionalBehaviors.put("/api/v1/*", apiGatewayBehavior);
        infof("Added API Gateway behavior for /api/v1/* pointing to %s", props.apiGatewayUrl());

        // Lookup log group
        ILogGroup distributionAccessLogGroup = LogGroup.fromLogGroupName(
                this,
                props.resourceNamePrefix() + "-ImportedDistributionLogGroup",
                props.sharedNames().distributionAccessLogGroupName);
//        IBucket distributionLogsBucket = Bucket.fromBucketName(
//                this,
//                props.resourceNamePrefix() + "-ImportedDistributionLogBucket",
//                props.sharedNames().distributionAccessLogBucketName);

        // CloudFront distribution for the web origin and all the URL Lambdas.
        this.distribution = Distribution.Builder.create(this, props.resourceNamePrefix() + "-WebDist")
                .defaultBehavior(localBehaviorOptions) // props.webBehaviorOptions)
                .additionalBehaviors(additionalBehaviors)
                // Use only the deployment-scoped domain to avoid alias conflicts with existing distributions
                .domainNames(List.of(props.sharedNames().deploymentDomainName))
                .certificate(cert)
                .defaultRootObject("index.html")
                .enableLogging(false)
                // TODO: Find an alternative for access logs
                //.logBucket(distributionLogsBucket)
                //.logFilePrefix("cloudfront/")
                .enableIpv6(true)
                .sslSupportMethod(SSLMethod.SNI)
                .webAclId(webAcl.getAttrArn())
                .build();
        Tags.of(this.distribution).add("OriginFor", props.sharedNames().deploymentDomainName);

        // Configure CloudFront standard access logging to CloudWatch Logs (pending CDK high-level support).
        CfnDistribution cfnDist = (CfnDistribution) this.distribution.getNode().getDefaultChild();
        assert cfnDist != null;
        //cfnDist.addPropertyOverride("DistributionConfig.Logging.Enabled", true);
        // Property names subject to change; adjust to official CloudFormation docs when released.
        //cfnDist.addPropertyOverride("DistributionConfig.Logging.LogGroup", distributionAccessLogGroup.getLogGroupName());
        //cfnDist.addPropertyOverride("DistributionConfig.Logging.LogGroupArn", distributionAccessLogGroup.getLogGroupArn());

        // 2. Compute the CloudFront distribution ARN for the delivery source
        String distributionArn = Stack.of(this).formatArn(ArnComponents.builder()
            .service("cloudfront")
            .region("")                         // CloudFront is global
            .resource("distribution")
            .resourceName(this.distribution.getDistributionId())
            .build());

        // 3. CloudWatch Logs destination that points at your log group
        CfnDeliveryDestination cfLogsDestination = new CfnDeliveryDestination(
            this,
            props.resourceNamePrefix() + "-CfAccessLogsDestination",
            CfnDeliveryDestinationProps.builder()
                .name(distributionAccessLogGroup.getLogGroupName())
                // This is the actual log group you already created
                .destinationResourceArn(distributionAccessLogGroup.getLogGroupArn())
                // "json", "w3c", or "parquet" per docs
                .outputFormat("json")
                .build()
        );

        // 4. Delivery source that represents the CloudFront distribution
        CfnDeliverySource cfLogsSource = new CfnDeliverySource(
            this,
            props.resourceNamePrefix() + "-CfAccessLogsSource",
            CfnDeliverySourceProps.builder()
                .name(props.resourceNamePrefix() + "-cf-access-logs-src")
                .logType("ACCESS_LOGS")           // required for CloudFront
                .resourceArn(distributionArn)     // ARN of the distribution
                .build()
        );

        // 5. Delivery that connects source to destination
        new CfnDelivery(
            this,
            props.resourceNamePrefix() + "-CfAccessLogsDelivery",
            CfnDeliveryProps.builder()
                .deliverySourceName(cfLogsSource.getName())
                .deliveryDestinationArn(cfLogsDestination.getAttrArn())
                // optional: customise fields and delimiter
                // .fieldDelimiter("\t")
                // .recordFields(List.of("date", "time", "x-edge-location", "c-ip",
                //                       "cs-method", "cs-host", "cs-uri-stem", "sc-status"))
                .build()
        );

        // Grant CloudFront access to the origin lambdas
        this.distributionInvokeFnUrl = Permission.builder()
                .principal(new ServicePrincipal("cloudfront.amazonaws.com"))
                .action("lambda:InvokeFunctionUrl")
                .functionUrlAuthType(FunctionUrlAuthType.NONE)
                .sourceArn(this.distribution.getDistributionArn())
                .build();

        // Idempotent UPSERT of Route53 A/AAAA alias to CloudFront (replaces deprecated deleteExisting)
        co.uk.diyaccounting.submit.utils.Route53AliasUpsert.upsertAliasToCloudFront(
                this, props.resourceNamePrefix() + "-AliasRecord", zone, recordName, this.distribution.getDomainName());
        // Capture the FQDN for outputs
        this.aliasRecordDomainName = (recordName == null || recordName.isBlank())
                ? zone.getZoneName()
                : (recordName + "." + zone.getZoneName());
        this.aliasRecordV6DomainName = this.aliasRecordDomainName;

        Aspects.of(this).add(new SetAutoDeleteJobLogRetentionAspect(props.deploymentName(), RetentionDays.THREE_DAYS));

        // Outputs
        cfnOutput(this, "BaseUrl", props.sharedNames().baseUrl);
        cfnOutput(this, "CertificateArn", cert.getCertificateArn());
        cfnOutput(this, "WebAclId", webAcl.getAttrArn());
        cfnOutput(this, "WebDistributionDomainName", this.distribution.getDomainName());
        cfnOutput(this, "DistributionId", this.distribution.getDistributionId());
        cfnOutput(this, "AliasRecord", this.aliasRecordDomainName);
        cfnOutput(this, "AliasRecordV6", this.aliasRecordV6DomainName);
        cfnOutput(this, "OriginBucketName", this.originBucket.getBucketName());

        infof("EdgeStack %s created successfully for %s", this.getNode().getId(), props.sharedNames().baseUrl);
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
