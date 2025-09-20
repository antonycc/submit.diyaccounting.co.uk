package co.uk.diyaccounting.submit.constructs;

import java.util.List;
import java.util.Map;
import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;
import software.amazon.awscdk.Duration;
import software.amazon.awscdk.RemovalPolicy;
import software.amazon.awscdk.services.cloudfront.AllowedMethods;
import software.amazon.awscdk.services.cloudfront.CachePolicy;
import software.amazon.awscdk.services.cloudfront.ICachePolicy;
import software.amazon.awscdk.services.cloudfront.IOriginRequestPolicy;
import software.amazon.awscdk.services.cloudfront.IResponseHeadersPolicy;
import software.amazon.awscdk.services.cloudfront.OriginProtocolPolicy;
import software.amazon.awscdk.services.cloudfront.OriginRequestPolicy;
import software.amazon.awscdk.services.cloudfront.ResponseHeadersPolicy;
import software.amazon.awscdk.services.cloudfront.ViewerProtocolPolicy;
import software.amazon.awscdk.services.ecr.IRepository;
import software.amazon.awscdk.services.ecr.Repository;
import software.amazon.awscdk.services.ecr.RepositoryAttributes;
import software.amazon.awscdk.services.lambda.DockerImageCode;
import software.amazon.awscdk.services.lambda.DockerImageFunction;
import software.amazon.awscdk.services.lambda.EcrImageCodeProps;
import software.amazon.awscdk.services.lambda.Function;
import software.amazon.awscdk.services.lambda.FunctionUrlAuthType;
import software.amazon.awscdk.services.lambda.InvokeMode;
import software.amazon.awscdk.services.lambda.Runtime;
import software.amazon.awscdk.services.lambda.Tracing;
import software.amazon.awscdk.services.logs.LogGroup;
import software.amazon.awscdk.services.logs.LogGroupProps;
import software.amazon.awscdk.services.logs.RetentionDays;
import software.constructs.Construct;

public class LambdaUrlOrigin {

    private static final Logger logger = LogManager.getLogger(LambdaUrlOrigin.class);
    // private static final Pattern LAMBDA_URL_HOST_PATTERN = Pattern.compile("https://([^/]+)/");

    public final DockerImageCode dockerImage;
    public final Function lambda;
    public final LogGroup logGroup;
    // public final FunctionUrl functionUrl;
    // public final BehaviorOptions behaviorOptions;
    // public final HttpOrigin apiOrigin;
    // public final String lambdaUrlHost;

    private LambdaUrlOrigin(final Construct scope, String id, LambdaUrlOriginProps props) {

        // Create the lambda function
        var imageCodeProps = EcrImageCodeProps.builder()
                .tagOrDigest(props.baseImageTag()) // e.g. "latest" or specific digest for immutability
                .cmd(List.of(props.handler()))
                .build();
        var repositoryAttributes = RepositoryAttributes.builder()
                .repositoryArn(props.ecrRepositoryArn())
                .repositoryName(props.ecrRepositoryName())
                .build();
        IRepository repository =
                Repository.fromRepositoryAttributes(scope, props.functionName() + "-EcrRepo", repositoryAttributes);
        this.dockerImage = DockerImageCode.fromEcr(repository, imageCodeProps);

        // Add X-Ray environment variables if enabled
        var environment = new java.util.HashMap<>(props.environment());
        if (props.xRayEnabled()) {
            environment.put("AWS_XRAY_TRACING_NAME", props.functionName());
        }

        var dockerFunctionBuilder = DockerImageFunction.Builder.create(scope, props.idPrefix() + "Fn")
                .code(this.dockerImage)
                .environment(environment)
                .functionName(props.functionName())
                .timeout(props.timeout());
        if (props.xRayEnabled()) {
            dockerFunctionBuilder.tracing(Tracing.ACTIVE);
        }

        this.lambda = dockerFunctionBuilder.build();

        // Create log group for the lambda
        this.logGroup = new LogGroup(
                scope,
                props.idPrefix() + "LogGroup",
                LogGroupProps.builder()
                        .logGroupName("/aws/lambda/" + this.lambda.getFunctionName())
                        .retention(props.logGroupRetention())
                        .removalPolicy(props.logGroupRemovalPolicy())
                        .build());

        // Create function URL
        // FunctionUrlOptions.Builder functionUrlOptionsBuilder = FunctionUrlOptions.builder()
        //        .authType(props.functionUrlAuthType())
        //        .invokeMode(props.invokeMode());

        // this.functionUrl = this.lambda.addFunctionUrl(functionUrlOptionsBuilder.build());

        // this.lambdaUrlHost = getLambdaUrlHostToken(this.functionUrl);
        // this.apiOrigin = HttpOrigin.Builder.create(this.lambdaUrlHost)
        //        .protocolPolicy(props.protocolPolicy())
        //        .build();

        // BehaviorOptions.Builder behaviorOptionsBuilder = BehaviorOptions.builder()
        //        .origin(this.apiOrigin)
        //        .allowedMethods(props.cloudFrontAllowedMethods())
        //        .cachePolicy(props.cachePolicy())
        //        .originRequestPolicy(props.originRequestPolicy())
        //        .viewerProtocolPolicy(props.viewerProtocolPolicy());

        // if (props.responseHeadersPolicy() != null) {
        //    behaviorOptionsBuilder.responseHeadersPolicy(props.responseHeadersPolicy());
        // }

        // this.behaviorOptions = behaviorOptionsBuilder.build();

        logger.info("Created LambdaUrlOrigin with function: {}", this.lambda.getFunctionName());
    }

    // private String getLambdaUrlHostToken(FunctionUrl functionUrl) {
    //    String urlHostToken = Fn.select(2, Fn.split("/", functionUrl.getUrl()));
    //    return urlHostToken;
    // }


    public static LambdaUrlOrigin create(Construct scope, String id, LambdaUrlOriginProps props) {
        return new LambdaUrlOrigin(scope, id, props);
    }
}
