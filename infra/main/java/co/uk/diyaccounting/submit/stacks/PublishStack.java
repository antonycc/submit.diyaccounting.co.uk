package co.uk.diyaccounting.submit.stacks;

import static co.uk.diyaccounting.submit.utils.Kind.infof;
import static co.uk.diyaccounting.submit.utils.Kind.warnf;
import static co.uk.diyaccounting.submit.utils.KindCdk.cfnOutput;
import static co.uk.diyaccounting.submit.utils.ResourceNameUtils.convertDotSeparatedToDashSeparated;

import java.util.List;

import co.uk.diyaccounting.submit.aspects.SetAutoDeleteJobLogRetentionAspect;
import org.immutables.value.Value;
import software.amazon.awscdk.Aspects;
import software.amazon.awscdk.AssetHashType;
import software.amazon.awscdk.Duration;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.Expiration;
import software.amazon.awscdk.Size;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.StackProps;
import software.amazon.awscdk.Tags;
import software.amazon.awscdk.services.cloudfront.Distribution;
import software.amazon.awscdk.services.cloudfront.DistributionAttributes;
import software.amazon.awscdk.services.cloudfront.IDistribution;
import software.amazon.awscdk.services.logs.ILogGroup;
import software.amazon.awscdk.services.logs.LogGroup;
import software.amazon.awscdk.services.s3.Bucket;
import software.amazon.awscdk.services.s3.IBucket;
import software.amazon.awscdk.services.s3.assets.AssetOptions;
import software.amazon.awscdk.services.s3.deployment.BucketDeployment;
import software.amazon.awscdk.services.s3.deployment.Source;
import software.constructs.Construct;

public class PublishStack extends Stack {

    public final BucketDeployment webDeployment;

    @Value.Immutable
    public interface PublishStackProps extends StackProps, SubmitStackProps {

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
        String dashedDomainName();

        @Override
        String domainName();

        @Override
        String baseUrl();

        @Override
        String cloudTrailEnabled();

        String distributionId();

        String commitHash();

        String websiteHash();

        String buildNumber();

        String docRootPath();

        String webDeploymentLogGroupArn();

        static ImmutablePublishStackProps.Builder builder() {
            return ImmutablePublishStackProps.builder();
        }
    }

