To implement a robust write‑through bundle cache you need a persistent store that survives page reloads and is keyed by the current user.  The existing `requestCache` in `lib/request-cache.js` is an **in‑memory, page‑scoped cache** with a very short TTL (5 s); it discards data when the tab closes and forces a network call on every mutation because it’s invalidated after POST/DELETE.  This doesn’t meet the new requirement.

The two browser‑native storage APIs capable of fulfilling the requirement are **IndexedDB** and the **Cache API**.  In practice:

* **Cache API** is designed for request/response pairs and is most convenient inside service workers.  Storing a custom JSON object involves wrapping it in a `Response` and retrieving it via `caches.match()`.  There’s no built‑in TTL, so you would need to store the expiry yourself and handle stale entries manually.  It also isn’t universally available on older Safari versions (though you’ve said you don’t target old browsers).

* **IndexedDB** is a transactional key/value store built into every modern browser.  You can store structured objects keyed by composite values (e.g. `userId:bundleKey`) and add an `expires` timestamp to each record.  IndexedDB doesn’t require a service worker and integrates cleanly with your existing scripts.

Given that you already operate without a service worker and need simple structured storage with TTL, **IndexedDB is the simpler and more future‑proof choice**.  It avoids the complexity of wrapping responses and manually managing HTTP response headers in the Cache API and offers straightforward expiration logic.

Below is a high‑level plan and specific changes for the `optitwo` branch to implement this:

---

### 1. Add a new persistent cache module

Create `web/public/lib/bundle-cache.js` (loaded before your inline script in `bundles.html`) that exposes a small API via `window.bundleCache`:

```js
// bundle-cache.js
(function () {
  'use strict';

  const DB_NAME = 'diy-submit-cache';
  const STORE_NAME = 'bundles';
  const DB_VERSION = 1;

  function openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function (event) {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'key' });
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
    return withStore('readonly', (store) => {
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
    return withStore('readwrite', (store) => {
      store.put({ key, value, expires });
    });
  }

  async function clearBundles(userId) {
    const key = buildKey(userId);
    return withStore('readwrite', (store) => {
      store.delete(key);
    });
  }

  window.bundleCache = { getBundles, setBundles, clearBundles };
})();
```

This module opens an IndexedDB database (`diy-submit-cache`) and creates an object store named `bundles`.  Each record stores the bundle list (`value`) for a user keyed by `bundles:<userId>` with an expiration timestamp.  `getBundles()` returns `null` if data is missing or expired; `setBundles()` writes new data with a TTL; `clearBundles()` deletes the record.

---

### 2. Include the module in `bundles.html`

In `web/public/account/bundles.html`, add a script tag for the new module just before your inline script:

```html
<script src="../lib/bundle-cache.js"></script>
```

Place this between the existing `<script src="../lib/request-cache.js"></script>` and your inline logic to ensure the module is loaded.

---

### 3. Modify `fetchUserBundles()` to use the cache

Inside the inline script in `bundles.html`, update the `fetchUserBundles` function:

1. **Derive the user ID** from the stored Cognito info:

   ```js
   const userInfoJson = localStorage.getItem('userInfo');
   let userId = null;
   try {
     const userInfo = JSON.parse(userInfoJson);
     userId = userInfo && userInfo.sub;
   } catch {}
   ```

2. **Check the IndexedDB cache** before making a network call:

   ```js
   if (userId) {
     const cached = await window.bundleCache.getBundles(userId);
     if (cached && Array.isArray(cached)) {
       __userBundles = cached;
       return __userBundles;
     }
   }
   ```

3. **Fetch from the server if the cache misses or is expired**:

    * Use `fetchAndParse("/api/v1/bundle", { ... })` exactly as today, but set `ttlMs` to `0` or remove it to avoid duplicate in-memory caching.  You still get the usual request deduplication from `requestCache`.
    * After parsing the JSON response, write the bundle list to the cache:

      ```js
      if (userId) {
        await window.bundleCache.setBundles(userId, __userBundles, 5 * 60 * 1000); // 5 minutes TTL
      }
      ```

4. **Return the list** as before.

Effectively, `fetchUserBundles` now tries the persistent cache first; if stale or absent, it fetches fresh data and caches it for 5 minutes.

---

### 4. Update POST/DELETE handlers to do write‑through

When a bundle is requested or removed, the UI already updates `__userBundles` by refetching the list from the server and re-rendering.  To avoid the unnecessary server call and enforce write‑through:

1. **Remove the forced re‑fetch** from the event handlers:

    * Delete or comment out `await fetchUserBundles();` after `invalidate("/api/v1/bundle")`.  The UI will still show the updated list because `__userBundles` is updated immediately.
    * Keep `invalidate('/api/v1/bundle')` to clear the short‑term in-memory cache in case the user navigates elsewhere and returns within the 5‑second window.

2. **Persist the new list into IndexedDB**:

    * After adding a bundle:

      ```js
      __userBundles.push(bundleId);
      const uid = userId; // same userId as before
      await window.bundleCache.setBundles(uid, __userBundles, 5 * 60 * 1000);
      ```
    * After removing a bundle:

      ```js
      __userBundles = __userBundles.filter(b => b !== bundleId);
      await window.bundleCache.setBundles(uid, __userBundles, 5 * 60 * 1000);
      ```
    * For `removeAllBundles()`, set an empty array in the cache and remove the localStorage hack.  You can keep the existing call to `invalidate("/api/v1/bundle")` but omit `await fetchUserBundles()`.

By writing through to IndexedDB whenever you mutate `__userBundles`, you ensure that subsequent page loads will read the updated list until the TTL expires.  Because the server returns 202 responses for asynchronous writes, there is no need to refresh the cache after the Lambda completes; the 5‑minute TTL naturally expires and triggers a new GET.

---

### 5. Adjust TTL usage

* For synchronous dynamic `GET` calls (Cache‑Aside Read pattern), continue to use `waitTimeMs = MAX_WAIT_MS` on the server side to ensure immediate completion, then cache the result on the client via IndexedDB as described.
* When the cached data expires or is missing, the page calls the GET endpoint again and refreshes the cache.  Clients can also manually force a refresh by clearing the cache (e.g. via a “Refresh” button) and invoking `fetchUserBundles`.

---

### Summary

By adding a tiny IndexedDB wrapper and extending the `bundles.html` logic to use it, you will achieve a **write‑through bundle cache** keyed by the current user.  This cache persists across page reloads, respects a five‑minute TTL, updates instantly upon POST/DELETE, and avoids unnecessary polling for the server’s eventual completion.  Although the Cache API could be used for this purpose, it would require more boilerplate and wouldn’t store structured data as neatly.  IndexedDB is better suited for storing small, user‑scoped JSON objects with custom expiry, making it the recommended choice for your “optitwo” branch.
