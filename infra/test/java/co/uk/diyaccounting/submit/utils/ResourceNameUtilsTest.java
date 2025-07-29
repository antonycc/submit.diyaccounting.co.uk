package co.uk.diyaccounting.submit.utils;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

public class ResourceNameUtilsTest {

    @Test
    public void testConvertCamelCaseToDashSeparated() {
        String input = "thisIsCamelCase";
        String expected = "this-is-camel-case";
        String actual = ResourceNameUtils.convertCamelCaseToDashSeparated(input);
        assertEquals(expected, actual);
    }

    @Test
    public void testConvertTitleCamelCaseToDashSeparated() {
        String input = "ThisIsTitleCamelCase";
        String expected = "this-is-title-camel-case";
        String actual = ResourceNameUtils.convertCamelCaseToDashSeparated(input);
        assertEquals(expected, actual);
    }

    @Test
    public void testConvertCamelCaseToDashSeparatedWithEmptyString() {
        String input = "";
        String expected = "";
        String actual = ResourceNameUtils.convertCamelCaseToDashSeparated(input);
        assertEquals(expected, actual);
    }

    @Test
    public void testConvertDashSeparatedToDotSeparated() {
        String input = "this.is.a.test";
        String expected = "this-is-a-test";
        String actual = ResourceNameUtils.convertDashSeparatedToDotSeparated(input);
        assertEquals(expected, actual);
    }

    @Test
    public void testConvertDashSeparatedToDotSeparatedWithEmptyString() {
        String input = "";
        String expected = "";
        String actual = ResourceNameUtils.convertDashSeparatedToDotSeparated(input);
        assertEquals(expected, actual);
    }
}