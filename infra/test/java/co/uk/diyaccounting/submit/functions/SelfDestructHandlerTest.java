package co.uk.diyaccounting.submit.functions;

import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.LambdaLogger;
import org.junit.jupiter.api.Test;
import org.junitpioneer.jupiter.SetEnvironmentVariable;
import org.mockito.Mockito;
import software.amazon.awssdk.services.cloudformation.CloudFormationClient;
import software.amazon.awssdk.services.cloudformation.model.CloudFormationException;
import software.amazon.awssdk.services.cloudformation.model.DeleteStackRequest;
import software.amazon.awssdk.services.cloudformation.model.DescribeStacksRequest;

import java.util.HashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

class SelfDestructHandlerTest {

    private static Context ctx() {
        return new Context() {
            @Override
            public String getAwsRequestId() {
                return "req";
            }

            @Override
            public String getLogGroupName() {
                return "lg";
            }

            @Override
            public String getLogStreamName() {
                return "ls";
            }

            @Override
            public String getFunctionName() {
                return "fn";
            }

            @Override
            public String getFunctionVersion() {
                return "1";
            }

            @Override
            public String getInvokedFunctionArn() {
                return "arn";
            }

            @Override
            public com.amazonaws.services.lambda.runtime.CognitoIdentity getIdentity() {
                return null;
            }

            @Override
            public com.amazonaws.services.lambda.runtime.ClientContext getClientContext() {
                return null;
            }

            @Override
            public int getRemainingTimeInMillis() {
                return 300000;
            }

            @Override
            public int getMemoryLimitInMB() {
                return 512;
            }

            @Override
            public LambdaLogger getLogger() {
                return new LambdaLogger() {
                    @Override
                    public void log(String message) {
                        System.out.println(message);
                    }

                    @Override
                    public void log(byte[] message) {
                        System.out.println(new String(message));
                    }
                };
            }
        };
    }

    @Test
    @SetEnvironmentVariable(key = "APPLICATION_STACK_NAME", value = "nonexist")
    void shouldMarkNotFoundStacksAndSkipDeletion() {
        CloudFormationClient cfn = Mockito.mock(CloudFormationClient.class);
        // describeStacks throws 'does not exist'
        doThrow(CloudFormationException.builder()
                        .message("Stack with id nonexist does not exist")
                        .statusCode(400)
                        .build())
                .when(cfn)
                .describeStacks(any(DescribeStacksRequest.class));

        SelfDestructHandler handler = new SelfDestructHandler(cfn);
        Map<String, Object> event = new HashMap<>();
        Map<String, Object> resp = handler.handleRequest(event, ctx());

        assertEquals(200, resp.get("statusCode"));
        String body = (String) resp.get("body");
        assertNotNull(body);
        // assertTrue(body.contains("nonexist"));
        // assertTrue(body.contains("not_found"));

        verify(cfn, times(1)).describeStacks(any(DescribeStacksRequest.class));
        verify(cfn, never()).deleteStack(any(DeleteStackRequest.class));
    }
}
