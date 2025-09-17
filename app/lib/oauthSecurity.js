// app/lib/oauthSecurity.js

import crypto from "crypto";
import logger from "./logger.js";

/**
 * Generates a cryptographically secure random state parameter for OAuth
 * @returns {string} - Base64URL encoded random state
 */
export function generateSecureState() {
  const randomBytes = crypto.randomBytes(32);
  return randomBytes.toString('base64url');
}

/**
 * Generates a cryptographically secure nonce for OpenID Connect
 * @returns {string} - Base64URL encoded random nonce
 */
export function generateSecureNonce() {
  const randomBytes = crypto.randomBytes(32);
  return randomBytes.toString('base64url');
}

/**
 * Validates OAuth state parameter
 * Checks format and minimum entropy requirements
 * @param {string} state - The state parameter to validate
 * @returns {object} - {isValid: boolean, message: string}
 */
export function validateOAuthState(state) {
  if (!state) {
    return { isValid: false, message: "OAuth state parameter is required" };
  }
  
  if (typeof state !== 'string') {
    return { isValid: false, message: "OAuth state must be a string" };
  }
  
  // Check minimum length (should be at least 16 characters for security)
  if (state.length < 16) {
    return { isValid: false, message: "OAuth state parameter is too short (minimum 16 characters)" };
  }
  
  // Check maximum reasonable length
  if (state.length > 256) {
    return { isValid: false, message: "OAuth state parameter is too long (maximum 256 characters)" };
  }
  
  // Check for basic alphanumeric/URL-safe characters
  if (!/^[A-Za-z0-9\-_]+$/.test(state)) {
    return { isValid: false, message: "OAuth state parameter contains invalid characters" };
  }
  
  return { isValid: true, message: "Valid OAuth state" };
}

/**
 * Validates nonce parameter for OpenID Connect
 * @param {string} nonce - The nonce parameter to validate
 * @returns {object} - {isValid: boolean, message: string}
 */
export function validateNonce(nonce) {
  if (!nonce) {
    return { isValid: false, message: "Nonce parameter is required for OpenID Connect" };
  }
  
  if (typeof nonce !== 'string') {
    return { isValid: false, message: "Nonce must be a string" };
  }
  
  // Check minimum length
  if (nonce.length < 16) {
    return { isValid: false, message: "Nonce parameter is too short (minimum 16 characters)" };
  }
  
  // Check maximum reasonable length
  if (nonce.length > 256) {
    return { isValid: false, message: "Nonce parameter is too long (maximum 256 characters)" };
  }
  
  // Check for basic alphanumeric/URL-safe characters
  if (!/^[A-Za-z0-9\-_]+$/.test(nonce)) {
    return { isValid: false, message: "Nonce parameter contains invalid characters" };
  }
  
  return { isValid: true, message: "Valid nonce" };
}

/**
 * Validates authorization code format
 * @param {string} code - The authorization code to validate
 * @returns {object} - {isValid: boolean, message: string}
 */
export function validateAuthorizationCode(code) {
  if (!code) {
    return { isValid: false, message: "Authorization code is required" };
  }
  
  if (typeof code !== 'string') {
    return { isValid: false, message: "Authorization code must be a string" };
  }
  
  // Check minimum length
  if (code.length < 8) {
    return { isValid: false, message: "Authorization code is too short" };
  }
  
  // Check maximum reasonable length
  if (code.length > 512) {
    return { isValid: false, message: "Authorization code is too long" };
  }
  
  // Basic format validation - should not contain spaces or control characters
  if (/[\s\x00-\x1f\x7f]/.test(code)) {
    return { isValid: false, message: "Authorization code contains invalid characters" };
  }
  
  return { isValid: true, message: "Valid authorization code" };
}

/**
 * Creates a CSRF token for form protection
 * @param {string} sessionId - Optional session identifier
 * @returns {string} - CSRF token
 */
export function createCSRFToken(sessionId = '') {
  const timestamp = Date.now().toString();
  const randomData = crypto.randomBytes(16).toString('hex');
  const data = `${timestamp}:${sessionId}:${randomData}`;
  
  const secret = process.env.DIY_SUBMIT_CSRF_SECRET || 'default-csrf-secret-change-me';
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(data);
  const signature = hmac.digest('hex');
  
  return `${Buffer.from(data).toString('base64')}.${signature}`;
}

/**
 * Validates a CSRF token
 * @param {string} token - The CSRF token to validate
 * @param {string} sessionId - Optional session identifier
 * @param {number} maxAge - Maximum age in milliseconds (default: 1 hour)
 * @returns {object} - {isValid: boolean, message: string}
 */
export function validateCSRFToken(token, sessionId = '', maxAge = 3600000) {
  if (!token) {
    return { isValid: false, message: "CSRF token is required" };
  }
  
  try {
    const [dataB64, signature] = token.split('.');
    if (!dataB64 || !signature) {
      return { isValid: false, message: "Invalid CSRF token format" };
    }
    
    const data = Buffer.from(dataB64, 'base64').toString();
    const [timestamp, tokenSessionId, randomData] = data.split(':');
    
    if (!timestamp || !randomData) {
      return { isValid: false, message: "Invalid CSRF token data" };
    }
    
    // Verify signature
    const secret = process.env.DIY_SUBMIT_CSRF_SECRET || 'default-csrf-secret-change-me';
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(data);
    const expectedSignature = hmac.digest('hex');
    
    if (signature !== expectedSignature) {
      return { isValid: false, message: "CSRF token signature verification failed" };
    }
    
    // Check timestamp
    const tokenTime = parseInt(timestamp);
    const currentTime = Date.now();
    if (currentTime - tokenTime > maxAge) {
      return { isValid: false, message: "CSRF token has expired" };
    }
    
    // Check session ID if provided
    if (sessionId && tokenSessionId !== sessionId) {
      return { isValid: false, message: "CSRF token session mismatch" };
    }
    
    return { isValid: true, message: "Valid CSRF token" };
  } catch (error) {
    logger.error({
      message: "CSRF token validation error",
      error: error.message,
      token: token ? `${token.substring(0, 16)}...` : 'null'
    });
    return { isValid: false, message: "CSRF token validation failed" };
  }
}

/**
 * Validates OAuth redirect URI against allowed patterns
 * @param {string} redirectUri - The redirect URI to validate
 * @param {string[]} allowedPatterns - Array of allowed URI patterns
 * @returns {object} - {isValid: boolean, message: string}
 */
export function validateRedirectUri(redirectUri, allowedPatterns = []) {
  if (!redirectUri) {
    return { isValid: false, message: "Redirect URI is required" };
  }
  
  try {
    const url = new URL(redirectUri);
    
    // Check protocol
    if (!['http:', 'https:'].includes(url.protocol)) {
      return { isValid: false, message: "Redirect URI must use HTTP or HTTPS" };
    }
    
    // Check against allowed patterns
    if (allowedPatterns.length > 0) {
      const isAllowed = allowedPatterns.some(pattern => {
        if (pattern.includes('*')) {
          // Simple wildcard matching
          const regexPattern = pattern.replace(/\*/g, '.*');
          return new RegExp(`^${regexPattern}$`).test(redirectUri);
        }
        return redirectUri === pattern;
      });
      
      if (!isAllowed) {
        return { isValid: false, message: "Redirect URI is not in the allowed list" };
      }
    }
    
    return { isValid: true, message: "Valid redirect URI" };
  } catch (error) {
    return { isValid: false, message: "Invalid redirect URI format" };
  }
}