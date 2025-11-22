// app/lib/permissionCheck.js

import logger from "./logger.js";
import { buildLambdaEventFromHttpRequest } from "./httpHelper.js";
import { enforceBundles, BundleAuthorizationError, BundleEntitlementError } from "./bundleEnforcement.js";
import { extractRequest } from "./responses.js";

/**
 * Middleware to handle HEAD requests for permission checking on API endpoints.
 * This allows web pages to check if a URL is permissible to call without executing the action.
 *
 * HEAD requests follow HTTP semantics:
 * - They return the same headers as the corresponding GET/POST would
 * - They do not include a response body
 * - They run the same authorization checks
 *
 * @param {object} app - Express application instance to register the HEAD route handler
 *
 * Returns:
 * - 200 OK: User has permission to access the resource
 * - 401 Unauthorized: User is not authenticated
 * - 403 Forbidden: User is authenticated but lacks required bundles/permissions
 */
export function permissionCheckMiddleware(app) {
  // Handle HEAD requests to all /api/v1/ paths (using Express middleware)
  app.head(/^\/api\/v1\/.*/, async (httpRequest, httpResponse) => {
    logger.info({
      message: "Permission check request received",
      method: "HEAD",
      path: httpRequest.path,
      url: httpRequest.url,
    });

    try {
      // Build a Lambda-like event from the HTTP request
      const lambdaEvent = buildLambdaEventFromHttpRequest(httpRequest);
      const { request } = extractRequest(lambdaEvent);

      // Run bundle enforcement to check permissions
      try {
        await enforceBundles(lambdaEvent);

        // If enforcement passes, user has permission
        logger.info({
          message: "Permission check passed",
          path: request.pathname,
          status: 200,
        });

        // Return 200 OK with no body (HEAD request semantics)
        return httpResponse
          .status(200)
          .set({
            "Content-Type": "application/json",
            "x-permission-check": "allowed",
          })
          .end();
      } catch (enforcementError) {
        // Determine appropriate status code based on error type
        let statusCode;

        if (enforcementError instanceof BundleAuthorizationError) {
          statusCode = 401;
          logger.warn({
            message: "Permission check failed - unauthorized",
            path: request.pathname,
            error: enforcementError.message,
            status: statusCode,
          });
        } else if (enforcementError instanceof BundleEntitlementError) {
          statusCode = 403;
          logger.warn({
            message: "Permission check failed - forbidden",
            path: request.pathname,
            error: enforcementError.message,
            status: statusCode,
          });
        } else {
          // Other errors - default to 403
          statusCode = 403;
          logger.error({
            message: "Permission check failed - unexpected error",
            path: request.pathname,
            error: enforcementError.message,
            status: statusCode,
          });
        }

        // Return appropriate error status with no body (HEAD request semantics)
        return httpResponse
          .status(statusCode)
          .set({
            "Content-Type": "application/json",
            "x-permission-check": "denied",
          })
          .end();
      }
    } catch (error) {
      logger.error({
        message: "Error processing permission check",
        error: error.message,
        stack: error.stack,
      });

      // Return 500 for unexpected errors
      return httpResponse
        .status(500)
        .set({
          "Content-Type": "application/json",
          "x-permission-check": "error",
        })
        .end();
    }
  });
}
