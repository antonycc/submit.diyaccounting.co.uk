package co.uk.diyaccounting.submit.utils;

import org.junit.jupiter.api.Test;
import software.amazon.awscdk.services.logs.RetentionDays;

import static org.junit.jupiter.api.Assertions.assertEquals;

class RetentionDaysConverterTest {

    @Test
    void mapsSpecificDaysAndDefault() {
        assertEquals(RetentionDays.ONE_DAY, RetentionDaysConverter.daysToRetentionDays(1));
        assertEquals(RetentionDays.THREE_DAYS, RetentionDaysConverter.daysToRetentionDays(3));
        assertEquals(RetentionDays.ONE_WEEK, RetentionDaysConverter.daysToRetentionDays(7));
        assertEquals(RetentionDays.ONE_MONTH, RetentionDaysConverter.daysToRetentionDays(30));
        assertEquals(RetentionDays.SIX_MONTHS, RetentionDaysConverter.daysToRetentionDays(180));
        assertEquals(RetentionDays.ONE_YEAR, RetentionDaysConverter.daysToRetentionDays(365));
        assertEquals(RetentionDays.INFINITE, RetentionDaysConverter.daysToRetentionDays(0));
        // default path
        assertEquals(RetentionDays.ONE_WEEK, RetentionDaysConverter.daysToRetentionDays(42));
    }
}
