// app/unit-tests/authorizerContext.test.js
import { describe, test, expect } from "vitest";
import { extractUserFromAuthorizerContext } from "@app/lib/responses.js";

describe("extractUserFromAuthorizerContext", () => {
  test("extracts from HTTP API v2 Lambda authorizer shape (authorizer.lambda.jwt.claims)", () => {
    const event = {
      requestContext: {
        authorizer: {
          lambda: {
            jwt: {
              claims: {
                "sub": "abc-123",
                "cognito:username": "user-1",
                "email": "user@example.com",
                "scope": "openid profile",
              },
              scopes: null,
            },
          },
        },
      },
    };

    const user = extractUserFromAuthorizerContext(event);
    expect(user).toEqual({
      sub: "abc-123",
      username: "user-1",
      email: "user@example.com",
      scope: "openid profile",
    });
  });

  test("extracts from REST API custom authorizer-like shape (authorizer.jwt.claims)", () => {
    const event = {
      requestContext: {
        authorizer: {
          jwt: {
            claims: {
              sub: "def-456",
              username: "user-2",
              email: "",
              scope: "email",
            },
          },
        },
      },
    };

    const user = extractUserFromAuthorizerContext(event);
    expect(user).toEqual({
      sub: "def-456",
      username: "user-2",
      email: "",
      scope: "email",
    });
  });

  test("falls back to flat legacy fields under authorizer", () => {
    const event = {
      requestContext: {
        authorizer: {
          sub: "ghi-789",
          username: "user-3",
          email: "",
          scope: "",
        },
      },
    };

    const user = extractUserFromAuthorizerContext(event);
    expect(user).toEqual({
      sub: "ghi-789",
      username: "user-3",
      email: "",
      scope: "",
    });
  });
});
