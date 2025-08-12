package co.uk.diyaccounting.submit.constructs;

import software.amazon.awscdk.SecretValue;
import software.amazon.awscdk.RemovalPolicy;
import software.amazon.awscdk.services.cognito.*;
import software.constructs.Construct;

import java.util.List;
import java.util.Map;

/**
 * Thin coordinator for Cognito resources, created at WebStack scope to preserve logical IDs.
 * Creates UserPool (id: "UserPool"), optional Google IdP (id: "GoogleIdentityProvider"),
 * and UserPoolClient (id: "UserPoolClient").
 */
public class CognitoAuth {

    public final UserPool userPool;
    public final UserPoolIdentityProviderGoogle googleIdentityProvider;
    public final UserPoolClient userPoolClient;

    private CognitoAuth(Builder b) {
        UserPool up = UserPool.Builder.create(b.scope, "UserPool")
                .userPoolName(b.userPoolName)
                .selfSignUpEnabled(true)
                .signInAliases(SignInAliases.builder().email(true).build())
                .standardAttributes(b.standardAttributes)
                .customAttributes(Map.of(
                        "bundles", StringAttribute.Builder.create().maxLen(2048).mutable(true).build()
                ))
                .removalPolicy(RemovalPolicy.DESTROY)
                .build();
        this.userPool = up;

        UserPoolIdentityProviderGoogle googleIdp = null;
        if (b.googleClientId != null && !b.googleClientId.isBlank() && b.googleClientSecretValue != null) {
            googleIdp = UserPoolIdentityProviderGoogle.Builder.create(b.scope, "GoogleIdentityProvider")
                    .userPool(up)
                    .clientId(b.googleClientId)
                    .clientSecretValue(b.googleClientSecretValue)
                    .scopes(List.of("email", "openid", "profile"))
                    .attributeMapping(AttributeMapping.builder()
                            .email(ProviderAttribute.GOOGLE_EMAIL)
                            .givenName(ProviderAttribute.GOOGLE_GIVEN_NAME)
                            .familyName(ProviderAttribute.GOOGLE_FAMILY_NAME)
                            .build())
                    .build();
        }
        this.googleIdentityProvider = googleIdp;

        UserPoolClient client = UserPoolClient.Builder.create(b.scope, "UserPoolClient")
                .userPool(up)
                .userPoolClientName(b.userPoolClientName)
                .generateSecret(false)
                .oAuth(OAuthSettings.builder()
                        .flows(OAuthFlows.builder().authorizationCodeGrant(true).build())
                        .scopes(List.of(OAuthScope.EMAIL, OAuthScope.OPENID, OAuthScope.PROFILE))
                        .callbackUrls(b.callbackUrls)
                        .logoutUrls(b.logoutUrls)
                        .build())
                .supportedIdentityProviders(b.supportedIdentityProviders)
                .build();

        if (googleIdp != null) {
            client.getNode().addDependency(googleIdp);
        }
        this.userPoolClient = client;
    }

    public static class Builder {
        private final Construct scope;
        private String userPoolName;
        private String userPoolClientName;
        private StandardAttributes standardAttributes;
        private String googleClientId;
        private SecretValue googleClientSecretValue;
        private List<String> callbackUrls;
        private List<String> logoutUrls;
        private List<UserPoolClientIdentityProvider> supportedIdentityProviders = List.of();

        private Builder(Construct scope) { this.scope = scope; }
        public static Builder create(Construct scope) { return new Builder(scope); }

        public Builder userPoolName(String name) { this.userPoolName = name; return this; }
        public Builder userPoolClientName(String name) { this.userPoolClientName = name; return this; }
        public Builder standardAttributes(StandardAttributes attrs) { this.standardAttributes = attrs; return this; }
        public Builder googleClientId(String id) { this.googleClientId = id; return this; }
        public Builder googleClientSecretValue(SecretValue value) { this.googleClientSecretValue = value; return this; }
        public Builder callbackUrls(List<String> urls) { this.callbackUrls = urls; return this; }
        public Builder logoutUrls(List<String> urls) { this.logoutUrls = urls; return this; }
        public Builder supportedIdentityProviders(List<UserPoolClientIdentityProvider> providers) { this.supportedIdentityProviders = providers; return this; }

        public CognitoAuth build() {
            if (userPoolName == null || userPoolName.isBlank()) throw new IllegalArgumentException("userPoolName is required");
            if (userPoolClientName == null || userPoolClientName.isBlank()) throw new IllegalArgumentException("userPoolClientName is required");
            if (standardAttributes == null) throw new IllegalArgumentException("standardAttributes is required");
            if (callbackUrls == null || callbackUrls.isEmpty()) throw new IllegalArgumentException("callbackUrls are required");
            if (logoutUrls == null || logoutUrls.isEmpty()) throw new IllegalArgumentException("logoutUrls are required");
            return new CognitoAuth(this);
        }
    }
}
