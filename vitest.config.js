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
              "@src": path.resolve(process.cwd(), "src"),
              "@tests": path.resolve(process.cwd(), "tests"),
            },
          },
          include: [
            "tests/unit/*.test.js",
            "tests/integration/*.test.js",
            "tests/system/*.test.js",
            "tests/client/*.test.js",
            "tests/behaviour/*.test.js",
          ],
          exclude: [],
        },
        {
          name: "frontend",
          environment: "happy-dom",
          resolve: {
            alias: {
              "@dist": path.resolve(process.cwd(), "dist"),
              "@src": path.resolve(process.cwd(), "src"),
              "@tests": path.resolve(process.cwd(), "tests"),
            },
          },
          include: [
            "tests/unit/vatFlow.frontend.test.js",
            "tests/system/client.system.test.js",
          ],
        },
      ],
      coverage: {
        provider: "v8",
        reportsDirectory: "./coverage",
        reporter: ["text", "json", "html"],
        include: ["src/**/*.js"],
        exclude: [
          "**/dist/**",
          "**/entrypoint/**",
          "tests/unit/*.test.js",
          "tests/integration/*.test.js",
          "tests/system/*.test.js",
          "tests/client/*.test.js",
          "tests/behaviour/*.test.js",
          "**/node_modules/**",
          "src/index.js",
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
