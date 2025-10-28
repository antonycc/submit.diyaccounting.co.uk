package co.uk.diyaccounting.submit.utils;

import java.util.List;
import java.util.Map;
import software.amazon.awscdk.customresources.AwsCustomResource;
import software.amazon.awscdk.customresources.AwsCustomResourcePolicy;
import software.amazon.awscdk.customresources.AwsSdkCall;
import software.amazon.awscdk.customresources.PhysicalResourceId;
import software.amazon.awscdk.services.route53.IHostedZone;
import software.constructs.Construct;

/**
 * Utilities for idempotent Route53 UPSERT of alias records using AwsCustomResource.
 * This replaces deprecated deleteExisting(true) behaviour with a supported approach.
 */
public final class Route53AliasUpsert {
    private Route53AliasUpsert() {}

    // CloudFront hosted zone ID (well-known constant)
    public static final String CLOUDFRONT_HOSTED_ZONE_ID = "Z2FDTNDATAQYW2";

    /**
     * UPSERTs A and AAAA records with AliasTarget pointing to the given CloudFront DNS name.
     *
     * @param scope construct scope
     * @param idPrefix unique id prefix for custom resources
     * @param zone hosted zone where records should be created
     * @param relativeRecordName relative record name within the zone (null or "" for zone apex)
     * @param cloudFrontDnsName CloudFront distribution domain name (e.g. d111111abcdef8.cloudfront.net)
     */
    public static void upsertAliasToCloudFront(
            Construct scope,
            String idPrefix,
            IHostedZone zone,
            String relativeRecordName,
            String cloudFrontDnsName) {
        String fqdn = buildFqdn(zone, relativeRecordName);

        // Build the common ChangeResourceRecordSets payload for A or AAAA
        java.util.function.Function<String, Map<String, Object>> changeForType = (recordType) -> {
            Map<String, Object> aliasTarget = new java.util.HashMap<>();
            aliasTarget.put("DNSName", cloudFrontDnsName);
            aliasTarget.put("HostedZoneId", CLOUDFRONT_HOSTED_ZONE_ID);
            aliasTarget.put("EvaluateTargetHealth", false);

            Map<String, Object> rrset = new java.util.HashMap<>();
            rrset.put("Name", fqdn);
            rrset.put("Type", recordType);
            rrset.put("AliasTarget", aliasTarget);

            Map<String, Object> change = new java.util.HashMap<>();
            change.put("Action", "UPSERT");
            change.put("ResourceRecordSet", rrset);

            Map<String, Object> changeBatch = new java.util.HashMap<>();
            changeBatch.put("Changes", java.util.List.of(change));

            Map<String, Object> params = new java.util.HashMap<>();
            params.put("HostedZoneId", zone.getHostedZoneId());
            params.put("ChangeBatch", changeBatch);
            return params;
        };

        var policy = AwsCustomResourcePolicy.fromStatements(List.of(
                software.amazon.awscdk.services.iam.PolicyStatement.Builder.create()
                        .actions(List.of("route53:ChangeResourceRecordSets"))
                        .resources(List.of("arn:aws:route53:::hostedzone/" + zone.getHostedZoneId()))
                        .build()));

        AwsSdkCall upsertA = AwsSdkCall.builder()
                .service("Route53")
                .action("changeResourceRecordSets")
                .parameters(changeForType.apply("A"))
                .physicalResourceId(PhysicalResourceId.of(idPrefix + "-A-" + fqdn))
                .build();

        AwsSdkCall upsertAAAA = AwsSdkCall.builder()
                .service("Route53")
                .action("changeResourceRecordSets")
                .parameters(changeForType.apply("AAAA"))
                .physicalResourceId(PhysicalResourceId.of(idPrefix + "-AAAA-" + fqdn))
                .build();

        AwsCustomResource.Builder.create(scope, idPrefix + "-AliasA-Upsert")
                .policy(policy)
                .onCreate(upsertA)
                .onUpdate(upsertA)
                .build();

        AwsCustomResource.Builder.create(scope, idPrefix + "-AliasAAAA-Upsert")
                .policy(policy)
                .onCreate(upsertAAAA)
                .onUpdate(upsertAAAA)
                .build();
    }

    private static String buildFqdn(IHostedZone zone, String relativeRecordName) {
        if (relativeRecordName == null || relativeRecordName.isBlank()) {
            return zone.getZoneName();
        }
        if (relativeRecordName.endsWith("." + zone.getZoneName()) || relativeRecordName.equals(zone.getZoneName())) {
            // already an FQDN
            return relativeRecordName;
        }
        return relativeRecordName + "." + zone.getZoneName();
    }
}
