package co.uk.diyaccounting.submit.swagger;

import static org.junit.jupiter.api.Assertions.*;

import co.uk.diyaccounting.submit.SubmitSharedNames;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Set;
import org.junit.jupiter.api.Test;

public class OpenApiGeneratorTest {

    @Test
    void generatedSpec_contains_key_hmrc_endpoints() throws IOException {
        ObjectMapper mapper = new ObjectMapper();

        Path tempDir = Files.createTempDirectory("openapi-test");
        OpenApiGeneratorTestHelper.generate("https://example.test/", "0.0.0-test", tempDir.toString());

        File jsonFile = tempDir.resolve("openapi.json").toFile();
        assertTrue(jsonFile.exists(), "openapi.json should exist");

        JsonNode root = mapper.readTree(jsonFile);
        JsonNode paths = root.path("paths");
        assertTrue(paths.isObject(), "paths should be an object");

        // Verify VAT endpoints
        assertTrue(paths.has("/hmrc/vat/return"), "Should have /hmrc/vat/return path");
        JsonNode vatReturnPath = paths.path("/hmrc/vat/return");
        assertTrue(vatReturnPath.has("get"), "Should have GET /hmrc/vat/return");
        assertTrue(vatReturnPath.has("post"), "Should have POST /hmrc/vat/return");

        assertTrue(paths.has("/hmrc/vat/obligation"), "Should have /hmrc/vat/obligation path");
        assertTrue(paths.path("/hmrc/vat/obligation").has("get"));

        assertTrue(paths.has("/hmrc/vat/liability"), "Should have /hmrc/vat/liability path");
        assertTrue(paths.path("/hmrc/vat/liability").has("get"));

        assertTrue(paths.has("/hmrc/vat/payments"), "Should have /hmrc/vat/payments path");
        assertTrue(paths.path("/hmrc/vat/payments").has("get"));

        assertTrue(paths.has("/hmrc/vat/penalty"), "Should have /hmrc/vat/penalty path");
        assertTrue(paths.path("/hmrc/vat/penalty").has("get"));

        // Check parameters for GET VAT return
        JsonNode getVatReturn = vatReturnPath.path("get");
        JsonNode parameters = getVatReturn.path("parameters");
        assertTrue(parameters.isArray(), "GET /hmrc/vat/return should have parameters array");

        Set<String> paramNames = new java.util.HashSet<>();
        for (JsonNode p : parameters) {
            paramNames.add(p.path("name").asText());
        }
        assertTrue(paramNames.contains("vrn"), "GET /hmrc/vat/return should document 'vrn' parameter");
        assertTrue(paramNames.contains("periodKey"), "GET /hmrc/vat/return should document 'periodKey' parameter");
    }
}

class OpenApiGeneratorTestHelper {
    static void generate(String baseUrl, String version, String outputDir) throws IOException {
        // Call the same logic as the exec-maven-plugin would use
        OpenApiGenerator.main(new String[] { baseUrl, version, outputDir });
    }
}
