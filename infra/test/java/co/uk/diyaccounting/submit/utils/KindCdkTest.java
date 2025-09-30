package co.uk.diyaccounting.submit.utils;

import static org.junit.jupiter.api.Assertions.*;

import java.util.Map;
import org.junit.jupiter.api.Test;
import software.amazon.awscdk.App;
import software.amazon.awscdk.AppProps;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.assertions.Template;

class KindCdkTest {

    @Test
    void cfnOutputBuildsAndGetContextValueStringReadsContext() {
        App app = new App(
                AppProps.builder().context(Map.of("testKey", "testValue")).build());
        Stack stack = new Stack(app, "TestStack");

        var out = KindCdk.cfnOutput(stack, "Out1", "");
        assertNotNull(out);
        assertEquals("", out.getValue());

        String v = KindCdk.getContextValueString(stack, "testKey", "default");
        assertEquals("testValue", v);

        // Also ensure Template can synth without errors
        Template.fromStack(stack);
    }
}
