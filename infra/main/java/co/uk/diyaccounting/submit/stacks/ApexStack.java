package co.uk.diyaccounting.submit.stacks;

import co.uk.diyaccounting.submit.SubmitSharedNames;
import co.uk.diyaccounting.submit.aspects.SetAutoDeleteJobLogRetentionAspect;
import org.immutables.value.Value;
import software.amazon.awscdk.Aspects;
import software.amazon.awscdk.AssetHashType;
import software.amazon.awscdk.Duration;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.Expiration;
import software.amazon.awscdk.RemovalPolicy;
import software.amazon.awscdk.Size;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.StackProps;
import software.amazon.awscdk.Tags;
import software.amazon.awscdk.services.certificatemanager.Certificate;
import software.amazon.awscdk.services.cloudfront.AllowedMethods;
import software.amazon.awscdk.services.cloudfront.BehaviorOptions;
import software.amazon.awscdk.services.cloudfront.Distribution;
import software.amazon.awscdk.services.cloudfront.IOrigin;
import software.amazon.awscdk.services.cloudfront.OriginRequestPolicy;
import software.amazon.awscdk.services.cloudfront.ResponseHeadersPolicy;
import software.amazon.awscdk.services.cloudfront.S3OriginAccessControl;
import software.amazon.awscdk.services.cloudfront.SSLMethod;
import software.amazon.awscdk.services.cloudfront.Signing;
import software.amazon.awscdk.services.cloudfront.ViewerProtocolPolicy;
import software.amazon.awscdk.services.cloudfront.origins.S3BucketOrigin;
import software.amazon.awscdk.services.cloudfront.origins.S3BucketOriginWithOACProps;
import software.amazon.awscdk.services.iam.PolicyStatement;
import software.amazon.awscdk.services.iam.ServicePrincipal;
import software.amazon.awscdk.services.lambda.FunctionUrlAuthType;
import software.amazon.awscdk.services.lambda.Permission;
import software.amazon.awscdk.services.logs.ILogGroup;
import software.amazon.awscdk.services.logs.LogGroup;
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
import software.amazon.awscdk.services.s3.assets.AssetOptions;
import software.amazon.awscdk.services.s3.deployment.BucketDeployment;
import software.amazon.awscdk.services.s3.deployment.Source;
import software.constructs.Construct;

import java.nio.file.Paths;
import java.util.List;
import java.util.Map;
import java.util.Objects;

import static co.uk.diyaccounting.submit.utils.Kind.infof;
import static co.uk.diyaccounting.submit.utils.KindCdk.cfnOutput;

public class ApexStack extends Stack {

    public Bucket holdingBucket;
    public final Distribution distribution;
    public final Permission distributionInvokeFnUrl;
    public final ARecord aliasRecord;
    public final AaaaRecord aliasRecordV6;
    public final BucketDeployment webDeployment;

    @Value.Immutable
    public interface ApexStackProps extends StackProps, SubmitStackProps {
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

        String holdingDocRootPath();

        /** Logging TTL in days */
        int accessLogGroupRetentionPeriodDays();

        static ImmutableApexStackProps.Builder builder() {
            return ImmutableApexStackProps.builder();
        }
    }

