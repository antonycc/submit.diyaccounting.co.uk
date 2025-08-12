package co.uk.diyaccounting.submit.functions;

import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.RequestHandler;
import com.amazonaws.services.lambda.runtime.events.CognitoUserPoolPreAuthenticationEvent;

public class LogPreAuthentication implements RequestHandler<CognitoUserPoolPreAuthenticationEvent, CognitoUserPoolPreAuthenticationEvent> {
    @Override
    public CognitoUserPoolPreAuthenticationEvent handleRequest(CognitoUserPoolPreAuthenticationEvent event, Context context) {
        context.getLogger().log("[Cognito] PreAuthentication: " + (event != null ? event.toString() : "null") + "\n");
        return event;
    }
}
