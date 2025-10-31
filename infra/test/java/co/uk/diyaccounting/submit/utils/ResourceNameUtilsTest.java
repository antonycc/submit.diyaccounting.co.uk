package co.uk.diyaccounting.submit.utils;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import org.junit.jupiter.api.Test;

class ResourceNameUtilsTest {

    //    @Test
    //    void compressedAndRegularPrefixesAndTruncation() {
    //        assertEquals("oidc-e-c-dev", ResourceNameUtils.generateCompressedResourceNamePrefix("oidc.example.com",
    // "dev"));
    //        assertEquals(
    //                "l-a-s-e-c-prod",
    //                ResourceNameUtils.generateCompressedResourceNamePrefix("login.auth.service.example.com", "prod"));
    //
    //        // Truncation to 16 chars (including '-')
    //        String longDomain = "really.long.domain.name.example.com";
    //        String pref = ResourceNameUtils.generateCompressedResourceNamePrefix(longDomain, "ci-build-123");
    //        assertTrue(pref.length() <= 16);
    //
    //        assertEquals("oidc-example-com-dev", ResourceNameUtils.generateResourceNamePrefix("oidc.example.com",
    // "dev"));
    //    }

    @Test
    void camelCaseAndDotConversions() {
        assertEquals("my-func-name", ResourceNameUtils.convertCamelCaseToDashSeparated("MyFuncName"));
        assertEquals("my-name", ResourceNameUtils.convertCamelCaseToDashSeparated("myName"));
        assertEquals("my-func", ResourceNameUtils.convertCamelCaseToDashSeparated("my_func.handler"));

        assertEquals("a-b-c", ResourceNameUtils.convertDotSeparatedToDashSeparated("a.b.c"));
        // With custom mapping applied twice
        var mappings = List.of(new java.util.AbstractMap.SimpleEntry<>(java.util.regex.Pattern.compile("b"), "bee"));
        assertEquals("a-bee-c", ResourceNameUtils.convertDotSeparatedToDashSeparated("a.b.c", mappings));
    }

    @Test
    void iamCompatibleAndOtherNames() {
        String name = ResourceNameUtils.generateIamCompatibleName("my@prefix#bad", "role$name");
        assertTrue(name.matches("[A-Za-z0-9+=,.@-]+"));
        assertTrue(name.length() <= 64);
        assertTrue(name.contains("my@prefix-"));
    }
}
