package co.uk.diyaccounting.submit.utils;

import org.junit.jupiter.api.Test;
import org.junitpioneer.jupiter.SetEnvironmentVariable;

import java.util.*;

import static org.junit.jupiter.api.Assertions.*;

class KindTest {

    @Test
    void concatVariants() {
        Map<String, Integer> a = new LinkedHashMap<>(Map.of("a", 1, "b", 2));
        Map<String, Integer> b = new LinkedHashMap<>(Map.of("b", 3, "c", 4));
        Map<String, Integer> out = Kind.concat(a, b);
        assertEquals(Map.of("a", 1, "b", 3, "c", 4), out);

        Map<String, Integer> outWith = Kind.concatWith(Integer::sum, a, b);
        assertEquals(Map.of("a", 1, "b", 5, "c", 4), outWith);

        Map<String, Object> loose = Kind.concatLoose(Map.of("x", 1), Map.of(2, "two"));
        assertEquals(2, loose.size());
        assertEquals("two", loose.get("2"));
    }

    @Test
    void orEmptyAndObj() {
        assertEquals(Map.of(), Kind.orEmpty(null));
        assertEquals(Map.of("k1", 1, "k2", "v2"), Kind.obj("k1", 1, "k2", "v2"));
        assertThrows(IllegalArgumentException.class, () -> Kind.obj("k1", 1, "k2"));
    }

    @Test
    void putIf() {
        Map<String, String> m = new HashMap<>();
        Kind.putIfNotNull(m, "a", null);
        assertFalse(m.containsKey("a"));
        Kind.putIfNotNull(m, "a", "v");
        assertEquals("v", m.get("a"));

        Kind.putIfPresent(m, "b", Optional.empty());
        assertFalse(m.containsKey("b"));
        Kind.putIfPresent(m, "b", Optional.of("w"));
        assertEquals("w", m.get("b"));
    }

    @Test
    @SetEnvironmentVariable(key = "TEST_ENV", value = "env-value")
    void envOrPicksEnvOrDefault() {
        assertEquals("env-value", Kind.envOr("TEST_ENV", "alt"));
        assertEquals("alt", Kind.envOr("MISSING_ENV", "alt", "(default)"));
    }
}
