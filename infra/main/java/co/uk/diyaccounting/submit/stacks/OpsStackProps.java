package co.uk.diyaccounting.submit.stacks;

import software.amazon.awscdk.Environment;
import software.amazon.awscdk.StackProps;

public class OpsStackProps implements StackProps {
    public final Environment env;
    private final Boolean crossRegionReferences;
    public final String envName;
    public final String deploymentName;
    public final String domainName;
    public final String resourceNamePrefix;
    public final String compressedResourceNamePrefix;
    public final String originBucketArn;
    public final String receiptsBucketArn; // optional, may be null
    public final java.util.List<String> lambdaFunctionArns;

    private OpsStackProps(Builder builder) {
        this.env = builder.env;
        this.envName = builder.envName;
        this.deploymentName = builder.deploymentName;
        this.domainName = builder.domainName;
        this.resourceNamePrefix = builder.resourceNamePrefix;
        this.compressedResourceNamePrefix = builder.compressedResourceNamePrefix;
        this.originBucketArn = builder.originBucketArn;
        this.receiptsBucketArn = builder.receiptsBucketArn;
        this.lambdaFunctionArns = builder.lambdaFunctionArns;
        this.crossRegionReferences = builder.crossRegionReferences;
    }

    @Override
    public Environment getEnv() {
        return this.env;
    }

    @Override
    public Boolean getCrossRegionReferences() {
        return this.crossRegionReferences;
    }

    public static Builder builder() {
        return new Builder();
    }

    public static class Builder {
        private Environment env;
        private String envName;
        private String deploymentName;
        private String domainName;
        private String resourceNamePrefix;
        private String compressedResourceNamePrefix;
        private String originBucketArn;
        private String receiptsBucketArn;
        private java.util.List<String> lambdaFunctionArns;
        private Boolean crossRegionReferences;

        public Builder env(Environment env) {
            this.env = env;
            return this;
        }

        public Builder envName(String envName) {
            this.envName = envName;
            return this;
        }

        public Builder deploymentName(String deploymentName) {
            this.deploymentName = deploymentName;
            return this;
        }

        public Builder domainName(String domainName) {
            this.domainName = domainName;
            return this;
        }

        public Builder resourceNamePrefix(String resourceNamePrefix) {
            this.resourceNamePrefix = resourceNamePrefix;
            return this;
        }

        public Builder compressedResourceNamePrefix(String compressedResourceNamePrefix) {
            this.compressedResourceNamePrefix = compressedResourceNamePrefix;
            return this;
        }

        public Builder originBucketArn(String originBucketArn) {
            this.originBucketArn = originBucketArn;
            return this;
        }

        public Builder receiptsBucketArn(String receiptsBucketArn) {
            this.receiptsBucketArn = receiptsBucketArn;
            return this;
        }

        public Builder lambdaFunctionArns(java.util.List<String> lambdaFunctionArns) {
            this.lambdaFunctionArns = lambdaFunctionArns;
            return this;
        }

        public Builder crossRegionReferences(Boolean crossRegionReferences) {
            this.crossRegionReferences = crossRegionReferences;
            return this;
        }

        public OpsStackProps build() {
            return new OpsStackProps(this);
        }
    }
}
