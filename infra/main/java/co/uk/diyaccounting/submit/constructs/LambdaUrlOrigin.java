package co.uk.diyaccounting.submit.constructs;

import static co.uk.diyaccounting.submit.utils.Kind.infof;

import java.util.List;
import software.amazon.awscdk.services.ecr.IRepository;
import software.amazon.awscdk.services.ecr.Repository;
import software.amazon.awscdk.services.ecr.RepositoryAttributes;
import software.amazon.awscdk.services.lambda.DockerImageCode;
import software.amazon.awscdk.services.lambda.DockerImageFunction;
import software.amazon.awscdk.services.lambda.EcrImageCodeProps;
import software.amazon.awscdk.services.lambda.Function;
import software.amazon.awscdk.services.lambda.Tracing;
import software.amazon.awscdk.services.logs.LogGroup;
import software.amazon.awscdk.services.logs.LogGroupProps;
import software.constructs.Construct;

public class LambdaUrlOrigin {

    // private static final Pattern LAMBDA_URL_HOST_PATTERN = Pattern.compile("https://([^/]+)/");

    public final DockerImageCode dockerImage;
    public final Function lambda;
    public final LogGroup logGroup;

    public LambdaUrlOrigin(final Construct scope, LambdaUrlOriginProps props) {

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
        infof("Created Lambda %s with function %s", this.lambda.getNode().getId(), this.lambda.toString());

        // Create log group for the lambda
        this.logGroup = new LogGroup(
                scope,
                props.idPrefix() + "LogGroup",
                LogGroupProps.builder()
                        .logGroupName("/aws/lambda/" + this.lambda.getFunctionName())
                        .retention(props.logGroupRetention())
                        .removalPolicy(props.logGroupRemovalPolicy())
                        .build());
        infof("Created log group %s with retention %s", this.logGroup.getNode().getId(), props.logGroupRetention());
    }
}
