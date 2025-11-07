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

// New test: flat context with colon-keyed claims should prefer cognito:username
describe("extractUserFromAuthorizerContext with flat colon-keyed claims", () => {
  test("prefers cognito:username and handles scope/email", () => {
    const event = {
      requestContext: {
        authorizer: {
          "sub": "1652b254-c021-70a8-39e8-2e2b620f92cc",
          "cognito:username": "cognito_2e90b081-973b-4716-a4c9-4a6be57c2a7c",
          "cognito:groups": "[eu-west-2_a4eKeQ4dz_cognito]",
          "custom:bundles": "test|EXPIRY=2025-11-06",
          "email": "",
          "scope": "openid profile email",
        },
      },
    };

    const user = extractUserFromAuthorizerContext(event);
    expect(user).toEqual({
      sub: "1652b254-c021-70a8-39e8-2e2b620f92cc",
      username: "cognito_2e90b081-973b-4716-a4c9-4a6be57c2a7c",
      email: "",
      scope: "openid profile email",
    });
  });
});
