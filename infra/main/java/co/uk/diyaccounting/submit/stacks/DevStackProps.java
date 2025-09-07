package co.uk.diyaccounting.submit.stacks;

public class DevStackProps {
    public final String env;
    public final String subDomainName;
    public final String hostedZoneName;
    public final String retainEcrRepository;

    private DevStackProps(Builder b) {
        this.env = b.env;
        this.subDomainName = b.subDomainName;
        this.hostedZoneName = b.hostedZoneName;
        this.retainEcrRepository = b.retainEcrRepository;
    }

    public static Builder builder() {
        return new Builder();
    }

    public static class Builder {
        private String env;
        private String subDomainName;
        private String hostedZoneName;
        private String retainEcrRepository;

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

        public Builder retainEcrRepository(String v) {
            this.retainEcrRepository = v;
            return this;
        }

        public DevStackProps build() {
            return new DevStackProps(this);
        }
    }
}
