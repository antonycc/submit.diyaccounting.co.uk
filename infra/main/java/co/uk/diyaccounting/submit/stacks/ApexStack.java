package co.uk.diyaccounting.submit.stacks;

import static co.uk.diyaccounting.submit.utils.KindCdk.cfnOutput;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import co.uk.diyaccounting.submit.aspects.SetAutoDeleteJobLogRetentionAspect;
import org.immutables.value.Value;
import software.amazon.awscdk.Aspects;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.RemovalPolicy;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.StackProps;
import software.amazon.awscdk.services.certificatemanager.Certificate;
import software.amazon.awscdk.services.cloudfront.AllowedMethods;
import software.amazon.awscdk.services.cloudfront.BehaviorOptions;
import software.amazon.awscdk.services.cloudfront.Distribution;
import software.amazon.awscdk.services.cloudfront.HttpVersion;
import software.amazon.awscdk.services.cloudfront.IOrigin;
import software.amazon.awscdk.services.cloudfront.OriginRequestPolicy;
import software.amazon.awscdk.services.cloudfront.PriceClass;
import software.amazon.awscdk.services.cloudfront.ResponseHeadersPolicy;
import software.amazon.awscdk.services.cloudfront.S3OriginAccessControl;
import software.amazon.awscdk.services.cloudfront.Signing;
import software.amazon.awscdk.services.cloudfront.ViewerProtocolPolicy;
import software.amazon.awscdk.services.cloudfront.origins.S3BucketOrigin;
import software.amazon.awscdk.services.cloudfront.origins.S3BucketOriginWithOACProps;
import software.amazon.awscdk.services.route53.ARecord;
import software.amazon.awscdk.services.route53.ARecordProps;
import software.amazon.awscdk.services.route53.HostedZone;
import software.amazon.awscdk.services.route53.HostedZoneAttributes;
import software.amazon.awscdk.services.route53.IHostedZone;
import software.amazon.awscdk.services.route53.RecordTarget;
import software.amazon.awscdk.services.route53.targets.CloudFrontTarget;
import software.amazon.awscdk.services.s3.BlockPublicAccess;
import software.amazon.awscdk.services.s3.Bucket;
import software.amazon.awscdk.services.s3.BucketEncryption;
import software.amazon.awscdk.services.s3.ObjectOwnership;
import software.amazon.awscdk.services.s3.deployment.BucketDeployment;
import software.amazon.awscdk.services.s3.deployment.Source;
import software.constructs.Construct;

public class ApexStack extends Stack {

    public Distribution distribution;
    public ARecord apexAlias;

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
        String dashedDomainName();

        @Override
        String domainName(); // apex, e.g. submit.diyaccounting.co.uk

        @Override
        String baseUrl();

        @Override
        String cloudTrailEnabled();

        String hostedZoneName();

        String hostedZoneId();

        String certificateArn();

        /** Logging TTL in days */
        int accessLogGroupRetentionPeriodDays();

