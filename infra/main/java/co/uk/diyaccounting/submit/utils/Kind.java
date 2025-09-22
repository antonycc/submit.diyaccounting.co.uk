package co.uk.diyaccounting.submit.utils;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.function.BiFunction;

public final class Kind {
    private Kind() {}

    // Strict, typed, null-tolerant. b,c,... overwrite a on clashes.
    @SafeVarargs
    public static <K, V> Map<K, V> concat(Map<? extends K, ? extends V>... maps) {
        var out = new LinkedHashMap<K, V>();
        if (maps == null) return out;
        for (var m : maps) {
            if (m == null) continue;
            out.putAll(m); // last one wins
        }
        return out;
    }

    // Typed with an explicit conflict policy (e.g. keep-old, keep-new, combine).
    @SafeVarargs
    public static <K, V> Map<K, V> concatWith(
            BiFunction<? super V, ? super V, ? extends V> combiner, Map<? extends K, ? extends V>... maps) {
        var out = new LinkedHashMap<K, V>();
        if (maps == null) return out;
        for (var m : maps) {
            if (m == null) continue;
            m.forEach((k, v) -> out.merge(k, v, (oldV, newV) -> combiner.apply(oldV, newV)));
        }
        return out;
    }

    // Extra-loose: stringifies keys and accepts any value type. Null maps ignored.
    // Useful when "nodeifying" config blobs.
    public static Map<String, Object> concatLoose(Map<?, ?>... maps) {
        var out = new LinkedHashMap<String, Object>();
        if (maps == null) return out;
        for (var m : maps) {
            if (m == null) continue;
            m.forEach((k, v) -> out.put(String.valueOf(k), v));
        }
        return out;
    }

    // Convenience: first non-null map, else empty.
    public static <K, V> Map<K, V> orEmpty(Map<K, V> m) {
        return m == null ? Map.of() : m;
    }

    // Convenience: immutable snapshot of concat(...)
    @SafeVarargs
    public static <K, V> Map<K, V> concatImmutable(Map<? extends K, ? extends V>... maps) {
        return Map.copyOf(concat(maps));
    }

    // Tiny “object literal”: Kind.obj("k1", v1, "k2", v2, ...)
    public static Map<String, Object> obj(Object... kv) {
        if (kv.length % 2 != 0) throw new IllegalArgumentException("odd arg count");
        var out = new LinkedHashMap<String, Object>();
        for (int i = 0; i < kv.length; i += 2) {
            out.put(Objects.toString(kv[i]), kv[i + 1]);
        }
        return out;
    }

    public static void logf(String fmt, Object... args) {
        System.out.printf(fmt + "%n", args);
    }

    public static void infof(String fmt, Object... args) {
        logf("[INFO] " + fmt, args);
    }

    public static void warnf(String fmt, Object... args) {
        logf("[WARN] " + fmt, args);
    }

    public static void errorf(String fmt, Object... args) {
        logf("[ERROR] " + fmt, args);
    }

    // Safe putIfNotNull
    public static <K, V> void putIfNotNull(Map<K, V> map, K key, V value) {
        if (value != null) {
            map.put(key, value);
            infof("Put key %s with value %s", key, value);
        } else {
            infof("Did not put key %s with null/empty value %s", key, value);
        }
    }

    public static <K, V> void putIfPresent(Map<K, V> map, K key, Optional<? extends V> value) {
        if (value != null && value.isPresent()) {
            map.put(key, value.get());
            infof("Put key %s with value %s", key, value.get());
        } else {
            infof("Did not put key %s with null/empty value %s", key, value.get());
        }
    }

    public static String envOr(String environmentVariable, String alternativeValue) {
        return envOr(environmentVariable, alternativeValue, "");
    }

    public static String envOr(String environmentVariable, String alternativeValue, String alternativeSource) {
        String environmentValue = System.getenv(environmentVariable);
        if (environmentValue != null && !environmentValue.isBlank()) {
            infof("Using environment variable %s for value %s", environmentVariable, environmentValue);
            return environmentValue;
        } else {
            var sourceLabel = alternativeSource == null ? "" : " " + alternativeSource;
            infof(
                    "Using environment variable %s is null or blank using alternative%s, value %s",
                    environmentVariable, sourceLabel, environmentValue);
            return alternativeValue;
        }
    }
}
