package com.intention.web;

import com.intention.web.LogForwardingBucket;
import com.intention.web.LogGzippedS3ObjectEvent;
import com.intention.web.LogS3ObjectEvent;
import com.intention.web.WebConstants;
import com.intention.web.ResourceNameUtils;
import org.apache.hc.core5.http.HttpStatus;
import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;
import software.amazon.awscdk.Duration;
import software.amazon.awscdk.RemovalPolicy;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.StackProps;
import software.amazon.awscdk.services.certificatemanager.Certificate;
import software.amazon.awscdk.services.certificatemanager.ICertificate;
import software.amazon.awscdk.services.cloudfront.AllowedMethods;
import software.amazon.awscdk.services.cloudfront.BehaviorOptions;
import software.amazon.awscdk.services.cloudfront.Distribution;
import software.amazon.awscdk.services.cloudfront.ErrorResponse;
import software.amazon.awscdk.services.cloudfront.HttpVersion;
import software.amazon.awscdk.services.cloudfront.OriginAccessIdentity;
import software.amazon.awscdk.services.cloudfront.OriginRequestCookieBehavior;
import software.amazon.awscdk.services.cloudfront.OriginRequestHeaderBehavior;
import software.amazon.awscdk.services.cloudfront.OriginRequestPolicy;
import software.amazon.awscdk.services.cloudfront.ResponseHeadersPolicy;
import software.amazon.awscdk.services.cloudfront.SSLMethod;
import software.amazon.awscdk.services.cloudfront.ViewerProtocolPolicy;
import software.amazon.awscdk.services.cloudfront.origins.S3Origin;
import software.amazon.awscdk.services.route53.ARecord;
import software.amazon.awscdk.services.route53.AaaaRecord;
import software.amazon.awscdk.services.route53.HostedZone;
import software.amazon.awscdk.services.route53.HostedZoneAttributes;
import software.amazon.awscdk.services.route53.IHostedZone;
import software.amazon.awscdk.services.route53.RecordTarget;
import software.amazon.awscdk.services.route53.targets.CloudFrontTarget;
import software.amazon.awscdk.services.s3.BlockPublicAccess;
import software.amazon.awscdk.services.s3.Bucket;
import software.amazon.awscdk.services.s3.BucketEncryption;
import software.amazon.awscdk.services.s3.IBucket;
import software.amazon.awscdk.services.s3.deployment.BucketDeployment;
import software.amazon.awscdk.services.s3.deployment.Source;
import software.constructs.Construct;

import java.io.File;
import java.util.AbstractMap;
import java.util.Collections;
import java.util.List;
import java.util.regex.Pattern;

public class ApplicationStack extends Stack {

    private static final Logger logger = LogManager.getLogger(ApplicationStack.class);

    // SimpleStackProps specific properties

    private static final String webWebsiteName = "public";
    private static final String webWebsiteDirName = "../%s".formatted(webWebsiteName);
    private static final String defaultHtmlDocument = "index.html";
    private static final String error404HtmlDistribution = "404-error-distribution.html";
    private String domainName(String env) { return "%s.web.%s".formatted(env, WebConstants.hostedZoneName); }
    private String dashedDomainName(String env) { return ResourceNameUtils.convertDashSeparatedToDotSeparated(domainName(env), WebConstants.domainNameMappings); }
    private String cloudTrailLogBucketName(String env) { return "%s-cloud-trail".formatted(dashedDomainName(env)); }
    private String originAccessLogBucketName(String env) { return "%s-origin-access-logs".formatted(dashedDomainName(env)); }
    private String distributionAccessLogBucketName(String env) { return "%s-distribution-access-logs".formatted(dashedDomainName(env));}
    private String getOriginBucketName(String env){ return dashedDomainName(env); }
    public String certificateArn(final String certificateName) {
        return "arn:aws:acm:us-east-1:%s:certificate/%s".formatted(this.getAccount(), certificateName);
    }

    private static final List<AbstractMap.SimpleEntry<Pattern, String>> domainNameMappings = List.of(
            new AbstractMap.SimpleEntry<>(Pattern.compile("xn--intenton-z2a"), "intention")
    );

    public ApplicationStack(final Construct scope, final String id) {
        this(scope, id, null);
    }

