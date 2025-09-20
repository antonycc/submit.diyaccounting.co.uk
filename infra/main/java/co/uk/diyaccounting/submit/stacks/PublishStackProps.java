package co.uk.diyaccounting.submit.stacks;

import software.amazon.awscdk.Environment;
import software.amazon.awscdk.StackProps;
import software.amazon.awscdk.services.s3.Bucket;

public class PublishStackProps implements StackProps {
    public final String envName;
    public final String deploymentName;
    public final String domainName;
    public final String baseUrl;
    public final String resourceNamePrefix;
    public final String distributionArn;
    public final Bucket webBucket;
    public final String commitHash;
    public final String docRootPath;
    public final Environment env;
    private final Boolean crossRegionReferences;

    private PublishStackProps(Builder builder) {
        this.envName = builder.envName;
        this.deploymentName = builder.deploymentName;
        this.domainName = builder.domainName;
        this.distributionArn = builder.distributionArn;
        this.baseUrl = builder.baseUrl;
        this.resourceNamePrefix = builder.resourceNamePrefix;
        this.webBucket = builder.webBucket;
        this.commitHash = builder.commitHash;
        this.docRootPath = builder.docRootPath;
        this.env = builder.env;
        this.crossRegionReferences = builder.crossRegionReferences;
    }

    // Ensure Stack consumes our explicit env (region/account) when provided
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
        private String envName;
        private String deploymentName;
        private String domainName;
        private String baseUrl;
        private String resourceNamePrefix;
        private String distributionArn;
        private Bucket webBucket;
        private String commitHash;
        private String docRootPath;
        private Environment env;
        private Boolean crossRegionReferences;

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

        public Builder baseUrl(String baseUrl) {
            this.baseUrl = baseUrl;
            return this;
        }

        public Builder resourceNamePrefix(String resourceNamePrefix) {
            this.resourceNamePrefix = resourceNamePrefix;
            return this;
        }

        public Builder distributionArn(String distributionArn) {
            this.distributionArn = distributionArn;
            return this;
        }

        public Builder webBucket(Bucket webBucket) {
            this.webBucket = webBucket;
            return this;
        }

        public Builder commitHash(String commitHash) {
            this.commitHash = commitHash;
            return this;
        }

        public Builder docRootPath(String docRootPath) {
            this.docRootPath = docRootPath;
            return this;
        }

        public Builder env(Environment env) {
            this.env = env;
            return this;
        }

        public Builder crossRegionReferences(Boolean crossRegionReferences) {
            this.crossRegionReferences = crossRegionReferences;
            return this;
        }

        public PublishStackProps build() {
            return new PublishStackProps(this);
        }
    }
}
