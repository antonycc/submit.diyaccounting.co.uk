// app/lib/hmrcVatApi.js

// Minimal safe implementations retained for backward compatibility with tests that import these helpers.
// TODO: [stubs] Remove test-time stub controls from production code once all tests prime HTTP instead.

export function shouldUseStub(stubEnvVar) {
  const raw = process.env[stubEnvVar];
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw);
    return parsed && parsed.source === "stub";
  } catch {
    return false;
  }
}

export function getStubData(stubEnvVar, defaultData = {}) {
  const raw = process.env[stubEnvVar];
  if (!raw) return defaultData;
  try {
    return JSON.parse(raw);
  } catch {
    return defaultData;
  }
}
