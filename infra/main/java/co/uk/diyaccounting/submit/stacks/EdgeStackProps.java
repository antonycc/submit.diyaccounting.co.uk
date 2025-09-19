package co.uk.diyaccounting.submit.stacks;

import software.amazon.awscdk.StackProps;
import software.amazon.awscdk.services.cloudfront.BehaviorOptions;

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
    public final String logsBucketArn;
    public final BehaviorOptions webBehaviorOptions;
    public final Map<String, BehaviorOptions> additionalOriginsBehaviourMappings;

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
        this.logsBucketArn = builder.logsBucketArn;
        this.webBehaviorOptions = builder.webBehaviorOptions;
        this.additionalOriginsBehaviourMappings = builder.additionalOriginsBehaviourMappings;
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
        private String logsBucketArn;
        private BehaviorOptions webBehaviorOptions;
        private Map<String, BehaviorOptions> additionalOriginsBehaviourMappings;

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

        public Builder logsBucketArn(String logsBucketArn) {
            this.logsBucketArn = logsBucketArn;
            return this;
        }

        public Builder webBehaviorOptions(BehaviorOptions webBehaviorOptions) {
            this.webBehaviorOptions = webBehaviorOptions;
            return this;
        }

        public Builder additionalOriginsBehaviourMappings(
                Map<String, BehaviorOptions> additionalOriginsBehaviourMappings) {
            this.additionalOriginsBehaviourMappings = additionalOriginsBehaviourMappings;
            return this;
        }

        public EdgeStackProps build() {
            return new EdgeStackProps(this);
        }
    }
}
