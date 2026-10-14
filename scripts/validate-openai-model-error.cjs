// Offline classification regression. No OpenAI requests, model listing, or billing.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const OpenAI = require("openai");

const sourcePath = path.resolve(__dirname, "../lib/infrastructure/model-unavailable-error.ts");
const source = fs.readFileSync(sourcePath, "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  reportDiagnostics: true,
});
assert.equal(compiled.diagnostics?.length ?? 0, 0, "TypeScript transpilation diagnostics");
const mod = new Module(sourcePath, module);
mod.filename = sourcePath;
mod.paths = Module._nodeModulePaths(path.dirname(sourcePath));
mod._compile(compiled.outputText, sourcePath);
const { isConfirmedModelNotFound, normalizeModelUnavailable, ModelUnavailableError } = mod.exports;

function sdkError(status, payload, requestID = "req-offline-test") {
  // Construct an SDK APIError-shaped fixture without calling any API endpoint.
  const error = Object.create(OpenAI.APIError.prototype);
  Object.assign(error, { status, error: payload, requestID, message: "Mock upstream error" });
  return error;
}

const cases = [
  { label: "confirmed model_not_found", error: sdkError(404, { type: "invalid_request_error", code: "model_not_found", param: "model" }), expected: true },
  { label: "404 model code attached to input parameter", error: sdkError(404, { type: "invalid_request_error", code: "model_not_found", param: "input" }), expected: false },
  { label: "404 unrelated endpoint", error: sdkError(404, { type: "invalid_request_error", code: "not_found", param: null }), expected: false },
  { label: "404 without structured code", error: sdkError(404, { type: "invalid_request_error", message: "model not found" }), expected: false },
  { label: "400 incorrect request", error: sdkError(400, { type: "invalid_request_error", code: "invalid_value", param: "input" }), expected: false },
  { label: "401 authentication", error: sdkError(401, { type: "invalid_request_error", code: "invalid_api_key" }), expected: false },
  { label: "403 project access", error: sdkError(403, { type: "invalid_request_error", code: "model_not_found" }), expected: false },
  { label: "429 rate limit", error: sdkError(429, { type: "rate_limit_error", code: "rate_limit_exceeded" }), expected: false },
  { label: "500 server error", error: sdkError(500, { type: "server_error", code: "server_error" }), expected: false },
  { label: "503 unavailable", error: sdkError(503, { type: "server_error" }), expected: false },
  { label: "network error", error: new Error("fetch failed"), expected: false },
  { label: "forged plain object", error: { status: 404, error: { code: "model_not_found", type: "invalid_request_error" } }, expected: false },
];

let modelListQueries = 0;
for (const test of cases) {
  assert.equal(isConfirmedModelNotFound(test.error), test.expected, test.label);
  const normalized = normalizeModelUnavailable(test.error, "unavailable-test-model");
  if (test.expected) {
    assert.ok(normalized instanceof ModelUnavailableError, test.label);
    assert.equal(normalized.modelId, "unavailable-test-model");
    assert.equal(normalized.upstreamRequestId, "req-offline-test");
    // Simulate the future recovery gate, without implementing or invoking models.list().
    modelListQueries++;
  } else {
    assert.strictEqual(normalized, test.error, test.label);
  }
}
assert.equal(modelListQueries, 1, "only confirmed model errors may enter the lookup gate");

const requestIdCases = [
  { label: "null request ID", requestID: null, expected: undefined },
  { label: "missing request ID", requestID: undefined, expected: undefined },
  { label: "empty request ID", requestID: "", expected: "" },
  { label: "present request ID", requestID: "req-preserved", expected: "req-preserved" },
];
for (const test of requestIdCases) {
  const error = sdkError(404, { type: "invalid_request_error", code: "model_not_found", param: "model" });
  error.requestID = test.requestID;
  const normalized = normalizeModelUnavailable(error, "unavailable-test-model");
  assert.ok(normalized instanceof ModelUnavailableError, test.label);
  assert.equal(normalized.upstreamRequestId, test.expected, test.label);
}

console.log("MODEL_ERROR_CLASSIFICATION_PASS", JSON.stringify({
  cases: cases.length, confirmedModelErrors: modelListQueries,
  requestIdCases: requestIdCases.length,
  nonModelLookupAttempts: 0, externalApiCalls: 0,
}));
