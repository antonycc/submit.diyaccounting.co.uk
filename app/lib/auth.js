// app/lib/auth.js

export function getUserSub(event) {
  const auth = event?.headers?.authorization || event?.headers?.Authorization;
  if (!auth || !auth.startsWith("Bearer ")) return null;
  const token = auth.split(" ")[1];
  try {
    const parts = String(token).split(".");
    if (parts.length < 2) return null;
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = Buffer.from(payload, "base64").toString("utf8");
    const claims = JSON.parse(json);
    return claims?.sub || null;
  } catch {
    return null;
  }
}
