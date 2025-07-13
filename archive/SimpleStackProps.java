package com.intention.web;

import software.amazon.awscdk.Environment;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.StackProps;

import java.util.HashMap;

public class SimpleStackProps implements StackProps {

    public static class Builder {

        final String stackPostfix;
        final Class<? extends Stack> stackClass;
        String env = null;
        String account = null;
        String region = null;

        public Builder(final Class<? extends Stack> stackClass) {
            this.stackClass = stackClass;
            this.stackPostfix = ResourceNameUtils.convertCamelCaseToDashSeparated(stackClass.getSimpleName());
        }

        public static Builder create(final Class<? extends Stack> stackClass) {
            return new Builder(stackClass).env().account().region();
        }

        public Builder env() {
            return env(
                    System.getenv(WebConstants.TARGET_ENV) != null
                            ? System.getenv(WebConstants.TARGET_ENV)
                            : WebConstants.defaultEnv
            );
        }

        public Builder env(String env) {
            final Builder newBuilder = new Builder(stackClass);
            newBuilder.env = env;
            newBuilder.account = account;
            newBuilder.region = region;
            return newBuilder;
        }

        public Builder account() {
            return account(
                    System.getenv(WebConstants.CDK_DEFAULT_ACCOUNT) != null
                            ? System.getenv(WebConstants.CDK_DEFAULT_ACCOUNT)
                            : WebConstants.defaultAccount
            );
        }

        public Builder account(String account) {
            final Builder newBuilder = new Builder(stackClass);
            newBuilder.env = env;
            newBuilder.account = account;
            newBuilder.region = region;
            return newBuilder;
        }

        public Builder region() {
            return region(
                    System.getenv(WebConstants.CDK_DEFAULT_REGION) != null
                            ? System.getenv(WebConstants.CDK_DEFAULT_REGION)
                            : WebConstants.defaultRegion
            );
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
                    .tags(new HashMap<>() {{ put(WebConstants.envTag, env); }})
                    .env(Environment.builder()
                            .account(account)
                            .region(region)
                            .build()
                    )
                    .build();
        }
    }
}
