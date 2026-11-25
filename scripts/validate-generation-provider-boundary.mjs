import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { extname } from "node:path";

const input = {
  platformId: "naver",
  categoryId: "health",
  presetId: "",
  freeTopic: "합성 건강 정보",
  attributes: {},
  extraConditions: "",
  styleId: "auto",
  styleIntensity: 3,
  structureId: "auto",
  length: "short",
  imageCount: 2,
};
const providerDraft = {
  title: "합성 Provider 응답",
  summary: "합성 원고",
  intro: [],
  sections: [],
  closing: [],
  tags: [],
  images: [],
  warnings: [],
};

const calls = [];
const events = [];
let providerError;
const harness = {
  create(payload) {
    calls.push(payload);
    if (providerError) throw providerError;
    return { output_text: JSON.stringify(providerDraft), output: [] };
  },
};
globalThis.blotoriProviderBoundaryFixture = harness;
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "openai" || specifier === "next/server") {
      return { url: `blotori-fixture:${specifier}`, shortCircuit: true };
    }
    if (specifier.startsWith(".") && !extname(specifier)) {
      try { return nextResolve(`${specifier}.ts`, context); } catch { /* Use Node's normal resolution. */ }
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === "blotori-fixture:openai") {
      return {
        format: "module",
        shortCircuit: true,
        source: `export default class OpenAI {
          static APIError = class extends Error {};
          responses = { create: (...args) => globalThis.blotoriProviderBoundaryFixture.create(...args) };
        }`,
      };
    }
    if (url === "blotori-fixture:next/server") {
      return { format: "module", shortCircuit: true, source: "export const NextResponse = Response;" };
    }
    return nextLoad(url, context);
  },
});

let fetchAttempts = 0;
globalThis.fetch = async () => {
  fetchAttempts += 1;
  throw new Error("Network is prohibited in this fixture");
};
for (const level of ["info", "warn", "error"]) {
  const originalLog = console[level].bind(console);
  console[level] = (event, ...args) => {
    if (typeof event === "string" && event.startsWith("{")) events.push(JSON.parse(event));
    else originalLog(event, ...args);
  };
}
for (const key of ["OPENAI_API_KEY", "OPENAI_VECTOR_STORE_ID", "BLOTORI_MOCK_MODE", "OPENAI_MODEL", "BLOTORI_RAG_MAX_RESULTS"]) {
  delete process.env[key];
}
process.env.BLOTORI_RAG_ENABLED = "true";
process.env.BLOTORI_RAG_CATEGORIES = "health";

const { POST } = await import("../app/api/generate/route.ts");
const { generateBlogDraft } = await import("../lib/application/generate-blog-draft.ts");
const { makeMockDraft } = await import("../lib/infrastructure/mock-content-adapter.ts");

async function request() {
  const response = await POST(new Request("http://localhost/api/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  }));
  const body = await response.json();
  assert.ok(body.requestId);
  assert.equal(response.headers.get("x-blotori-request-id"), body.requestId);
  return { status: response.status, body, logs: events.filter((event) => event.requestId === body.requestId) };
}

// Mock must be explicitly enabled and keeps its existing normalized draft.
process.env.BLOTORI_MOCK_MODE = "true";
const mock = await request();
assert.equal(mock.status, 200);
assert.equal(mock.body.mode, "mock");
const expectedMock = await generateBlogDraft(input, { mode: "mock", generate: async (request) => makeMockDraft(request) });
assert.deepEqual(mock.body.draft, JSON.parse(JSON.stringify(expectedMock.draft)));
assert.equal(calls.length, 0);

process.env.BLOTORI_MOCK_MODE = "false";
const missingKey = await request();
assert.equal(missingKey.status, 503);
assert.equal(missingKey.body.code, "OPENAI_CONFIG_ERROR");
assert.equal(calls.length, 0);

// A configured key still takes precedence over explicit mock.
process.env.BLOTORI_MOCK_MODE = "true";
process.env.OPENAI_API_KEY = "fixture-key";
const api = await request();
assert.equal(api.status, 200);
assert.equal(api.body.mode, "api");
assert.equal(api.body.draft.title, providerDraft.title);
assert.deepEqual(api.logs.map((event) => event.event), ["generation.started", "generation.completed"]);
assert.equal(calls.length, 1);

// Provider errors retain the existing status, code and logging with no service fallback.
providerError = new Error("fixture upstream timeout");
const failure = await request();
assert.equal(failure.status, 502);
assert.equal(failure.body.code, "UPSTREAM_TIMEOUT");
assert.deepEqual(failure.logs.map((event) => event.event), ["generation.started", "generation.failed"]);
assert.equal(calls.length, 2);
providerError = undefined;

// An empty RAG response retains the baseline HTTP behavior in this refactor.
process.env.OPENAI_VECTOR_STORE_ID = "vs_fixture";
const rag = await request();
assert.equal(rag.status, 200);
assert.equal(rag.body.mode, "api");
assert.equal(rag.body.draft.knowledgeGrounding.used, false);
assert.deepEqual(rag.logs.map((event) => event.event), ["generation.started", "generation.completed", "rag.empty_result"]);
assert.equal(calls[2]?.tools?.[0]?.type, "file_search");
assert.equal(calls.length, 3);
assert.equal(fetchAttempts, 0);

console.log("Provider boundary PASS (5 scenarios, 3 synthetic adapter calls, 0 network calls)");
