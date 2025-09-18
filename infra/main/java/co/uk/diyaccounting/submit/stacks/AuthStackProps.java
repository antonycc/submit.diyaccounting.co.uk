package co.uk.diyaccounting.submit.stacks;

public class AuthStackProps {
    public final String env;
    public final String subDomainName;
    public final String hostedZoneName;
    public final String cloudTrailEnabled;
    public final String xRayEnabled;
    public final String baseImageTag;
    public final String ecrRepositoryArn;
    public final String ecrRepositoryName;
    public final String lambdaEntry;
    public final String homeUrl;
    public final String cognitoClientId;
    public final String cognitoBaseUri;
    public final String optionalTestAccessToken;

    private AuthStackProps(Builder b) {
        this.env = b.env;
        this.subDomainName = b.subDomainName;
        this.hostedZoneName = b.hostedZoneName;
        this.cloudTrailEnabled = b.cloudTrailEnabled;
        this.xRayEnabled = b.xRayEnabled;
        this.baseImageTag = b.baseImageTag;
        this.ecrRepositoryArn = b.ecrRepositoryArn;
        this.ecrRepositoryName = b.ecrRepositoryName;
        this.lambdaEntry = b.lambdaEntry;
        this.homeUrl = b.homeUrl;
        this.cognitoClientId = b.cognitoClientId;
        this.cognitoBaseUri = b.cognitoBaseUri;
        this.optionalTestAccessToken = b.optionalTestAccessToken;
    }

    public static Builder builder() {
        return new Builder();
    }

    public static class Builder {
        private String env;
        private String subDomainName;
        private String hostedZoneName;
        private String cloudTrailEnabled;
        private String xRayEnabled;
        private String baseImageTag;
        private String ecrRepositoryArn;
        private String ecrRepositoryName;
        private String lambdaEntry;
        private String homeUrl;
        private String cognitoClientId;
        private String cognitoBaseUri;
        private String optionalTestAccessToken;

        public Builder env(String v) {
            this.env = v;
            return this;
        }

        public Builder subDomainName(String v) {
            this.subDomainName = v;
            return this;
        }

        public Builder hostedZoneName(String v) {
            this.hostedZoneName = v;
            return this;
        }

        public Builder cloudTrailEnabled(String v) {
            this.cloudTrailEnabled = v;
            return this;
        }

        public Builder xRayEnabled(String v) {
            this.xRayEnabled = v;
            return this;
        }

        public Builder baseImageTag(String v) {
            this.baseImageTag = v;
            return this;
        }

        public Builder ecrRepositoryArn(String v) {
            this.ecrRepositoryArn = v;
            return this;
        }

        public Builder ecrRepositoryName(String v) {
            this.ecrRepositoryName = v;
            return this;
        }

        public Builder lambdaEntry(String v) {
            this.lambdaEntry = v;
            return this;
        }

        public Builder homeUrl(String v) {
            this.homeUrl = v;
            return this;
        }

        public Builder cognitoClientId(String v) {
            this.cognitoClientId = v;
            return this;
        }

        public Builder cognitoBaseUri(String v) {
            this.cognitoBaseUri = v;
            return this;
        }

        public Builder optionalTestAccessToken(String v) {
            this.optionalTestAccessToken = v;
            return this;
        }

        public AuthStackProps build() {
            return new AuthStackProps(this);
        }
    }
}
