// app/lib/httpProxy.js

// Compatibility shim: re-export the proxy helper from services layer so
// tests can vi.doMock("@app/lib/httpProxy.js") and affect all imports.
export * from "../services/httpProxy.js";
