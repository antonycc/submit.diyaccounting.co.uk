// SetAutoDeleteJobLogRetentionAspect.java
package co.uk.diyaccounting.submit.aspects;

import software.amazon.awscdk.IAspect;
import software.amazon.awscdk.services.logs.CfnLogGroup;
import software.amazon.awscdk.services.logs.LogGroup;
import software.constructs.IConstruct;

import java.util.regex.Pattern;

public class SetAutoDeleteJobLogRetentionAspect implements IAspect {
    private final Number retentionDays;
    private final Pattern match;

    public SetAutoDeleteJobLogRetentionAspect(String deploymentName, Number retentionDays) {
        this.retentionDays = retentionDays;
        // Escapes deploymentName and groups alternates once
        this.match = Pattern.compile(
            "(?:%s.*Custom(?:CDKBucketDeployment|DeleteExistingRecordSet|S3AutoDeleteObjects))"
                .formatted(Pattern.quote(deploymentName)),
            Pattern.CASE_INSENSITIVE
        );
    }

    @Override
    public void visit(IConstruct node) {
        if (!(node instanceof LogGroup)) return;
        String path = node.getNode().getPath();
        if (!match.matcher(path).find()) return;

        Object child = ((LogGroup) node).getNode().getDefaultChild();
        if (child instanceof CfnLogGroup) {
            ((CfnLogGroup) child).setRetentionInDays(retentionDays);
        }
    }
}
