// Synthetic, offline contract QA. Never calls OpenAI, Naver, a helper, or an external API.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import Module, { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const originalExtension = Module._extensions[".ts"];

Module._extensions[".ts"] = (module, filename) => module._compile(ts.transpileModule(readFileSync(filename, "utf8"), {
  fileName: filename,
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    esModuleInterop: true,
  },
}).outputText, filename);

try {
  const {
    foodFactLines,
    usableFoodFact,
    validCalendarDate,
    validFoodReviewFacts,
    validHttpsSourceUrl,
  } = require("../lib/domain/food-review.ts");

  assert.equal(validCalendarDate("2024-02-29"), true);
  for (const value of ["2025-02-29", "2026-00-10", "2026-13-10", "2026-04-31", "2026-01-00", "2026-1-01"]) {
    assert.equal(validCalendarDate(value), false, `invalid calendar date admitted: ${value}`);
  }

  assert.equal(validHttpsSourceUrl("https://example.com/hours?day=mon#notice"), true);
  for (const value of ["http://example.com", "https://example.com/hours bad", " https://example.com", "https://user:pass@example.com", "not-a-url"]) {
    assert.equal(validHttpsSourceUrl(value), false, `invalid HTTPS provenance admitted: ${value}`);
  }

  assert.equal(validFoodReviewFacts({ place: { status: "USER_CONFIRMED", value: "synthetic place" } }), true);
  assert.equal(validFoodReviewFacts({ place: { status: "RAW_USER_INPUT", value: "synthetic raw place" } }), true);
  assert.equal(validFoodReviewFacts({ arbitrary: { status: "USER_CONFIRMED", value: "x" } }), false);
  assert.equal(validFoodReviewFacts({ place: { status: "INVALID", value: "x" } }), false);
  assert.equal(validFoodReviewFacts({ place: { status: "USER_CONFIRMED", value: "x".repeat(501) } }), false);
  assert.equal(validFoodReviewFacts({ place: { status: "USER_CONFIRMED", sourceUrl: "x".repeat(2049) } }), false);
  assert.equal(validFoodReviewFacts({ price: { status: "USER_CONFIRMED", value: "10000", checkedAt: "2026-02-30" } }), false);

  assert.equal(usableFoodFact("visit", { status: "USER_CONFIRMED", value: "visited" }), true);
  assert.equal(usableFoodFact("place", { status: "RAW_USER_INPUT", value: "synthetic raw place" }), false,
    "raw form text is structurally valid but not an admitted verified fact");
  assert.equal(usableFoodFact("price", { status: "USER_CONFIRMED", value: "10000" }), false);
  assert.equal(usableFoodFact("price", { status: "USER_CONFIRMED", value: "10000", checkedAt: "2026-11-03" }), true);
  assert.equal(usableFoodFact("hours", { status: "EXTERNAL_VERIFIED", value: "10-18", checkedAt: "2026-11-03" }), false);
  assert.equal(usableFoodFact("hours", { status: "EXTERNAL_VERIFIED", value: "10-18", sourceUrl: "http://example.com", checkedAt: "2026-11-03" }), false);
  assert.equal(usableFoodFact("hours", { status: "EXTERNAL_VERIFIED", value: "10-18", sourceUrl: "https://example.com/hours", checkedAt: "2026-11-03" }), true);
  assert.equal(usableFoodFact("parking", { status: "UNKNOWN", value: "unverified parking" }), false);
  assert.equal(usableFoodFact("parking", { status: "NOT_APPLICABLE", value: "not applicable" }), false);

  const facts = {
    place: { status: "RAW_USER_INPUT", value: "synthetic raw place" },
    visit: { status: "USER_CONFIRMED", value: "synthetic visit" },
    price: { status: "USER_CONFIRMED", value: "10000", checkedAt: "2026-11-03" },
    parking: { status: "UNKNOWN", value: "unverified parking" },
    hours: { status: "EXTERNAL_VERIFIED", value: "unverified hours", sourceUrl: "http://example.com/hours", checkedAt: "2026-11-03" },
    address: { status: "EXTERNAL_VERIFIED", value: "synthetic address", sourceUrl: "https://example.com/address", checkedAt: "2026-11-03" },
  };
  const rawBefore = structuredClone(facts);
  const lines = foodFactLines(facts);

  assert.deepEqual(facts, rawBefore, "raw food facts must remain unchanged");
  assert.equal(lines.length, 3);
  assert.equal(lines.some((line) => line.includes("synthetic raw place") || line.includes("unverified parking") || line.includes("unverified hours")), false);
  assert.equal(lines.some((line) => line.includes("https://") || line.includes("http://")), false, "source URL must not be emitted");

  console.log(JSON.stringify({
    result: "FOOD_REVIEW_FACTS_SYNTHETIC_PASS",
    admitted: lines.length,
    excluded: 3,
    rawInputUnchanged: true,
    sourceUrlExposed: false,
    externalCalls: 0,
    userData: 0,
  }));
} finally {
  if (originalExtension) Module._extensions[".ts"] = originalExtension;
  else delete Module._extensions[".ts"];
}
