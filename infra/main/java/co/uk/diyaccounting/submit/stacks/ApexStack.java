package co.uk.diyaccounting.submit.stacks;

import co.uk.diyaccounting.submit.SubmitSharedNames;
import org.immutables.value.Value;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.StackProps;
import software.amazon.awscdk.services.cloudfront.Distribution;
import software.constructs.Construct;

public class ApexStack extends Stack {

    public Distribution distribution;

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

        /** Logging TTL in days */
        int accessLogGroupRetentionPeriodDays();

        static ImmutableApexStackProps.Builder builder() {
            return ImmutableApexStackProps.builder();
        }
    }

    public ApexStack(final Construct scope, final String id, final ApexStackProps props) {
        super(scope, id, props);

        // TODO: Add website bucket for maintenance page usiong ./web/holding

        // Outputs
    }
}
