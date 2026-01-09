/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * Copyright (C) 2025-2026 DIY Accounting Ltd
 */

package co.uk.diyaccounting.submit.utils;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import org.junit.jupiter.api.Test;

class ResourceNameUtilsTest {

    @Test
    void camelCaseAndDotConversions() {
        assertEquals("my-func-name", ResourceNameUtils.convertCamelCaseToDashSeparated("MyFuncName"));
        assertEquals("my-name", ResourceNameUtils.convertCamelCaseToDashSeparated("myName"));
        assertEquals("my-func", ResourceNameUtils.convertCamelCaseToDashSeparated("my_func.ingestHandler"));
        assertEquals("my-func", ResourceNameUtils.convertCamelCaseToDashSeparated("my_func.workerHandler"));

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
