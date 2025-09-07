package co.uk.diyaccounting.submit.stacks;

import org.junit.jupiter.api.Test;
import software.amazon.awscdk.App;

import static org.junit.jupiter.api.Assertions.*;

class ApplicationStackTest {

    @Test
    void shouldCreateApplicationStack() {
        App app = new App();

        ApplicationStack stack = ApplicationStack.Builder.create(app, "TestApplicationStack")
                .env("test")
                .hostedZoneName("diyaccounting.co.uk")
                .subDomainName("submit")
                .cloudTrailEnabled("false")
                .xRayEnabled("false")
                .build();

        assertNotNull(stack, "ApplicationStack should be created");
        // Currently ApplicationStack does not expose specific resources; this sanity check ensures builder wiring works.
    }

    @Test
    void shouldBuildCorrectNamingPatterns() {
        String prodDomain = ApplicationStack.Builder.buildDomainName("prod", "submit", "diyaccounting.co.uk");
        assertEquals("submit.diyaccounting.co.uk", prodDomain);

        String devDomain = ApplicationStack.Builder.buildDomainName("dev", "submit", "diyaccounting.co.uk");
        assertEquals("dev.submit.diyaccounting.co.uk", devDomain);

        String dashed = ApplicationStack.Builder.buildDashedDomainName("dev", "submit", "diyaccounting.co.uk");
        assertEquals("dev-submit-diyaccounting-co-uk", dashed);
    }
}
