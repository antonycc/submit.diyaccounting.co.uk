// app/unit-tests/entitlementsService.test.js
import { describe, it, beforeEach, expect } from "vitest";
import { getActiveBundles, isActivityAllowed } from "@app/lib/entitlementsService.js";
import { __getInMemoryBundlesStore } from "@app/functions/bundle.js";

describe("entitlementsService", () => {
  const store = __getInMemoryBundlesStore();

  beforeEach(() => {
    store.clear?.();
  });

  it("anonymous user should have default and not be allowed to submit-vat", () => {
    const ctx = { sub: null, claims: {} };
    const active = getActiveBundles(ctx);
    expect(active).toContain("default");
    expect(isActivityAllowed("vat-obligations", ctx)).toBe(true);
    expect(isActivityAllowed("submit-vat", ctx)).toBe(false);
  });

  it("guest grant should allow submit-vat", () => {
    const sub = "ent-user-1";
    store.set(sub, ["guest|EXPIRY=2099-01-01"]);
    const ctx = { sub, claims: {} };
    const active = getActiveBundles(ctx);
    expect(active).toContain("guest");
    expect(isActivityAllowed("submit-vat", ctx)).toBe(true);
  });

  it("legacy requires transactionId qualifier", () => {
    const sub = "ent-user-2";
    store.set(sub, ["legacy|EXPIRY=2099-01-01"]);

    const ctxNoTxn = { sub, claims: {} };
    const activeNoTxn = getActiveBundles(ctxNoTxn);
    expect(activeNoTxn).not.toContain("legacy");

    const ctxWithTxn = { sub, claims: { transactionId: "abc-123" } };
    const activeWithTxn = getActiveBundles(ctxWithTxn);
    expect(activeWithTxn).toContain("legacy");
  });

  it("expired bundles should not appear in active bundles", () => {
    const sub = "ent-user-expired";
    store.set(sub, ["guest|EXPIRY=2020-01-01"]); // expired
    const ctx = { sub, claims: {} };
    const active = getActiveBundles(ctx);
    expect(active).not.toContain("guest");
  });

  it("multiple active bundles from different sources", () => {
    const sub = "ent-user-multi";
    store.set(sub, ["guest|EXPIRY=2099-01-01", "legacy|EXPIRY=2099-01-01"]);
    const ctx = { sub, claims: { transactionId: "abc-123" } };
    const active = getActiveBundles(ctx);
    expect(active).toContain("default"); // automatic
    expect(active).toContain("guest"); // on-request grant
    expect(active).toContain("legacy"); // on-request grant with qualifier
  });

  it("bundlesForActivity edge cases", () => {
    expect(isActivityAllowed("nonexistent-activity", { sub: "user", claims: {} })).toBe(false);
    expect(isActivityAllowed("submit-vat", { sub: null, claims: {} })).toBe(false); // anonymous
  });
});
