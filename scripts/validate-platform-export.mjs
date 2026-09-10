import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const strategy = readFileSync(new URL("../lib/domain/platform-strategy.ts", import.meta.url), "utf8");
const exporter = readFileSync(new URL("../lib/application/platform-exporter.ts", import.meta.url), "utf8");

assert.match(strategy, /naver:\s*\{[\s\S]*?clipboardMode:\s*"plain"/, "Naver must use plain clipboard mode");
assert.match(strategy, /tistory:\s*\{[\s\S]*?clipboardMode:\s*"rich"/, "Tistory must keep rich clipboard mode");
assert.match(strategy, /wordpress:\s*\{[\s\S]*?clipboardMode:\s*"rich"/, "WordPress must keep rich clipboard mode");
assert.match(strategy, /brunch:\s*\{[\s\S]*?clipboardMode:\s*"plain"/, "Brunch must use plain clipboard mode");

assert.match(exporter, /const parts: string\[\] = \[\];/, "Body export must not prepend the title");
assert.match(exporter, /titleText:\s*draft\.title/, "Title must be exported separately");
assert.match(exporter, /formattingGuide:\s*platformId === "naver"/, "Naver formatting guide must be exported separately");
assert.match(exporter, /tagsText:/, "Tags must be exported separately");
assert.doesNotMatch(exporter, /buildNaverRichHtml/, "Naver rich HTML exporter must not remain active");

console.log("Platform export QA PASS: title/body/tags separated; Naver plain-safe; rich platforms preserved.");