        static ImmutableApexStackProps.Builder builder() {
            return ImmutableApexStackProps.builder();
        }
    }

    public ApexStack(final Construct scope, final String id, final ApexStackProps props) {
        super(scope, id, props);

        // Hosted zone
        IHostedZone zone = HostedZone.fromHostedZoneAttributes(
                this,
                props.resourceNamePrefix() + "-Zone",
                HostedZoneAttributes.builder()
                        .hostedZoneId(props.hostedZoneId())
                        .zoneName(props.hostedZoneName())
                        .build());

        // Record name for apex or subdomain
        String recordName = props.hostedZoneName().equals(props.domainName())
                ? null
                : (props.domainName().endsWith("." + props.hostedZoneName())
                        ? props.domainName()
                                .substring(
                                        0,
                                        props.domainName().length()
                                                - (props.hostedZoneName().length() + 1))
                        : props.domainName());

        // ACM cert (us-east-1 for CloudFront)
        var cert =
                Certificate.fromCertificateArn(this, props.resourceNamePrefix() + "-ApexCert", props.certificateArn());

        // Maintenance holding page in S3 (private with OAC)
        Bucket maintenanceBucket = Bucket.Builder.create(this, props.resourceNamePrefix() + "-ApexHoldingBucket")
                .versioned(false)
                .blockPublicAccess(BlockPublicAccess.BLOCK_ALL)
                .objectOwnership(ObjectOwnership.OBJECT_WRITER)
                .encryption(BucketEncryption.S3_MANAGED)
                .removalPolicy(RemovalPolicy.DESTROY)
                .autoDeleteObjects(true)
                .build();

        S3OriginAccessControl oac = S3OriginAccessControl.Builder.create(this, props.resourceNamePrefix() + "-ApexOAC")
                .signing(Signing.SIGV4_ALWAYS)
                .build();
        IOrigin maintenanceOrigin = S3BucketOrigin.withOriginAccessControl(
                maintenanceBucket,
                S3BucketOriginWithOACProps.builder().originAccessControl(oac).build());

        // TODO: Move to file ./web/holding/index.html and load from repository files
        // Upload a minimal maintenance page
        String maintenanceHtml = "<!doctype html>\n" + "<html lang=\"en\">\n"
                + "<head>\n"
                + "  <meta charset=\"utf-8\"/>\n"
                + "  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"/>\n"
                + "  <title>Maintenance – "
                + props.domainName() + "</title>\n" + "  <style>\n"
                + "    body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Cantarell,Noto Sans,sans-serif;margin:0;background:#f8f9fa;color:#222}\n"
                + "    .wrap{max-width:720px;margin:12vh auto;padding:2rem;background:#fff;border:1px solid #e5e7eb;border-radius:12px;box-shadow:0 2px 24px rgba(0,0,0,.05);text-align:center}\n"
                + "    h1{margin:0 0 .25em 0;font-size:2rem}\n"
                + "    p{margin:.25em 0;color:#555}\n"
                + "    small{color:#777}\n"
                + "  </style>\n"
                + "</head>\n"
                + "<body>\n"
                + "  <div class=\"wrap\">\n"
                + "    <h1>We'll be right back</h1>\n"
                + "    <p>The site is temporarily unavailable while we deploy an update.</p>\n"
                + "    <p><small>Domain: "
                + props.domainName() + "</small></p>\n" + "  </div>\n"
                + "</body>\n"
                + "</html>\n";
        BucketDeployment.Builder.create(this, props.resourceNamePrefix() + "-HoldingDeploy")
                .sources(List.of(Source.data("index.html", maintenanceHtml)))
                .destinationBucket(maintenanceBucket)
                .retainOnDelete(false)
                .build();

        BehaviorOptions maintenanceBehavior = BehaviorOptions.builder()
                .origin(maintenanceOrigin)
                .allowedMethods(AllowedMethods.ALLOW_GET_HEAD_OPTIONS)
                .originRequestPolicy(OriginRequestPolicy.CORS_S3_ORIGIN)
                .viewerProtocolPolicy(ViewerProtocolPolicy.REDIRECT_TO_HTTPS)
                .responseHeadersPolicy(ResponseHeadersPolicy.CORS_ALLOW_ALL_ORIGINS_WITH_PREFLIGHT_AND_SECURITY_HEADERS)
                .compress(true)
                .build();

        // Default to maintenance origin; application origins (if any) are managed at runtime via AWS CLI workflow
        BehaviorOptions defaultBehavior = maintenanceBehavior;

        Map<String, BehaviorOptions> additionalBehaviors = new HashMap<>();
        additionalBehaviors.put("/maintenance/*", maintenanceBehavior);

        // Distribution with all hostnames (apex + extras)
        List<String> altNames = new ArrayList<>();
        altNames.add(props.domainName());

        this.distribution = Distribution.Builder.create(this, props.resourceNamePrefix() + "-ApexDist")
                .defaultBehavior(defaultBehavior)
                .additionalBehaviors(additionalBehaviors)
                .domainNames(altNames)
                .certificate(cert)
                .defaultRootObject("index.html")
                .enableIpv6(true)
                .httpVersion(HttpVersion.HTTP2_AND_3)
                .priceClass(PriceClass.PRICE_CLASS_100)
                .build();

        // Alias A/AAAA for apex
        this.apexAlias = new ARecord(
                this,
                props.resourceNamePrefix() + "-ApexAlias",
                ARecordProps.builder()
                        .recordName(recordName)
                        .zone(zone)
                        .target(RecordTarget.fromAlias(new CloudFrontTarget(this.distribution)))
                        .deleteExisting(true)
                        .build());

        Aspects.of(this).add(new SetAutoDeleteJobLogRetentionAspect(props.deploymentName(), 2));

        // Outputs
        cfnOutput(this, "ApexDistributionDomainName", this.distribution.getDomainName());
        cfnOutput(this, "ApexDistributionId", this.distribution.getDistributionId());
        cfnOutput(this, "ApexAlias", this.apexAlias.getDomainName());
    }
}
