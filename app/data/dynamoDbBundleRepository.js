// Keep data path as a thin re-export of lib for compatibility, so that
// tests mocking the lib path also affect consumers importing from data path.
export * from "../lib/dynamoDbBundleRepository.js";
