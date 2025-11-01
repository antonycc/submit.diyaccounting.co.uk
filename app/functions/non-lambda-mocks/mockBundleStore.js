// app/lib/bundlesStore.js

const store = new Map(); // Map<userSub, string[]>

export function getBundlesStore() {
  return store;
}

export function resetBundlesStore() {
  store.clear();
}

export function getUserBundles(userId) {
  return store.get(userId) || [];
}

export function setUserBundles(userId, bundles) {
  store.set(userId, bundles);
}
