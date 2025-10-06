package co.uk.diyaccounting.submit.aspects;

import org.jetbrains.annotations.NotNull;
import software.amazon.awscdk.IAspect;
import software.amazon.awscdk.services.lambda.Function;
import software.amazon.awscdk.services.logs.LogRetention;
import software.amazon.awscdk.services.logs.LogRetentionProps;
import software.amazon.awscdk.services.logs.RetentionDays;
import software.constructs.Construct;
import software.constructs.IConstruct;

import java.util.regex.Pattern;

public class SetAutoDeleteJobLogRetentionAspect implements IAspect {

    private final RetentionDays retention;
    private final Pattern match;

    public SetAutoDeleteJobLogRetentionAspect(String deploymentName, RetentionDays retention) {
        this.retention = retention;
        this.match = Pattern.compile(
            Pattern.quote(deploymentName) + ".*(CustomCDKBucketDeployment|DeleteExistingRecordSet|S3AutoDeleteObjects)",
            Pattern.CASE_INSENSITIVE);
    }

    @Override
    public void visit(@NotNull IConstruct node) {
        if (!(node instanceof Function)) return;

        String path = node.getNode().getPath();
        if (!match.matcher(path).find()) return;

        Function fn = (Function) node;

        // Idempotent attach: avoid duplicates if synth runs multiple times
        String id = "LogRetention";
        if (((Construct) node).getNode().tryFindChild(id) == null) {
            new LogRetention((Construct) node, id, LogRetentionProps.builder()
                .logGroupName("/aws/lambda/" + fn.getFunctionName())
                .retention(this.retention)
                .build());
        }
    }
}
