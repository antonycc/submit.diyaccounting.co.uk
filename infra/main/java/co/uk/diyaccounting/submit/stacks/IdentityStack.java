package co.uk.diyaccounting.submit.stacks;

import co.uk.diyaccounting.submit.SubmitSharedNames;
import co.uk.diyaccounting.submit.aspects.SetAutoDeleteJobLogRetentionAspect;
import org.immutables.value.Value;
import software.amazon.awscdk.Aspects;
import software.amazon.awscdk.Environment;
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
import software.amazon.awscdk.services.logs.RetentionDays;
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

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static co.uk.diyaccounting.submit.utils.Kind.infof;
import static co.uk.diyaccounting.submit.utils.KindCdk.cfnOutput;
import static co.uk.diyaccounting.submit.utils.ResourceNameUtils.buildCognitoBaseUri;
import static co.uk.diyaccounting.submit.utils.ResourceNameUtils.buildDashedCognitoDomainName;

public class IdentityStack extends Stack {

    public ICertificate certificate;
    public ISecret googleClientSecretsManagerSecret;
    public UserPool userPool;
    public UserPoolClient userPoolClient;
    public UserPoolIdentityProviderGoogle googleIdentityProvider;
    public CfnUserPoolIdentityProvider antonyccIdentityProvider;
    public final HashMap<UserPoolClientIdentityProvider, IDependable> identityProviders = new HashMap<>();
    public final UserPoolDomain userPoolDomain;
    public final ARecord userPoolDomainARecord;
    public final AaaaRecord userPoolDomainAaaaRecord;
    public final String dashedCognitoDomainName;
    public final ICertificate authCertificate;
    public final String cognitoBaseUri;

    @Value.Immutable
    public interface IdentityStackProps extends StackProps, SubmitStackProps {

        @Override
        Environment getEnv();

        @Override
        @Value.Default
        default Boolean getCrossRegionReferences() {
            return null;
        }

        @Override
        String envName();

        @Override
        String deploymentName();

        @Override
        String resourceNamePrefix();

        @Override
        String compressedResourceNamePrefix();

        @Override
        String cloudTrailEnabled();

        @Override
        SubmitSharedNames sharedNames();

        String hostedZoneName();

        String hostedZoneId();

        String authCertificateArn();

        String antonyccClientId();

        String antonyccBaseUri();

        String googleClientId();

        String googleClientSecretArn();

        static ImmutableIdentityStackProps.Builder builder() {
            return ImmutableIdentityStackProps.builder();
        }
    }

    public IdentityStack(Construct scope, String id, IdentityStackProps props) {
        this(scope, id, null, props);
    }

