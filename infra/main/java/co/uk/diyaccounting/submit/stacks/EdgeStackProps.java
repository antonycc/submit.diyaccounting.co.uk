package co.uk.diyaccounting.submit.stacks;

import software.amazon.awscdk.Environment;
import software.amazon.awscdk.StackProps;
import software.amazon.awscdk.services.cloudfront.BehaviorOptions;

import java.util.Map;

public class EdgeStackProps implements StackProps {
    public final Environment env;
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
    // public final Bucket webBucket;
    public final BehaviorOptions webBehaviorOptions;
    // public final Bucket wellKnownBucket;
    public final BehaviorOptions wellKnownBehaviorOptions;
    public final String jwksEndpointFunctionArn;
    public final String authorizeEndpointFunctionArn;
    public final String tokenEndpointFunctionArn;
    public final String userinfoEndpointFunctionArn;
    public final Map<String, BehaviorOptions> additionalOriginsBehaviourMappings;

    private EdgeStackProps(Builder builder) {
        this.env = builder.env;
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
        // this.webBucket = builder.webBucket;
        this.webBehaviorOptions = builder.webBehaviorOptions;
        // this.wellKnownBucket = builder.wellKnownBucket;
        this.wellKnownBehaviorOptions = builder.wellKnownBehaviorOptions;
        this.jwksEndpointFunctionArn = builder.jwksEndpointFunctionArn;
        this.authorizeEndpointFunctionArn = builder.authorizeEndpointFunctionArn;
        this.tokenEndpointFunctionArn = builder.tokenEndpointFunctionArn;
        this.userinfoEndpointFunctionArn = builder.userinfoEndpointFunctionArn;
        this.additionalOriginsBehaviourMappings = builder.additionalOriginsBehaviourMappings;
    }

    @Override
    public Environment getEnv() {
        return this.env;
    }

    public static Builder builder() {
        return new Builder();
    }

    public static class Builder {
        private Environment env;
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
        // private Bucket webBucket;
        private BehaviorOptions webBehaviorOptions;
        // private Bucket wellKnownBucket;
        private BehaviorOptions wellKnownBehaviorOptions;
        private String jwksEndpointFunctionArn;
        private String authorizeEndpointFunctionArn;
        private String tokenEndpointFunctionArn;
        private String userinfoEndpointFunctionArn;
        private Map<String, BehaviorOptions> additionalOriginsBehaviourMappings;

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

        // public Builder webBucket(Bucket webBucket) {
        //    this.webBucket = webBucket;
        //    return this;
        // }

        public Builder webBehaviorOptions(BehaviorOptions webBehaviorOptions) {
            this.webBehaviorOptions = webBehaviorOptions;
            return this;
        }

        // public Builder wellKnownBucket(Bucket wellKnownBucket) {
        //    this.wellKnownBucket = wellKnownBucket;
        //    return this;
        // }

        public Builder wellKnownBehaviorOptions(BehaviorOptions wellKnownBehaviorOptions) {
            this.wellKnownBehaviorOptions = wellKnownBehaviorOptions;
            return this;
        }

        public Builder jwksEndpointFunctionArn(String jwksEndpointFunctionArn) {
            this.jwksEndpointFunctionArn = jwksEndpointFunctionArn;
            return this;
        }

        public Builder authorizeEndpointFunctionArn(String authorizeEndpointFunctionArn) {
            this.authorizeEndpointFunctionArn = authorizeEndpointFunctionArn;
            return this;
        }

        public Builder tokenEndpointFunctionArn(String tokenEndpointFunctionArn) {
            this.tokenEndpointFunctionArn = tokenEndpointFunctionArn;
            return this;
        }

        public Builder userinfoEndpointFunctionArn(String userinfoEndpointFunctionArn) {
            this.userinfoEndpointFunctionArn = userinfoEndpointFunctionArn;
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
