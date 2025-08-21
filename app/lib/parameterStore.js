// app/lib/parameterStore.js

// AWS SSM Parameter Store client is loaded lazily to avoid requiring it during tests
let __ssmModule;
let __ssmClient;

async function getSsmModule() {
  if (!__ssmModule) {
    __ssmModule = await import("@aws-sdk/client-ssm");
  }
  return __ssmModule;
}

async function getSsmClient() {
  if (!__ssmClient) {
    const mod = await getSsmModule();
    __ssmClient = new mod.SSMClient({ region: process.env.AWS_REGION || "eu-west-2" });
  }
  return __ssmClient;
}

// In-memory cache for parameter values with TTL
const __parameterCache = new Map();
const CACHE_TTL_MS = 30000; // 30 seconds TTL

/**
 * Get a parameter from AWS Systems Manager Parameter Store with caching
 * @param {string} parameterName - The parameter name (e.g., "/diy-submit/bundle-mock")
 * @param {string} fallbackValue - Fallback value if parameter doesn't exist or can't be read
 * @returns {Promise<string>} The parameter value
 */
export async function getParameter(parameterName, fallbackValue = "") {
  try {
    // Check cache first
    const cached = __parameterCache.get(parameterName);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      console.log(`[PARAMETER_STORE] Cache hit for ${parameterName}: ${cached.value}`);
      return cached.value;
    }

    console.log(`[PARAMETER_STORE] Fetching parameter: ${parameterName}`);
    
    const mod = await getSsmModule();
    const client = await getSsmClient();
    
    const command = new mod.GetParameterCommand({
      Name: parameterName,
      WithDecryption: false
    });
    
    const response = await client.send(command);
    const value = response.Parameter?.Value || fallbackValue;
    
    // Cache the result
    __parameterCache.set(parameterName, {
      value,
      timestamp: Date.now()
    });
    
    console.log(`[PARAMETER_STORE] Retrieved ${parameterName}: ${value}`);
    return value;
    
  } catch (error) {
    console.log(`[PARAMETER_STORE] Error fetching ${parameterName}: ${error.message}. Using fallback: ${fallbackValue}`);
    return fallbackValue;
  }
}

/**
 * Get boolean parameter value from Parameter Store
 * @param {string} parameterName - The parameter name
 * @param {boolean|null} fallbackValue - Fallback value if parameter doesn't exist (null means no fallback)
 * @returns {Promise<boolean|null>} The boolean parameter value or null if not found and no fallback
 */
export async function getBooleanParameter(parameterName, fallbackValue = false) {
  const value = await getParameter(parameterName, fallbackValue === null ? "NOT_FOUND" : String(fallbackValue));
  if (value === "NOT_FOUND" && fallbackValue === null) {
    return null;
  }
  return String(value).toLowerCase() === "true" || value === "1";
}

/**
 * Check if mock mode is enabled for bundles via parameter store
 * Falls back to environment variable if parameter store is not available
 * @returns {Promise<boolean>} True if bundle mock mode is enabled
 */
export async function isBundleMockMode() {
  // Try parameter store first
  try {
    const parameterValue = await getBooleanParameter("/diy-submit/bundle-mock", null);
    if (parameterValue !== null) {
      return parameterValue;
    }
  } catch (error) {
    console.log("[PARAMETER_STORE] Failed to check bundle mock parameter, falling back to environment variable");
  }
  
  // Fallback to environment variable (current behavior)
  return (
    String(process.env.DIY_SUBMIT_BUNDLE_MOCK || "").toLowerCase() === "true" ||
    process.env.DIY_SUBMIT_BUNDLE_MOCK === "1"
  );
}

/**
 * Check if mock mode is enabled for authentication via parameter store
 * Falls back to checking if mock oauth2 server should be used
 * @returns {Promise<boolean>} True if auth mock mode is enabled
 */
export async function isAuthMockMode() {
  // Try parameter store first
  try {
    const parameterValue = await getBooleanParameter("/diy-submit/auth-mock", null);
    if (parameterValue !== null) {
      return parameterValue;
    }
  } catch (error) {
    console.log("[PARAMETER_STORE] Failed to check auth mock parameter, falling back to environment variable");
  }
  
  // Fallback to environment variable check for mock oauth2 server
  return String(process.env.DIY_SUBMIT_TEST_MOCK_OAUTH2 || "").toLowerCase() === "run";
}

/**
 * Clear the parameter cache (useful for testing)
 */
export function clearParameterCache() {
  __parameterCache.clear();
}

/**
 * Get the current cache state (useful for testing)
 */
export function __getParameterCache() {
  return __parameterCache;
}