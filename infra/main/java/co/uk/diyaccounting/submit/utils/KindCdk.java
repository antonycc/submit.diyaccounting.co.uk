package co.uk.diyaccounting.submit.utils;

import static co.uk.diyaccounting.submit.utils.Kind.infof;
import static co.uk.diyaccounting.submit.utils.Kind.warnf;

import org.jetbrains.annotations.NotNull;
import software.amazon.awscdk.CfnOutput;
import software.amazon.awscdk.Environment;
import software.amazon.awssdk.utils.StringUtils;
import software.constructs.Construct;

public class KindCdk {
    public static CfnOutput cfnOutput(Construct scope, String id, String value) {
        if (StringUtils.isBlank(value)) {
            warnf("CfnOutput value for %s is blank", id);
        }
        return CfnOutput.Builder.create(scope, id).value(value).build();
    }

    public static String getContextValueString(Construct scope, String contextKey, String defaultValue) {
        var contextValue = scope.getNode().tryGetContext(contextKey);
        String defaultedValue;
        String source;
        if (StringUtils.isNotBlank(contextValue.toString())) {
            defaultedValue = contextValue.toString();
            infof("%s=%s (source: CDK context)", contextKey, defaultedValue);
        } else {
            defaultedValue = defaultValue;
            infof("%s=%s (resolved from default)", contextKey, defaultedValue);
        }

        return defaultedValue;
    }

    public static @NotNull Environment buildPrimaryEnvironment() {
        String cdkDefaultAccount = System.getenv("CDK_DEFAULT_ACCOUNT");
        String cdkDefaultRegion = System.getenv("CDK_DEFAULT_REGION");
        Environment primaryEnv = null;
        if (cdkDefaultAccount != null
                && !cdkDefaultAccount.isBlank()
                && cdkDefaultRegion != null
                && !cdkDefaultRegion.isBlank()) {
            primaryEnv = Environment.builder()
                    .account(cdkDefaultAccount)
                    .region(cdkDefaultRegion)
                    .build();
            infof("Using primary environment account %s region %s", cdkDefaultAccount, cdkDefaultRegion);
        } else {
            primaryEnv = Environment.builder().build();
            warnf(
                    "CDK_DEFAULT_ACCOUNT or CDK_DEFAULT_REGION environment variables are not set, using environment agnostic stacks");
        }
        return primaryEnv;
    }
}
