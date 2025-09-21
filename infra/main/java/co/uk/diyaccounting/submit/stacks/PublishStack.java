package co.uk.diyaccounting.submit.stacks;

import software.amazon.awscdk.AssetHashType;
import software.amazon.awscdk.Duration;
import software.amazon.awscdk.Expiration;
import software.amazon.awscdk.RemovalPolicy;
import software.amazon.awscdk.Size;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.Tags;
import software.amazon.awscdk.services.cloudfront.Distribution;
import software.amazon.awscdk.services.cloudfront.DistributionAttributes;
import software.amazon.awscdk.services.cloudfront.IDistribution;
import software.amazon.awscdk.services.logs.LogGroup;
import software.amazon.awscdk.services.logs.RetentionDays;
import software.amazon.awscdk.services.s3.Bucket;
import software.amazon.awscdk.services.s3.IBucket;
import software.amazon.awscdk.services.s3.assets.AssetOptions;
import software.amazon.awscdk.services.s3.deployment.BucketDeployment;
import software.amazon.awscdk.services.s3.deployment.Source;
import software.constructs.Construct;

import java.util.List;

public class PublishStack extends Stack {
    public final BucketDeployment webDeployment;
    public final String baseUrl;

    public PublishStack(final Construct scope, final String id, final PublishStackProps props) {
        super(scope, id, props);

        // Apply cost allocation tags for all resources in this stack
        Tags.of(this).add("Environment", props.envName);
        Tags.of(this).add("Application", "submit");
        Tags.of(this).add("CostCenter", "@antonycc/submit.diyaccounting.co.uk");
        Tags.of(this).add("Owner", "@antonycc/submit.diyaccounting.co.uk");
        Tags.of(this).add("Project", "@antonycc/submit.diyaccounting.co.uk");
        Tags.of(this).add("DeploymentName", props.deploymentName);
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
        this.baseUrl = props.baseUrl;
        //DistributionAttributes distributionAttributes = DistributionAttributes.builder()
        //        .domainName(props.domainName)
        //        //.distributionId(props.distributionArn)
        //        .build();
        // Distribution from ARN
        var distributionId = props.distributionArn.split("/")[1];
        DistributionAttributes distributionAttributes = DistributionAttributes.builder()
                .domainName(props.domainName)
                .distributionId(distributionId)
                .build();
        IDistribution distribution = Distribution.fromDistributionAttributes(
                this, props.resourceNamePrefix + "-ImportedWebDist", distributionAttributes);
        // Distribution from ARN
        //S3BucketOrigin origin = S3BucketOrigin.Builder.create(props.webBucket).build();
        //this.originBucket = props.webBucket;
        //this.originAccessIdentity = origin.getOriginAccessIdentity();
        IBucket originBucket = Bucket.fromBucketArn(this, props.resourceNamePrefix + "-WebBucket", props.webBucketArn);

                /*

        // Generate submit.version file with commit hash if provided
        if (builder.commitHash != null && !builder.commitHash.isBlank()) {
            try {
                java.nio.file.Path sourceFilePath = java.nio.file.Paths.get(builder.docRootPath, "submit.version");
                java.nio.file.Files.writeString(sourceFilePath, builder.commitHash.trim());
                infof("Created submit.version file with commit hash: %s".formatted(builder.commitHash));
            } catch (Exception e) {
                warnf("Failed to create submit.version file: %s".formatted(e.getMessage()));
            }
        } else {
            infof("No commit hash provided, skipping submit.version generation");
        }

        var deployPostfix = java.util.UUID.randomUUID().toString().substring(0, 8);

        // Deploy the web website files to the web website bucket and invalidate distribution
        this.docRootSource = Source.asset(
                builder.docRootPath,
                AssetOptions.builder().assetHashType(AssetHashType.SOURCE).build());
        infof("Will deploy files from: %s".formatted(builder.docRootPath));

        // Create LogGroup for BucketDeployment
        var bucketDeploymentRetentionPeriodDays = Integer.parseInt(builder.cloudTrailLogGroupRetentionPeriodDays);
        var bucketDeploymentRetentionPeriod =
                RetentionDaysConverter.daysToRetentionDays(bucketDeploymentRetentionPeriodDays);
        LogGroup bucketDeploymentLogGroup = LogGroup.Builder.create(this, "BucketDeploymentLogGroup-" + deployPostfix)
                .logGroupName("/aws/lambda/bucket-deployment-%s-%s".formatted(dashedDomainName, deployPostfix))
                .retention(bucketDeploymentRetentionPeriod)
                .removalPolicy(s3RetainOriginBucket ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY)
                .build();

        this.deployment = BucketDeployment.Builder.create(this, "DocRootToOriginDeployment")
                .sources(List.of(this.docRootSource))
                .destinationBucket(this.originBucket)
                .distribution(this.distribution)
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
                    "/submit.version"
                ))
                .logGroup(bucketDeploymentLogGroup)
                .retainOnDelete(true)
                .expires(Expiration.after(Duration.minutes(5)))
                .prune(false)
                .memoryLimit(1024)
                .ephemeralStorageSize(Size.gibibytes(2))
                .build();
*/

        // Generate submit.version file with commit hash if provided
        if (props.commitHash != null && !props.commitHash.isBlank()) {
            try {
                java.nio.file.Path sourceFilePath = java.nio.file.Paths.get(props.docRootPath, "submit.version");
                java.nio.file.Files.writeString(sourceFilePath, props.commitHash.trim());
                //infof("Created submit.version file with commit hash: %s".formatted(builder.commitHash));
            } catch (Exception e) {
                //warnf("Failed to create submit.version file: %s".formatted(e.getMessage()));
            }
        //} else {
            //infof("No commit hash provided, skipping submit.version generation");
        }

        var deployPostfix = java.util.UUID.randomUUID().toString().substring(0, 8);

        // Deploy the web website files to the web website bucket and invalidate distribution
        var webDocRootSource = Source.asset(
                "web/public",
                AssetOptions.builder().assetHashType(AssetHashType.SOURCE).build());
        var webDeploymentLogGroup = LogGroup.Builder.create(this, props.resourceNamePrefix + "-WebDeploymentLogGroup-" + deployPostfix)
                .logGroupName("/deployment/" + props.resourceNamePrefix + "-web-deployment-" + deployPostfix)
                //.logGroupName("/deployment/" + props.resourceNamePrefix + "-web-deployment")
                .retention(RetentionDays.ONE_DAY)
                .removalPolicy(RemovalPolicy.DESTROY)
                .build();
        this.webDeployment = BucketDeployment.Builder.create(
                        this, props.resourceNamePrefix + "-DocRootToWebOriginDeployment")
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
                    "/submit.version"
                ))
                .retainOnDelete(true)
                .logGroup(webDeploymentLogGroup)
                .expires(Expiration.after(Duration.minutes(5)))
                .prune(false)
                .memoryLimit(1024)
                .ephemeralStorageSize(Size.gibibytes(2))
                .build();

        // Outputs
    }
}
