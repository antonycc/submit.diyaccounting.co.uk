import security from "eslint-plugin-security";
import globals from "globals";

/** @type {import('eslint').Linter.FlatConfig[]} */
export default [
  {
    plugins: {
      security,
    },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
    linterOptions: {
      reportUnusedDisableDirectives: false,
    },
    rules: {
      // Only security rules - disable any sonarjs that might be inherited
      "sonarjs/no-nested-conditional": "off",
      "sonarjs/no-nested-template-literals": "off",
      "sonarjs/pseudo-random": "off",
      "sonarjs/no-parameter-reassignment": "off",
      "sonarjs/no-os-command-from-path": "off",
      ...security.configs.recommended.rules,
      // Disabled: generates too many false positives for intentional obj[key] patterns.
      // Real object injection risks are mitigated by input validation at API boundaries.
      "security/detect-object-injection": "off",
      "security/detect-non-literal-regexp": "warn",
      "security/detect-non-literal-require": "warn",
      "security/detect-non-literal-fs-filename": "warn",
      "security/detect-eval-with-expression": "error",
      "security/detect-no-csrf-before-method-override": "error",
      "security/detect-possible-timing-attacks": "warn",
      "security/detect-pseudoRandomBytes": "error",
      "security/detect-unsafe-regex": "error",
      "security/detect-buffer-noassert": "error",
      "security/detect-child-process": "warn",
      "security/detect-disable-mustache-escape": "error",
      "security/detect-new-buffer": "error",
      "security/detect-bidi-characters": "error",
    },
  },
  {
    ignores: [
      "node_modules/",
      "target/",
      "cdk.out/",
      "cdk-environment/cdk.out/",
      "cdk-application/cdk.out/",
      "*.min.js",
      "web/public/tests/",
      // Exclude test files - not production code
      "**/*-tests/**",
      "**/*.test.js",
      "**/*.spec.js",
      "behaviour-tests/",
      "app/http-simulator/routes/",
      "app/test-helpers/",
      // Exclude build scripts - not production code
      "scripts/",
      // Exclude config files
      "eslint.config.js",
      "eslint.security.config.js",
      // Exclude bundled files (generated, contain eslint-disable for other configs)
      "**/*.bundle.js",
      // Exclude entry points that have eslint-disable for other plugins
      "web/public/submit.js",
      "web/public/lib/test-data-generator.js",
      // Note: The following files have eslint-disable for sonarjs (code quality).
      // They are security-reviewed but excluded here due to config incompatibility.
      // Security warnings for these files appear in the main eslint run.
      "app/services/bundleManagement.js",
      "app/services/hmrcApi.js",
    ],
  },
];
