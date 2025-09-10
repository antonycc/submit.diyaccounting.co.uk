package co.uk.diyaccounting.submit.stacks;

import co.uk.diyaccounting.submit.utils.ResourceNameUtils;
import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.StackProps;
import software.constructs.Construct;

import java.util.AbstractMap;
import java.util.List;
import java.util.regex.Pattern;

public class ApplicationStack extends Stack {

    private static final Logger logger = LogManager.getLogger(ApplicationStack.class);

    // CDK resources here

    public ApplicationStack(Construct scope, String id, ApplicationStack.Builder builder) {
        this(scope, id, null, builder);
    }

    public ApplicationStack(Construct scope, String id, ApplicationStackProps appProps) {
        this(scope, id, null, appProps);
    }

    public ApplicationStack(Construct scope, String id, StackProps props, ApplicationStackProps p) {
        super(scope, id, props);

        // Values are provided via WebApp after context/env resolution

        // Build naming using same patterns as WebStack
        String domainName = Builder.buildDomainName(p.env, p.subDomainName, p.hostedZoneName);
        String dashedDomainName =
                Builder.buildDashedDomainName(p.env, p.subDomainName, p.hostedZoneName);

        boolean cloudTrailEnabled = Boolean.parseBoolean(p.cloudTrailEnabled);
        boolean xRayEnabled = Boolean.parseBoolean(p.xRayEnabled);

        logger.info("ApplicationStack created successfully for {}", dashedDomainName);
    }

    public ApplicationStack(Construct scope, String id, StackProps props, ApplicationStack.Builder builder) {
        super(scope, id, props);

        // Values are provided via WebApp after context/env resolution

        // Build naming using same patterns as WebStack
        String domainName = Builder.buildDomainName(builder.env, builder.subDomainName, builder.hostedZoneName);
        String dashedDomainName =
                Builder.buildDashedDomainName(builder.env, builder.subDomainName, builder.hostedZoneName);

        boolean cloudTrailEnabled = Boolean.parseBoolean(builder.cloudTrailEnabled);
        boolean xRayEnabled = Boolean.parseBoolean(builder.xRayEnabled);

        logger.info("ApplicationStack created successfully for {}", dashedDomainName);
    }

    /**
     * Builder class following the same pattern as WebStack.Builder
     */
    public static class Builder {
        private Construct scope;
        private String id;
        private StackProps props;
        private ApplicationStackProps appProps;

        // Environment configuration
        public String env;
        public String subDomainName;
        public String hostedZoneName;
        public String cloudTrailEnabled;
        public String xRayEnabled;

        private Builder() {}

        public static Builder create(Construct scope, String id) {
            Builder builder = new Builder();
            builder.scope = scope;
            builder.id = id;
            return builder;
        }

        public Builder props(StackProps props) {
            this.props = props;
            return this;
        }

        public Builder env(String env) {
            this.env = env;
            return this;
        }

        public Builder subDomainName(String subDomainName) {
            this.subDomainName = subDomainName;
            return this;
        }

        public Builder hostedZoneName(String hostedZoneName) {
            this.hostedZoneName = hostedZoneName;
            return this;
        }

        public Builder cloudTrailEnabled(String cloudTrailEnabled) {
            this.cloudTrailEnabled = cloudTrailEnabled;
            return this;
        }

        public Builder xRayEnabled(String xRayEnabled) {
            this.xRayEnabled = xRayEnabled;
            return this;
        }

        public Builder props(ApplicationStackProps p) {
            if (p == null) return this;
            this.appProps = p;
            this.env = p.env;
            this.subDomainName = p.subDomainName;
            this.hostedZoneName = p.hostedZoneName;
            this.cloudTrailEnabled = p.cloudTrailEnabled;
            this.xRayEnabled = p.xRayEnabled;
            return this;
        }

        public ApplicationStack build() {
            ApplicationStackProps p = this.appProps != null ? this.appProps : ApplicationStackProps.builder()
                    .env(this.env)
                    .subDomainName(this.subDomainName)
                    .hostedZoneName(this.hostedZoneName)
                    .cloudTrailEnabled(this.cloudTrailEnabled)
                    .xRayEnabled(this.xRayEnabled)
                    .build();
            return new ApplicationStack(this.scope, this.id, this.props, p);
        }

        // Naming utility methods following WebStack patterns
        public static String buildDomainName(String env, String subDomainName, String hostedZoneName) {
            return env.equals("prod")
                    ? Builder.buildProdDomainName(subDomainName, hostedZoneName)
                    : Builder.buildNonProdDomainName(env, subDomainName, hostedZoneName);
        }

        public static String buildProdDomainName(String subDomainName, String hostedZoneName) {
            return "%s.%s".formatted(subDomainName, hostedZoneName);
        }

        public static String buildNonProdDomainName(String env, String subDomainName, String hostedZoneName) {
            return "%s.%s.%s".formatted(env, subDomainName, hostedZoneName);
        }

        public static String buildDashedDomainName(String env, String subDomainName, String hostedZoneName) {
            return ResourceNameUtils.convertDotSeparatedToDashSeparated(
                    "%s.%s.%s".formatted(env, subDomainName, hostedZoneName), domainNameMappings);
        }
    }

    // Use same domain name mappings as WebStack
    public static final List<AbstractMap.SimpleEntry<Pattern, String>> domainNameMappings = List.of();
}
