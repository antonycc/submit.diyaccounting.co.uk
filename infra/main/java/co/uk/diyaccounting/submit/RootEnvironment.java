/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * Copyright (C) 2025-2026 DIY Accounting Ltd
 */

package co.uk.diyaccounting.submit;

import static co.uk.diyaccounting.submit.utils.Kind.envOr;
import static co.uk.diyaccounting.submit.utils.Kind.infof;

import co.uk.diyaccounting.submit.stacks.RootDnsStack;
import co.uk.diyaccounting.submit.utils.KindCdk;
import software.amazon.awscdk.App;
import software.amazon.awscdk.Environment;

/**
 * CDK entry point for the root account DNS management.
 * Deploys RootDnsStack which manages Route53 alias records
 * for gateway and spreadsheets CloudFront distributions.
 * <p>
 * Deployed by deploy-root.yml (manual dispatch only).
 */
public class RootEnvironment {

    public final RootDnsStack rootDnsStack;

    public static void main(final String[] args) {
        App app = new App();

        var hostedZoneName = KindCdk.getContextValueString(app, "hostedZoneName", "diyaccounting.co.uk");
        var hostedZoneId = KindCdk.getContextValueString(app, "hostedZoneId", "");
        var ciGatewayCfDomain = envOr("CI_GATEWAY_CLOUDFRONT_DOMAIN", KindCdk.getContextValueString(app, "ciGatewayCloudFrontDomain", ""));
        var prodGatewayCfDomain = envOr("PROD_GATEWAY_CLOUDFRONT_DOMAIN", KindCdk.getContextValueString(app, "prodGatewayCloudFrontDomain", ""));
        var ciSpreadsheetsCfDomain = envOr(
                "CI_SPREADSHEETS_CLOUDFRONT_DOMAIN",
                KindCdk.getContextValueString(app, "ciSpreadsheetsCloudFrontDomain", ""));
        var prodSpreadsheetsCfDomain = envOr(
                "PROD_SPREADSHEETS_CLOUDFRONT_DOMAIN",
                KindCdk.getContextValueString(app, "prodSpreadsheetsCloudFrontDomain", ""));
        var apexCfDomain = envOr("APEX_CLOUDFRONT_DOMAIN", KindCdk.getContextValueString(app, "apexCloudFrontDomain", ""));
        var wwwCfDomain = envOr("WWW_CLOUDFRONT_DOMAIN", KindCdk.getContextValueString(app, "wwwCloudFrontDomain", ""));
        var spreadsheetsCfDomain = envOr(
                "SPREADSHEETS_CLOUDFRONT_DOMAIN",
                KindCdk.getContextValueString(app, "spreadsheetsCloudFrontDomain", ""));

        var root = new RootEnvironment(
                app,
                hostedZoneName,
                hostedZoneId,
                ciGatewayCfDomain,
                prodGatewayCfDomain,
                ciSpreadsheetsCfDomain,
                prodSpreadsheetsCfDomain,
                apexCfDomain,
                wwwCfDomain,
                spreadsheetsCfDomain);
        app.synth();
        infof("CDK synth complete for root DNS environment");
    }

    public RootEnvironment(
            App app,
            String hostedZoneName,
            String hostedZoneId,
            String ciGatewayCfDomain,
            String prodGatewayCfDomain,
            String ciSpreadsheetsCfDomain,
            String prodSpreadsheetsCfDomain,
            String apexCfDomain,
            String wwwCfDomain,
            String spreadsheetsCfDomain) {
        // Root account DNS management runs in us-east-1 (Route53 is global but CDK needs a region)
        Environment usEast1Env = Environment.builder()
                .region("us-east-1")
                .account(KindCdk.buildPrimaryEnvironment().getAccount())
                .build();

        String stackId = "root-RootDnsStack";
        infof("Synthesizing stack %s", stackId);

        this.rootDnsStack = new RootDnsStack(
                app,
                stackId,
                RootDnsStack.RootDnsStackProps.builder()
                        .env(usEast1Env)
                        .hostedZoneName(hostedZoneName)
                        .hostedZoneId(hostedZoneId)
                        .ciGatewayCloudFrontDomain(ciGatewayCfDomain)
                        .prodGatewayCloudFrontDomain(prodGatewayCfDomain)
                        .ciSpreadsheetsCloudFrontDomain(ciSpreadsheetsCfDomain)
                        .prodSpreadsheetsCloudFrontDomain(prodSpreadsheetsCfDomain)
                        .apexCloudFrontDomain(apexCfDomain)
                        .wwwCloudFrontDomain(wwwCfDomain)
                        .spreadsheetsCloudFrontDomain(spreadsheetsCfDomain)
                        .build());
    }
}
