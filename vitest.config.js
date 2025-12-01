import { defineConfig } from "vitest/config";
import dotenv from "dotenv";
import path from "path";

export default defineConfig(({ mode }) => {
  // Load env files for tests without requiring Vite
  // 1) Base .env
  dotenv.config({ path: path.resolve(process.cwd(), ".env") });
  // 2) Mode-specific .env (e.g., .env.test, .env.ci, .env.prod) if present
  if (mode) {
    dotenv.config({ path: path.resolve(process.cwd(), `.env.${mode}`) });
  }
  const env = process.env;

  return {
    test: {
      env,
      projects: [
        {
          name: "default",
          environment: "node",
          // Limit workers without CLI flags
          pool: "forks",
          poolOptions: { forks: { minForks: 1, maxForks: 1 } },

          // Disable file-level parallelism and concurrent tests
          // fileParallelism: false, // run test files sequentially
          // sequence: { concurrent: false }, // run tests in a file sequentially

          // pool: "threads",
          // poolOptions: {
          //  threads: { minThreads: 1, maxThreads: 1 },
          //  forks: { minForks: 1, maxForks: 1 },
          //  vmThreads: { minThreads: 1, maxThreads: 1 },
          // },
          resolve: {
            alias: {
              "@dist": path.resolve(process.cwd(), "dist"),
              "@app": path.resolve(process.cwd(), "app"),
            },
          },
          include: ["app/unit-tests/*.test.js", "app/unit-tests/*/*.test.js", "app/system-tests/*.test.js", "web/unit-tests/*.test.js"],
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
          "app/unit-tests/*/*.test.js",
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
