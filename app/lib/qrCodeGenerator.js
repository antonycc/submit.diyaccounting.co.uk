// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/lib/qrCodeGenerator.js
// Generate QR codes for pass invitation codes.
//
// Creates QR codes containing pass URLs that can be scanned to quickly
// access the bundle redemption page.

import QRCode from "qrcode";

/**
 * Generate a QR code for a pass as a data URL (base64 PNG image).
 *
 * @param {Object} params
 * @param {string} params.code - The pass code (e.g., "tiger-happy-mountain-silver")
 * @param {string} params.url - The full URL to the pass redemption page
 * @param {Object} [params.options] - QRCode generation options
 * @param {number} [params.options.width=300] - Width in pixels
 * @param {number} [params.options.margin=4] - Margin in modules
 * @param {string} [params.options.errorCorrectionLevel='M'] - Error correction level (L, M, Q, H)
 * @returns {Promise<string>} Data URL containing the QR code image
 */
export async function generatePassQrCode({ code, url, options = {} }) {
  if (!code) {
    throw new Error("Pass code is required");
  }
  if (!url) {
    throw new Error("Pass URL is required");
  }

  const qrOptions = {
    width: options.width || 300,
    margin: options.margin || 4,
    errorCorrectionLevel: options.errorCorrectionLevel || "M",
    type: "image/png",
  };

  try {
    const dataUrl = await QRCode.toDataURL(url, qrOptions);
    return dataUrl;
  } catch (error) {
    throw new Error(`Failed to generate QR code for pass ${code}: ${error.message}`);
  }
}

/**
 * Generate a QR code for a pass as a Buffer (raw PNG data).
 *
 * @param {Object} params
 * @param {string} params.code - The pass code
 * @param {string} params.url - The full URL to the pass redemption page
 * @param {Object} [params.options] - QRCode generation options
 * @returns {Promise<Buffer>} Buffer containing PNG image data
 */
export async function generatePassQrCodeBuffer({ code, url, options = {} }) {
  if (!code) {
    throw new Error("Pass code is required");
  }
  if (!url) {
    throw new Error("Pass URL is required");
  }

  const qrOptions = {
    width: options.width || 300,
    margin: options.margin || 4,
    errorCorrectionLevel: options.errorCorrectionLevel || "M",
  };

  try {
    const buffer = await QRCode.toBuffer(url, qrOptions);
    return buffer;
  } catch (error) {
    throw new Error(`Failed to generate QR code buffer for pass ${code}: ${error.message}`);
  }
}

/**
 * Generate a text-based QR code for terminal display (useful for debugging).
 *
 * @param {Object} params
 * @param {string} params.code - The pass code
 * @param {string} params.url - The full URL to the pass redemption page
 * @param {Object} [params.options] - QRCode generation options
 * @returns {Promise<string>} ASCII art QR code
 */
export async function generatePassQrCodeText({ code, url, options = {} }) {
  if (!code) {
    throw new Error("Pass code is required");
  }
  if (!url) {
    throw new Error("Pass URL is required");
  }

  const qrOptions = {
    errorCorrectionLevel: options.errorCorrectionLevel || "M",
    type: "terminal",
  };

  try {
    const text = await QRCode.toString(url, qrOptions);
    return text;
  } catch (error) {
    throw new Error(`Failed to generate text QR code for pass ${code}: ${error.message}`);
  }
}

/**
 * Build pass details object with metadata for display.
 *
 * @param {Object} pass - Pass record from passService
 * @param {string} passUrl - Full URL to the pass redemption page
 * @param {string} [email] - Email if pass is restricted
 * @returns {Object} Pass details with formatted metadata
 */
export function buildPassDetails(pass, passUrl, email) {
  const details = {
    code: pass.code,
    url: passUrl,
    bundleId: pass.bundleId,
    passTypeId: pass.passTypeId,
    maxUses: pass.maxUses,
    usesRemaining: pass.maxUses - pass.useCount,
    validFrom: pass.validFrom,
    validUntil: pass.validUntil || "unlimited",
    createdAt: pass.createdAt,
  };

  if (email) {
    details.restrictedToEmail = email;
  }

  if (pass.notes) {
    details.notes = pass.notes;
  }

  return details;
}
