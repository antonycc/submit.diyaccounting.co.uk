package co.uk.diyaccounting.submit.stacks;

import co.uk.diyaccounting.submit.utils.ResourceNameUtils;
import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;
import software.amazon.awscdk.CfnOutput;
import software.amazon.awscdk.RemovalPolicy;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.StackProps;
import software.amazon.awscdk.services.certificatemanager.Certificate;
import software.amazon.awscdk.services.certificatemanager.ICertificate;
import software.amazon.awscdk.services.cognito.AttributeMapping;
import software.amazon.awscdk.services.cognito.CfnUserPoolIdentityProvider;
import software.amazon.awscdk.services.cognito.OAuthFlows;
import software.amazon.awscdk.services.cognito.OAuthScope;
import software.amazon.awscdk.services.cognito.OAuthSettings;
import software.amazon.awscdk.services.cognito.ProviderAttribute;
import software.amazon.awscdk.services.cognito.SignInAliases;
import software.amazon.awscdk.services.cognito.StandardAttribute;
import software.amazon.awscdk.services.cognito.StandardAttributes;
import software.amazon.awscdk.services.cognito.StringAttribute;
import software.amazon.awscdk.services.cognito.UserPool;
import software.amazon.awscdk.services.cognito.UserPoolClient;
import software.amazon.awscdk.services.cognito.UserPoolClientIdentityProvider;
import software.amazon.awscdk.services.cognito.UserPoolDomain;
import software.amazon.awscdk.services.cognito.UserPoolIdentityProviderGoogle;
import software.amazon.awscdk.services.route53.ARecord;
import software.amazon.awscdk.services.route53.AaaaRecord;
import software.amazon.awscdk.services.route53.AliasRecordTargetConfig;
import software.amazon.awscdk.services.route53.HostedZone;
import software.amazon.awscdk.services.route53.HostedZoneAttributes;
import software.amazon.awscdk.services.route53.IAliasRecordTarget;
import software.amazon.awscdk.services.route53.RecordTarget;
import software.amazon.awscdk.services.secretsmanager.ISecret;
import software.amazon.awscdk.services.secretsmanager.Secret;
import software.constructs.Construct;
import software.constructs.IDependable;

import java.util.AbstractMap;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

public class IdentityStack extends Stack {

    private static final Logger logger = LogManager.getLogger(IdentityStack.class);

    public String domainName;
    public ICertificate certificate;
    public ISecret googleClientSecretsManagerSecret;
    public ISecret antonyccClientSecretsManagerSecret;

    // Cognito resources
    public UserPool userPool;
    public UserPoolClient userPoolClient;
    public UserPoolIdentityProviderGoogle googleIdentityProvider;
    public CfnUserPoolIdentityProvider antonyccIdentityProvider;
    public final HashMap<UserPoolClientIdentityProvider, IDependable> identityProviders = new HashMap<>();
    public final UserPoolDomain userPoolDomain;
    public final ARecord userPoolDomainARecord;
    public final AaaaRecord userPoolDomainAaaaRecord;
    public final String cognitoDomainName;
    public final String dashedCognitoDomainName;
    public final ICertificate authCertificate;
    public final String cognitoBaseUri;

    public static class Builder {
        public Construct scope;
        public String id;
        public StackProps props;

        public String env;
        public String hostedZoneName;
        public String hostedZoneId;
        public String subDomainName;
        public String authCertificateArn;
        public String useExistingAuthCertificate;
        public String cloudTrailEnabled;
        public String cloudTrailEventSelectorPrefix;
        public String accessLogGroupRetentionPeriodDays;
        public String xRayEnabled;
        public String verboseLogging;
        public String homeUrl;
        public String antonyccClientId;
        public String antonyccBaseUri;
        public String antonyccClientSecretArn;
        public String googleClientId;
        public String googleClientSecretArn;
        public String cognitoDomainPrefix;

        public Builder(Construct scope, String id, StackProps props) {
            this.scope = scope;
            this.id = id;
            this.props = props;
        }

