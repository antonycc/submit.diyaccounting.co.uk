// app/lib/circuitBreaker.js

import logger from "./logger.js";

const CIRCUIT_BREAKER_TABLE_NAME = process.env.CIRCUIT_BREAKER_TABLE_NAME;

// Lazy initialization of DynamoDB clients only when needed
// Using dynamic imports to avoid test initialization issues
let dynamodbClient = null;
let docClient = null;
let GetCommand = null;
let PutCommand = null;

async function getDynamoDBClient() {
  if (!CIRCUIT_BREAKER_TABLE_NAME) {
    return null;
  }
  if (!dynamodbClient) {
    // Dynamic import to avoid initialization issues in tests
    const dynamoModule = await import("@aws-sdk/client-dynamodb");
    const libModule = await import("@aws-sdk/lib-dynamodb");
    dynamodbClient = new dynamoModule.DynamoDBClient({});
    docClient = libModule.DynamoDBDocumentClient.from(dynamodbClient);
    GetCommand = libModule.GetCommand;
    PutCommand = libModule.PutCommand;
  }
  return docClient;
}
const FAILURE_THRESHOLD = parseInt(process.env.CIRCUIT_BREAKER_FAILURE_THRESHOLD || "5");
const TIMEOUT_THRESHOLD_MS = parseInt(process.env.CIRCUIT_BREAKER_TIMEOUT_THRESHOLD_MS || "10000");
const OPEN_TIMEOUT_SECONDS = parseInt(process.env.CIRCUIT_BREAKER_OPEN_TIMEOUT_SECONDS || "60");
const HALF_OPEN_MAX_REQUESTS = parseInt(process.env.CIRCUIT_BREAKER_HALF_OPEN_MAX_REQUESTS || "3");

// Circuit breaker states
const CIRCUIT_STATE = {
  CLOSED: "CLOSED", // Normal operation
  OPEN: "OPEN", // Blocking requests due to failures
  HALF_OPEN: "HALF_OPEN", // Testing if service has recovered
};

/**
 * Circuit breaker error thrown when circuit is open
 */
export class CircuitBreakerOpenError extends Error {
  constructor(hostName, state) {
    super(`Circuit breaker is OPEN for ${hostName}. Service is currently unavailable.`);
    this.name = "CircuitBreakerOpenError";
    this.hostName = hostName;
    this.circuitBreakerState = state;
  }
}

/**
 * Get the host name from a URL
 */
function getHostFromUrl(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch (error) {
    logger.error({ message: "Error parsing URL for circuit breaker", url, error: error.message });
    return null;
  }
}

/**
 * Get circuit breaker state for a host
 */
async function getCircuitBreakerState(hostName) {
  const client = await getDynamoDBClient();
  if (!client) {
    logger.debug({ message: "Circuit breaker disabled (no table configured)" });
    return null;
  }

  try {
    const command = new GetCommand({
      TableName: CIRCUIT_BREAKER_TABLE_NAME,
      Key: { hostName },
    });

    const result = await client.send(command);

    if (!result.Item) {
      // Initialize new circuit breaker state
      const initialState = {
        hostName,
        state: CIRCUIT_STATE.CLOSED,
        failureCount: 0,
        successCount: 0,
        lastFailureTime: null,
        lastSuccessTime: null,
        lastStateChange: new Date().toISOString(),
        totalRequests: 0,
        totalFailures: 0,
      };
      await updateCircuitBreakerState(initialState);
      return initialState;
    }

    return result.Item;
  } catch (error) {
    logger.error({
      message: "Error getting circuit breaker state",
      hostName,
      error: error.message,
      stack: error.stack,
    });
    // Fail open - allow request if we can't get state
    return null;
  }
}

/**
 * Update circuit breaker state in DynamoDB
 */
async function updateCircuitBreakerState(state) {
  const client = await getDynamoDBClient();
  if (!client) {
    return;
  }

  try {
    const command = new PutCommand({
      TableName: CIRCUIT_BREAKER_TABLE_NAME,
      Item: state,
    });

    await client.send(command);
    logger.info({
      message: "Updated circuit breaker state",
      hostName: state.hostName,
      state: state.state,
      failureCount: state.failureCount,
      successCount: state.successCount,
    });
  } catch (error) {
    logger.error({
      message: "Error updating circuit breaker state",
      hostName: state.hostName,
      error: error.message,
      stack: error.stack,
    });
  }
}

/**
 * Record a successful request
 */
async function recordSuccess(hostName, duration) {
  const state = await getCircuitBreakerState(hostName);
  if (!state) return;

  const now = new Date().toISOString();
  state.successCount = (state.successCount || 0) + 1;
  state.lastSuccessTime = now;
  state.totalRequests = (state.totalRequests || 0) + 1;

  // If in HALF_OPEN state and success, transition to CLOSED
  if (state.state === CIRCUIT_STATE.HALF_OPEN) {
    if (state.successCount >= HALF_OPEN_MAX_REQUESTS) {
      state.state = CIRCUIT_STATE.CLOSED;
      state.failureCount = 0;
      state.successCount = 0;
      state.lastStateChange = now;
      logger.info({
        message: "Circuit breaker transitioned from HALF_OPEN to CLOSED",
        hostName,
        duration,
      });
    }
  }

  // If in CLOSED state, reset failure count on success
  if (state.state === CIRCUIT_STATE.CLOSED) {
    state.failureCount = 0;
  }

  await updateCircuitBreakerState(state);
}

