/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * Copyright (C) 2025-2026 DIY Accounting Ltd
 */

package co.uk.diyaccounting.submit.stacks;

import static co.uk.diyaccounting.submit.utils.Kind.infof;
import static co.uk.diyaccounting.submit.utils.KindCdk.cfnOutput;

import co.uk.diyaccounting.submit.utils.Route53AliasUpsert;
import org.immutables.value.Value;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.StackProps;
import software.amazon.awscdk.Tags;
import software.amazon.awscdk.services.route53.HostedZone;
import software.amazon.awscdk.services.route53.HostedZoneAttributes;
import software.amazon.awscdk.services.route53.IHostedZone;
import software.constructs.Construct;

/**
 * RootDnsStack: Manages Route53 alias records in the root account zone
 * for the gateway CloudFront distributions.
 * <p>
 * Phase 1 records:
 * - ci-gateway.diyaccounting.co.uk → gateway account CloudFront
 * - prod-gateway.diyaccounting.co.uk → gateway account CloudFront
 * <p>
 * Future phases will add NS delegations for spreadsheets and submit subdomains.
 */
public class RootDnsStack extends Stack {

    @Value.Immutable
    public interface RootDnsStackProps extends StackProps {
        @Override
        Environment getEnv();

        String hostedZoneName();

        String hostedZoneId();

        /** CloudFront domain name for ci-gateway (e.g. d1234abcdef.cloudfront.net). Empty to skip. */
        @Value.Default
        default String ciGatewayCloudFrontDomain() {
            return "";
        }

        /** CloudFront domain name for prod-gateway. Empty to skip. */
        @Value.Default
        default String prodGatewayCloudFrontDomain() {
            return "";
        }

        static ImmutableRootDnsStackProps.Builder builder() {
            return ImmutableRootDnsStackProps.builder();
        }
    }

    public RootDnsStack(final Construct scope, final String id, final RootDnsStackProps props) {
        super(
                scope,
                id,
                StackProps.builder()
                        .env(props.getEnv())
                        .build());

        // Cost allocation tags
        Tags.of(this).add("Application", "@antonycc/submit.diyaccounting.co.uk/root-dns");
        Tags.of(this).add("CostCenter", "@antonycc/submit.diyaccounting.co.uk");
        Tags.of(this).add("Owner", "@antonycc/submit.diyaccounting.co.uk");
        Tags.of(this).add("Stack", "RootDnsStack");
        Tags.of(this).add("ManagedBy", "aws-cdk");
        Tags.of(this).add("BillingPurpose", "dns-management");

        // Look up the hosted zone in the root account
        IHostedZone zone = HostedZone.fromHostedZoneAttributes(
                this,
                "RootZone",
                HostedZoneAttributes.builder()
                        .hostedZoneId(props.hostedZoneId())
                        .zoneName(props.hostedZoneName())
                        .build());

        // Phase 1: Gateway DNS records
        if (!props.ciGatewayCloudFrontDomain().isBlank()) {
            infof("Creating ci-gateway alias to %s", props.ciGatewayCloudFrontDomain());
            Route53AliasUpsert.upsertAliasToCloudFront(
                    this, "CiGateway", zone, "ci-gateway", props.ciGatewayCloudFrontDomain());
            cfnOutput(this, "CiGatewayDomain", "ci-gateway." + props.hostedZoneName());
        }

        if (!props.prodGatewayCloudFrontDomain().isBlank()) {
            infof("Creating prod-gateway alias to %s", props.prodGatewayCloudFrontDomain());
            Route53AliasUpsert.upsertAliasToCloudFront(
                    this, "ProdGateway", zone, "prod-gateway", props.prodGatewayCloudFrontDomain());
            cfnOutput(this, "ProdGatewayDomain", "prod-gateway." + props.hostedZoneName());
        }

        infof("RootDnsStack %s created", this.getNode().getId());
    }
}
