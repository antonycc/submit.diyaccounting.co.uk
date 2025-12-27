// bundle-cache.js
(function () {
  "use strict";

  const DB_NAME = "diy-submit-cache";
  const STORE_NAME = "bundles";
  const DB_VERSION = 1;

  function openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function (event) {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "key" });
        }
      };
      req.onerror = (e) => reject(e.target.error);
      req.onsuccess = (e) => resolve(e.target.result);
    });
  }

  async function withStore(type, callback) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, type);
      const store = tx.objectStore(STORE_NAME);
      const result = callback(store);
      tx.oncomplete = () => resolve(result);
      tx.onerror = (e) => reject(e.target.error);
    });
  }

  function buildKey(userId) {
    return `bundles:${userId}`;
  }

  async function getBundles(userId) {
    const key = buildKey(userId);
    return withStore("readonly", (store) => {
      return new Promise((resolve) => {
        const req = store.get(key);
        req.onsuccess = (event) => {
          const record = event.target.result;
          if (!record) return resolve(null);
          // expire stale records
          if (record.expires && record.expires <= Date.now()) {
            // async deletion; ignore errors
            store.delete(key);
            return resolve(null);
          }
          resolve(record.value);
        };
        req.onerror = () => resolve(null);
      });
    });
  }

  async function setBundles(userId, value, ttlMs) {
    const key = buildKey(userId);
    const expires = Date.now() + (ttlMs || 0);
    return withStore("readwrite", (store) => {
      store.put({ key, value, expires });
    });
  }

  async function clearBundles(userId) {
    const key = buildKey(userId);
    return withStore("readwrite", (store) => {
      store.delete(key);
    });
  }

  window.bundleCache = { getBundles, setBundles, clearBundles };
})();
