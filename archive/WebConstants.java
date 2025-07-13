package com.intention.web;

import software.amazon.awssdk.regions.Region;

public class WebConstants {
    //public static final String envTag = "env";
    //public static final String defaultEnv = "local";
    public static final String defaultAccount = "541134664601";
    public static final String defaultRegion = "eu-west-2";
    public static final String baseDirPath = System.getProperty("user.dir");
    public static final Region region = Region.EU_WEST_2;
    //public static final String hostedZoneName = "xn--intenton-z2a.com";
    //public static final String hostedZoneId = "Z0315522208PWZSSBI9AL";
    public static final String TARGET_ENV = "TARGET_ENV";
    public static final String CDK_DEFAULT_ACCOUNT = "CDK_DEFAULT_ACCOUNT";
    public static final String CDK_DEFAULT_REGION = "CDK_DEFAULT_REGION";
    public static final String JSII_SILENCE_WARNING_UNTESTED_NODE_VERSION = "JSII_SILENCE_WARNING_UNTESTED_NODE_VERSION";
    public static final String JSII_SILENCE_WARNING_DEPRECATED_NODE_VERSION = "JSII_SILENCE_WARNING_DEPRECATED_NODE_VERSION";
    //public static final List<AbstractMap.SimpleEntry<Pattern, String>> domainNameMappings = List.of(
    //        new AbstractMap.SimpleEntry<>(Pattern.compile("xn--intenton-z2a"), "intention")
    //);
}
