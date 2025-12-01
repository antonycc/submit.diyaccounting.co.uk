// app/services/httpProxy.js

import http from "http";
import https from "https";
import { createLogger } from "../lib/logger.js";

const logger = createLogger({ source: "app/services/httpProxy.js" });

// Maximum number of redirects the proxy will follow for a single upstream request
const MAX_REDIRECTS = 5;

/**
 * Perform the HTTP proxy request.
 */
export function proxyRequest(targetUrl, options, body) {
  return new Promise((resolve) => {
    const client = targetUrl.protocol === "https:" ? https : http;
    const req = client.request(targetUrl, options, (res) => {
      const chunks = [];
      res.on("data", (d) => chunks.push(typeof d === "string" ? Buffer.from(d) : d));
      res.on("end", () => {
        const responseBody = Buffer.concat(chunks).toString("utf8");
        logger.info({ msg: `Upstream response received: ${res.statusCode}`, responseBody });
        resolve({ statusCode: res.statusCode, headers: res.headers, body: responseBody });
      });
    });
    req.on("error", (err) => {
      logger.error({ err: err.stack ?? err.message, msg: "Upstream request error" });
      resolve({ statusCode: 502, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: err.message }) });
    });
    if (body) req.write(body);
    req.end();
    logger.info({ msg: `Upstream request sent to ${targetUrl.toString()}` });
  });
}

/**
 * Wrapper around proxyRequest that follows HTTP redirects up to MAX_REDIRECTS hops.
 * Redirect handling semantics:
 * - 301/302/303: switch to GET and drop request body
 * - 307/308: preserve original method and body
 * Relative Location headers are resolved against the current URL.
 *
 * Note: requestImpl parameter allows injection of a custom request function for tests.
 */
export async function proxyRequestWithRedirects(initialUrl, initialOptions, initialBody, requestImpl = proxyRequest) {
  let url = new URL(initialUrl.toString());
  let options = { ...initialOptions, headers: { ...(initialOptions.headers || {}) } };
  let body = initialBody;

  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    const resp = await requestImpl(url, options, body);

    const status = resp.statusCode || 0;
    const headers = resp.headers || {};
    const location = headers.location || headers.Location;

    const isRedirect = [301, 302, 303, 307, 308].includes(status);
    if (!isRedirect || !location) {
      return resp;
    }

    // Resolve next URL relative to current
    let nextUrl;
    try {
      nextUrl = new URL(location, url);
    } catch (error) {
      // If Location is invalid, return the redirect response as-is
      logger.warn({ msg: "Invalid redirect location header, returning upstream response", error, location, status });
      return resp;
    }

    // Adjust method/body per RFC semantics
    const prevMethod = (options.method || "GET").toUpperCase();
    let nextMethod = prevMethod;
    let nextBody = body;
    if ([301, 302, 303].includes(status)) {
      nextMethod = "GET";
      nextBody = undefined;
      // Remove entity headers when dropping body
      delete options.headers["content-length"]; // lower-case typical
      delete options.headers["Content-Length"]; // just in case
      delete options.headers["content-type"]; // avoid misleading type
      delete options.headers["Content-Type"]; // casing variant
    }

    // Prepare headers for next hop
    const nextHeaders = { ...(options.headers || {}) };
    // Update Host header for the new URL
    nextHeaders.host = nextUrl.host;
    // If origin changes, strip Authorization to avoid credential leak
    if (nextUrl.origin !== url.origin) {
      delete nextHeaders.authorization;
      delete nextHeaders.Authorization;
    }

    options = { ...options, method: nextMethod, headers: nextHeaders };
    url = nextUrl;
    body = nextBody;

    logger.info({
      msg: "Following redirect",
      status,
      location,
      nextUrl: nextUrl.toString(),
      nextMethod,
      hop: i + 1,
    });

    // Loop to perform the next request; if we exceed redirects, fall through
    if (i === MAX_REDIRECTS) break;
  }

  // Too many redirects
  logger.error({ msg: "Exceeded maximum redirects in proxy", max: MAX_REDIRECTS });
  return {
    statusCode: 508, // Loop Detected / Too many redirects
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "Too many redirects" }),
  };
}
