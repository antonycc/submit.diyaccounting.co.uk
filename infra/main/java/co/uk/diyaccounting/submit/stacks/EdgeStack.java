package co.uk.diyaccounting.submit.stacks;

import static co.uk.diyaccounting.submit.utils.Kind.infof;
import static co.uk.diyaccounting.submit.utils.KindCdk.cfnOutput;

import co.uk.diyaccounting.submit.SubmitSharedNames;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.immutables.value.Value;
import software.amazon.awscdk.ArnComponents;
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
import software.amazon.awscdk.services.cloudfront.ResponseCustomHeader;
import software.amazon.awscdk.services.cloudfront.ResponseCustomHeadersBehavior;
import software.amazon.awscdk.services.cloudfront.ResponseHeadersContentSecurityPolicy;
import software.amazon.awscdk.services.cloudfront.ResponseHeadersCorsBehavior;
import software.amazon.awscdk.services.cloudfront.ResponseHeadersPolicy;
import software.amazon.awscdk.services.cloudfront.ResponseSecurityHeadersBehavior;
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
import software.amazon.awscdk.services.route53.HostedZone;
import software.amazon.awscdk.services.route53.HostedZoneAttributes;
import software.amazon.awscdk.services.route53.IHostedZone;
import software.amazon.awscdk.services.s3.BlockPublicAccess;
import software.amazon.awscdk.services.s3.Bucket;
import software.amazon.awscdk.services.s3.BucketEncryption;
import software.amazon.awscdk.services.wafv2.CfnWebACL;
import software.constructs.Construct;

public class EdgeStack extends Stack {

    private static final String WAF_RULES_PATH = "infra/policies/waf.json";
    private static final String CSP_POLICY_PATH = "infra/policies/csp.txt";

