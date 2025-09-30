package co.uk.diyaccounting.submit;

import co.uk.diyaccounting.submit.stacks.ApexStack;
import software.amazon.awscdk.App;
import software.amazon.awscdk.Environment;
import software.constructs.Construct;

import java.lang.reflect.Field;
import java.nio.file.Paths;
import java.util.*;

import static co.uk.diyaccounting.submit.utils.Kind.envOr;
import static co.uk.diyaccounting.submit.utils.Kind.infof;
import static co.uk.diyaccounting.submit.utils.Kind.warnf;
import static co.uk.diyaccounting.submit.utils.ResourceNameUtils.*;

public class SubmitEnvironment {

    public final ApexStack apexStack;

    public static class SubmitEnvironmentProps {
        public String env;
        public String deploymentName;

        public String hostedZoneName;
        public String hostedZoneId;
        public String certificateArn;

        /** Apex hostname, e.g. submit.diyaccounting.co.uk */
        public String domainName;
        public String baseUrl;

        /** Comma-separated extra alt names, optional */
        public String extraAltNames;

        /** Active label for apex, e.g. prod-blue or ci-feature-2 */
        public String activeLabel;

        /** Map passed as "label=domain,label=domain", e.g. "ci-feature-1=dxxxx.cloudfront.net,prod-blue=dyyyy.cloudfront.net" */
        public String deploymentOriginsCsv;

        public String accessLogGroupRetentionPeriodDays;

        public static class Builder {
            private final SubmitEnvironmentProps p = new SubmitEnvironmentProps();
            public static Builder create() { return new Builder(); }
            public SubmitEnvironmentProps build() { return p; }
            public Builder set(String key, String value) {
                try { var f = SubmitEnvironmentProps.class.getDeclaredField(key); f.setAccessible(true); f.set(p, value); }
                catch (Exception ignored) {}
                return this;
            }
        }
    }

    public static void main(final String[] args) {
        App app = new App();
        SubmitEnvironmentProps appProps = loadAppProps(app);
        var env = new SubmitEnvironment(app, appProps);
        app.synth();
        infof("CDK synth complete. Created stack: %s", env.apexStack.getStackName());
    }

    public SubmitEnvironment(App app, SubmitEnvironmentProps appProps) {
        var envName = envOr("ENV_NAME", appProps.env);
        var deploymentName = envOr("DEPLOYMENT_NAME", appProps.deploymentName);

        var hostedZoneName = envOr("HOSTED_ZONE_NAME", appProps.hostedZoneName);
        var hostedZoneId   = envOr("HOSTED_ZONE_ID", appProps.hostedZoneId);
        var certificateArn = envOr("CERTIFICATE_ARN", appProps.certificateArn);

        var domainName = envOr("DOMAIN_NAME", appProps.domainName);
        var baseUrl    = envOr("DIY_SUBMIT_HOME_URL", appProps.baseUrl);

        var extraAltNamesCsv = envOr("EXTRA_ALT_NAMES", appProps.extraAltNames, "");
        var extraAltNames = extraAltNamesCsv.isBlank() ? List.<String>of()
            : Arrays.stream(extraAltNamesCsv.split(",")).map(String::trim).filter(s -> !s.isBlank()).toList();

        var activeLabel = envOr("APEX_ACTIVE_LABEL", appProps.activeLabel);

        // Parse label=domain pairs
        var originsCsv = envOr("APEX_DEPLOYMENT_ORIGINS", appProps.deploymentOriginsCsv);
        Map<String,String> deploymentOrigins = new HashMap<>();
        if (originsCsv != null && !originsCsv.isBlank()) {
            for (var part : originsCsv.split(",")) {
                var kv = part.trim().split("=", 2);
                if (kv.length == 2) deploymentOrigins.put(kv[0].trim(), kv[1].trim());
            }
        }

        String resourceNamePrefix = "apex-%s".formatted(generateResourceNamePrefix(domainName));
        String compressedResourceNamePrefix = "apex-%s".formatted(generateCompressedResourceNamePrefix(domainName));
        String dashedDomainName = buildDashedDomainName(domainName);

        String apexStackId = "%s-ApexStack".formatted(deploymentName);
        this.apexStack = new ApexStack(
            app,
            apexStackId,
            ApexStack.ApexStackProps.builder()
                .env(Environment.builder().region("us-east-1").build())
                .crossRegionReferences(true)
                .envName(envName)
                .deploymentName(deploymentName)
                .resourceNamePrefix(resourceNamePrefix)
                .compressedResourceNamePrefix(compressedResourceNamePrefix)
                .domainName(domainName)
                .dashedDomainName(dashedDomainName)
                .baseUrl(baseUrl)
                .cloudTrailEnabled("false")
                .hostedZoneName(hostedZoneName)
                .hostedZoneId(hostedZoneId)
                .certificateArn(certificateArn)
                .deploymentOrigins(deploymentOrigins)
                .activeLabel(activeLabel)
                .extraAltNames(extraAltNames)
                .accessLogGroupRetentionPeriodDays(Integer.parseInt(
                    envOr("ACCESS_LOG_GROUP_RETENTION_PERIOD_DAYS",
                        appProps.accessLogGroupRetentionPeriodDays, "30")))
                .build());
    }

    // load context from cdk.json like existing apps
    public static SubmitEnvironmentProps loadAppProps(Construct scope) { return loadAppProps(scope, null); }
    public static SubmitEnvironmentProps loadAppProps(Construct scope, String pathPrefix) {
        SubmitEnvironmentProps props = SubmitEnvironmentProps.Builder.create().build();
        var cdkPath = Paths.get((pathPrefix == null ? "" : pathPrefix) + "cdk.json").toAbsolutePath();
        if (!cdkPath.toFile().exists()) {
            warnf("Cannot find application properties (cdk.json) at %s", cdkPath);
        } else {
            for (Field f : SubmitEnvironmentProps.class.getDeclaredFields()) {
                if (f.getType() != String.class) continue;
                try {
                    f.setAccessible(true);
                    String current = (String) f.get(props);
                    String fieldName = f.getName();
                    String ctx = co.uk.diyaccounting.submit.utils.KindCdk.getContextValueString(scope, fieldName, current);
                    if (ctx == null) {
                        // Accept synonyms from cdk-environment/cdk.json
                        if ("activeLabel".equals(fieldName)) {
                            ctx = co.uk.diyaccounting.submit.utils.KindCdk.getContextValueString(scope, "apexActiveLabel", null);
                        } else if ("deploymentOriginsCsv".equals(fieldName)) {
                            ctx = co.uk.diyaccounting.submit.utils.KindCdk.getContextValueString(scope, "apexDeploymentOrigins", null);
                        }
                    }
                    if (ctx != null) f.set(props, ctx);
                } catch (Exception ignored) {}
            }
        }
        if (props.env == null || props.env.isBlank()) props.env = "dev";
        return props;
    }
}
