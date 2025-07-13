package com.intention.web;

import java.util.AbstractMap;
import java.util.Collections;
import java.util.List;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

public class ResourceNameUtils {

    private static final List<AbstractMap.SimpleEntry<Pattern, String>> dashSeparatedMappings = List.of(
            new AbstractMap.SimpleEntry<>(Pattern.compile("\\."), "-")
    );

    public static String convertCamelCaseToDashSeparated(String input) {
        if (input == null || input.isEmpty()) {
            return input;
        } else {
            String result = input.chars()
                    .mapToObj(c -> Character.isUpperCase(c)
                            ? "-" + Character.toLowerCase((char) c)
                            : String.valueOf((char) c))
                    .collect(Collectors.joining());
            return result.startsWith("-") ? result.substring(1) : result;
        }
    }

    public static String convertDashSeparatedToDotSeparated(String input) {
        return convertDashSeparatedToDotSeparated(input, Collections.emptyList());
    }

    public static String convertDashSeparatedToDotSeparated(String input, List<AbstractMap.SimpleEntry<Pattern, String>> mappings) {
        return applyMappings(applyMappings(input, mappings), dashSeparatedMappings);
    }

    public static String applyMappings(String input, List<AbstractMap.SimpleEntry<Pattern, String>> mappings)  {
        String result = input;
        for (AbstractMap.SimpleEntry<Pattern, String> mapping : mappings) {
            result = mapping.getKey().matcher(result).replaceAll(mapping.getValue());
        }
        return result;
    };
}