    public Bucket originBucket;
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
        super(
                scope,
                id,
                StackProps.builder()
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
                .rules(loadWafRules())
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
                // .autoDeleteObjects(true)
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

        // Define a custom Response Headers Policy with CSP that allows AWS RUM client + dataplane
        ResponseHeadersPolicy webResponseHeadersPolicy = ResponseHeadersPolicy.Builder.create(
                        this, props.resourceNamePrefix() + "-WHP")
                .responseHeadersPolicyName(props.resourceNamePrefix() + "-whp")
                .comment("CORS + security headers with CSP allowing CloudWatch RUM client & dataplane")
                .corsBehavior(ResponseHeadersCorsBehavior.builder()
                        .accessControlAllowCredentials(false)
                        .accessControlAllowHeaders(List.of("*"))
                        .accessControlAllowMethods(List.of("GET", "HEAD", "OPTIONS"))
                        .accessControlAllowOrigins(List.of("*"))
                        .accessControlExposeHeaders(List.of())
                        .accessControlMaxAge(software.amazon.awscdk.Duration.seconds(600))
                        .originOverride(true)
                        .build())
                .securityHeadersBehavior(ResponseSecurityHeadersBehavior.builder()
                        .contentSecurityPolicy(ResponseHeadersContentSecurityPolicy.builder()
                                .contentSecurityPolicy(loadContentSecurityPolicy())
                                .override(true)
                                .build())
                        .build())
                // keep space for future custom headers if needed
                .customHeadersBehavior(ResponseCustomHeadersBehavior.builder()
                        .customHeaders(List.of(
                                // No custom headers at present
                                new ResponseCustomHeader[] {}))
                        .build())
                .build();

        BehaviorOptions localBehaviorOptions = BehaviorOptions.builder()
                .origin(localOrigin)
                .allowedMethods(AllowedMethods.ALLOW_GET_HEAD_OPTIONS)
                .originRequestPolicy(OriginRequestPolicy.CORS_S3_ORIGIN)
                .viewerProtocolPolicy(ViewerProtocolPolicy.REDIRECT_TO_HTTPS)
                .responseHeadersPolicy(webResponseHeadersPolicy)
                .compress(true)
                .build();

        // Create additional behaviours for the API Gateway Lambda origins
        HashMap<String, BehaviorOptions> additionalBehaviors = new HashMap<String, BehaviorOptions>();
        BehaviorOptions apiGatewayBehavior =
                createBehaviorOptionsForApiGateway(props.apiGatewayUrl(), webResponseHeadersPolicy);
        additionalBehaviors.put("/api/v1/*", apiGatewayBehavior);
        infof("Added API Gateway behavior for /api/v1/* pointing to %s", props.apiGatewayUrl());

        // CloudFront distribution for the web origin and all the URL Lambdas.
        this.distribution = Distribution.Builder.create(this, props.resourceNamePrefix() + "-WebDist")
                .defaultBehavior(localBehaviorOptions) // props.webBehaviorOptions)
                .additionalBehaviors(additionalBehaviors)
                // Use only the deployment-scoped domain to avoid alias conflicts with existing distributions
                .domainNames(List.of(props.sharedNames().deploymentDomainName))
                .certificate(cert)
                .defaultRootObject("index.html")
                .enableLogging(false)
                .enableIpv6(true)
                .sslSupportMethod(SSLMethod.SNI)
                .webAclId(webAcl.getAttrArn())
                .build();
        Tags.of(this.distribution).add("OriginFor", props.sharedNames().deploymentDomainName);

        // Compute the CloudFront distribution ARN for the delivery source
        String distributionArn = Stack.of(this)
                .formatArn(ArnComponents.builder()
                        .service("cloudfront")
                        .region("") // CloudFront is global
                        .resource("distribution")
                        .resourceName(this.distribution.getDistributionId())
                        .build());

        // Grant CloudFront access to the origin lambdas
        this.distributionInvokeFnUrl = Permission.builder()
                .principal(new ServicePrincipal("cloudfront.amazonaws.com"))
                .action("lambda:InvokeFunctionUrl")
                .functionUrlAuthType(FunctionUrlAuthType.NONE)
                .sourceArn(this.distribution.getDistributionArn())
                .build();

        // Idempotent UPSERT of Route53 A/AAAA alias to CloudFront (replaces deprecated deleteExisting)
        co.uk.diyaccounting.submit.utils.Route53AliasUpsert.upsertAliasToCloudFront(
                this, "AliasRecord", zone, recordName, this.distribution.getDomainName());
        // Capture the FQDN for outputs
        this.aliasRecordDomainName = (recordName == null || recordName.isBlank())
                ? zone.getZoneName()
                : (recordName + "." + zone.getZoneName());
        this.aliasRecordV6DomainName = this.aliasRecordDomainName;

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

    private List<CfnWebACL.RuleProperty> loadWafRules() {
        try {
            Path wafJsonPath = Path.of(WAF_RULES_PATH);
            String json = Files.readString(wafJsonPath, StandardCharsets.UTF_8);
            ObjectMapper mapper = new ObjectMapper();
            List<Map<String, Object>> rulesData =
                    mapper.readValue(json, new TypeReference<List<Map<String, Object>>>() {});

            return rulesData.stream().map(this::buildRuleProperty).toList();
        } catch (Exception e) {
            throw new RuntimeException("Failed to load WAF rules from " + WAF_RULES_PATH + ": " + e.getMessage(), e);
        }
    }

    @SuppressWarnings("unchecked")
    private CfnWebACL.RuleProperty buildRuleProperty(Map<String, Object> ruleData) {
        CfnWebACL.RuleProperty.Builder builder = CfnWebACL.RuleProperty.builder()
                .name((String) ruleData.get("name"))
                .priority(((Number) ruleData.get("priority")).intValue());

        // Handle visibility config
        Map<String, Object> visConfig = (Map<String, Object>) ruleData.get("visibilityConfig");
        if (visConfig != null) {
            builder.visibilityConfig(CfnWebACL.VisibilityConfigProperty.builder()
                    .cloudWatchMetricsEnabled((Boolean) visConfig.get("cloudWatchMetricsEnabled"))
                    .metricName((String) visConfig.get("metricName"))
                    .sampledRequestsEnabled((Boolean) visConfig.get("sampledRequestsEnabled"))
                    .build());
        }

        // Handle statement
        Map<String, Object> statement = (Map<String, Object>) ruleData.get("statement");
        if (statement != null) {
            CfnWebACL.StatementProperty.Builder stmtBuilder = CfnWebACL.StatementProperty.builder();

            // Rate based statement
            if (statement.containsKey("rateBasedStatement")) {
                Map<String, Object> rateStmt = (Map<String, Object>) statement.get("rateBasedStatement");
                stmtBuilder.rateBasedStatement(CfnWebACL.RateBasedStatementProperty.builder()
                        .limit(((Number) rateStmt.get("limit")).longValue())
                        .aggregateKeyType((String) rateStmt.get("aggregateKeyType"))
                        .build());
            }

            // Managed rule group statement
            if (statement.containsKey("managedRuleGroupStatement")) {
                Map<String, Object> managedStmt = (Map<String, Object>) statement.get("managedRuleGroupStatement");
                stmtBuilder.managedRuleGroupStatement(CfnWebACL.ManagedRuleGroupStatementProperty.builder()
                        .name((String) managedStmt.get("name"))
                        .vendorName((String) managedStmt.get("vendorName"))
                        .ruleActionOverrides(List.of()) // Empty override list to prevent conflicts
                        .build());
            }

            builder.statement(stmtBuilder.build());
        }

        // Handle action (for rate limit rule)
        if (ruleData.containsKey("action")) {
            Map<String, Object> action = (Map<String, Object>) ruleData.get("action");
            CfnWebACL.RuleActionProperty.Builder actionBuilder = CfnWebACL.RuleActionProperty.builder();

            if (action.containsKey("block")) {
                actionBuilder.block(CfnWebACL.BlockActionProperty.builder().build());
            }

            builder.action(actionBuilder.build());
        }

        // Handle override action (for managed rule groups)
        if (ruleData.containsKey("overrideAction")) {
            Map<String, Object> overrideAction = (Map<String, Object>) ruleData.get("overrideAction");
            CfnWebACL.OverrideActionProperty.Builder overrideBuilder = CfnWebACL.OverrideActionProperty.builder();

            if (overrideAction.containsKey("none")) {
                overrideBuilder.none(Map.of());
            }

            builder.overrideAction(overrideBuilder.build());
        }

        return builder.build();
    }

    private String loadContentSecurityPolicy() {
        try {
            Path cspPath = Path.of(CSP_POLICY_PATH);
            String csp = Files.readString(cspPath, StandardCharsets.UTF_8);
            // Normalize whitespace: collapse runs into single spaces, trim edges
            return csp.replaceAll("\\s+", " ").trim();
        } catch (Exception e) {
            throw new RuntimeException("Failed to load CSP from " + CSP_POLICY_PATH + ": " + e.getMessage(), e);
        }
    }

    public BehaviorOptions createBehaviorOptionsForApiGateway(
            String apiGatewayUrl, ResponseHeadersPolicy responseHeadersPolicy) {
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
                .responseHeadersPolicy(responseHeadersPolicy)
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
