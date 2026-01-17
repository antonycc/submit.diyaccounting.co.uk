// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/lib/dateUtils.js
// Shared date utilities for TTL calculations and timestamp handling

/**
 * Calculate a DynamoDB TTL (Unix epoch seconds) and ISO datestamp
 * @param {Date} baseDate - The date to calculate from
 * @param {Object} offset - Time offset configuration
 * @param {number} [offset.months] - Number of months to add
 * @param {number} [offset.days] - Number of days to add
 * @param {number} [offset.hours] - Number of hours to add
 * @returns {{ttl: number, ttl_datestamp: string}} TTL as Unix epoch seconds and ISO datestamp
 */
export function calculateTtl(baseDate, offset = {}) {
  const ttlDate = new Date(baseDate.getTime());

  if (offset.months) {
    ttlDate.setMonth(ttlDate.getMonth() + offset.months);
  }
  if (offset.days) {
    ttlDate.setDate(ttlDate.getDate() + offset.days);
  }
  if (offset.hours) {
    ttlDate.setHours(ttlDate.getHours() + offset.hours);
  }

  return {
    ttl: Math.floor(ttlDate.getTime() / 1000),
    ttl_datestamp: ttlDate.toISOString(),
  };
}

// Common TTL presets for different record types
export const TTL_PRESETS = {
  // HMRC requires tax records to be kept for 7 years (approx 2555 days)
  HMRC_TAX_RECORDS: { days: 2555 },
  // Standard retention of 1 month
  ONE_MONTH: { months: 1 },
  // Short-lived async request state
  ONE_HOUR: { hours: 1 },
};

/**
 * Calculate TTL for HMRC tax records (7 years / 2555 days)
 * @param {Date} baseDate - The date to calculate from (usually creation date)
 * @returns {{ttl: number, ttl_datestamp: string}} TTL values
 */
export function calculateHmrcTaxRecordTtl(baseDate) {
  return calculateTtl(baseDate, TTL_PRESETS.HMRC_TAX_RECORDS);
}

/**
 * Calculate TTL for standard 1-month retention
 * @param {Date} baseDate - The date to calculate from
 * @returns {{ttl: number, ttl_datestamp: string}} TTL values
 */
export function calculateOneMonthTtl(baseDate) {
  return calculateTtl(baseDate, TTL_PRESETS.ONE_MONTH);
}

/**
 * Calculate TTL for short-lived 1-hour retention
 * @param {Date} baseDate - The date to calculate from
 * @returns {{ttl: number, ttl_datestamp: string}} TTL values
 */
export function calculateOneHourTtl(baseDate) {
  return calculateTtl(baseDate, TTL_PRESETS.ONE_HOUR);
}
