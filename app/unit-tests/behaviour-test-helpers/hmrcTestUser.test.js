// app/unit-tests/behaviour-test-helpers/hmrcTestUser.test.js
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createHmrcTestUser, saveHmrcTestUserToFiles } from "../../../behaviour-tests/helpers/behaviour-helpers.js";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import fs from "node:fs";
import path from "node:path";

dotenvConfigIfNotBlank({ path: ".env.test" });

describe("createHmrcTestUser", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should call HMRC API with correct parameters", async () => {
    const mockResponse = {
      userId: "test-user-123",
      password: "test-password",
      userFullName: "Test Organisation Ltd",
      emailAddress: "test@example.com",
      vatRegistrationNumber: "123456789",
      organisationDetails: {
        name: "Test Organisation Ltd",
        address: { line1: "1 Test Street", postcode: "TE1 1ST" },
      },
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: vi.fn().mockResolvedValue(mockResponse),
    });

    const result = await createHmrcTestUser("test-client-id", { serviceNames: ["mtd-vat"] });

    expect(global.fetch).toHaveBeenCalledWith(
      "https://test-api.service.hmrc.gov.uk/create-test-user/organisations",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          "Accept": "application/vnd.hmrc.1.0+json",
        }),
        body: JSON.stringify({ serviceNames: ["mtd-vat"] }),
      }),
    );

    expect(result).toEqual(expect.objectContaining(mockResponse));
    expect(result.userId).toBe("test-user-123");
    expect(result.vatRegistrationNumber).toBe("123456789");
  });

  it("should throw error when API returns non-OK response", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      json: vi.fn().mockResolvedValue({ message: "Invalid credentials" }),
    });

    await expect(createHmrcTestUser("invalid-client-id")).rejects.toThrow("Failed to create HMRC test user");
  });

  it("should use default serviceNames when not provided", async () => {
    const mockResponse = {
      userId: "test-user",
      password: "test-password",
      vatRegistrationNumber: "123456789",
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue(mockResponse),
    });

    await createHmrcTestUser("test-client-id");

    const callArgs = global.fetch.mock.calls[0];
    const body = JSON.parse(callArgs[1].body);
    expect(body.serviceNames).toEqual(["mtd-vat"]);
  });
});

describe("saveHmrcTestUserToFiles", () => {
  const testUser = {
    userId: "test-user-123",
    password: "test-password",
    vatRegistrationNumber: "123456789",
  };

  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(fs, "mkdirSync").mockImplementation(() => {});
    vi.spyOn(fs, "writeFileSync").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should save test user to both output directory and repo root", () => {
    const outputDir = "/tmp/test-output";
    const repoRoot = "/tmp/repo";

    saveHmrcTestUserToFiles(testUser, outputDir, repoRoot);

    expect(fs.mkdirSync).toHaveBeenCalledWith(outputDir, { recursive: true });
    expect(fs.writeFileSync).toHaveBeenCalledTimes(2);

    // Check output directory file
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      path.join(outputDir, "hmrc-test-user.json"),
      JSON.stringify(testUser, null, 2),
      "utf-8",
    );

    // Check repo root file
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      path.join(repoRoot, "hmrc-test-user.json"),
      JSON.stringify(testUser, null, 2),
      "utf-8",
    );
  });

  it("should handle errors gracefully when saving to output directory fails", () => {
    const outputDir = "/tmp/test-output";
    const repoRoot = "/tmp/repo";

    vi.spyOn(fs, "writeFileSync").mockImplementationOnce(() => {
      throw new Error("Failed to write file");
    });

    // Should not throw, but continue to save to repo root
    expect(() => saveHmrcTestUserToFiles(testUser, outputDir, repoRoot)).not.toThrow();

    // Verify it attempted both writes despite first one failing
    expect(fs.writeFileSync).toHaveBeenCalledTimes(2);
  });

  it("should skip saving when directories are not provided", () => {
    saveHmrcTestUserToFiles(testUser, null, null);

    // mkdirSync should not be called since outputDir is null
    expect(fs.mkdirSync).not.toHaveBeenCalled();
    expect(fs.writeFileSync).not.toHaveBeenCalled();
  });
});
