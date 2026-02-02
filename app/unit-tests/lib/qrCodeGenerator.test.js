// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

import { describe, it, expect } from "vitest";
import {
  generatePassQrCode,
  generatePassQrCodeBuffer,
  generatePassQrCodeText,
  buildPassDetails,
} from "../../lib/qrCodeGenerator.js";

describe("qrCodeGenerator", () => {
  const testPass = {
    code: "tiger-happy-mountain-silver",
    bundleId: "test",
    passTypeId: "test-access",
    maxUses: 1,
    useCount: 0,
    validFrom: "2026-01-01T00:00:00.000Z",
    validUntil: "2026-01-08T00:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
  };

  const testUrl = "https://ci.submit.diyaccounting.co.uk/bundles.html?pass=tiger-happy-mountain-silver";

  describe("generatePassQrCode", () => {
    it("should generate a data URL QR code", async () => {
      const dataUrl = await generatePassQrCode({
        code: testPass.code,
        url: testUrl,
      });

      expect(dataUrl).toMatch(/^data:image\/png;base64,/);
      expect(dataUrl.length).toBeGreaterThan(100);
    });

    it("should use custom options when provided", async () => {
      const dataUrl = await generatePassQrCode({
        code: testPass.code,
        url: testUrl,
        options: {
          width: 400,
          margin: 2,
          errorCorrectionLevel: "H",
        },
      });

      expect(dataUrl).toMatch(/^data:image\/png;base64,/);
      // Higher width should result in more data
      expect(dataUrl.length).toBeGreaterThan(100);
    });

    it("should throw error when code is missing", async () => {
      await expect(
        generatePassQrCode({
          code: "",
          url: testUrl,
        })
      ).rejects.toThrow("Pass code is required");
    });

    it("should throw error when URL is missing", async () => {
      await expect(
        generatePassQrCode({
          code: testPass.code,
          url: "",
        })
      ).rejects.toThrow("Pass URL is required");
    });

    it("should generate different QR codes for different URLs", async () => {
      const url1 = "https://ci.submit.diyaccounting.co.uk/bundles.html?pass=code-one";
      const url2 = "https://ci.submit.diyaccounting.co.uk/bundles.html?pass=code-two";

      const qr1 = await generatePassQrCode({ code: "code-one", url: url1 });
      const qr2 = await generatePassQrCode({ code: "code-two", url: url2 });

      expect(qr1).not.toBe(qr2);
    });
  });

  describe("generatePassQrCodeBuffer", () => {
    it("should generate a Buffer with PNG data", async () => {
      const buffer = await generatePassQrCodeBuffer({
        code: testPass.code,
        url: testUrl,
      });

      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.length).toBeGreaterThan(100);
      // Check PNG signature (first 8 bytes)
      expect(buffer[0]).toBe(0x89);
      expect(buffer[1]).toBe(0x50); // 'P'
      expect(buffer[2]).toBe(0x4e); // 'N'
      expect(buffer[3]).toBe(0x47); // 'G'
    });

    it("should throw error when code is missing", async () => {
      await expect(
        generatePassQrCodeBuffer({
          code: "",
          url: testUrl,
        })
      ).rejects.toThrow("Pass code is required");
    });

    it("should throw error when URL is missing", async () => {
      await expect(
        generatePassQrCodeBuffer({
          code: testPass.code,
          url: "",
        })
      ).rejects.toThrow("Pass URL is required");
    });

    it("should use custom options when provided", async () => {
      const buffer = await generatePassQrCodeBuffer({
        code: testPass.code,
        url: testUrl,
        options: {
          width: 200,
          margin: 1,
        },
      });

      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.length).toBeGreaterThan(0);
    });
  });

  describe("generatePassQrCodeText", () => {
    it("should generate ASCII art QR code", async () => {
      const text = await generatePassQrCodeText({
        code: testPass.code,
        url: testUrl,
      });

      expect(typeof text).toBe("string");
      expect(text.length).toBeGreaterThan(50);
      // Terminal QR codes use blocks and spaces
      expect(text).toMatch(/[█▀▄▌▐ ]/);
    });

    it("should throw error when code is missing", async () => {
      await expect(
        generatePassQrCodeText({
          code: "",
          url: testUrl,
        })
      ).rejects.toThrow("Pass code is required");
    });

    it("should throw error when URL is missing", async () => {
      await expect(
        generatePassQrCodeText({
          code: testPass.code,
          url: "",
        })
      ).rejects.toThrow("Pass URL is required");
    });
  });

  describe("buildPassDetails", () => {
    it("should build pass details with all fields", () => {
      const details = buildPassDetails(testPass, testUrl, "user@example.com");

      expect(details.code).toBe(testPass.code);
      expect(details.url).toBe(testUrl);
      expect(details.bundleId).toBe(testPass.bundleId);
      expect(details.passTypeId).toBe(testPass.passTypeId);
      expect(details.maxUses).toBe(testPass.maxUses);
      expect(details.usesRemaining).toBe(1);
      expect(details.validFrom).toBe(testPass.validFrom);
      expect(details.validUntil).toBe(testPass.validUntil);
      expect(details.createdAt).toBe(testPass.createdAt);
      expect(details.restrictedToEmail).toBe("user@example.com");
    });

    it("should build pass details without email", () => {
      const details = buildPassDetails(testPass, testUrl);

      expect(details.code).toBe(testPass.code);
      expect(details.url).toBe(testUrl);
      expect(details.restrictedToEmail).toBeUndefined();
    });

    it("should handle unlimited passes", () => {
      const unlimitedPass = { ...testPass, validUntil: null };
      const details = buildPassDetails(unlimitedPass, testUrl);

      expect(details.validUntil).toBe("unlimited");
    });

    it("should include notes when present", () => {
      const passWithNotes = { ...testPass, notes: "Test note for admin" };
      const details = buildPassDetails(passWithNotes, testUrl);

      expect(details.notes).toBe("Test note for admin");
    });

    it("should calculate usesRemaining correctly", () => {
      const usedPass = { ...testPass, useCount: 0, maxUses: 5 };
      const details = buildPassDetails(usedPass, testUrl);

      expect(details.usesRemaining).toBe(5);
    });

    it("should handle partially used passes", () => {
      const partiallyUsedPass = { ...testPass, useCount: 3, maxUses: 10 };
      const details = buildPassDetails(partiallyUsedPass, testUrl);

      expect(details.usesRemaining).toBe(7);
    });
  });
});
