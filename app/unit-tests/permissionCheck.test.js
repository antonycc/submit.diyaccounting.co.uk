// app/unit-tests/permissionCheck.test.js

import { describe, it, expect, beforeEach, vi } from "vitest";
import { permissionCheckMiddleware } from "../lib/permissionCheck.js";
import * as bundleEnforcement from "../lib/bundleEnforcement.js";
import * as httpHelper from "../lib/httpHelper.js";
import * as responses from "../lib/responses.js";

describe("Permission Check Middleware", () => {
  let mockApp;
  let mockRequest;
  let mockResponse;
  let headHandler;

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

    // Mock Express app
    mockApp = {
      head: vi.fn((path, handler) => {
        // Match regex pattern or exact string
        if (path instanceof RegExp || path === "/api/v1/*" || String(path).includes("/api/v1")) {
          headHandler = handler;
        }
      }),
    };

    // Mock request
    mockRequest = {
      path: "/api/v1/catalog",
      url: "/api/v1/catalog",
      headers: {
        authorization: "Bearer test-token",
        host: "localhost:3000",
      },
      get: vi.fn((header) => {
        return mockRequest.headers[header.toLowerCase()];
      }),
      query: {},
    };

    // Mock response
    mockResponse = {
      status: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
      end: vi.fn().mockReturnThis(),
    };

    // Register middleware
    permissionCheckMiddleware(mockApp);
  });

  describe("Middleware Registration", () => {
    it("should register HEAD handler for /api/v1/ paths", () => {
      expect(mockApp.head).toHaveBeenCalledWith(expect.any(RegExp), expect.any(Function));
    });
  });

  describe("Permission Check - Success Cases", () => {
    it("should return 200 OK when user has required permissions", async () => {
      // Mock bundle enforcement to pass
      vi.spyOn(bundleEnforcement, "enforceBundles").mockResolvedValue(undefined);
      vi.spyOn(httpHelper, "buildLambdaEventFromHttpRequest").mockReturnValue({
        requestContext: {
          authorizer: {
            lambda: {
              jwt: {
                claims: { sub: "test-user" },
              },
            },
          },
        },
        path: "/api/v1/catalog",
        headers: mockRequest.headers,
      });
      vi.spyOn(responses, "extractRequest").mockReturnValue({
        request: { pathname: "/api/v1/catalog" },
      });

      await headHandler(mockRequest, mockResponse);

      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.set).toHaveBeenCalledWith(
        expect.objectContaining({
          "Content-Type": "application/json",
          "x-permission-check": "allowed",
        }),
      );
      expect(mockResponse.end).toHaveBeenCalled();
    });

    it("should not include response body for HEAD requests", async () => {
      vi.spyOn(bundleEnforcement, "enforceBundles").mockResolvedValue(undefined);
      vi.spyOn(httpHelper, "buildLambdaEventFromHttpRequest").mockReturnValue({
        requestContext: {
          authorizer: {
            lambda: {
              jwt: {
                claims: { sub: "test-user" },
              },
            },
          },
        },
        path: "/api/v1/catalog",
        headers: mockRequest.headers,
      });
      vi.spyOn(responses, "extractRequest").mockReturnValue({
        request: { pathname: "/api/v1/catalog" },
      });

      await headHandler(mockRequest, mockResponse);

      // Verify end() is called without arguments (no body)
      expect(mockResponse.end).toHaveBeenCalledWith();
      expect(mockResponse.end.mock.calls[0]).toHaveLength(0);
    });
  });

  describe("Permission Check - Authentication Failures", () => {
    it("should return 401 Unauthorized when user is not authenticated", async () => {
      const authError = new bundleEnforcement.BundleAuthorizationError("Missing auth token", {
        code: "MISSING_AUTH_TOKEN",
      });

      vi.spyOn(bundleEnforcement, "enforceBundles").mockRejectedValue(authError);
      vi.spyOn(httpHelper, "buildLambdaEventFromHttpRequest").mockReturnValue({
        requestContext: {},
        path: "/api/v1/bundle",
        headers: {},
      });
      vi.spyOn(responses, "extractRequest").mockReturnValue({
        request: { pathname: "/api/v1/bundle" },
      });

      await headHandler(mockRequest, mockResponse);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.set).toHaveBeenCalledWith(
        expect.objectContaining({
          "Content-Type": "application/json",
          "x-permission-check": "denied",
        }),
      );
      expect(mockResponse.end).toHaveBeenCalled();
    });

    it("should return 401 for invalid JWT token", async () => {
      const authError = new bundleEnforcement.BundleAuthorizationError("Invalid token", {
        code: "INVALID_AUTH_TOKEN",
      });

      vi.spyOn(bundleEnforcement, "enforceBundles").mockRejectedValue(authError);
      vi.spyOn(httpHelper, "buildLambdaEventFromHttpRequest").mockReturnValue({
        requestContext: {},
        path: "/api/v1/bundle",
        headers: {},
      });
      vi.spyOn(responses, "extractRequest").mockReturnValue({
        request: { pathname: "/api/v1/bundle" },
      });

      await headHandler(mockRequest, mockResponse);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.end).toHaveBeenCalled();
    });
  });

  describe("Permission Check - Authorization Failures", () => {
    it("should return 403 Forbidden when user lacks required bundles", async () => {
      const entitlementError = new bundleEnforcement.BundleEntitlementError("Missing required bundle", {
        code: "BUNDLE_FORBIDDEN",
        requiredBundleIds: ["premium"],
        currentBundleIds: ["basic"],
      });

      vi.spyOn(bundleEnforcement, "enforceBundles").mockRejectedValue(entitlementError);
      vi.spyOn(httpHelper, "buildLambdaEventFromHttpRequest").mockReturnValue({
        requestContext: {
          authorizer: {
            lambda: {
              jwt: {
                claims: { sub: "test-user" },
              },
            },
          },
        },
        path: "/api/v1/hmrc/vat/submit",
        headers: mockRequest.headers,
      });
      vi.spyOn(responses, "extractRequest").mockReturnValue({
        request: { pathname: "/api/v1/hmrc/vat/submit" },
      });

      await headHandler(mockRequest, mockResponse);

      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockResponse.set).toHaveBeenCalledWith(
        expect.objectContaining({
          "Content-Type": "application/json",
          "x-permission-check": "denied",
        }),
      );
      expect(mockResponse.end).toHaveBeenCalled();
    });
  });

  describe("Permission Check - Error Handling", () => {
    it("should return 500 for unexpected errors", async () => {
      const unexpectedError = new Error("Database connection failed");

      vi.spyOn(httpHelper, "buildLambdaEventFromHttpRequest").mockImplementation(() => {
        throw unexpectedError;
      });

      await headHandler(mockRequest, mockResponse);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.set).toHaveBeenCalledWith(
        expect.objectContaining({
          "Content-Type": "application/json",
          "x-permission-check": "error",
        }),
      );
      expect(mockResponse.end).toHaveBeenCalled();
    });

    it("should handle generic enforcement errors as 403", async () => {
      const genericError = new Error("Some enforcement error");

      vi.spyOn(bundleEnforcement, "enforceBundles").mockRejectedValue(genericError);
      vi.spyOn(httpHelper, "buildLambdaEventFromHttpRequest").mockReturnValue({
        requestContext: {
          authorizer: {
            lambda: {
              jwt: {
                claims: { sub: "test-user" },
              },
            },
          },
        },
        path: "/api/v1/catalog",
        headers: mockRequest.headers,
      });
      vi.spyOn(responses, "extractRequest").mockReturnValue({
        request: { pathname: "/api/v1/catalog" },
      });

      await headHandler(mockRequest, mockResponse);

      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockResponse.end).toHaveBeenCalled();
    });
  });

  describe("Permission Check - Different API Paths", () => {
    it("should check permissions for bundle endpoint", async () => {
      mockRequest.path = "/api/v1/bundle";
      mockRequest.url = "/api/v1/bundle";

      vi.spyOn(bundleEnforcement, "enforceBundles").mockResolvedValue(undefined);
      vi.spyOn(httpHelper, "buildLambdaEventFromHttpRequest").mockReturnValue({
        requestContext: {
          authorizer: {
            lambda: {
              jwt: {
                claims: { sub: "test-user" },
              },
            },
          },
        },
        path: "/api/v1/bundle",
        headers: mockRequest.headers,
      });
      vi.spyOn(responses, "extractRequest").mockReturnValue({
        request: { pathname: "/api/v1/bundle" },
      });

      await headHandler(mockRequest, mockResponse);

      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.end).toHaveBeenCalled();
    });

    it("should check permissions for HMRC VAT endpoints", async () => {
      mockRequest.path = "/api/v1/hmrc/vat/submit";
      mockRequest.url = "/api/v1/hmrc/vat/submit";

      vi.spyOn(bundleEnforcement, "enforceBundles").mockResolvedValue(undefined);
      vi.spyOn(httpHelper, "buildLambdaEventFromHttpRequest").mockReturnValue({
        requestContext: {
          authorizer: {
            lambda: {
              jwt: {
                claims: { sub: "test-user" },
              },
            },
          },
        },
        path: "/api/v1/hmrc/vat/submit",
        headers: mockRequest.headers,
      });
      vi.spyOn(responses, "extractRequest").mockReturnValue({
        request: { pathname: "/api/v1/hmrc/vat/submit" },
      });

      await headHandler(mockRequest, mockResponse);

      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.end).toHaveBeenCalled();
    });
  });

  describe("Permission Check - Query Parameters Ignored", () => {
    it("should check base URL permissions, ignoring query parameters", async () => {
      mockRequest.path = "/api/v1/catalog";
      mockRequest.url = "/api/v1/catalog?search=test&page=1";
      mockRequest.query = { search: "test", page: "1" };

      vi.spyOn(bundleEnforcement, "enforceBundles").mockResolvedValue(undefined);
      vi.spyOn(httpHelper, "buildLambdaEventFromHttpRequest").mockReturnValue({
        requestContext: {
          authorizer: {
            lambda: {
              jwt: {
                claims: { sub: "test-user" },
              },
            },
          },
        },
        path: "/api/v1/catalog",
        headers: mockRequest.headers,
        queryStringParameters: { search: "test", page: "1" },
      });
      vi.spyOn(responses, "extractRequest").mockReturnValue({
        request: { pathname: "/api/v1/catalog" },
      });

      await headHandler(mockRequest, mockResponse);

      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.end).toHaveBeenCalled();
      // Verify that bundle enforcement was called with the event (query params don't affect path-based enforcement)
      expect(bundleEnforcement.enforceBundles).toHaveBeenCalled();
    });
  });
});
