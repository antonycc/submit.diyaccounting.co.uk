package co.uk.diyaccounting.submit.stacks;

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
import software.amazon.awscdk.services.cloudfront.IOrigin;
import software.amazon.awscdk.services.cloudfront.OriginProtocolPolicy;
import software.amazon.awscdk.services.cloudfront.PriceClass;
import software.amazon.awscdk.services.cloudfront.ResponseHeadersPolicy;
import software.amazon.awscdk.services.cloudfront.ViewerProtocolPolicy;
import software.amazon.awscdk.services.cloudfront.origins.HttpOrigin;
import software.amazon.awscdk.services.cloudfront.origins.OriginGroup;
import software.amazon.awscdk.services.route53.ARecord;
import software.amazon.awscdk.services.route53.ARecordProps;
import software.amazon.awscdk.services.route53.HostedZone;
import software.amazon.awscdk.services.route53.HostedZoneAttributes;
import software.amazon.awscdk.services.route53.IHostedZone;
import software.amazon.awscdk.services.route53.RecordTarget;
import software.amazon.awscdk.services.route53.targets.CloudFrontTarget;
import software.constructs.Construct;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static co.uk.diyaccounting.submit.utils.KindCdk.cfnOutput;

public class ApexStack extends Stack {

    public final Distribution distribution;
    public final ARecord apexAlias;

    @Value.Immutable
    public interface ApexStackProps extends StackProps, SubmitStackProps {
        @Override
        Environment getEnv();
        @Override @Value.Default default Boolean getCrossRegionReferences() { return null; }
        @Override String envName();
        @Override String deploymentName();
        @Override String resourceNamePrefix();
        @Override String compressedResourceNamePrefix();
        @Override String dashedDomainName();
        @Override String domainName(); // apex, e.g. submit.diyaccounting.co.uk
        @Override String baseUrl();
        @Override String cloudTrailEnabled();

        String hostedZoneName();
        String hostedZoneId();
        String certificateArn();

        /** Map of label -> CloudFront distribution domain, e.g. "ci-feature-1" -> "dxxxx.cloudfront.net" */
        Map<String, String> deploymentOrigins();

        /** Which label should ‘apex’ point at now. Example: "ci-feature-2" or "prod-blue" */
        String activeLabel();

        /** Optional additional SANs on the distribution, e.g. ["www.example.com"] */
        @Value.Default default List<String> extraAltNames() { return List.of(); }

        /** Logging TTL in days */
        int accessLogGroupRetentionPeriodDays();

        static ImmutableApexStackProps.Builder builder() { return ImmutableApexStackProps.builder(); }
    }

    public ApexStack(final Construct scope, final String id, final ApexStackProps props) {
        super(scope, id, props);

        // Hosted zone
        IHostedZone zone = HostedZone.fromHostedZoneAttributes(
            this, props.resourceNamePrefix() + "-Zone",
            HostedZoneAttributes.builder()
                .hostedZoneId(props.hostedZoneId())
                .zoneName(props.hostedZoneName())
                .build());

        // Record name for apex or subdomain
        String recordName = props.hostedZoneName().equals(props.domainName())
            ? null
            : (props.domainName().endsWith("." + props.hostedZoneName())
            ? props.domainName().substring(0, props.domainName().length() - (props.hostedZoneName().length() + 1))
            : props.domainName());

        // ACM cert (us-east-1 for CloudFront)
        var cert = Certificate.fromCertificateArn(this, props.resourceNamePrefix() + "-ApexCert", props.certificateArn());

        // Build candidate origins from supplied CloudFront distribution domain names
        Map<String, OriginGroup> originGroups = new HashMap<>();
        Map<String, IOrigin> origins = new HashMap<>();
        for (var e : props.deploymentOrigins().entrySet()) {
            var label = e.getKey();
            var cfDomain = e.getValue(); // e.g. dyyyy.cloudfront.net
            origins.put(label, HttpOrigin.Builder.create(cfDomain)
                .originShieldEnabled(false)
                .protocolPolicy(OriginProtocolPolicy.HTTPS_ONLY)
                .build());
        }

        // Default origin = active label
        var active = props.activeLabel();
        if (!origins.containsKey(active)) {
            throw new IllegalArgumentException("activeLabel '" + active + "' not in deploymentOrigins");
        }

        // Behaviour
        var defaultBehavior = BehaviorOptions.builder()
            .origin(origins.get(active))
            .allowedMethods(AllowedMethods.ALLOW_GET_HEAD_OPTIONS)
            .cachePolicy(CachePolicy.CACHING_OPTIMIZED) // keep apex fast, invalidate on cutover
            .viewerProtocolPolicy(ViewerProtocolPolicy.REDIRECT_TO_HTTPS)
            .responseHeadersPolicy(ResponseHeadersPolicy.CORS_ALLOW_ALL_ORIGINS_WITH_PREFLIGHT_AND_SECURITY_HEADERS)
            .build();

        // Distribution with all hostnames (apex + extras)
        List<String> altNames = new ArrayList<>();
        altNames.add(props.domainName());
        altNames.addAll(props.extraAltNames());

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
            this, props.resourceNamePrefix() + "-ApexAlias",
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
