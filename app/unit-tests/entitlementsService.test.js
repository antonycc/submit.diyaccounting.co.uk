// app/unit-tests/entitlementsService.test.js
import { describe, it, beforeEach, expect } from "vitest";
import { getActiveBundles, isActivityAllowed } from "@app/lib/entitlementsService.js";
import { __getInMemoryBundlesStore } from "@app/functions/bundle.js";

describe("entitlementsService", () => {
  const store = __getInMemoryBundlesStore();

  beforeEach(() => {
    store.clear?.();
  });

  // it("anonymous user should have default and not be allowed to submit-vat", () => {
  //  const ctx = { sub: null, claims: {} };
  //  const active = getActiveBundles(ctx);
  //  expect(active).toContain("default");
  //  expect(isActivityAllowed("vat-obligations", ctx)).toBe(true);
  //  expect(isActivityAllowed("submit-vat", ctx)).toBe(false);
  // });

  // it("guest grant should allow submit-vat", () => {
  //  const sub = "ent-user-1";
  //  store.set(sub, ["guest|EXPIRY=2099-01-01"]);
  //  const ctx = { sub, claims: {} };
  //  const active = getActiveBundles(ctx);
  //  expect(active).toContain("guest");
  //  expect(isActivityAllowed("submit-vat", ctx)).toBe(true);
  // });

  it("legacy requires transactionId qualifier", () => {
    const sub = "ent-user-2";
    store.set(sub, ["legacy|EXPIRY=2099-01-01"]);

    const ctxNoTxn = { sub, claims: {} };
    const activeNoTxn = getActiveBundles(ctxNoTxn);
    expect(activeNoTxn).not.toContain("legacy");

    const ctxWithTxn = { sub, claims: { transactionId: "abc-123" } };
    const activeWithTxn = getActiveBundles(ctxWithTxn);
    // expect(activeWithTxn).toContain("legacy");
  });
});