    public IdentityStack(Construct scope, String id, StackProps stackProps, IdentityStackProps props) {
        super(scope, id, stackProps);

        // Values are provided via SubmitApplication after context/env resolution

        var hostedZone = HostedZone.fromHostedZoneAttributes(
                this,
                props.resourceNamePrefix() + "-HostedZone",
                HostedZoneAttributes.builder()
                        .zoneName(props.hostedZoneName())
                        .hostedZoneId(props.hostedZoneId())
                        .build());

        this.cognitoBaseUri = buildCognitoBaseUri(props.sharedNames().cognitoDomainName);

        this.dashedCognitoDomainName = buildDashedCognitoDomainName(props.sharedNames().cognitoDomainName);
        this.authCertificate = Certificate.fromCertificateArn(
                this, props.resourceNamePrefix() + "-AuthCertificate", props.authCertificateArn());

        // Create a secret for the Google client secret and set the ARN to be used in the Lambda

        // Look up the client secret by arn
        if (props.googleClientSecretArn() == null
                || props.googleClientSecretArn().isBlank()) {
            throw new IllegalArgumentException("GOOGLE_CLIENT_SECRET_ARN must be provided for env=" + props.envName());
        }
        this.googleClientSecretsManagerSecret = Secret.fromSecretPartialArn(
                this, props.resourceNamePrefix() + "-GoogleClientSecret", props.googleClientSecretArn());

        var googleClientSecretValue = this.googleClientSecretsManagerSecret.getSecretValue();

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
        this.userPool = UserPool.Builder.create(this, props.resourceNamePrefix() + "-UserPool")
                .userPoolName(props.resourceNamePrefix() + "-user-pool")
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
        this.googleIdentityProvider = UserPoolIdentityProviderGoogle.Builder.create(
                        this, props.resourceNamePrefix() + "-GoogleIdentityProvider")
                .userPool(this.userPool)
                .clientId(props.googleClientId())
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
        this.antonyccIdentityProvider = CfnUserPoolIdentityProvider.Builder.create(
                        this, props.resourceNamePrefix() + "-CognitoIdentityProvider")
                .providerName("cognito")
                .providerType("OIDC")
                .userPoolId(this.userPool.getUserPoolId())
                .providerDetails(Map.of(
                        "client_id",
                        props.antonyccClientId(),
                        "oidc_issuer",
                        props.antonyccBaseUri(),
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
        this.userPoolClient = UserPoolClient.Builder.create(this, props.resourceNamePrefix() + "-UserPoolClient")
                .userPool(userPool)
                .userPoolClientName(props.resourceNamePrefix() + "-client")
                .generateSecret(false)
                .oAuth(OAuthSettings.builder()
                        .flows(OAuthFlows.builder().authorizationCodeGrant(true).build())
                        .scopes(List.of(OAuthScope.EMAIL, OAuthScope.OPENID, OAuthScope.PROFILE))
                        .callbackUrls(List.of(
                                "https://" + props.sharedNames().domainName + "/",
                                "https://" + props.sharedNames().domainName + "/auth/loginWithCognitoCallback.html"))
                        .logoutUrls(List.of("https://" + props.sharedNames().domainName + "/"))
                        .build())
                .supportedIdentityProviders(
                        this.identityProviders.keySet().stream().toList())
                .build();
        this.identityProviders
                .values()
                .forEach(idp -> this.userPoolClient.getNode().addDependency(idp));

        // Create Cognito User Pool Domain
        this.userPoolDomain = UserPoolDomain.Builder.create(this, props.resourceNamePrefix() + "-UserPoolDomain")
                .userPool(userPool)
                .customDomain(software.amazon.awscdk.services.cognito.CustomDomainOptions.builder()
                        .domainName(props.sharedNames().cognitoDomainName)
                        .certificate(this.authCertificate)
                        .build())
                .build();

        // Create Route53 records for the Cognito UserPoolDomain as subdomains from the web domain.
        this.userPoolDomainARecord = ARecord.Builder.create(this, props.resourceNamePrefix() + "-UserPoolDomainARecord")
                .zone(hostedZone)
                .recordName(props.sharedNames().cognitoDomainName)
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

        this.userPoolDomainAaaaRecord = AaaaRecord.Builder.create(
                        this, props.resourceNamePrefix() + "-UserPoolDomainAaaaRecord")
                .zone(hostedZone)
                .recordName(props.sharedNames().cognitoDomainName)
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

        Aspects.of(this).add(new SetAutoDeleteJobLogRetentionAspect(props.deploymentName(), RetentionDays.THREE_DAYS));

        // Stack Outputs for Identity resources
        if (this.userPool != null) {
            cfnOutput(this, "UserPoolId", this.userPool.getUserPoolId());
            cfnOutput(this, "UserPoolArn", this.userPool.getUserPoolArn());
        }
        if (this.userPoolClient != null) {
            cfnOutput(this, "UserPoolClientId", this.userPoolClient.getUserPoolClientId());
        }
        cfnOutput(this, "UserPoolDomainName", this.userPoolDomain.getDomainName());
        cfnOutput(this, "UserPoolDomainARecord", this.userPoolDomainARecord.getDomainName());
        cfnOutput(this, "UserPoolDomainAaaaRecord", this.userPoolDomainAaaaRecord.getDomainName());
        if (this.googleIdentityProvider != null) {
            cfnOutput(this, "CognitoGoogleIdpId", this.googleIdentityProvider.getProviderName());
        }
        if (this.antonyccIdentityProvider != null) {
            cfnOutput(this, "CognitoAntonyccIdpId", this.antonyccIdentityProvider.getProviderName());
        }

        infof(
                "IdentityStack %s created successfully for %s",
                this.getNode().getId(), props.sharedNames().dashedDomainName);
    }
}
