package co.uk.diyaccounting.submit.utils;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ResourceNameUtilsTest {

    @Test
    void buildDomainNames() {
        assertEquals("app.example.com", ResourceNameUtils.buildPrimaryDomainName("app", "example.com"));
        assertEquals("dev.app.example.com", ResourceNameUtils.buildVersionedDomainName("dev", "app", "example.com"));
        assertEquals(
                "dev-app-example-com",
                ResourceNameUtils.buildDashedDomainName(
                        ResourceNameUtils.buildVersionedDomainName("dev", "app", "example.com")));
        assertEquals("app.example.com", ResourceNameUtils.buildEnvironmentDomainName("prod", "app", "example.com"));
        assertEquals("dev.app.example.com", ResourceNameUtils.buildVersionedDomainName("dev", "app", "example.com"));
    }

    @Test
    void compressedAndRegularPrefixesAndTruncation() {
        assertEquals("oidc-e-c-dev", ResourceNameUtils.generateCompressedResourceNamePrefix("oidc.example.com", "dev"));
        assertEquals(
                "l-a-s-e-c-prod",
                ResourceNameUtils.generateCompressedResourceNamePrefix("login.auth.service.example.com", "prod"));

        // Truncation to 16 chars (including '-')
        String longDomain = "really.long.domain.name.example.com";
        String pref = ResourceNameUtils.generateCompressedResourceNamePrefix(longDomain, "ci-build-123");
        assertTrue(pref.length() <= 16);

        assertEquals("oidc-example-com-dev", ResourceNameUtils.generateResourceNamePrefix("oidc.example.com", "dev"));
    }

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

        assertEquals("dashed-cloud-trail", ResourceNameUtils.buildTrailName("dashed"));
        assertEquals("dashed-ecr", ResourceNameUtils.buildEcrRepositoryName("dashed"));
        assertEquals("/aws/ecr/dashed", ResourceNameUtils.buildEcrLogGroupName("dashed"));
        assertEquals("dashed-ecr-publish-role", ResourceNameUtils.buildEcrPublishRoleName("dashed"));

        assertEquals("dashed-func-name", ResourceNameUtils.buildFunctionName("dashed", "FuncName"));
        assertThrows(IllegalArgumentException.class, () -> ResourceNameUtils.buildFunctionName("dashed", " "));
    }

    @Test
    void cognitoDomains() {
        assertEquals("cog.app.example.com", ResourceNameUtils.buildCognitoDomainName("cog", "app", "example.com"));
        assertEquals(
                "dev.cog.app.example.com", ResourceNameUtils.buildCognitoDomainName("dev", "cog", "app.example.com"));
        assertEquals("https://login.example.com", ResourceNameUtils.buildCognitoBaseUri("login.example.com"));
        assertEquals("cog-app-example-com", ResourceNameUtils.buildDashedCognitoDomainName("cog.app.example.com"));

        assertThrows(IllegalArgumentException.class, () -> ResourceNameUtils.buildCognitoDomainName(null, "c", "d"));
        assertThrows(IllegalArgumentException.class, () -> ResourceNameUtils.buildCognitoDomainName("dev", "", "d"));
        assertThrows(IllegalArgumentException.class, () -> ResourceNameUtils.buildCognitoDomainName("dev", "c", ""));
        assertEquals(
                "dev.cog.app.example.com", ResourceNameUtils.buildCognitoDomainName("dev", "cog", "app.example.com"));
        assertEquals("cog.app.example.com", ResourceNameUtils.buildCognitoDomainName("prod", "cog", "app.example.com"));
    }
}
