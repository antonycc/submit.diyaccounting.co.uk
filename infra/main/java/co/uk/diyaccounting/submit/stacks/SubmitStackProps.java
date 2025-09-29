package co.uk.diyaccounting.submit.stacks;

public interface SubmitStackProps {
    String envName();

    String deploymentName();

    String resourceNamePrefix();

    String compressedResourceNamePrefix();
}
