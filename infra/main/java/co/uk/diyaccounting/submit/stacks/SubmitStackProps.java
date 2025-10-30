package co.uk.diyaccounting.submit.stacks;

import co.uk.diyaccounting.submit.SubmitSharedNames;

public interface SubmitStackProps {
    String envName();

    String deploymentName();

    String resourceNamePrefix();

    //String compressedResourceNamePrefix();

    String cloudTrailEnabled();

    SubmitSharedNames sharedNames();
}
