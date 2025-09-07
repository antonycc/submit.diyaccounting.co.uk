package co.uk.diyaccounting.submit.stacks;

public class ApplicationStackProps {
    public final String env;
    public final String subDomainName;
    public final String hostedZoneName;
    public final String cloudTrailEnabled;
    public final String xRayEnabled;

    private ApplicationStackProps(Builder b) {
        this.env = b.env;
        this.subDomainName = b.subDomainName;
        this.hostedZoneName = b.hostedZoneName;
        this.cloudTrailEnabled = b.cloudTrailEnabled;
        this.xRayEnabled = b.xRayEnabled;
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

        public ApplicationStackProps build() {
            return new ApplicationStackProps(this);
        }
    }
}
