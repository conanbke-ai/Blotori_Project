import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import Module, { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const ts = require("typescript");
const { load } = require("cheerio");
const originalTsLoader = Module._extensions[".ts"];
Module._extensions[".ts"] = (module, filename) => module._compile(ts.transpileModule(readFileSync(filename, "utf8"), {
  fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, filename);

try {
  const { buildPlatformExport } = require("../lib/application/platform-exporter.ts");
  const { getPlatformCapabilities } = require("../lib/domain/platform-capabilities.ts");
  const { copyPlatformContent, copyResultMessage, browserClipboard } = require("../lib/browser/copy-platform-content.ts");
  const draft = {
    title: "Separate title", summary: "Editor-only summary", intro: ["Intro <script>alert('x')</script> & 시작"],
    presentation: { titleAlign: "center", introAlign: "center", density: "airy" },
    sections: [
      { id: "s1", heading: 'Heading <img src=x onerror="alert(1)">', paragraphs: ["긴 강조 문구와 강조, 강조 & <끝>", "color:#2D8FA0;를 텍스트로만 취급"], presentation: { headingAlign: "center", bodyAlign: "left", visualStyle: "key-point", emphasis: [{ phrase: "긴 강조 문구", kind: "accent" }, { phrase: "강조", kind: "bold" }, { phrase: "& <끝>", kind: "highlight" }, { phrase: "color", kind: "accent" }, { phrase: "없는 문구", kind: "highlight" }] } },
      { id: "glossary", heading: "용어해설", paragraphs: ["용어 설명"], presentation: { visualStyle: "glossary" } },
      { id: "s2", heading: "다음 문단", paragraphs: ["본문 유지"], presentation: { visualStyle: "quote", bodyAlign: "center" } },
    ],
    closing: ["마무리"], tags: ["tag", "<unsafe>"], warnings: [],
    images: [
      { id: "IMG-01-HERO", role: "HERO", label: "대표", afterSectionId: null, placement: "도입 앞", size: "문서 너비", ratio: "16:9", prompt: "PRIVATE_PROMPT_NEVER_IN_BODY" },
      { id: "IMG-02", role: "TIP", label: '사진 <script>bad()</script>', afterSectionId: "s1", placement: "첫 섹션 뒤", size: "작게", ratio: "4:3", prompt: "PRIVATE_PROMPT_NEVER_IN_BODY" },
      { id: "IMG-03", role: "TIP", label: "용어 사진", afterSectionId: "glossary", placement: "용어 뒤", size: "작게", ratio: "1:1", prompt: "prompt" },
      { id: "IMG-04", role: "TIP", label: "이전 위치", afterSectionId: "missing", placement: "없는 섹션", size: "작게", ratio: "1:1", prompt: "prompt" },
    ],
  };
  const before = structuredClone(draft);
  function deepFreeze(value) { if (value && typeof value === "object") { Object.values(value).forEach(deepFreeze); Object.freeze(value); } return value; }
  deepFreeze(draft);
  const modes = { naver: "rich", tistory: "rich", blogger: "rich", wordpress: "rich", brunch: "plain", other: "rich" };
  const firstNaver = buildPlatformExport(draft, "naver");
  for (const [platform, mode] of Object.entries(modes)) {
    const exported = buildPlatformExport(draft, platform);
    assert.equal(exported.clipboardMode, mode);
    assert.equal(exported.titleText, draft.title);
    assert.equal(exported.tagsText, "#tag #<unsafe>");
    assert.ok(!exported.plainText.includes(draft.title));
    assert.ok(!exported.plainText.includes(draft.summary));
    assert.ok(!exported.plainText.includes("PRIVATE_PROMPT"));
    assert.ok(exported.plainText.indexOf("마무리") < exported.plainText.indexOf("용어해설"));
    for (const image of draft.images) assert.equal(exported.plainText.split(`[${image.id} 삽입`).length - 1, 1, `${platform}: preserve every slot`);
    assert.equal(exported.capabilities.externalPaste, "unverified");
    assert.equal(exported.capabilities.images, "manual-upload");
    if (mode === "rich") {
      assert.ok(exported.html);
      const $ = load(exported.html);
      assert.equal($("script,img,iframe,style,link").length, 0, "User text cannot create active HTML or remote resources");
      assert.equal($("[onerror],[onclick],[class]").length, 0, "No event handlers or external class styling");
      assert.equal($("span span").length, 0, "Overlapping emphasis must not corrupt generated markup");
      assert.ok($('span[style*="color:#2D8FA0"]').length >= 1);
      assert.ok($('span[style*="background-color:#FFF0A8"]').length >= 1);
      assert.ok($('p[style*="text-align:center"]').length >= 1);
      assert.ok($.root().text().includes(draft.sections[0].heading));
      assert.ok($.root().text().includes(draft.sections[0].paragraphs[0]));
      assert.ok(!exported.html.includes("PRIVATE_PROMPT"));
      assert.equal($("h2").length, platform === "naver" ? 0 : 3);
      for (const image of draft.images) assert.ok($.root().text().includes(image.id));
    } else assert.equal(exported.html, undefined);
  }
  assert.deepEqual(draft, before, "Every platform projection must preserve the canonical draft, styling, anchors and prompts");
  assert.deepEqual(buildPlatformExport(draft, "naver"), firstNaver, "Round-trip platform switching must be lossless");
  const returnedCapabilities = getPlatformCapabilities("naver");
  returnedCapabilities.defaultCopyMode = "plain";
  assert.equal(getPlatformCapabilities("naver").defaultCopyMode, "rich", "Callers cannot mutate the capability registry");

  const calls = [];
  const rich = await copyPlatformContent(firstNaver, "rich", { writeRich: async (...args) => calls.push(["rich", ...args]), writePlain: async (text) => calls.push(["plain", text]) });
  assert.deepEqual(rich, { status: "copied", format: "rich", fallback: false });
  assert.deepEqual(calls, [["rich", firstNaver.html, firstNaver.plainText]]);
  const fallbackCalls = [];
  const fallback = await copyPlatformContent(firstNaver, "rich", { writeRich: async () => { throw new Error("NotAllowedError"); }, writePlain: async (text) => fallbackCalls.push(text) });
  assert.deepEqual(fallback, { status: "copied", format: "plain", fallback: true });
  assert.deepEqual(fallbackCalls, [firstNaver.plainText]);
  assert.match(copyResultMessage(fallback), /텍스트만 복사됐어요/);
  assert.doesNotMatch(copyResultMessage(fallback), /서식을 포함해 복사했어요/);
  const unsupported = await copyPlatformContent(firstNaver, "rich", { writePlain: async () => {} });
  assert.equal(unsupported.fallback, true);
  const denied = await copyPlatformContent(firstNaver, "rich", { writeRich: async () => { throw Error(); }, writePlain: async () => { throw Error(); } });
  assert.deepEqual(denied, { status: "failed", format: null, fallback: false });
  assert.match(copyResultMessage(denied), /복사하지 못했어요/);
  const plain = await copyPlatformContent(firstNaver, "plain", { writeRich: async () => { assert.fail("Explicit plain copy must never write HTML"); }, writePlain: async () => {} });
  assert.deepEqual(plain, { status: "copied", format: "plain", fallback: false });
  assert.equal(typeof browserClipboard().writePlain, "function");
  console.log("Platform export QA PASS: six existing platform outputs; safe inline HTML; canonical draft retention; every image anchor; rich/plain and truthful denied/fallback results. External editor paste fidelity NOT VERIFIED.");
} finally {
  if (originalTsLoader) Module._extensions[".ts"] = originalTsLoader;
  else delete Module._extensions[".ts"];
}
