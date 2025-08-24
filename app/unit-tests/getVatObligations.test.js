// app/unit-tests/getVatObligations.test.js

import { describe, test, expect, beforeEach, vi } from "vitest";
import fetch from "node-fetch";

import { httpGet } from "../functions/getVatObligations.js";
import { buildGovClientTestHeaders } from "./govClientTestHeader.js";

vi.mock("node-fetch");

describe("getVatObligations handler", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Set stubbed mode
    process.env.DIY_SUBMIT_TEST_VAT_OBLIGATIONS = JSON.stringify({
      obligations: [
        {
          start: "2024-01-01",
          end: "2024-03-31",
          due: "2024-05-07",
          status: "F",
          periodKey: "24A1",
          received: "2024-05-06",
        },
        {
          start: "2024-04-01",
          end: "2024-06-30",
          due: "2024-08-07",
          status: "O",
          periodKey: "24A2",
        },
      ],
    });
  });

  test("should retrieve VAT obligations successfully", async () => {
    const event = {
      queryStringParameters: {
        vrn: "193054661",
      },
      headers: {
        ...buildGovClientTestHeaders(),
        authorization: "Bearer test-access-token",
      },
    };

    const result = await httpGet(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(200);
    expect(body.obligations).toBeDefined();
    expect(body.obligations).toHaveLength(2);
    expect(body.obligations[0].periodKey).toBe("24A1");
    expect(body.obligations[0].status).toBe("F");
    expect(body.obligations[1].periodKey).toBe("24A2");
    expect(body.obligations[1].status).toBe("O");
  });

  test("should retrieve VAT obligations with date filters", async () => {
    const event = {
      queryStringParameters: {
        vrn: "193054661",
        from: "2024-01-01",
        to: "2024-06-30",
        status: "O",
      },
      headers: {
        ...buildGovClientTestHeaders(),
        authorization: "Bearer test-access-token",
      },
    };

    const result = await httpGet(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(200);
    expect(body.obligations).toBeDefined();
  });

  test("should retrieve VAT obligations with Gov-Test-Scenario", async () => {
    const event = {
      queryStringParameters: {
        vrn: "193054661",
        "Gov-Test-Scenario": "QUARTERLY_NONE_MET",
      },
      headers: {
        ...buildGovClientTestHeaders(),
        authorization: "Bearer test-access-token",
      },
    };

    const result = await httpGet(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(200);
    expect(body.obligations).toBeDefined();
  });

  test("should return 400 when vrn is missing", async () => {
    const event = {
      queryStringParameters: {},
      headers: {
        ...buildGovClientTestHeaders(),
        authorization: "Bearer test-access-token",
      },
    };

    const result = await httpGet(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(400);
    expect(body.message).toContain("Missing vrn parameter");
  });

  test("should return 400 when vrn format is invalid", async () => {
    const event = {
      queryStringParameters: {
        vrn: "invalid-vrn",
      },
      headers: {
        ...buildGovClientTestHeaders(),
        authorization: "Bearer test-access-token",
      },
    };

    const result = await httpGet(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(400);
    expect(body.message).toContain("Invalid vrn format - must be 9 digits");
  });

  test("should return 400 when date format is invalid", async () => {
    const event = {
      queryStringParameters: {
        vrn: "193054661",
        from: "invalid-date",
      },
      headers: {
        ...buildGovClientTestHeaders(),
        authorization: "Bearer test-access-token",
      },
    };

    const result = await httpGet(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(400);
    expect(body.message).toContain("Invalid from date format - must be YYYY-MM-DD");
  });

  test("should return 400 when status format is invalid", async () => {
    const event = {
      queryStringParameters: {
        vrn: "193054661",
        status: "INVALID",
      },
      headers: {
        ...buildGovClientTestHeaders(),
        authorization: "Bearer test-access-token",
      },
    };

    const result = await httpGet(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(400);
    expect(body.message).toContain("Invalid status - must be O (Open) or F (Fulfilled)");
  });

  test("should return 400 when authorization header is missing", async () => {
    const event = {
      queryStringParameters: {
        vrn: "193054661",
      },
      headers: {
        ...buildGovClientTestHeaders(),
      },
    };

    const result = await httpGet(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(400);
    expect(body.message).toContain("Missing Authorization Bearer token");
  });

  test("should call HMRC API when not in stubbed mode", async () => {
    // Remove stubbed mode
    delete process.env.DIY_SUBMIT_TEST_VAT_OBLIGATIONS;

    const mockResponse = {
      obligations: [
        {
          start: "2024-01-01",
          end: "2024-03-31",
          due: "2024-05-07",
          status: "F",
          periodKey: "24A1",
          received: "2024-05-06",
        },
      ],
    };

    fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    });

    const event = {
      queryStringParameters: {
        vrn: "193054661",
      },
      headers: {
        ...buildGovClientTestHeaders(),
        authorization: "Bearer test-access-token",
      },
    };

    const result = await httpGet(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(200);
    expect(body.obligations).toBeDefined();
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/organisations/vat/193054661/obligations"),
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Authorization: "Bearer test-access-token",
          Accept: "application/vnd.hmrc.1.0+json",
        }),
      })
    );
  });

  test("should handle HMRC API error", async () => {
    // Remove stubbed mode
    delete process.env.DIY_SUBMIT_TEST_VAT_OBLIGATIONS;

    const errorMessage = "INVALID_VRN";

    fetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ error: errorMessage }),
    });

    const event = {
      queryStringParameters: {
        vrn: "193054661",
      },
      headers: {
        ...buildGovClientTestHeaders(),
        authorization: "Bearer test-access-token",
      },
    };

    const result = await httpGet(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(500);
    expect(body.message).toBe("HMRC VAT obligations retrieval failed");
  });
});