package co.uk.diyaccounting.submit.utils;

import java.util.AbstractMap;
import java.util.Collections;
import java.util.List;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

public class ResourceNameUtils {

    private static final List<AbstractMap.SimpleEntry<Pattern, String>> dashSeparatedMappings =
            List.of(new AbstractMap.SimpleEntry<>(Pattern.compile("\\."), "-"));

    public static String convertCamelCaseToDashSeparated(String input) {
        if (input == null || input.isEmpty()) {
            return input;
        } else {
            String result = input.chars()
                    .mapToObj(c ->
                            Character.isUpperCase(c) ? "-" + Character.toLowerCase((char) c) : String.valueOf((char) c))
                    .collect(Collectors.joining())
                    .replaceAll("[-. _]+", "-")
                    .replaceAll("-http", "")
                    .replaceAll("-handler", "");
            return result.startsWith("-") ? result.substring(1) : result;
        }
    }

    public static String convertDotSeparatedToDashSeparated(String input) {
        return convertDotSeparatedToDashSeparated(input, Collections.emptyList());
    }

    public static String convertDotSeparatedToDashSeparated(
            String input, List<AbstractMap.SimpleEntry<Pattern, String>> mappings) {
        return applyMappings(applyMappings(input, mappings), dashSeparatedMappings);
    }

    /**
     * Generate AWS IAM-compatible resource names by replacing invalid characters.
     * AWS IAM role names can only contain: alphanumeric characters, plus (+), equals (=),
     * comma (,), period (.), at (@), and hyphen (-).
     * Length must be between 1 and 64 characters.
     *
     * @param resourceNamePrefix base resource name prefix
     * @param suffix additional suffix for the resource name
     * @return IAM-compatible resource name, truncated to 64 characters if needed
     */
    public static String generateIamCompatibleName(String resourceNamePrefix, String suffix) {
        if (resourceNamePrefix == null || resourceNamePrefix.isBlank()) {
            throw new IllegalArgumentException("resourceNamePrefix must be non-empty");
        }
        if (suffix == null || suffix.isBlank()) {
            throw new IllegalArgumentException("suffix must be non-empty");
        }

        // Replace any invalid characters with dashes and normalize
        String cleanPrefix = resourceNamePrefix
            .replaceAll("[^a-zA-Z0-9+=,.@-]", "-")
            .replaceAll("-+", "-") // Collapse multiple dashes
            .replaceAll("^-+|-+$", ""); // Remove leading/trailing dashes

        String cleanSuffix = suffix.replaceAll("[^a-zA-Z0-9+=,.@-]", "-")
            .replaceAll("-+", "-")
            .replaceAll("^-+|-+$", "");

        String fullName = cleanPrefix + "-" + cleanSuffix;

        // Truncate to 64 characters if needed
        if (fullName.length() > 64) {
            fullName = fullName.substring(0, 64);
            // Ensure we don't end with a dash after truncation
            fullName = fullName.replaceAll("-+$", "");
        }

        return fullName;
    }

    public static String applyMappings(String input, List<AbstractMap.SimpleEntry<Pattern, String>> mappings) {
        String result = input;
        for (AbstractMap.SimpleEntry<Pattern, String> mapping : mappings) {
            result = mapping.getKey().matcher(result).replaceAll(mapping.getValue());
        }
        return result;
    }
    ;
}
