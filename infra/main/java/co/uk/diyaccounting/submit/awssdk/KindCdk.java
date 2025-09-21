package co.uk.diyaccounting.submit.awssdk;

import software.amazon.awscdk.CfnOutput;
import software.amazon.awssdk.utils.StringUtils;
import software.constructs.Construct;

import static co.uk.diyaccounting.submit.utils.Kind.infof;
import static co.uk.diyaccounting.submit.utils.Kind.warnf;

public class KindCdk {
    public static CfnOutput cfnOutput(Construct scope, String id, String value){
        if (StringUtils.isBlank(value)){
            warnf("CfnOutput value for %s is blank", id);
        }
        return CfnOutput.Builder.create(scope, id)
            .value(value)
            .build();
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
}