    public ApplicationStack(final Construct scope, final String id, final StackProps props) {
        super(scope, id, props);

        final String env = props != null && props.getTags() != null && props.getTags().get(WebConstants.envTag) != null
                ? props.getTags().get(WebConstants.envTag)
                : WebConstants.defaultEnv ;

        // Web bucket as origin for the CloudFront distribution with a bucket for access logs forwarded to CloudWatch
        final IBucket originAccessLogBucket = LogForwardingBucket.Builder
                .create(this, "WebWebsiteOriginAccess", LogS3ObjectEvent.handlerSource, LogS3ObjectEvent.class)
                .bucketName(originAccessLogBucketName(env))
                .functionNamePrefix("origin-access-")
                .build();
        final Bucket originBucket = Bucket.Builder
                .create(this, "WebWebsiteOriginBucket")
                .bucketName(getOriginBucketName(env))
                .versioned(true)
                .blockPublicAccess(BlockPublicAccess.BLOCK_ALL)
                .encryption(BucketEncryption.S3_MANAGED)
                .removalPolicy(RemovalPolicy.DESTROY)
                //.websiteIndexDocument(defaultHtmlDocument) // This sets the bucket as a website bucket which interferes
                //.websiteErrorDocument(error404HtmlOrigin)  // with the permissions because it adds a bucket policy.
                .autoDeleteObjects(true)
                .serverAccessLogsBucket(originAccessLogBucket)
                .build();
        final OriginAccessIdentity originIdentity = OriginAccessIdentity.Builder
                .create(this, "WebWebsiteOriginIdentity")
                .comment("Identity created for access to the web website bucket via the CloudFront distribution")
                .build();
        originBucket.grantRead(originIdentity); // This adds "s3:List*" so that 404s are handled.
        final S3Origin WebWebsiteOrigin = S3Origin.Builder.create(originBucket)
                .originAccessIdentity(originIdentity)
                .build();

        // Deploy the web website files to the web website bucket
        final String WebWebsitePath = "%s%s%s".formatted(
                WebConstants.baseDirPath,
                File.separator,
                webWebsiteDirName);
        BucketDeployment.Builder.create(this, "DeployWebWebsite")
                .sources(List.of(Source.asset(WebWebsitePath)))
                .destinationBucket(originBucket)
                .build();
        logger.info("Deployed files: from %s".formatted(WebWebsitePath));

        // Create a certificate for the web website domain
        IHostedZone hostedZone = HostedZone.fromHostedZoneAttributes(this, "HostedZone", HostedZoneAttributes.builder()
                .zoneName(WebConstants.hostedZoneName)
                .hostedZoneId(WebConstants.hostedZoneId)
                .build());
        var certificateArn = certificateArn(domainName(env));
        ICertificate certificate = Certificate.fromCertificateArn(this, "Certificate", certificateArn);

        // Create the CloudFront distribution using the web website bucket as the origin and Origin Access Identity
        final IBucket distributionAccessLogBucket = LogForwardingBucket.Builder
                .create(this, "WebWebsiteDistributionAccess", LogGzippedS3ObjectEvent.handlerSource, LogGzippedS3ObjectEvent.class)
                .bucketName(distributionAccessLogBucketName(env))
                .functionNamePrefix("distribution-access-")
                .build();
        final OriginRequestPolicy originRequestPolicy = OriginRequestPolicy.Builder
                .create(this, "WebWebsiteOriginRequestPolicy")
                .comment("Policy to allow content headers but no cookies from the origin")
                .cookieBehavior(OriginRequestCookieBehavior.none())
                .headerBehavior(OriginRequestHeaderBehavior.allowList("Accept", "Accept-Language", "Origin"))
                .build();
        final BehaviorOptions defaultBehaviour = BehaviorOptions.builder()
                .origin(WebWebsiteOrigin)
                .allowedMethods(AllowedMethods.ALLOW_GET_HEAD_OPTIONS)
                .originRequestPolicy(originRequestPolicy)
                .viewerProtocolPolicy(ViewerProtocolPolicy.REDIRECT_TO_HTTPS)
                .responseHeadersPolicy(ResponseHeadersPolicy.CORS_ALLOW_ALL_ORIGINS_WITH_PREFLIGHT_AND_SECURITY_HEADERS)
                .compress(true)
                .build();
        final Distribution WebWebsiteDistribution = Distribution.Builder
                .create(this, "WebWebsiteBucketDistribution")
                .domainNames(Collections.singletonList(domainName(env)))
                .defaultBehavior(defaultBehaviour)
                .defaultRootObject(defaultHtmlDocument)
                .errorResponses(List.of(ErrorResponse.builder()
                        .httpStatus(HttpStatus.SC_NOT_FOUND)
                        .responseHttpStatus(HttpStatus.SC_NOT_FOUND)
                        .responsePagePath("/%s".formatted(error404HtmlDistribution))
                        .build()))
                .certificate(certificate)
                .enableIpv6(true)
                .sslSupportMethod(SSLMethod.SNI)
                .httpVersion(HttpVersion.HTTP2_AND_3)
                .enableLogging(true)
                .logBucket(distributionAccessLogBucket)
                .logIncludesCookies(true)
                .build();
        final String distributionUrl = "https://%s/".formatted(WebWebsiteDistribution.getDomainName());
        logger.info("Distribution URL: %s".formatted(distributionUrl));

        // TODO: Create Route53 record for use with CloudFront distribution
        ARecord aRecord = ARecord.Builder
                .create(this, "WebWebsiteARecord")
                .zone(hostedZone)
                .recordName(domainName(env))
                .deleteExisting(true)
                .ttl(Duration.seconds(60))
                .target(RecordTarget.fromAlias(new CloudFrontTarget(WebWebsiteDistribution)))
                .build();
        AaaaRecord aaaaRecord = AaaaRecord.Builder
                .create(this, "WebWebsiteAaaaRecord")
                .zone(hostedZone)
                .recordName(domainName(env))
                .deleteExisting(true)
                .ttl(Duration.seconds(60))
                .target(RecordTarget.fromAlias(new CloudFrontTarget(WebWebsiteDistribution)))
                .build();
    }
}
