// app/lib/env.js

export function validateEnv(requiredVars) {
  const bad = requiredVars.map((name) => [name, process.env[name]]).filter(([, value]) => !value || !value.trim());

  if (bad.length) {
    const details = bad.map(([key, value]) => `${key}=${value ?? "undefined"}`).join(", ");
    throw new Error(`Missing or blank environment variables: ${details}`);
  }
}
