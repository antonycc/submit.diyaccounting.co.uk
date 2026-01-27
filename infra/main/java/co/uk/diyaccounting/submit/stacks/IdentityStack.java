/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * Copyright (C) 2025-2026 DIY Accounting Ltd
 */

package co.uk.diyaccounting.submit.stacks;

import static co.uk.diyaccounting.submit.utils.Kind.infof;
import static co.uk.diyaccounting.submit.utils.KindCdk.cfnOutput;

import co.uk.diyaccounting.submit.SubmitSharedNames;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.immutables.value.Value;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.RemovalPolicy;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.StackProps;
import software.amazon.awscdk.services.certificatemanager.Certificate;
import software.amazon.awscdk.services.certificatemanager.ICertificate;
import software.amazon.awscdk.services.cognito.CustomThreatProtectionMode;
import software.amazon.awscdk.services.cognito.FeaturePlan;
import software.amazon.awscdk.services.cognito.StandardThreatProtectionMode;
import software.amazon.awscdk.services.cognito.AttributeMapping;
import software.amazon.awscdk.services.cognito.AuthFlow;
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
import software.amazon.awscdk.services.route53.HostedZone;
import software.amazon.awscdk.services.route53.HostedZoneAttributes;
import software.amazon.awscdk.services.secretsmanager.ISecret;
import software.amazon.awscdk.services.secretsmanager.Secret;
import software.constructs.Construct;
import software.constructs.IDependable;

public class IdentityStack extends Stack {

    public ICertificate certificate;
    public ISecret googleClientSecretsManagerSecret;
    public UserPool userPool;
    public UserPoolClient userPoolClient;
    public UserPoolIdentityProviderGoogle googleIdentityProvider;
    public CfnUserPoolIdentityProvider antonyccIdentityProvider;
    public final HashMap<UserPoolClientIdentityProvider, IDependable> identityProviders = new HashMap<>();
    public final UserPoolDomain userPoolDomain;
    public final String userPoolDomainARecordName;
    public final String userPoolDomainAaaaRecordName;
    public final ICertificate authCertificate;

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
        String cloudTrailEnabled();

        @Override
        SubmitSharedNames sharedNames();

        String hostedZoneName();

        String hostedZoneId();

        String certificateArn();

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

        this.authCertificate = Certificate.fromCertificateArn(
                this, props.resourceNamePrefix() + "-AuthCertificate", props.certificateArn());

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
                .selfSignUpEnabled(false)
                .signInAliases(SignInAliases.builder().email(true).build())
                .standardAttributes(standardAttributes)
                .customAttributes(Map.of(
                        "bundles",
                        StringAttribute.Builder.create()
                                .maxLen(2048)
                                .mutable(true)
                                .build()))
                // Phase 2.1: Enable Cognito Threat Protection (risk-based adaptive authentication)
                // FULL_FUNCTION mode blocks suspicious sign-ins and requires MFA for risky attempts
                // Provides: compromised credential detection, account takeover protection,
                // suspicious IP detection, and device fingerprinting
                // Requires PLUS tier for Threat Protection features
                .featurePlan(FeaturePlan.PLUS)
                .standardThreatProtectionMode(StandardThreatProtectionMode.FULL_FUNCTION)
                .customThreatProtectionMode(CustomThreatProtectionMode.FULL_FUNCTION)
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
        // Include COGNITO (native users) alongside federated identity providers
        var allProviders = new java.util.ArrayList<>(this.identityProviders.keySet());
        allProviders.add(UserPoolClientIdentityProvider.COGNITO); // Enable native Cognito users
        this.userPoolClient = UserPoolClient.Builder.create(this, props.resourceNamePrefix() + "-UserPoolClient")
                .userPool(userPool)
                .userPoolClientName(props.resourceNamePrefix() + "-client")
                .generateSecret(false)
                // Enable USER_PASSWORD_AUTH for native Cognito user authentication (used by behavior tests)
                .authFlows(AuthFlow.builder()
                        .userPassword(true) // ALLOW_USER_PASSWORD_AUTH for native users
                        .userSrp(true) // ALLOW_USER_SRP_AUTH for more secure native auth
                        .build())
                .oAuth(OAuthSettings.builder()
                        .flows(OAuthFlows.builder().authorizationCodeGrant(true).build())
                        .scopes(List.of(OAuthScope.EMAIL, OAuthScope.OPENID, OAuthScope.PROFILE))
                        .callbackUrls(List.of(
                                "https://" + props.sharedNames().envDomainName + "/",
                                "https://" + props.sharedNames().envDomainName + "/auth/loginWithCognitoCallback.html"))
                        .logoutUrls(List.of("https://" + props.sharedNames().envDomainName + "/"))
                        .build())
                .supportedIdentityProviders(allProviders)
                .build();
        this.identityProviders
                .values()
                .forEach(idp -> this.userPoolClient.getNode().addDependency(idp));

        // Create Cognito User Pool Domain with AWS-managed prefix
        // Using AWS-managed domain for reliability - works immediately without DNS setup
        // Format: {prefix}.auth.{region}.amazoncognito.com
        this.userPoolDomain = UserPoolDomain.Builder.create(this, props.resourceNamePrefix() + "-UserPoolDomain")
                .userPool(userPool)
                .cognitoDomain(software.amazon.awscdk.services.cognito.CognitoDomainOptions.builder()
                        .domainPrefix(props.sharedNames().cognitoDomainPrefix)
                        .build())
                .build();

        // NOTE: Custom domain configuration removed to use AWS-managed domain for OAuth2 endpoints
        // Custom domains require DNS setup and certificate validation which can cause delays
        // If custom domain is needed for branding, it can be added later with proper DNS configuration
        // Old custom domain setup (commented out):
        // .customDomain(software.amazon.awscdk.services.cognito.CustomDomainOptions.builder()
        //         .domainName(props.sharedNames().cognitoDomainName)
        //         .certificate(this.authCertificate)
        //         .build())

        this.userPoolDomainARecordName = "%s.auth.%s.amazoncognito.com".formatted(
                props.sharedNames().cognitoDomainPrefix, props.getEnv().getRegion());
        this.userPoolDomainAaaaRecordName = this.userPoolDomainARecordName;

        // Stack Outputs for Identity resources
        cfnOutput(this, "UserPoolId", this.userPool.getUserPoolId());
        cfnOutput(this, "UserPoolArn", this.userPool.getUserPoolArn());
        cfnOutput(this, "UserPoolClientId", this.userPoolClient.getUserPoolClientId());
        cfnOutput(this, "UserPoolDomainName", this.userPoolDomain.getDomainName());
        cfnOutput(this, "UserPoolDomainARecord", this.userPoolDomainARecordName);
        cfnOutput(this, "UserPoolDomainAaaaRecord", this.userPoolDomainAaaaRecordName);
        cfnOutput(this, "CognitoGoogleIdpId", this.googleIdentityProvider.getProviderName());
        cfnOutput(this, "CognitoAntonyccIdpId", this.antonyccIdentityProvider.getProviderName());

        infof(
                "IdentityStack %s created successfully for %s",
                this.getNode().getId(), props.sharedNames().dashedDeploymentDomainName);
    }
}
