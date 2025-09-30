package co.uk.diyaccounting.submit.stacks;

import static co.uk.diyaccounting.submit.utils.KindCdk.cfnOutput;

import java.util.ArrayList;
import java.util.List;
import org.immutables.value.Value;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.StackProps;
import software.amazon.awscdk.services.certificatemanager.Certificate;
import software.amazon.awscdk.services.cloudfront.AllowedMethods;
import software.amazon.awscdk.services.cloudfront.BehaviorOptions;
import software.amazon.awscdk.services.cloudfront.CachePolicy;
import software.amazon.awscdk.services.cloudfront.Distribution;
import software.amazon.awscdk.services.cloudfront.HttpVersion;
import software.amazon.awscdk.services.cloudfront.PriceClass;
import software.amazon.awscdk.services.cloudfront.ResponseHeadersPolicy;
import software.amazon.awscdk.services.cloudfront.ViewerProtocolPolicy;
import software.amazon.awscdk.services.cloudfront.origins.HttpOrigin;
import software.amazon.awscdk.services.route53.ARecord;
import software.amazon.awscdk.services.route53.ARecordProps;
import software.amazon.awscdk.services.route53.HostedZone;
import software.amazon.awscdk.services.route53.HostedZoneAttributes;
import software.amazon.awscdk.services.route53.IHostedZone;
import software.amazon.awscdk.services.route53.RecordTarget;
import software.amazon.awscdk.services.route53.targets.CloudFrontTarget;
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

        // Behaviour
        var origin = new HttpOrigin("example.com");
        var defaultBehavior = BehaviorOptions.builder()
                .origin(origin)
                .allowedMethods(AllowedMethods.ALLOW_GET_HEAD_OPTIONS)
                .cachePolicy(CachePolicy.CACHING_OPTIMIZED) // keep apex fast, invalidate on cutover
                .viewerProtocolPolicy(ViewerProtocolPolicy.REDIRECT_TO_HTTPS)
                .responseHeadersPolicy(ResponseHeadersPolicy.CORS_ALLOW_ALL_ORIGINS_WITH_PREFLIGHT_AND_SECURITY_HEADERS)
                .build();

        // Distribution with all hostnames (apex + extras)
        List<String> altNames = new ArrayList<>();
        altNames.add(props.domainName());

        this.distribution = Distribution.Builder.create(this, props.resourceNamePrefix() + "-ApexDist")
                .defaultBehavior(defaultBehavior)
                .domainNames(altNames)
                .certificate(cert)
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

        // Outputs
        cfnOutput(this, "ApexDistributionDomainName", this.distribution.getDomainName());
        cfnOutput(this, "ApexDistributionId", this.distribution.getDistributionId());
        cfnOutput(this, "ApexAlias", this.apexAlias.getDomainName());
    }
}
