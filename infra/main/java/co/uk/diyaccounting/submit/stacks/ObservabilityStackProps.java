package co.uk.diyaccounting.submit.stacks;

public class ObservabilityStackProps {
  public final String env;
  public final String subDomainName;
  public final String hostedZoneName;
  public final String cloudTrailEnabled;
  public final String cloudTrailLogGroupPrefix;
  public final String cloudTrailLogGroupRetentionPeriodDays;
  public final String accessLogGroupRetentionPeriodDays;
  public final String xRayEnabled;

  private ObservabilityStackProps(Builder b) {
    this.env = b.env;
    this.subDomainName = b.subDomainName;
    this.hostedZoneName = b.hostedZoneName;
    this.cloudTrailEnabled = b.cloudTrailEnabled;
    this.cloudTrailLogGroupPrefix = b.cloudTrailLogGroupPrefix;
    this.cloudTrailLogGroupRetentionPeriodDays = b.cloudTrailLogGroupRetentionPeriodDays;
    this.accessLogGroupRetentionPeriodDays = b.accessLogGroupRetentionPeriodDays;
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
    private String cloudTrailLogGroupPrefix;
    private String cloudTrailLogGroupRetentionPeriodDays;
    private String accessLogGroupRetentionPeriodDays;
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

    public Builder cloudTrailLogGroupPrefix(String v) {
      this.cloudTrailLogGroupPrefix = v;
      return this;
    }

    public Builder cloudTrailLogGroupRetentionPeriodDays(String v) {
      this.cloudTrailLogGroupRetentionPeriodDays = v;
      return this;
    }

    public Builder accessLogGroupRetentionPeriodDays(String v) {
      this.accessLogGroupRetentionPeriodDays = v;
      return this;
    }

    public Builder xRayEnabled(String v) {
      this.xRayEnabled = v;
      return this;
    }

    public ObservabilityStackProps build() {
      return new ObservabilityStackProps(this);
    }
  }
}
