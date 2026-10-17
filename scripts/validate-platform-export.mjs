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
  const {
    copyPlatformContent, copyResultMessage, browserClipboard, prepareClipboardImages,
    MAX_CLIPBOARD_IMAGE_BYTES, MAX_CLIPBOARD_TOTAL_IMAGE_BYTES,
  } = require("../lib/browser/copy-platform-content.ts");
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
      { id: "IMG-01-HERO", role: "HERO", label: "대표", afterSectionId: null, placement: "도입 앞", size: "문서 너비", ratio: "16:9", prompt: "PRIVATE_PROMPT_NEVER_IN_BODY", display: { widthPercent: 75, align: "right" } },
      { id: "IMG-02", role: "TIP", label: '사진 <script>bad()</script>', afterSectionId: "s1", placement: "첫 섹션 뒤", size: "작게", ratio: "4:3", prompt: "PRIVATE_PROMPT_NEVER_IN_BODY", display: { widthPercent: 50, align: "left" } },
      { id: "IMG-03", role: "TIP", label: "용어 사진", afterSectionId: "glossary", placement: "용어 뒤", size: "작게", ratio: "1:1", prompt: "prompt", display: { widthPercent: 25, align: "center" } },
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
    for (const image of draft.images) {
      assert.ok(!exported.plainText.includes(image.id), `${platform}: internal slot id must not leak into reader body`);
      assert.ok(exported.imageGuideText.includes(image.id), `${platform}: preserve every slot in the separate editor guide`);
      assert.ok(exported.imageGuideText.includes(image.placement), `${platform}: preserve image placement in the separate guide`);
    }
    assert.ok(exported.imageGuideText.includes("PRIVATE_PROMPT_NEVER_IN_BODY"));
    assert.ok(!exported.plainText.includes("삽입"));
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
      for (const image of draft.images) assert.ok(!$.root().text().includes(image.id));
      assert.ok(!$.root().text().includes("표시 너비"));
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
  assert.deepEqual(fallback, { status: "copied", format: "plain", fallback: true, richFailure: "clipboard" });
  assert.deepEqual(fallbackCalls, [firstNaver.plainText]);
  assert.match(copyResultMessage(fallback), /텍스트만 복사됐어요/);
  assert.doesNotMatch(copyResultMessage(fallback), /서식을 포함해 복사했어요/);
  const unsupported = await copyPlatformContent(firstNaver, "rich", { writePlain: async () => {} });
  assert.equal(unsupported.fallback, true);
  const denied = await copyPlatformContent(firstNaver, "rich", { writeRich: async () => { throw Error(); }, writePlain: async () => { throw Error(); } });
  assert.deepEqual(denied, { status: "failed", format: null, fallback: false, richFailure: "clipboard" });
  assert.match(copyResultMessage(denied), /복사하지 못했어요/);
  const plain = await copyPlatformContent(firstNaver, "plain", { writeRich: async () => { assert.fail("Explicit plain copy must never write HTML"); }, writePlain: async () => {} });
  assert.deepEqual(plain, { status: "copied", format: "plain", fallback: false });

  const rawBytes = {
    "IMG-01-HERO": Uint8Array.from([0, 255, 4, 3, 2, 1, 128]),
    "IMG-02": Uint8Array.from([82, 73, 70, 70, 1, 2, 3, 4]),
    "IMG-03": Uint8Array.from([255, 216, 255, 224, 9, 8, 7, 6]),
  };
  const assets = [
    { draftId: "draft", imageId: "IMG-01-HERO", blob: new Blob([rawBytes["IMG-01-HERO"]], { type: "image/png" }), name: "hero.png", updatedAt: "2026-10-17T00:00:00.000Z" },
    { draftId: "draft", imageId: "IMG-02", blob: new Blob([rawBytes["IMG-02"]], { type: "image/webp" }), name: "context.webp", updatedAt: "2026-10-17T00:00:00.000Z" },
    { draftId: "draft", imageId: "IMG-03", blob: new Blob([rawBytes["IMG-03"]], { type: "image/jpeg" }), name: "glossary.jpg", updatedAt: "2026-10-17T00:00:00.000Z" },
  ];
  const preparedImages = await prepareClipboardImages(draft.images, assets);
  assert.equal(preparedImages.report.planned, 4);
  assert.equal(preparedImages.report.uploaded, 3);
  assert.equal(preparedImages.report.included, 3);
  assert.deepEqual(preparedImages.report.omitted, [{ imageId: "IMG-04", reason: "not-uploaded" }]);
  assert.equal(MAX_CLIPBOARD_IMAGE_BYTES, 8 * 1024 * 1024);
  assert.equal(MAX_CLIPBOARD_TOTAL_IMAGE_BYTES, 20 * 1024 * 1024);
  for (const embedded of preparedImages.embeddedImages) {
    const encoded = embedded.src.slice(embedded.src.indexOf(",") + 1);
    assert.deepEqual(Buffer.from(encoded, "base64"), Buffer.from(rawBytes[embedded.imageId]), `${embedded.imageId}: embedded bytes must be exact`);
  }
  const richWithImages = buildPlatformExport(draft, "naver", preparedImages.embeddedImages);
  const richDom = load(richWithImages.html);
  assert.equal(richDom("img").length, 3, "Only uploaded supported images belong in rich HTML");
  assert.equal(richDom("script").length, 0, "Image alt text cannot inject markup");
  assert.deepEqual(richDom("img").map((_, node) => richDom(node).attr("alt")).get(), ["대표", '사진 <script>bad()</script>', "용어 사진"]);
  assert.match(richDom("img").eq(0).attr("style"), /width:75%/);
  assert.match(richDom("img").eq(0).parent().attr("style"), /text-align:right/);
  assert.match(richDom("img").eq(1).attr("style"), /width:50%/);
  assert.match(richDom("img").eq(1).parent().attr("style"), /text-align:left/);
  assert.match(richDom("img").eq(2).attr("style"), /width:25%/);
  assert.match(richDom("img").eq(2).parent().attr("style"), /text-align:center/);
  const imageHtml = richWithImages.html;
  assert.ok(imageHtml.indexOf(preparedImages.embeddedImages[0].src) < imageHtml.indexOf("Intro"), "Hero must precede intro");
  assert.ok(imageHtml.indexOf(draft.sections[0].paragraphs[1]) < imageHtml.indexOf(preparedImages.embeddedImages[1].src), "Section image must follow its section paragraphs");
  assert.ok(imageHtml.indexOf("마무리") < imageHtml.indexOf("용어해설") && imageHtml.indexOf("용어 설명") < imageHtml.indexOf(preparedImages.embeddedImages[2].src), "Glossary image must follow the glossary after closing");
  const malicious = buildPlatformExport(draft, "naver", [{ imageId: "IMG-01-HERO", mimeType: "image/png", byteLength: 4, src: 'data:image/png;base64,AAAA" onerror="alert(1)' }]);
  assert.equal(load(malicious.html)("img").length, 0, "Malformed data URLs must be rejected, not escaped into an img");

  const constrained = await prepareClipboardImages(draft.images.slice(0, 3), [
    { ...assets[0], blob: new Blob([Uint8Array.from([0, 1, 2, 3])], { type: "image/png" }) },
    { ...assets[1], blob: new Blob([Uint8Array.from([1, 2, 3, 4])], { type: "image/gif" }) },
    { ...assets[2], blob: new Blob([Uint8Array.from([1, 2, 3, 4, 5])], { type: "image/jpeg" }) },
  ], { perImageBytes: 4, totalBytes: 4 });
  assert.equal(constrained.report.included, 1);
  assert.deepEqual(constrained.report.omitted, [
    { imageId: "IMG-02", reason: "unsupported-type" },
    { imageId: "IMG-03", reason: "too-large" },
  ]);

  let releasePreparation;
  let writeStarted = false;
  const deferredPreparation = new Promise((resolve) => { releasePreparation = resolve; });
  const deferredCopy = copyPlatformContent(firstNaver, "rich", {
    writeRich: async (html) => { writeStarted = true; assert.equal(typeof await html, "string"); },
    writePlain: async () => assert.fail("Deferred rich copy must not fall back"),
  }, () => deferredPreparation);
  assert.equal(writeStarted, true, "Clipboard write must start in the user gesture before async image preparation resolves");
  releasePreparation({ html: richWithImages.html, images: preparedImages.report });
  const deferredResult = await deferredCopy;
  assert.equal(deferredResult.format, "rich");
  assert.equal(deferredResult.images.included, 3);
  assert.match(copyResultMessage(deferredResult, "naver"), /이미지 3\/4개만 포함/);
  assert.match(copyResultMessage(deferredResult, "naver"), /네이버 스마트에디터/);

  const storageFallbackWrites = [];
  const storageFallback = await copyPlatformContent(firstNaver, "rich", {
    writeRich: async (html) => { await html; },
    writePlain: async (text) => storageFallbackWrites.push(text),
  }, async () => { throw new Error("fixture IndexedDB read failure"); });
  assert.equal(storageFallback.format, "plain");
  assert.equal(storageFallback.richFailure, "preparation");
  assert.deepEqual(storageFallbackWrites, [firstNaver.plainText]);
  assert.match(copyResultMessage(storageFallback, "naver"), /저장된 이미지를 읽지 못해/);

  const clipboardFallback = await copyPlatformContent(firstNaver, "rich", {
    writeRich: async (html) => { await html; throw new DOMException("fixture denied", "NotAllowedError"); },
    writePlain: async () => {},
  }, async () => ({ html: richWithImages.html, images: preparedImages.report }));
  assert.equal(clipboardFallback.format, "plain");
  assert.equal(clipboardFallback.richFailure, "clipboard");
  assert.match(copyResultMessage(clipboardFallback, "naver"), /텍스트만 복사됐어요/);
  assert.equal(typeof browserClipboard().writePlain, "function");
  console.log("Platform export QA PASS: safe inline PNG/JPEG/WebP bytes; image anchors/order/width/alignment; missing/limited/read/clipboard failures; synchronous ClipboardItem start; existing six-platform text/export behavior. Naver SmartEditor paste fidelity UNVERIFIED.");
} finally {
  if (originalTsLoader) Module._extensions[".ts"] = originalTsLoader;
  else delete Module._extensions[".ts"];
}
