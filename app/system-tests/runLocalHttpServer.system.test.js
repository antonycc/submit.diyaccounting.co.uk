// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/system-tests/runLocalHttpServer.system.test.js

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { runLocalHttpServer } from "../../behaviour-tests/helpers/behaviour-helpers.js";

async function httpGet(url) {
  const res = await fetch(url);
  return { status: res.status, text: await res.text() };
}

describe("System: runLocalHttpServer() helper", () => {
  /** @type {import('child_process').ChildProcess | undefined} */
  let serverProcess;
  const port = 3100 + Math.floor(Math.random() * 200);

  beforeAll(async () => {
    serverProcess = await runLocalHttpServer("run", port);
    expect(serverProcess?.pid).toBeTruthy();
  }, 60_000);

  afterAll(async () => {
    try {
      serverProcess?.kill();
    } catch {}
  });

  it("serves HTTP on the configured port", async () => {
    const { status, text } = await httpGet(`http://127.0.0.1:${port}`);
    expect(status).toBe(200);
    expect(text).toBeTypeOf("string");
    expect(text.length).toBeGreaterThan(0);
  });
});