    public ApexStack(final Construct scope, final String id, final ApexStackProps props) {
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
        String recordName = props.hostedZoneName().equals(props.sharedNames().holdingDomainName)
            ? null
            : (props.sharedNames().holdingDomainName.endsWith("." + props.hostedZoneName())
            ? props.sharedNames()
            .holdingDomainName
            .substring(
                0,
                props.sharedNames().holdingDomainName.length()
                    - (props.hostedZoneName().length() + 1))
            : props.sharedNames().holdingDomainName);

        // TLS certificate from existing ACM (must be in us-east-1 for CloudFront)
        var cert =
            Certificate.fromCertificateArn(this, props.resourceNamePrefix() + "-WebCert", props.certificateArn());

        // Create the origin bucket
        this.holdingBucket = Bucket.Builder.create(this, props.resourceNamePrefix() + "-OriginBucket")
            .bucketName(props.sharedNames().holdingBucketName)
            .versioned(false)
            .blockPublicAccess(BlockPublicAccess.BLOCK_ALL)
            .encryption(BucketEncryption.S3_MANAGED)
            .removalPolicy(RemovalPolicy.DESTROY)
            .autoDeleteObjects(true)
            .build();
        infof(
            "Created origin bucket %s with name %s",
            this.holdingBucket.getNode().getId(), props.sharedNames().holdingBucketName);

        this.holdingBucket.addToResourcePolicy(PolicyStatement.Builder.create()
            .sid("AllowCloudFrontReadViaOAC")
            .principals(List.of(new ServicePrincipal("cloudfront.amazonaws.com")))
            .actions(List.of("s3:GetObject"))
            .resources(List.of(this.holdingBucket.getBucketArn() + "/*"))
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
            this.holdingBucket,
            S3BucketOriginWithOACProps.builder().originAccessControl(oac).build());
        infof("Created BucketOrigin with bucket: %s", this.holdingBucket.getBucketName());

        BehaviorOptions localBehaviorOptions = BehaviorOptions.builder()
            .origin(localOrigin)
            .allowedMethods(AllowedMethods.ALLOW_GET_HEAD_OPTIONS)
            .originRequestPolicy(OriginRequestPolicy.CORS_S3_ORIGIN)
            .viewerProtocolPolicy(ViewerProtocolPolicy.REDIRECT_TO_HTTPS)
            .responseHeadersPolicy(ResponseHeadersPolicy.CORS_ALLOW_ALL_ORIGINS_WITH_PREFLIGHT_AND_SECURITY_HEADERS)
            .compress(true)
            .build();

        // CloudFront distribution for the web origin and all the URL Lambdas.
        this.distribution = Distribution.Builder.create(this, props.resourceNamePrefix() + "-WebDist")
            .defaultBehavior(localBehaviorOptions)
            .domainNames(List.of(
                // props.sharedNames().domainName,
                props.sharedNames().holdingDomainName
            ))
            .certificate(cert)
            .defaultRootObject("index.html")
            .enableLogging(false)
            .enableIpv6(true)
            .sslSupportMethod(SSLMethod.SNI)
            .build();
        Tags.of(this.distribution).add("OriginFor", props.sharedNames().holdingDomainName);

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
                .deleteExisting(true)
                .build());

        // AAAA record
        this.aliasRecordV6 = new AaaaRecord(
            this,
            props.resourceNamePrefix() + "-AliasRecordV6",
            AaaaRecordProps.builder()
                .recordName(recordName)
                .zone(zone)
                .target(RecordTarget.fromAlias(new CloudFrontTarget(this.distribution)))
                .deleteExisting(true)
                .build());

        // Lookup Log Group for web deployment
        ILogGroup webDeploymentLogGroup = LogGroup.fromLogGroupArn(
            this,
            props.resourceNamePrefix() + "-ImportedWebDeploymentLogGroup",
            "arn:aws:logs:%s:%s:log-group:%s"
                .formatted(
                    Objects.requireNonNull(props.getEnv()).getRegion(),
                    props.getEnv().getAccount(),
                    props.sharedNames().webDeploymentLogGroupName));

        // Deploy the web website files to the web website bucket and invalidate distribution
        // Resolve the document root path from props to avoid path mismatches between generation and deployment
        var publicDir = Paths.get(props.holdingDocRootPath()).toAbsolutePath().normalize();
        infof("Using public doc root: %s".formatted(publicDir));
        var webDocRootSource = Source.asset(
            publicDir.toString(),
            AssetOptions.builder().assetHashType(AssetHashType.SOURCE).build());
        this.webDeployment = BucketDeployment.Builder.create(
                this, props.resourceNamePrefix() + "-DocRootToWebOriginDeployment")
            .sources(List.of(webDocRootSource))
            .destinationBucket(this.holdingBucket)
            .distribution(distribution)
            .distributionPaths(List.of("/index.html"))
            .retainOnDelete(true)
            .logGroup(webDeploymentLogGroup)
            .expires(Expiration.after(Duration.minutes(5)))
            .prune(false)
            .memoryLimit(1024)
            .ephemeralStorageSize(Size.gibibytes(2))
            .build();

        Aspects.of(this).add(new SetAutoDeleteJobLogRetentionAspect(props.deploymentName(), RetentionDays.THREE_DAYS));

        // Outputs
        cfnOutput(this, "BaseUrl", props.sharedNames().baseUrl);
        cfnOutput(this, "CertificateArn", cert.getCertificateArn());
        cfnOutput(this, "WebDistributionDomainName", this.distribution.getDomainName());
        cfnOutput(this, "DistributionId", this.distribution.getDistributionId());
        cfnOutput(this, "AliasRecord", this.aliasRecord.getDomainName());
        cfnOutput(this, "AliasRecordV6", this.aliasRecordV6.getDomainName());

        infof("ApexStack %s created successfully for %s", this.getNode().getId(), props.sharedNames().baseUrl);
    }
}
