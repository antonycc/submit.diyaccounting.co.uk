/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * Copyright (C) 2025-2026 DIY Accounting Ltd
 */

package co.uk.diyaccounting.submit.stacks;

import static co.uk.diyaccounting.submit.utils.Kind.infof;
import static co.uk.diyaccounting.submit.utils.KindCdk.cfnOutput;
import static co.uk.diyaccounting.submit.utils.KindCdk.ensureLogGroup;

import co.uk.diyaccounting.submit.SubmitSharedNames;
import org.immutables.value.Value;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.StackProps;
import software.amazon.awscdk.services.logs.ILogGroup;
import software.constructs.Construct;

public class ObservabilityUE1Stack extends Stack {

    public final ILogGroup selfDestructLogGroup;
    public final ILogGroup distributionAccessLogGroup;

    @Value.Immutable
    public interface ObservabilityUE1StackProps extends StackProps, SubmitStackProps {

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

        int logGroupRetentionPeriodDays();

        static ImmutableObservabilityUE1StackProps.Builder builder() {
            return ImmutableObservabilityUE1StackProps.builder();
        }
    }

    public ObservabilityUE1Stack(Construct scope, String id, ObservabilityUE1StackProps props) {
        this(scope, id, null, props);
    }

    public ObservabilityUE1Stack(Construct scope, String id, StackProps stackProps, ObservabilityUE1StackProps props) {
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

        // Log Group for CloudFront access logs (idempotent creation)
        this.distributionAccessLogGroup = ensureLogGroup(
                this,
                props.resourceNamePrefix() + "-DistributionAccessLogGroup",
                props.sharedNames().distributionAccessLogGroupName);

        // Log group for self-destruct operations (idempotent creation)
        this.selfDestructLogGroup = ensureLogGroup(
                this,
                props.resourceNamePrefix() + "-SelfDestructLogGroup",
                props.sharedNames().ue1SelfDestructLogGroupName);
        infof(
                "ObservabilityStack %s created successfully for %s",
                this.getNode().getId(), props.sharedNames().dashedDeploymentDomainName);

        // Outputs for Observability resources
        // cfnOutput(this, "WebDeploymentLogGroupArn", this.webDeploymentLogGroup.getLogGroupArn());
        cfnOutput(this, "SelfDestructLogGroupArn", this.selfDestructLogGroup.getLogGroupArn());
    }
}