    public PublishStack(final Construct scope, final String id, final PublishStackProps props) {
        super(scope, id, props);

        // Apply cost allocation tags for all resources in this stack
        Tags.of(this).add("Environment", props.envName());
        Tags.of(this).add("Application", "submit");
        Tags.of(this).add("CostCenter", "@antonycc/submit.diyaccounting.co.uk");
        Tags.of(this).add("Owner", "@antonycc/submit.diyaccounting.co.uk");
        Tags.of(this).add("Project", "@antonycc/submit.diyaccounting.co.uk");
        Tags.of(this).add("DeploymentName", props.deploymentName());
        Tags.of(this).add("Stack", "PublishStack");
        Tags.of(this).add("ManagedBy", "aws-cdk");

        // Enhanced cost optimization tags
        Tags.of(this).add("BillingPurpose", "authentication-infrastructure");
        Tags.of(this).add("ResourceType", "serverless-web-app");
        Tags.of(this).add("Criticality", "low");
        Tags.of(this).add("DataClassification", "public");
        Tags.of(this).add("BackupRequired", "false");
        Tags.of(this).add("MonitoringEnabled", "true");

        // Use Resources from the passed props

        DistributionAttributes distributionAttributes = DistributionAttributes.builder()
                .domainName(props.domainName())
                .distributionId(props.distributionId())
                .build();
        IDistribution distribution = Distribution.fromDistributionAttributes(
                this, props.resourceNamePrefix() + "-ImportedWebDist", distributionAttributes);

        String originBucketName = convertDotSeparatedToDashSeparated("origin-" + props.domainName());
        IBucket originBucket = Bucket.fromBucketName(this, props.resourceNamePrefix() + "-WebBucket", originBucketName);

        // Generate submit.version file with commit hash if provided
        if (props.commitHash() != null && !props.commitHash().isBlank()) {
            try {
                java.nio.file.Path versionFilepath = java.nio.file.Paths.get(props.docRootPath(), "submit.version");
                java.nio.file.Files.writeString(
                        versionFilepath, props.commitHash().trim());
                infof("Created submit.version file with commit hash: %s".formatted(props.commitHash()));
            } catch (Exception e) {
                warnf("Failed to create submit.version file: %s".formatted(e.getMessage()));
            }
        } else {
            infof("No commit hash provided, skipping submit.version generation");
        }

        // Generate a file containing a hash of the website files for deployment optimization
        if (props.websiteHash() != null && !props.websiteHash().isBlank()) {
            try {
                java.nio.file.Path hashFilepath = java.nio.file.Paths.get(props.docRootPath(), "submit.hash");
                java.nio.file.Files.writeString(
                        hashFilepath, props.websiteHash().trim());
                infof("Created submit.hash file with website hash: %s".formatted(props.websiteHash()));
            } catch (Exception e) {
                warnf("Failed to create submit.hash file: %s".formatted(e.getMessage()));
            }
        } else {
            infof("No website hash provided, skipping submit.hash generation");
        }

        // Generate a file containing the environment name for runtime use
        if (props.envName() != null && !props.envName().isBlank()) {
            try {
                java.nio.file.Path envFilepath = java.nio.file.Paths.get(props.docRootPath(), "submit.env");
                java.nio.file.Files.writeString(envFilepath, props.envName().trim());
                infof("Created submit.env file with environment name: %s".formatted(props.envName()));
            } catch (Exception e) {
                warnf("Failed to create submit.env file: %s".formatted(e.getMessage()));
            }
        } else {
            infof("No environment name provided, skipping submit.env generation");
        }

        // Generate a file containing the build number for runtime use
        if (props.buildNumber() != null && !props.buildNumber().isBlank()) {
            try {
                java.nio.file.Path buildNumberFilepath = java.nio.file.Paths.get(props.docRootPath(), "submit.build");
                java.nio.file.Files.writeString(
                        buildNumberFilepath, props.buildNumber().trim());
                infof("Created submit.build file with build number: %s".formatted(props.buildNumber()));
            } catch (Exception e) {
                warnf("Failed to create submit.build file: %s".formatted(e.getMessage()));
            }
        } else {
            infof("No build number provided, skipping submit.build generation");
        }

        // Lookup Log Group for web deployment
        ILogGroup webDeploymentLogGroup = LogGroup.fromLogGroupArn(
                this, props.resourceNamePrefix() + "-ImportedWebDeploymentLogGroup", props.webDeploymentLogGroupArn());

        // Deploy the web website files to the web website bucket and invalidate distribution
        // Resolve the document root path from props to avoid path mismatches between generation and deployment
        var publicDir =
                java.nio.file.Paths.get(props.docRootPath()).toAbsolutePath().normalize();
        infof("Using public doc root: %s".formatted(publicDir));
        var webDocRootSource = Source.asset(
                publicDir.toString(),
                AssetOptions.builder().assetHashType(AssetHashType.SOURCE).build());
        this.webDeployment = BucketDeployment.Builder.create(
                        this, props.resourceNamePrefix() + "-DocRootToWebOriginDeployment")
                .sources(List.of(webDocRootSource))
                .destinationBucket(originBucket)
                .distribution(distribution)
                .distributionPaths(List.of(
                        "/account/*",
                        "/activities/*",
                        "/auth/*",
                        "/errors/*",
                        "/images/*",
                        "/widgets/*",
                        "/favicon.ico",
                        "/index.html",
                        "/submit.css",
                        "/submit.js",
                        "/submit.version",
                        "/submit.hash",
                        "/submit.build",
                        "/submit.env"))
                .retainOnDelete(true)
                .logGroup(webDeploymentLogGroup)
                .expires(Expiration.after(Duration.minutes(5)))
                .prune(false)
                .memoryLimit(1024)
                .ephemeralStorageSize(Size.gibibytes(2))
                .build();

        Aspects.of(this).add(new SetAutoDeleteJobLogRetentionAspect(props.deploymentName(), 2));

        // Outputs
        cfnOutput(this, "BaseUrl", props.baseUrl());

        infof("PublishStack %s created successfully for %s", this.getNode().getId(), props.resourceNamePrefix());
    }
}
