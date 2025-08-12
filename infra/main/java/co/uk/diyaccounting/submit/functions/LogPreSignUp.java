package co.uk.diyaccounting.submit.functions;

import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.RequestHandler;
import com.amazonaws.services.lambda.runtime.events.CognitoUserPoolPreSignUpEvent;

public class LogPreSignUp implements RequestHandler<CognitoUserPoolPreSignUpEvent, CognitoUserPoolPreSignUpEvent> {
    @Override
    public CognitoUserPoolPreSignUpEvent handleRequest(CognitoUserPoolPreSignUpEvent event, Context context) {
        context.getLogger().log("[Cognito] PreSignUp: " + (event != null ? event.toString() : "null") + "\n");
        return event;
    }
}
