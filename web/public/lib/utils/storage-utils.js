/**
 * Safe access to localStorage and sessionStorage with error handling.
 */

export function getLocalStorageItem(key) {
  try {
    return typeof window !== "undefined" ? localStorage.getItem(key) : null;
  } catch (err) {
    console.warn(`Failed to read ${key} from localStorage:`, err.message);
    return null;
  }
}

export function setLocalStorageItem(key, value) {
  try {
    if (typeof window !== "undefined") {
      localStorage.setItem(key, value);
    }
  } catch (err) {
    console.warn(`Failed to write ${key} to localStorage:`, err.message);
  }
}

export function removeLocalStorageItem(key) {
  try {
    if (typeof window !== "undefined") {
      localStorage.removeItem(key);
    }
  } catch (err) {
    console.warn(`Failed to remove ${key} from localStorage:`, err.message);
  }
}

export function getSessionStorageItem(key) {
  try {
    return typeof window !== "undefined" ? sessionStorage.getItem(key) : null;
  } catch (err) {
    console.warn(`Failed to read ${key} from sessionStorage:`, err.message);
    return null;
  }
}

export function setSessionStorageItem(key, value) {
  try {
    if (typeof window !== "undefined") {
      sessionStorage.setItem(key, value);
    }
  } catch (err) {
    console.warn(`Failed to write ${key} to sessionStorage:`, err.message);
  }
}

export function removeSessionStorageItem(key) {
  try {
    if (typeof window !== "undefined") {
      sessionStorage.removeItem(key);
    }
  } catch (err) {
    console.warn(`Failed to remove ${key} from sessionStorage:`, err.message);
  }
}
