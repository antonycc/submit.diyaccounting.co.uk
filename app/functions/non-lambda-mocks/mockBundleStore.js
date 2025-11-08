// app/lib/bundlesStore.js

import { hashSub } from "../../lib/subHasher.js";

const store = new Map(); // Map<hashedSub, string[]>

export function getBundlesStore() {
  return store;
}

export function resetBundlesStore() {
  store.clear();
}

export function getUserBundles(userId) {
  const hashedId = hashSub(userId);
  return store.get(hashedId) || [];
}

export function setUserBundles(userId, bundles) {
  const hashedId = hashSub(userId);
  store.set(hashedId, bundles);
}
