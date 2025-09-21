package co.uk.diyaccounting.submit.stacks;

import software.amazon.awscdk.Environment;
import software.amazon.awscdk.StackProps;

import java.util.Map;

public class EdgeStackProps implements StackProps {
    public final String envName;
    public final String deploymentName;
    public final String hostedZoneName;
    public final String hostedZoneId;
    public final String domainName;
    public final String baseUrl;
    public final String resourceNamePrefix;
    public final String compressedResourceNamePrefix;
    public final String certificateArn;
    public final int accessLogGroupRetentionPeriodDays;
    public final Map<String, String> pathsToOriginLambdaFunctionArns;

    // Explicit env to allow this stack to target us-east-1 for CloudFront/WAF
    private final Environment env;

    private EdgeStackProps(Builder builder) {
        this.envName = builder.envName;
        this.deploymentName = builder.deploymentName;
        this.hostedZoneName = builder.hostedZoneName;
        this.hostedZoneId = builder.hostedZoneId;
        this.domainName = builder.domainName;
        this.baseUrl = builder.baseUrl;
        this.resourceNamePrefix = builder.resourceNamePrefix;
        this.compressedResourceNamePrefix = builder.compressedResourceNamePrefix;
        this.certificateArn = builder.certificateArn;
        this.accessLogGroupRetentionPeriodDays = builder.accessLogGroupRetentionPeriodDays;
        this.pathsToOriginLambdaFunctionArns = builder.pathsToOriginLambdaFunctionArns;
        this.env = builder.env;
    }

    // Ensure Stack consumes our explicit env (region/account) when provided
    @Override
    public Environment getEnv() {
        return this.env;
    }

    public static Builder builder() {
        return new Builder();
    }

    public static class Builder {
        private String envName;
        private String deploymentName;
        private String hostedZoneName;
        private String hostedZoneId;
        private String domainName;
        private String baseUrl;
        private String resourceNamePrefix;
        private String compressedResourceNamePrefix;
        private String certificateArn;
        private int accessLogGroupRetentionPeriodDays;
        private Map<String, String> pathsToOriginLambdaFunctionArns;
        private Environment env;

        public Builder envName(String envName) {
            this.envName = envName;
            return this;
        }

        public Builder deploymentName(String deploymentName) {
            this.deploymentName = deploymentName;
            return this;
        }

        public Builder hostedZoneName(String hostedZoneName) {
            this.hostedZoneName = hostedZoneName;
            return this;
        }

        public Builder hostedZoneId(String hostedZoneId) {
            this.hostedZoneId = hostedZoneId;
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

        public Builder compressedResourceNamePrefix(String compressedResourceNamePrefix) {
            this.compressedResourceNamePrefix = compressedResourceNamePrefix;
            return this;
        }

        public Builder certificateArn(String certificateArn) {
            this.certificateArn = certificateArn;
            return this;
        }

        public Builder accessLogGroupRetentionPeriodDays(int accessLogGroupRetentionPeriodDays) {
            this.accessLogGroupRetentionPeriodDays = accessLogGroupRetentionPeriodDays;
            return this;
        }

        public Builder pathsToOriginLambdaFunctionArns(
                Map<String, String> pathsToOriginLambdaFunctionArns) {
            this.pathsToOriginLambdaFunctionArns = pathsToOriginLambdaFunctionArns;
            return this;
        }

        public Builder env(Environment env) {
            this.env = env;
            return this;
        }

        public EdgeStackProps build() {
            return new EdgeStackProps(this);
        }
    }
}
