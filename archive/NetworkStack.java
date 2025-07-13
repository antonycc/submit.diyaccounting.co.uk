package com.intention.web;

import com.intention.web.WebConstants;
import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;
import software.amazon.awscdk.Duration;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.StackProps;
import software.amazon.awscdk.services.certificatemanager.Certificate;
import software.amazon.awscdk.services.certificatemanager.CertificateValidation;
import software.amazon.awscdk.services.route53.ARecord;
import software.amazon.awscdk.services.route53.AaaaRecord;
import software.amazon.awscdk.services.route53.HostedZone;
import software.amazon.awscdk.services.route53.HostedZoneAttributes;
import software.amazon.awscdk.services.route53.IHostedZone;
import software.amazon.awscdk.services.route53.RecordTarget;
import software.constructs.Construct;

public class NetworkStack extends Stack {

    private static final Logger logger = LogManager.getLogger(NetworkStack.class);

    private String domainName(String env) { return "%s.web.%s".formatted(env, WebConstants.hostedZoneName); }

    public NetworkStack(final Construct scope, final String id) {
        this(scope, id, null);
    }

    public NetworkStack(final Construct scope, final String id, final StackProps props) {
        super(scope, id, props);

        final String env = props != null && props.getTags() != null && props.getTags().get(WebConstants.envTag) != null
                ? props.getTags().get(WebConstants.envTag)
                : WebConstants.defaultEnv ;

        // SSL certificate for the web website domain
        IHostedZone hostedZone = HostedZone.fromHostedZoneAttributes(this, "HostedZone", HostedZoneAttributes.builder()
                .zoneName(WebConstants.hostedZoneName)
                .hostedZoneId(WebConstants.hostedZoneId)
                .build());
        Certificate certificate = Certificate.Builder
                .create(this, "WebWebsiteCertificate")
                .domainName(domainName(env))
                .certificateName(domainName(env))
                .validation(CertificateValidation.fromDns(hostedZone))
                .transparencyLoggingEnabled(true)
                .build();

        // Route53 records for use with CloudFront distribution
        ARecord aRecord = ARecord.Builder
                .create(this, "WebWebsiteARecord")
                .zone(hostedZone)
                .recordName(domainName(env))
                .deleteExisting(true)
                .ttl(Duration.seconds(60))
                .target(RecordTarget.fromIpAddresses("127.0.0.1"))
                //.target(RecordTarget.fromAlias(new CloudFrontTarget(WebWebsiteDistribution)))
                .build();
        AaaaRecord aaaaRecord = AaaaRecord.Builder
                .create(this, "WebWebsiteAaaaRecord")
                .zone(hostedZone)
                .recordName(domainName(env))
                .deleteExisting(true)
                .ttl(Duration.seconds(60))
                .target(RecordTarget.fromIpAddresses("::1"))
                //.target(RecordTarget.fromAlias(new CloudFrontTarget(WebWebsiteDistribution)))
                .build();
    }
}
