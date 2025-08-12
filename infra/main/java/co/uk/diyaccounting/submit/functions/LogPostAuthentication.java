package co.uk.diyaccounting.submit.functions;

import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.RequestHandler;
import com.amazonaws.services.lambda.runtime.events.CognitoUserPoolPostAuthenticationEvent;

public class LogPostAuthentication implements RequestHandler<CognitoUserPoolPostAuthenticationEvent, CognitoUserPoolPostAuthenticationEvent> {
    @Override
    public CognitoUserPoolPostAuthenticationEvent handleRequest(CognitoUserPoolPostAuthenticationEvent event, Context context) {
        context.getLogger().log("[Cognito] PostAuthentication: " + (event != null ? event.toString() : "null") + "\n");
        return event;
    }
}
