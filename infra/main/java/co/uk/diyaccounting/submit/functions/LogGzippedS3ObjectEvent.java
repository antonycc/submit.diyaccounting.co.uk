package co.uk.diyaccounting.submit.functions;

import co.uk.diyaccounting.submit.awssdk.S3;
import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.RequestHandler;
import com.amazonaws.services.lambda.runtime.events.S3Event;

import java.util.Arrays;

public class LogGzippedS3ObjectEvent implements RequestHandler<S3Event, Void> {

    public S3 s3 = new S3();

    @Override
    public Void handleRequest(S3Event s3event, Context context) {
        s3event.getRecords().forEach( record -> {
            var content = s3.getZippedObjectContentAsString(record.getS3());
            Arrays.stream(content.split("\n")).forEach(line -> {
                context.getLogger().log(line);
            });
        });
        return null;
    }
}
