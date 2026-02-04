/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * Copyright (C) 2025-2026 DIY Accounting Ltd
 */

package co.uk.diyaccounting.submit;

import static co.uk.diyaccounting.submit.utils.Kind.envOr;
import static co.uk.diyaccounting.submit.utils.Kind.infof;

import co.uk.diyaccounting.submit.stacks.GatewayStack;
import co.uk.diyaccounting.submit.utils.KindCdk;
import java.util.List;
import software.amazon.awscdk.App;
import software.amazon.awscdk.Environment;

/**
 * CDK entry point for the gateway account. Deploys a single GatewayStack
 * containing S3 + CloudFront for the diyaccounting.co.uk static site.
 * <p>
 * No Route53 records are created here — those live in the root account
 * and are managed by RootDnsStack via deploy-root.yml.
 */
public class GatewayEnvironment {

    public final GatewayStack gatewayStack;

    public static void main(final String[] args) {
        App app = new App();

        var envName = envOr("ENVIRONMENT_NAME", KindCdk.getContextValueString(app, "envName", "ci"));
        var certificateArn = envOr("CERTIFICATE_ARN", KindCdk.getContextValueString(app, "certificateArn", ""));
        var docRootPath = envOr("DOC_ROOT_PATH", KindCdk.getContextValueString(app, "docRootPath", "../web/www.diyaccounting.co.uk/public"));
        var domainNamesStr = envOr("DOMAIN_NAMES", KindCdk.getContextValueString(app, "domainNames", ""));

        var domainNames = domainNamesStr.isBlank()
                ? List.of(envName + "-gateway.diyaccounting.co.uk")
                : List.of(domainNamesStr.split(","));

        var gateway = new GatewayEnvironment(app, envName, certificateArn, docRootPath, domainNames);
        app.synth();
        infof("CDK synth complete for gateway environment");
    }

    public GatewayEnvironment(App app, String envName, String certificateArn, String docRootPath, List<String> domainNames) {
        // CloudFront requires us-east-1 for certificates
        Environment usEast1Env = Environment.builder()
                .region("us-east-1")
                .account(KindCdk.buildPrimaryEnvironment().getAccount())
                .build();

        String stackId = envName + "-gateway-GatewayStack";
        infof("Synthesizing stack %s for environment %s", stackId, envName);

        this.gatewayStack = new GatewayStack(
                app,
                stackId,
                GatewayStack.GatewayStackProps.builder()
                        .env(usEast1Env)
                        .envName(envName)
                        .certificateArn(certificateArn)
                        .docRootPath(docRootPath)
                        .domainNames(domainNames)
                        .build());
    }
}
