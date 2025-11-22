// app/integration-tests/permissionCheck.integration.test.js

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import request from "supertest";
import { permissionCheckMiddleware } from "../lib/permissionCheck.js";
import { apiEndpoint as catalogGetApiEndpoint } from "../functions/account/catalogGet.js";
import { apiEndpoint as bundlePostApiEndpoint } from "../functions/account/bundlePost.js";
import { dotenvConfigIfNotBlank } from "../lib/env.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

// Test data constants
const VALID_JWT_TOKEN =
  "eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiJ0ZXN0LXVzZXIiLCJlbWFpbCI6InRlc3RAZXhhbXBsZS5jb20iLCJpYXQiOjE2MzQ1NjAwMDAsImV4cCI6OTk5OTk5OTk5OX0.";
const VALID_JWT_TOKEN_POST =
  "eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiJ0ZXN0LXVzZXItcG9zdCIsImVtYWlsIjoidGVzdC1wb3N0QGV4YW1wbGUuY29tIiwiaWF0IjoxNjM0NTYwMDAwLCJleHAiOjk5OTk5OTk5OTl9.";

describe("Permission Check Integration Tests", () => {
  let app;

  beforeAll(() => {
    // Create Express app with permission check middleware
    app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    // Register permission check middleware
    permissionCheckMiddleware(app);

    // Register actual API endpoints
    catalogGetApiEndpoint(app);
    bundlePostApiEndpoint(app);
  });

  describe("HEAD Request Permission Checks", () => {
    it("should return 200 OK for HEAD request to catalog endpoint with valid auth", async () => {
      const response = await request(app).head("/api/v1/catalog").set("Authorization", `Bearer ${VALID_JWT_TOKEN}`);

      expect(response.status).toBe(200);
      expect(response.headers["x-permission-check"]).toBe("allowed");
      expect(response.headers["content-type"]).toContain("application/json");
      expect(response.text).toBeUndefined(); // HEAD requests should have no body
    });

    it("should return 200 OK for HEAD request to bundle endpoint with valid auth", async () => {
      const response = await request(app).head("/api/v1/bundle").set("Authorization", `Bearer ${VALID_JWT_TOKEN}`);

      expect(response.status).toBe(200);
      expect(response.headers["x-permission-check"]).toBe("allowed");
      expect(response.text).toBeUndefined();
    });

    it("should return 401 Unauthorized for HEAD request without auth token", async () => {
      const response = await request(app).head("/api/v1/catalog");

      expect(response.status).toBe(401);
      expect(response.headers["x-permission-check"]).toBe("denied");
      expect(response.text).toBeUndefined();
    });

    it("should return 401 for HEAD request with invalid auth token", async () => {
      const response = await request(app).head("/api/v1/catalog").set("Authorization", "Bearer invalid-token");

      expect(response.status).toBe(401);
      expect(response.headers["x-permission-check"]).toBe("denied");
      expect(response.text).toBeUndefined();
    });

    it("should ignore query parameters in permission check", async () => {
      const response = await request(app).head("/api/v1/catalog?page=1&search=test").set("Authorization", `Bearer ${VALID_JWT_TOKEN}`);

      expect(response.status).toBe(200);
      expect(response.headers["x-permission-check"]).toBe("allowed");
      expect(response.text).toBeUndefined();
    });
  });

  describe("GET Request Still Works Normally", () => {
    it("should return full response body for GET request to catalog", async () => {
      const response = await request(app).get("/api/v1/catalog");

      expect(response.status).toBe(200);
      expect(response.headers["content-type"]).toContain("application/json");
      expect(response.body).toBeDefined();
      expect(response.body.bundles).toBeDefined();
      expect(response.body.activities).toBeDefined();
      // GET should have body, unlike HEAD
      expect(response.text).not.toBe("");
    });
  });

  describe("POST Request Still Works Normally", () => {
    it("should process POST request to bundle endpoint normally", async () => {
      const response = await request(app)
        .post("/api/v1/bundle")
        .set("Authorization", `Bearer ${VALID_JWT_TOKEN_POST}`)
        .send({ bundleId: "test" });

      expect(response.status).toBe(200);
      expect(response.body).toBeDefined();
      expect(response.body.granted).toBeDefined();
      // POST should have body with actual data
      expect(response.text).not.toBe("");
    });
  });

  describe("HEAD vs GET Comparison", () => {
    it("HEAD should return same headers as GET but without body", async () => {
      // Make HEAD request
      const headResponse = await request(app).head("/api/v1/catalog").set("Authorization", `Bearer ${VALID_JWT_TOKEN}`);

      // Make GET request
      const getResponse = await request(app).get("/api/v1/catalog").set("Authorization", `Bearer ${VALID_JWT_TOKEN}`);

      // Both should succeed
      expect(headResponse.status).toBe(200);
      expect(getResponse.status).toBe(200);

      // Both should have content-type
      expect(headResponse.headers["content-type"]).toContain("application/json");
      expect(getResponse.headers["content-type"]).toContain("application/json");

      // HEAD should have no body
      expect(headResponse.text).toBeUndefined();

      // GET should have body
      expect(getResponse.text).not.toBe("");
      expect(getResponse.body).toBeDefined();
    });
  });
});
