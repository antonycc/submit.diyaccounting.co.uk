package co.uk.diyaccounting.submit.functions;

import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.LambdaLogger;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junitpioneer.jupiter.SetEnvironmentVariable;
import org.mockito.ArgumentCaptor;
import org.mockito.Mockito;
import software.amazon.awssdk.awscore.exception.AwsErrorDetails;
import software.amazon.awssdk.services.cloudformation.CloudFormationClient;
import software.amazon.awssdk.services.cloudformation.model.CloudFormationException;
import software.amazon.awssdk.services.cloudformation.model.DeleteStackRequest;
import software.amazon.awssdk.services.cloudformation.model.DescribeStacksRequest;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class SelfDestructHandlerTest {

    private static final ObjectMapper OM = new ObjectMapper();

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
    @SetEnvironmentVariable(key = "ACCOUNT_STACK_NAME", value = "nonexist")
    void alreadyDeleted_stackIsSkipped_noDeletion() {
        CloudFormationClient cfn = Mockito.mock(CloudFormationClient.class);
        // First existence check throws 'does not exist' so deletion is skipped
        doThrow(CloudFormationException.builder()
                        .message("Stack with id nonexist does not exist")
                        .statusCode(400)
                        .build())
                .when(cfn)
                .describeStacks(any(DescribeStacksRequest.class));

        SelfDestructHandler handler = new SelfDestructHandler(cfn);
        Map<String, Object> resp = handler.handleRequest(new HashMap<>(), ctx());

        assertEquals(200, resp.get("statusCode"));
        assertNotNull(resp.get("body"));
        verify(cfn, never()).deleteStack(any(DeleteStackRequest.class));
    }

    @Test
    @SetEnvironmentVariable(key = "ACCOUNT_STACK_NAME", value = "appStack")
    void deletesStackSuccessfully_andWaitsUntilGone() throws Exception {
        CloudFormationClient cfn = Mockito.mock(CloudFormationClient.class);

        // Existence check OK (no throw) then first poll returns ValidationError -> treated as deleted immediately
        when(cfn.describeStacks(any(DescribeStacksRequest.class)))
                .thenReturn(null) // initial existence check
                .thenThrow(CloudFormationException.builder()
                        .awsErrorDetails(AwsErrorDetails.builder()
                                .errorCode("ValidationError")
                                .errorMessage("Stack with id appStack does not exist")
                                .build())
                        .statusCode(400)
                        .build()); // first poll indicates deletion

        SelfDestructHandler handler = new SelfDestructHandler(cfn);
        Map<String, Object> resp = handler.handleRequest(new HashMap<>(), ctx());

        assertEquals(200, resp.get("statusCode"));
        ArgumentCaptor<DeleteStackRequest> captor = ArgumentCaptor.forClass(DeleteStackRequest.class);
        verify(cfn, times(1)).deleteStack(captor.capture());
        assertEquals("appStack", captor.getValue().stackName());

        // Body has message and empty results (no errors)
        String body = (String) resp.get("body");
        assertNotNull(body);
        Map<String, Object> parsed = OM.readValue(body, new TypeReference<>() {});
        assertEquals("Self-destruct sequence completed", parsed.get("message"));
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> results = (List<Map<String, Object>>) parsed.get("results");
        assertNotNull(results);
        assertTrue(results.isEmpty());
    }

    @Test
    @SetEnvironmentVariable(key = "ACCOUNT_STACK_NAME", value = "badStack")
    void errorDuringDeletion_setsErrorResult_andReturns500() throws Exception {
        CloudFormationClient cfn = Mockito.mock(CloudFormationClient.class);

        // Existence check OK
        when(cfn.describeStacks(any(DescribeStacksRequest.class))).thenReturn(null);
        // Deletion throws error
        doThrow(CloudFormationException.builder()
                .message("AccessDenied")
                .statusCode(403)
                .build()).when(cfn).deleteStack(any(DeleteStackRequest.class));

        SelfDestructHandler handler = new SelfDestructHandler(cfn);
        Map<String, Object> resp = handler.handleRequest(new HashMap<>(), ctx());

        assertEquals(500, resp.get("statusCode"));
        ArgumentCaptor<DeleteStackRequest> captor = ArgumentCaptor.forClass(DeleteStackRequest.class);
        verify(cfn, times(1)).deleteStack(captor.capture());
        assertEquals("badStack", captor.getValue().stackName());

        String body = (String) resp.get("body");
        assertNotNull(body);
        Map<String, Object> parsed = OM.readValue(body, new TypeReference<>() {});
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> results = (List<Map<String, Object>>) parsed.get("results");
        assertNotNull(results);
        assertEquals(1, results.size());
        assertEquals("badStack", results.get(0).get("stackName"));
        assertEquals("error", results.get(0).get("status"));
    }
}