/**
 * Record a failed request
 */
async function recordFailure(hostName, error, duration) {
  const state = await getCircuitBreakerState(hostName);
  if (!state) return;

  const now = new Date().toISOString();
  state.failureCount = (state.failureCount || 0) + 1;
  state.lastFailureTime = now;
  state.totalRequests = (state.totalRequests || 0) + 1;
  state.totalFailures = (state.totalFailures || 0) + 1;

  // If in HALF_OPEN state and failure, transition to OPEN
  if (state.state === CIRCUIT_STATE.HALF_OPEN) {
    state.state = CIRCUIT_STATE.OPEN;
    state.lastStateChange = now;
    state.successCount = 0;
    logger.warn({
      message: "Circuit breaker transitioned from HALF_OPEN to OPEN",
      hostName,
      error: error?.message,
      duration,
    });
  }

  // If in CLOSED state and failure count exceeds threshold, transition to OPEN
  if (state.state === CIRCUIT_STATE.CLOSED && state.failureCount >= FAILURE_THRESHOLD) {
    state.state = CIRCUIT_STATE.OPEN;
    state.lastStateChange = now;
    logger.warn({
      message: "Circuit breaker transitioned from CLOSED to OPEN",
      hostName,
      failureCount: state.failureCount,
      threshold: FAILURE_THRESHOLD,
      error: error?.message,
      duration,
    });
  }

  await updateCircuitBreakerState(state);
}

/**
 * Check if request should be allowed based on circuit breaker state
 */
async function shouldAllowRequest(hostName) {
  const state = await getCircuitBreakerState(hostName);
  if (!state) return true; // Fail open if no state

  const now = Date.now();

  // If circuit is OPEN, check if enough time has passed to transition to HALF_OPEN
  if (state.state === CIRCUIT_STATE.OPEN) {
    const timeSinceOpen = now - new Date(state.lastStateChange).getTime();
    if (timeSinceOpen > OPEN_TIMEOUT_SECONDS * 1000) {
      // Transition to HALF_OPEN
      state.state = CIRCUIT_STATE.HALF_OPEN;
      state.successCount = 0;
      state.failureCount = 0;
      state.lastStateChange = new Date().toISOString();
      await updateCircuitBreakerState(state);
      logger.info({
        message: "Circuit breaker transitioned from OPEN to HALF_OPEN",
        hostName,
        timeSinceOpen,
      });
      return true;
    }
    return false; // Circuit is still OPEN
  }

  // If in HALF_OPEN state, limit number of concurrent test requests
  if (state.state === CIRCUIT_STATE.HALF_OPEN) {
    // Allow limited requests to test if service has recovered
    return true; // Simplified: allow request, will be tracked in recordSuccess/recordFailure
  }

  // Circuit is CLOSED, allow request
  return true;
}

/**
 * Wrap a fetch call with circuit breaker protection
 */
export async function fetchWithCircuitBreaker(url, options = {}) {
  const hostName = getHostFromUrl(url);
  if (!hostName) {
    // If we can't parse hostname, proceed without circuit breaker
    return fetch(url, options);
  }

  // Check if request should be allowed
  const allowed = await shouldAllowRequest(hostName);
  if (!allowed) {
    const state = await getCircuitBreakerState(hostName);
    throw new CircuitBreakerOpenError(hostName, state);
  }

  const startTime = Date.now();
  try {
    const response = await fetch(url, options);
    const duration = Date.now() - startTime;

    // Check for timeout
    if (duration > TIMEOUT_THRESHOLD_MS) {
      logger.warn({
        message: "Request exceeded timeout threshold",
        hostName,
        duration,
        threshold: TIMEOUT_THRESHOLD_MS,
      });
      await recordFailure(hostName, new Error("Timeout threshold exceeded"), duration);
    }
    // Check for HTTP error status codes (5xx, 429)
    else if (response.status >= 500 || response.status === 429) {
      logger.warn({
        message: "Request returned error status",
        hostName,
        status: response.status,
        duration,
      });
      await recordFailure(hostName, new Error(`HTTP ${response.status}`), duration);
    } else {
      // Success
      await recordSuccess(hostName, duration);
    }

    return response;
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error({
      message: "Request failed with exception",
      hostName,
      error: error.message,
      duration,
    });
    await recordFailure(hostName, error, duration);
    throw error;
  }
}

/**
 * Get circuit breaker status for a host (for monitoring/debugging)
 */
export async function getCircuitBreakerStatus(hostName) {
  return await getCircuitBreakerState(hostName);
}

/**
 * Manually reset circuit breaker for a host (for admin operations)
 */
export async function resetCircuitBreaker(hostName) {
  const state = {
    hostName,
    state: CIRCUIT_STATE.CLOSED,
    failureCount: 0,
    successCount: 0,
    lastFailureTime: null,
    lastSuccessTime: null,
    lastStateChange: new Date().toISOString(),
    totalRequests: 0,
    totalFailures: 0,
  };
  await updateCircuitBreakerState(state);
  logger.info({ message: "Circuit breaker manually reset", hostName });
  return state;
}
