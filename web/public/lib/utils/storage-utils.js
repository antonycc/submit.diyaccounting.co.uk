// Storage utility functions for localStorage and sessionStorage

/**
 * Get item from localStorage safely
 * @param {string} key - Storage key
 * @returns {string|null} Value or null if not found
 */
export function getLocalStorage(key) {
  try {
    return localStorage.getItem(key);
  } catch (error) {
    console.warn(`Failed to get localStorage item "${key}":`, error);
    return null;
  }
}

/**
 * Set item in localStorage safely
 * @param {string} key - Storage key
 * @param {string} value - Value to store
 * @returns {boolean} True if successful, false otherwise
 */
export function setLocalStorage(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (error) {
    console.warn(`Failed to set localStorage item "${key}":`, error);
    return false;
  }
}

/**
 * Remove item from localStorage safely
 * @param {string} key - Storage key
 * @returns {boolean} True if successful, false otherwise
 */
export function removeLocalStorage(key) {
  try {
    localStorage.removeItem(key);
    return true;
  } catch (error) {
    console.warn(`Failed to remove localStorage item "${key}":`, error);
    return false;
  }
}

/**
 * Get item from sessionStorage safely
 * @param {string} key - Storage key
 * @returns {string|null} Value or null if not found
 */
export function getSessionStorage(key) {
  try {
    return sessionStorage.getItem(key);
  } catch (error) {
    console.warn(`Failed to get sessionStorage item "${key}":`, error);
    return null;
  }
}

/**
 * Set item in sessionStorage safely
 * @param {string} key - Storage key
 * @param {string} value - Value to store
 * @returns {boolean} True if successful, false otherwise
 */
export function setSessionStorage(key, value) {
  try {
    sessionStorage.setItem(key, value);
    return true;
  } catch (error) {
    console.warn(`Failed to set sessionStorage item "${key}":`, error);
    return false;
  }
}

/**
 * Remove item from sessionStorage safely
 * @param {string} key - Storage key
 * @returns {boolean} True if successful, false otherwise
 */
export function removeSessionStorage(key) {
  try {
    sessionStorage.removeItem(key);
    return true;
  } catch (error) {
    console.warn(`Failed to remove sessionStorage item "${key}":`, error);
    return false;
  }
}