        public static Builder create(Construct scope, String id) {
            return new Builder(scope, id, null);
        }

        public static Builder create(Construct scope, String id, StackProps props) {
            return new Builder(scope, id, props);
        }

        public Builder env(String env) {
            this.env = env;
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

        public Builder subDomainName(String subDomainName) {
            this.subDomainName = subDomainName;
            return this;
        }

        public Builder authCertificateArn(String authCertificateArn) {
            this.authCertificateArn = authCertificateArn;
            return this;
        }

        public Builder useExistingAuthCertificate(String useExistingAuthCertificate) {
            this.useExistingAuthCertificate = useExistingAuthCertificate;
            return this;
        }

        public Builder accessLogGroupRetentionPeriodDays(String accessLogGroupRetentionPeriodDays) {
            this.accessLogGroupRetentionPeriodDays = accessLogGroupRetentionPeriodDays;
            return this;
        }

        public Builder cloudTrailEnabled(String cloudTrailEnabled) {
            this.cloudTrailEnabled = cloudTrailEnabled;
            return this;
        }

        public Builder cloudTrailEventSelectorPrefix(String cloudTrailEventSelectorPrefix) {
            this.cloudTrailEventSelectorPrefix = cloudTrailEventSelectorPrefix;
            return this;
        }

        public Builder xRayEnabled(String xRayEnabled) {
            this.xRayEnabled = xRayEnabled;
            return this;
        }

        public Builder verboseLogging(String verboseLogging) {
            this.verboseLogging = verboseLogging;
            return this;
        }

        public Builder homeUrl(String homeUrl) {
            this.homeUrl = homeUrl;
            return this;
        }

        public Builder antonyccClientId(String antonyccClientId) {
            this.antonyccClientId = antonyccClientId;
            return this;
        }

        public Builder antonyccBaseUri(String antonyccBaseUri) {
            this.antonyccBaseUri = antonyccBaseUri;
            return this;
        }

        public Builder antonyccClientSecretArn(String antonyccClientSecretArn) {
            this.antonyccClientSecretArn = antonyccClientSecretArn;
            return this;
        }

        public Builder googleClientId(String googleClientId) {
            this.googleClientId = googleClientId;
            return this;
        }

        public Builder googleClientSecretArn(String googleClientSecretArn) {
            this.googleClientSecretArn = googleClientSecretArn;
            return this;
        }

        public Builder cognitoDomainPrefix(String cognitoDomainPrefix) {
            this.cognitoDomainPrefix = cognitoDomainPrefix;
            return this;
        }

        public Builder props(IdentityStackProps p) {
            if (p == null) return this;
            this.env = p.env;
            this.hostedZoneName = p.hostedZoneName;
            this.hostedZoneId = p.hostedZoneId;
            this.subDomainName = p.subDomainName;
            this.authCertificateArn = p.authCertificateArn;
            this.useExistingAuthCertificate = p.useExistingAuthCertificate;
            this.accessLogGroupRetentionPeriodDays = p.accessLogGroupRetentionPeriodDays;
            this.cloudTrailEnabled = p.cloudTrailEnabled;
            this.cloudTrailEventSelectorPrefix = p.cloudTrailEventSelectorPrefix;
            this.xRayEnabled = p.xRayEnabled;
            this.verboseLogging = p.verboseLogging;
            this.homeUrl = p.homeUrl;
            this.googleClientId = p.googleClientId;
            this.googleClientSecretArn = p.googleClientSecretArn;
            this.antonyccClientId = p.antonyccClientId;
            this.antonyccBaseUri = p.antonyccBaseUri;
            this.antonyccClientSecretArn = p.antonyccClientSecretArn;
            this.cognitoDomainPrefix = p.cognitoDomainPrefix;
            return this;
        }

        public IdentityStack build() {
            return new IdentityStack(this.scope, this.id, this.props, this);
        }

        public static String buildDomainName(String env, String subDomainName, String hostedZoneName) {
            if (env == null || env.isBlank()) {
                throw new IllegalArgumentException("env is required to build domain name");
            }
            if (subDomainName == null || subDomainName.isBlank()) {
                throw new IllegalArgumentException("subDomainName is required to build domain name");
            }
            if (hostedZoneName == null || hostedZoneName.isBlank()) {
                throw new IllegalArgumentException("hostedZoneName is required to build domain name");
            }
            return "prod".equals(env)
                    ? Builder.buildProdDomainName(subDomainName, hostedZoneName)
                    : Builder.buildNonProdDomainName(env, subDomainName, hostedZoneName);
        }

        public static String buildProdDomainName(String subDomainName, String hostedZoneName) {
            return "%s.%s".formatted(subDomainName, hostedZoneName);
        }

        public static String buildNonProdDomainName(String env, String subDomainName, String hostedZoneName) {
            return "%s.%s.%s".formatted(env, subDomainName, hostedZoneName);
        }

        public static String buildDashedDomainName(String env, String subDomainName, String hostedZoneName) {
            return ResourceNameUtils.convertDotSeparatedToDashSeparated(
                    "%s.%s.%s".formatted(env, subDomainName, hostedZoneName), domainNameMappings);
        }

        public static String buildCognitoDomainName(
                String env, String cognitoDomainPrefix, String subDomainName, String hostedZoneName) {
            if (env == null || env.isBlank()) {
                throw new IllegalArgumentException("env is required to build cognito domain name");
            }
            if (subDomainName == null || subDomainName.isBlank()) {
                throw new IllegalArgumentException("subDomainName is required to build cognito domain name");
            }
            if (hostedZoneName == null || hostedZoneName.isBlank()) {
                throw new IllegalArgumentException("hostedZoneName is required to build cognito domain name");
            }
            return "prod".equals(env)
                    ? Builder.buildProdCognitoDomainName(cognitoDomainPrefix, subDomainName, hostedZoneName)
                    : Builder.buildNonProdCognitoDomainName(env, cognitoDomainPrefix, subDomainName, hostedZoneName);
        }

        public static String buildProdCognitoDomainName(
                String cognitoDomainPrefix, String subDomainName, String hostedZoneName) {
            return "%s.%s.%s".formatted(cognitoDomainPrefix, subDomainName, hostedZoneName);
        }

        public static String buildNonProdCognitoDomainName(
                String env, String cognitoDomainPrefix, String subDomainName, String hostedZoneName) {
            return "%s.%s.%s.%s".formatted(env, cognitoDomainPrefix, subDomainName, hostedZoneName);
        }

        public static String buildDashedCognitoDomainName(String cognitoDomainName) {
            return ResourceNameUtils.convertDotSeparatedToDashSeparated(cognitoDomainName, domainNameMappings);
        }

        public static String buildCognitoBaseUri(String cognitoDomain) {
            return "https://%s".formatted(cognitoDomain);
        }
    }

