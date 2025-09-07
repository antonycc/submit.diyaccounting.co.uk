package co.uk.diyaccounting.submit.constructs;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.StackProps;
import software.amazon.awscdk.services.iam.Effect;
import software.amazon.awscdk.services.iam.FederatedPrincipal;
import software.amazon.awscdk.services.iam.OpenIdConnectProvider;
import software.amazon.awscdk.services.iam.PolicyStatement;
import software.amazon.awscdk.services.iam.Role;
import software.constructs.Construct;

/**
 * Creates separate IAM roles for different purposes:
 * - Test role: Limited permissions for reading S3 objects and artifacts
 * - Deployment role: Full permissions for CDK deployment and resource management
 *
 * This improves security by following the principle of least privilege.
 */
public class GitHubOIDCRoles extends Stack {

    public final Role testRole;
    public final Role deploymentRole;
    public final OpenIdConnectProvider oidcProvider;

    public GitHubOIDCRoles(Construct scope, String id, GitHubOIDCRolesProps props) {
        super(scope, id, props);

        // Create OIDC provider for GitHub Actions
        this.oidcProvider = OpenIdConnectProvider.Builder.create(this, "GitHubOIDCProvider")
                .url("https://token.actions.githubusercontent.com")
                .clientIds(List.of("sts.amazonaws.com"))
                .thumbprints(List.of(
                        // GitHub's OIDC thumbprint
                        "6938fd4d98bab03faadb97b34396831e3780aea1", "1c58a3a8518e8759bf075b76b750d4f2df264fcd"))
                .build();

        // Create test role with limited permissions
        Map<String, Object> testConditions = new HashMap<>();
        testConditions.put(
                "StringEquals",
                Map.of(
                        "token.actions.githubusercontent.com:aud",
                        "sts.amazonaws.com",
                        "token.actions.githubusercontent.com:sub",
                        "repo:" + props.repositoryName + ":ref:refs/heads/main"));

        this.testRole = Role.Builder.create(this, "GitHubTestRole")
                .roleName("submit-test-role")
                .description(
                        "Limited role for GitHub Actions testing - read-only access to S3 artifacts and" + " receipts")
                .assumedBy(new FederatedPrincipal(
                        this.oidcProvider.getOpenIdConnectProviderArn(),
                        testConditions,
                        "sts:AssumeRoleWithWebIdentity"))
                .inlinePolicies(Map.of(
                        "TestPermissions",
                        software.amazon.awscdk.services.iam.PolicyDocument.Builder.create()
                                .statements(List.of(
                                        // S3 read permissions for artifacts and receipts
                                        PolicyStatement.Builder.create()
                                                .effect(Effect.ALLOW)
                                                .actions(List.of("s3:GetObject", "s3:ListBucket"))
                                                .resources(List.of(
                                                        "arn:aws:s3:::*-receipts/*",
                                                        "arn:aws:s3:::*-receipts",
                                                        "arn:aws:s3:::*artifacts*/*",
                                                        "arn:aws:s3:::*artifacts*"))
                                                .build(),
                                        // CloudWatch Logs read permissions for debugging
                                        PolicyStatement.Builder.create()
                                                .effect(Effect.ALLOW)
                                                .actions(List.of(
                                                        "logs:DescribeLogGroups",
                                                        "logs:DescribeLogStreams",
                                                        "logs:GetLogEvents"))
                                                .resources(List.of("arn:aws:logs:*:*:log-group:/aws/lambda/*"))
                                                .build(),
                                        // Lambda read permissions for testing
                                        PolicyStatement.Builder.create()
                                                .effect(Effect.ALLOW)
                                                .actions(List.of("lambda:InvokeFunction"))
                                                .resources(List.of("arn:aws:lambda:*:*:function:*-test-*"))
                                                .build()))
                                .build()))
                .build();

        // Create deployment role with full permissions
        Map<String, Object> deployConditions = new HashMap<>();
        deployConditions.put(
                "StringEquals",
                Map.of(
                        "token.actions.githubusercontent.com:aud",
                        "sts.amazonaws.com",
                        "token.actions.githubusercontent.com:sub",
                        "repo:" + props.repositoryName + ":ref:refs/heads/main"));

        this.deploymentRole = Role.Builder.create(this, "GitHubDeploymentRole")
                .roleName("submit-deployment-role")
                .description("Full deployment role for GitHub Actions - CDK and AWS resource management")
                .assumedBy(new FederatedPrincipal(
                        this.oidcProvider.getOpenIdConnectProviderArn(),
                        deployConditions,
                        "sts:AssumeRoleWithWebIdentity"))
                .inlinePolicies(Map.of(
                        "CDKDeploymentPermissions",
                        software.amazon.awscdk.services.iam.PolicyDocument.Builder.create()
                                .statements(List.of(
                                        // Full CDK deployment permissions
                                        PolicyStatement.Builder.create()
                                                .effect(Effect.ALLOW)
                                                .actions(List.of(
                                                        "iam:*",
                                                        "cloudformation:*",
                                                        "s3:*",
                                                        "lambda:*",
                                                        "cloudfront:*",
                                                        "route53:*",
                                                        "acm:*",
                                                        "cognito-idp:*",
                                                        "secretsmanager:*",
                                                        "cloudtrail:*",
                                                        "logs:*",
                                                        "xray:*",
                                                        "sts:AssumeRole"))
                                                .resources(List.of("*"))
                                                .build(),
                                        // Restrict sensitive IAM operations
                                        PolicyStatement.Builder.create()
                                                .effect(Effect.DENY)
                                                .actions(List.of(
                                                        "iam:CreateUser",
                                                        "iam:DeleteUser",
                                                        "iam:CreateAccessKey",
                                                        "iam:DeleteAccessKey"))
                                                .resources(List.of("*"))
                                                .build()))
                                .build()))
                .build();
    }

    public static class Builder {
        public final Construct scope;
        public final String id;
        public final StackProps props;
        public String repositoryName = "antonycc/submit.diyaccounting.co.uk";

        private Builder(Construct scope, String id, StackProps props) {
            this.scope = scope;
            this.id = id;
            this.props = props;
        }

        public static Builder create(Construct scope, String id, StackProps props) {
            return new Builder(scope, id, props);
        }

        public Builder repositoryName(String repositoryName) {
            this.repositoryName = repositoryName;
            return this;
        }

        public GitHubOIDCRoles build() {
            var p = GitHubOIDCRolesProps.builder()
                    .env(props != null ? props.getEnv() : null)
                    .repositoryName(this.repositoryName)
                    .build();
            return new GitHubOIDCRoles(scope, id, p);
        }
    }
}
