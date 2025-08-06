import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";
import path from "path";

export default defineConfig(({ mode }) => {
  // Load env file for tests
  const env = loadEnv(mode, process.cwd(), "");

  return {
    test: {
      env,
      projects: [
        {
          name: "default",
          environment: "node",
          resolve: {
            alias: {
              "@dist": path.resolve(process.cwd(), "dist"),
              "@app": path.resolve(process.cwd(), "app"),
            },
          },
          include: [
            "app/unit-tests/*.test.js",
            "app/integration-tests/*.test.js",
            "app/system-tests/*.test.js",
            "web/unit-tests/*.test.js",
          ],
          exclude: ["web/browser-tests/*.test.js", "manually-run-tests/*.test.js", "behaviour-tests/*.test.js"],
        },
      ],
      coverage: {
        provider: "v8",
        reportsDirectory: "./coverage",
        reporter: ["text", "json", "html"],
        include: ["app/**/*.js"],
        exclude: [
          "**/dist/**",
          "**/entrypoint/**",
          "app/unit-tests/*.test.js",
          "app/integration-tests/*.test.js",
          "app/system-tests/*.test.js",
          "web/unit-tests/*.test.js",
          "web/browser-tests/*.test.js",
          "manually-run-tests/*.test.js",
          "behaviour-tests/*.test.js",
          "**/node_modules/**",
          "app/index.js",
          "**/exports/**",
        ],
        threshold: {
          statements: 85,
          branches: 80,
          functions: 75,
          lines: 85,
          perFile: {
            statements: 70,
            branches: 60,
            functions: 40,
            lines: 70,
          },
        },
      },
    },
  };
});
