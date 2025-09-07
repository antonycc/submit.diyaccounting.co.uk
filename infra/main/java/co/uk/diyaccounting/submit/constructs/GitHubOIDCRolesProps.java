package co.uk.diyaccounting.submit.constructs;

import software.amazon.awscdk.Environment;
import software.amazon.awscdk.StackProps;

public class GitHubOIDCRolesProps implements StackProps {
  public final Environment env;
  public final String repositoryName;

  private GitHubOIDCRolesProps(Builder b) {
    this.env = b.env;
    this.repositoryName = b.repositoryName;
  }

  @Override
  public Environment getEnv() {
    return env;
  }

  public static Builder builder() {
    return new Builder();
  }

  public static class Builder {
    private Environment env;
    private String repositoryName = "antonycc/submit.diyaccounting.co.uk";

    public Builder env(Environment env) {
      this.env = env;
      return this;
    }

    public Builder repositoryName(String name) {
      this.repositoryName = name;
      return this;
    }

    public GitHubOIDCRolesProps build() {
      return new GitHubOIDCRolesProps(this);
    }
  }
}
