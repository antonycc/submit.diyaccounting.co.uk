package co.uk.diyaccounting.submit.awssdk;

import co.uk.diyaccounting.submit.utils.ResourceNameUtils;
import java.util.HashMap;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.StackProps;

public class SimpleStackProps implements StackProps {

  public static class Builder {

    final String stackPostfix;
    final Class<? extends Stack> stackClass;
    String env = null;
    String account = null;
    String region = null;

    public Builder(final Class<? extends Stack> stackClass) {
      this.stackClass = stackClass;
      this.stackPostfix =
          ResourceNameUtils.convertCamelCaseToDashSeparated(stackClass.getSimpleName());
    }

    public static Builder create(final Class<? extends Stack> stackClass) {
      return new Builder(stackClass).env().account().region();
    }

    public Builder env() {
      return env("test");
    }

    public Builder env(String env) {
      final Builder newBuilder = new Builder(stackClass);
      newBuilder.env = env;
      newBuilder.account = account;
      newBuilder.region = region;
      return newBuilder;
    }

    public Builder account() {
      return account("11111111");
    }

    public Builder account(String account) {
      final Builder newBuilder = new Builder(stackClass);
      newBuilder.env = env;
      newBuilder.account = account;
      newBuilder.region = region;
      return newBuilder;
    }

    public Builder region() {
      return region("eu-west-2");
    }

    public Builder region(String region) {
      final Builder newBuilder = new Builder(stackClass);
      newBuilder.env = env;
      newBuilder.account = account;
      newBuilder.region = region;
      return newBuilder;
    }

    public StackProps build() {
      return StackProps.builder()
          .stackName("%s-%s".formatted(env, stackPostfix))
          .tags(
              new HashMap<>() {
                {
                  put("test", env);
                }
              })
          .env(Environment.builder().account(account).region(region).build())
          .build();
    }
  }
}
