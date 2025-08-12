package co.uk.diyaccounting.submit.functions;

import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.RequestHandler;
import com.amazonaws.services.lambda.runtime.events.CognitoUserPoolPreTokenGenerationEvent;

public class LogPreTokenGeneration implements RequestHandler<CognitoUserPoolPreTokenGenerationEvent, CognitoUserPoolPreTokenGenerationEvent> {
    @Override
    public CognitoUserPoolPreTokenGenerationEvent handleRequest(CognitoUserPoolPreTokenGenerationEvent event, Context context) {
        context.getLogger().log("[Cognito] PreTokenGeneration: " + (event != null ? event.toString() : "null") + "\n");
        return event;
    }
}