    public static final List<AbstractMap.SimpleEntry<Pattern, String>> domainNameMappings = List.of();

    public static class BuilderPropsAdapter {
        // left intentionally empty
    }

    public IdentityStack(Construct scope, String id, IdentityStack.Builder builder) {
        this(scope, id, null, builder);
    }

    public IdentityStack(Construct scope, String id, StackProps props, IdentityStack.Builder builder) {
        super(scope, id, props);

        // Values are provided via WebApp after context/env resolution

        var hostedZone = HostedZone.fromHostedZoneAttributes(
                this,
                "HostedZone",
                HostedZoneAttributes.builder()
                        .zoneName(builder.hostedZoneName)
                        .hostedZoneId(builder.hostedZoneId)
                        .build());

        this.domainName = Builder.buildDomainName(builder.env, builder.subDomainName, builder.hostedZoneName);
        String dashedDomainName =
                Builder.buildDashedDomainName(builder.env, builder.subDomainName, builder.hostedZoneName);

        int accessLogGroupRetentionPeriodDays;
        try {
            accessLogGroupRetentionPeriodDays = Integer.parseInt(builder.accessLogGroupRetentionPeriodDays);
        } catch (Exception e) {
            accessLogGroupRetentionPeriodDays = 30;
        }

        boolean xRayEnabled = Boolean.parseBoolean(builder.xRayEnabled);

        var cognitoDomainName = Builder.buildCognitoDomainName(
                builder.env, builder.cognitoDomainPrefix, builder.subDomainName, hostedZone.getZoneName());
        var cognitoBaseUri = Builder.buildCognitoBaseUri(cognitoDomainName);
        this.cognitoDomainName = cognitoDomainName;
        this.cognitoBaseUri = cognitoBaseUri;

        this.dashedCognitoDomainName = Builder.buildDashedCognitoDomainName(cognitoDomainName);
        this.authCertificate = Certificate.fromCertificateArn(this, "AuthCertificate", builder.authCertificateArn);

        // Create a secret for the Google client secret and set the ARN to be used in the Lambda
        // environment variable
        // this.googleClientSecretsManagerSecret = Secret.Builder.create(this,
        // "GoogleClientSecretValue")
        //        .secretStringValue(SecretValue.unsafePlainText(builder.googleClientSecret))
        //        .description("Google Client Secret for OAuth authentication")
        //        .build();
        // Look up the client secret by arn
        if (builder.googleClientSecretArn == null || builder.googleClientSecretArn.isBlank()) {
            throw new IllegalArgumentException(
                    "DIY_SUBMIT_GOOGLE_CLIENT_SECRET_ARN must be provided for env=" + builder.env);
        }
        this.googleClientSecretsManagerSecret =
                Secret.fromSecretPartialArn(this, "GoogleClientSecret", builder.googleClientSecretArn);

        if (builder.antonyccClientSecretArn != null && !builder.antonyccClientSecretArn.isBlank()) {
            this.antonyccClientSecretsManagerSecret =
                    Secret.fromSecretPartialArn(this, "AntonyccClientSecret", builder.antonyccClientSecretArn);
        }
        // var antonyccClientSecretArn = this.antonyccClientSecretsManagerSecret.getSecretArn();

        // this.cognitoClientSecretsManagerSecret =
        //          Secret.fromSecretPartialArn(this, "CognitoClientSecret",
        // builder.cognitoClientSecretArn);
        // var cognitoClientSecretArn = this.cognitoClientSecretsManagerSecret.getSecretArn();

        var googleClientSecretValue = this.googleClientSecretsManagerSecret.getSecretValue();
        // var antonyccClientSecretValue = this.antonyccClientSecretsManagerSecret.getSecretValue();
        // var cognitoClientSecretValue = this.cognitoClientSecretsManagerSecret.getSecretValue();
        // var googleClientSecretValue = this.googleClientSecretsManagerSecret != null
        //        ? this.googleClientSecretsManagerSecret.getSecretValue()
        //        : SecretValue.unsafePlainText(builder.googleClientSecret);

        // Create Cognito User Pool for authentication
        var standardAttributes = StandardAttributes.builder()
                .email(StandardAttribute.builder().required(false).mutable(true).build())
                .givenName(StandardAttribute.builder()
                        .required(false)
                        .mutable(true)
                        .build())
                .familyName(StandardAttribute.builder()
                        .required(false)
                        .mutable(true)
                        .build())
                .build();
        this.userPool = UserPool.Builder.create(this, "UserPool")
                .userPoolName(dashedDomainName + "-user-pool")
                .selfSignUpEnabled(true)
                .signInAliases(SignInAliases.builder().email(true).build())
                .standardAttributes(standardAttributes)
                .customAttributes(Map.of(
                        "bundles",
                        StringAttribute.Builder.create()
                                .maxLen(2048)
                                .mutable(true)
                                .build()))
                .removalPolicy(RemovalPolicy.DESTROY)
                .build();

        // Google IdP
        this.googleIdentityProvider = UserPoolIdentityProviderGoogle.Builder.create(this, "GoogleIdentityProvider")
                .userPool(this.userPool)
                .clientId(builder.googleClientId)
                .clientSecretValue(googleClientSecretValue)
                .scopes(List.of("email", "openid", "profile"))
                .attributeMapping(AttributeMapping.builder()
                        .email(ProviderAttribute.GOOGLE_EMAIL)
                        .givenName(ProviderAttribute.GOOGLE_GIVEN_NAME)
                        .familyName(ProviderAttribute.GOOGLE_FAMILY_NAME)
                        .build())
                .build();
        this.identityProviders.put(UserPoolClientIdentityProvider.GOOGLE, this.googleIdentityProvider);

        // Antonycc OIDC via Cognito IdP (using L1 construct to avoid clientSecret requirement)
        this.antonyccIdentityProvider = CfnUserPoolIdentityProvider.Builder.create(this, "CognitoIdentityProvider")
                .providerName("cognito")
                .providerType("OIDC")
                .userPoolId(this.userPool.getUserPoolId())
                .providerDetails(Map.of(
                        "client_id",
                        builder.antonyccClientId,
                        "oidc_issuer",
                        builder.antonyccBaseUri,
                        "authorize_scopes",
                        "email openid profile",
                        "attributes_request_method",
                        "GET"
                        // No client_secret provided
                        ))
                .attributeMapping(Map.of(
                        "email", "email",
                        "given_name", "given_name",
                        "family_name", "family_name"))
                .build();
        this.identityProviders.put(UserPoolClientIdentityProvider.custom("cognito"), this.antonyccIdentityProvider);

        // User Pool Client
        this.userPoolClient = UserPoolClient.Builder.create(this, "UserPoolClient")
            .userPool(userPool)
            .userPoolClientName(dashedDomainName + "-client")
            .generateSecret(false)
            .oAuth(OAuthSettings.builder()
                .flows(OAuthFlows.builder().authorizationCodeGrant(true).build())
                .scopes(List.of(OAuthScope.EMAIL, OAuthScope.OPENID, OAuthScope.PROFILE))
                .callbackUrls(List.of(
                    "https://" + this.domainName + "/",
                    "https://" + this.domainName + "/auth/loginWithGoogleCallback.html",
                    "https://" + this.domainName + "/auth/loginWithCognitoCallback.html"))
                .logoutUrls(List.of("https://" + this.domainName + "/"))
                .build())
            .supportedIdentityProviders(this.identityProviders.keySet().stream().toList())
            .build();
        this.identityProviders
            .values()
            .forEach(idp -> this.userPoolClient.getNode().addDependency(idp));

        //var cognito = CognitoAuth.Builder.create(this)
                //.userPoolArn(this.userPool.getUserPoolArn())
                //.userPoolClientName(dashedDomainName + "-client")
                //.identityProviders(this.identityProviders)
                //.standardAttributes(standardAttributes)
                //.callbackUrls(List.of(
                //        "https://" + this.domainName + "/",
                //        "https://" + this.domainName + "/auth/loginWithGoogleCallback.html",
                //        "https://" + this.domainName + "/auth/loginWithCognitoCallback.html"))
                //.logoutUrls(List.of("https://" + this.domainName + "/"))
                //.featurePlan(
                //        builder.cognitoFeaturePlan != null && !builder.cognitoFeaturePlan.isBlank()
                //                ? builder.cognitoFeaturePlan
                //                : "ESSENTIALS")
                //.enableLogDelivery(builder.cognitoEnableLogDelivery != null
                //        && !builder.cognitoEnableLogDelivery.isBlank()
                //        && Boolean.parseBoolean(builder.cognitoEnableLogDelivery))
                //.xRayEnabled(xRayEnabled)
                //.accessLogGroupRetentionPeriodDays(accessLogGroupRetentionPeriodDays)
                //.logGroupNamePrefix(dashedDomainName)
                //.build();
        //this.userPoolClient = cognito.userPoolClient;

        // Create Cognito User Pool Domain
        this.userPoolDomain = UserPoolDomain.Builder.create(this, "UserPoolDomain")
                .userPool(userPool)
                .customDomain(software.amazon.awscdk.services.cognito.CustomDomainOptions.builder()
                        .domainName(cognitoDomainName)
                        .certificate(this.authCertificate)
                        .build())
                .build();

        // Create Route53 records for the Cognito UserPoolDomain as subdomains from the web domain.
        this.userPoolDomainARecord = ARecord.Builder.create(
                        this, "UserPoolDomainARecord-%s".formatted(dashedCognitoDomainName))
                .zone(hostedZone)
                .recordName(cognitoDomainName)
                .deleteExisting(true)
                .target(RecordTarget.fromAlias(new IAliasRecordTarget() {
                    @Override
                    public AliasRecordTargetConfig bind(
                            software.amazon.awscdk.services.route53.IRecordSet record,
                            software.amazon.awscdk.services.route53.IHostedZone zone) {
                        return AliasRecordTargetConfig.builder()
                                .dnsName(userPoolDomain.getCloudFrontEndpoint())
                                // CloudFront hosted zone ID is a well-known constant
                                .hostedZoneId("Z2FDTNDATAQYW2")
                                .build();
                    }

                    @Override
                    public AliasRecordTargetConfig bind(software.amazon.awscdk.services.route53.IRecordSet record) {
                        return bind(record, null);
                    }
                }))
                .build();
        // this.userPoolDomainARecord.getNode().addDependency(this.aRecord);
        this.userPoolDomainAaaaRecord = AaaaRecord.Builder.create(
                        this, "UserPoolDomainAaaaRecord-%s".formatted(dashedCognitoDomainName))
                .zone(hostedZone)
                .recordName(cognitoDomainName)
                .deleteExisting(true)
                .target(RecordTarget.fromAlias(new IAliasRecordTarget() {
                    @Override
                    public AliasRecordTargetConfig bind(
                            software.amazon.awscdk.services.route53.IRecordSet record,
                            software.amazon.awscdk.services.route53.IHostedZone zone) {
                        return AliasRecordTargetConfig.builder()
                                .dnsName(userPoolDomain.getCloudFrontEndpoint())
                                // CloudFront hosted zone ID is a well-known constant
                                .hostedZoneId("Z2FDTNDATAQYW2")
                                .build();
                    }

                    @Override
                    public AliasRecordTargetConfig bind(software.amazon.awscdk.services.route53.IRecordSet record) {
                        return bind(record, null);
                    }
                }))
                .build();
        // this.userPoolDomainAaaaRecord.getNode().addDependency(this.aaaaRecord);

        // Stack Outputs for Identity resources
        if (this.userPool != null) {
            CfnOutput.Builder.create(this, "UserPoolId")
                    .value(this.userPool.getUserPoolId())
                    .build();
            CfnOutput.Builder.create(this, "UserPoolArn")
                    .value(this.userPool.getUserPoolArn())
                    .build();
        }
        if (this.userPoolClient != null) {
            CfnOutput.Builder.create(this, "UserPoolClientId")
                    .value(this.userPoolClient.getUserPoolClientId())
                    .build();
        }
        if (this.userPoolDomain != null) {
            CfnOutput.Builder.create(this, "UserPoolDomainName")
                    .value(this.userPoolDomain.getDomainName())
                    .build();
        }
        if (this.userPoolDomainARecord != null) {
            CfnOutput.Builder.create(this, "UserPoolDomainARecord")
                    .value(this.userPoolDomainARecord.getDomainName())
                    .build();
        }
        if (this.userPoolDomainAaaaRecord != null) {
            CfnOutput.Builder.create(this, "UserPoolDomainAaaaRecord")
                    .value(this.userPoolDomainAaaaRecord.getDomainName())
                    .build();
        }
        if (this.googleIdentityProvider != null) {
            CfnOutput.Builder.create(this, "CognitoGoogleIdpId")
                    .value(this.googleIdentityProvider.getProviderName())
                    .build();
        }
        if (this.antonyccIdentityProvider != null) {
            CfnOutput.Builder.create(this, "CognitoAntonyccIdpId")
                    .value(this.antonyccIdentityProvider.getProviderName())
                    .build();
        }
    }
}
