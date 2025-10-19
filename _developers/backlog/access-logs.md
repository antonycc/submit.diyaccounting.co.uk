**Options (no S3 server access log bucket):**

1. CloudFront logs (you already front S3 with OAC)
    - Standard logs (to S3) still need a bucket (you want to avoid).
    - Real\-time logs via Kinesis Data Stream (no extra bucket) then Lambda → CloudWatch Logs.
    - Rich HTTP fields (method, URI, status, bytes, UA, referrer, edge location, cache result).

2. AWS WAF logging
    - Directly to CloudWatch Logs (or S3 / Firehose). Gives HTTP request info (includes headers + action).
    - Complements CloudFront (only blocked/allowed context, not full body).

3. CloudTrail Data Events for S3
    - Object\-level API calls (GetObject, PutObject) -> CloudWatch Logs.
    - Granular but not full HTTP (no user agent, referrer). Higher cost; sample carefully with prefix filters.

4. S3 Request Metrics (CloudWatch)
    - Enable request metrics on the bucket/prefix.
    - Aggregated counts (GET, 4xx, 5xx, latency). No per\-request detail.

5. Custom edge instrumentation
    - CloudFront Function / Lambda@Edge adds headers or emits CloudWatch metrics (e.g., path buckets, auth outcome).

**Recommended stack (HTTP analysis focus):**
- CloudFront real\-time logs (primary detailed HTTP feed).
- WAF logging (security lens).
- Targeted CloudTrail S3 data events only if you must audit object access beyond CloudFront (may be redundant if all access is via CloudFront OAC).

**CDK snippets (Java)**

CloudFront real\-time log config + association:
```java
import software.amazon.awscdk.services.cloudfront.CfnRealtimeLogConfig;
import software.amazon.awscdk.services.kinesis.Stream;

// Kinesis stream for real-time logs
Stream rtStream = Stream.Builder.create(this, "CfRtLogStream")
        .streamName(props.resourceNamePrefix() + "-cf-rt-logs")
        .shardCount(1)
        .build();

// Real-time log config (choose needed fields)
CfnRealtimeLogConfig rtConfig = CfnRealtimeLogConfig.Builder.create(this, "CfRtLogConfig")
        .name(props.resourceNamePrefix() + "-rtlog")
        .fields(List.of(
                "timestamp","c-ip","cs-method","cs(Host)","cs-uri-stem",
                "sc-status","sc-bytes","cs(User-Agent)","cs(Referer)",
                "x-edge-location","x-edge-response-result-type","x-host-header","cs-protocol"))
        .samplingRate(100) // percent
        .endPoints(List.of(CfnRealtimeLogConfig.EndPointProperty.builder()
                .kinesisStreamConfig(CfnRealtimeLogConfig.KinesisStreamConfigProperty.builder()
                        .roleArn(myIamRoleForCfToPutRecords.getRoleArn())
                        .streamArn(rtStream.getStreamArn())
                        .build())
                .streamType("Kinesis")
                .build()))
        .build();

// Attach to Distribution (low-level override since L2 lacks direct prop)
distribution.getNode().addDependency(rtConfig);
((software.amazon.awscdk.CfnResource) distribution.getNode().getDefaultChild())
        .addPropertyOverride("RealtimeLogConfigArn", rtConfig.getAttrArn());
```

WAF logging to CloudWatch Logs:
```java
import software.amazon.awscdk.services.logs.LogGroup;
import software.amazon.awscdk.services.wafv2.CfnLoggingConfiguration;

LogGroup wafLogGroup = LogGroup.Builder.create(this, "WafLogGroup")
        .logGroupName("/aws/waf/" + props.resourceNamePrefix())
        .retention(RetentionDays.THREE_DAYS)
        .build();

CfnLoggingConfiguration.Builder.create(this, "WafLogging")
        .logDestinationConfigs(List.of(wafLogGroup.getLogGroupArn()))
        .resourceArn(webAcl.getAttrArn())
        .build();
```

CloudTrail data events (targeted):
```java
import software.amazon.awscdk.services.cloudtrail.Trail;

Trail trail = Trail.Builder.create(this, "EdgeTrail")
        .sendToCloudWatchLogs(true)
        .build();

trail.addS3EventSelector(List.of(
        software.amazon.awscdk.services.cloudtrail.S3EventSelector.builder()
            .bucket(originBucket)
            .objectPrefix("") // narrow with a prefix if needed
            .build()),
        software.amazon.awscdk.services.cloudtrail.ReadWriteType.READ_ONLY);
```

**Cost/control tips:**
- Start with 100% sampling; reduce if volume high.
- WAF + CloudFront logs overlap partially; use filters in analysis pipeline.
- Prune CloudTrail data events if all access is via CloudFront (may be unnecessary).

**Summary:**
Use CloudFront real\-time logs (Kinesis) + WAF CloudWatch Logs for rich HTTP telemetry without adding an S3 access log bucket; optionally layer CloudTrail data events or S3 request metrics for audit/aggregate needs.
