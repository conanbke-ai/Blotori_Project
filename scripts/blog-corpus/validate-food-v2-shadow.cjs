const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const ts = require("typescript");

const SOURCE_SHA = "311817592919b060961676c36bc455c313ade87f19fd3e1f5f1a6688dc7ffde3";
const FOOD_IDS = ["food-observed-01", "food-observed-02", "food-observed-03"];
const DEFAULT_INPUT = "C:/Blotori_Migration_Backup_20261013_134756/source-working-tree/tmp-blog-corpus/recovery-37568100548/generated/category-blog-presets-v2.json";
const SHADOW_LABELS = {
  "food-observed-01": "다중 출처 · 고빈도 사진 교차형 (Shadow)",
  "food-observed-02": "저강조 · 완만한 사진 교차형 (Shadow)",
  "food-observed-03": "단일 출처 · 리액션 정보형 (Shadow)",
};
const QUALITATIVE = {
  "food-observed-01": {
    signature: "해요체 경향의 짧은 문단과 사진-텍스트의 잦은 교차를 참고하되, 관측 개수는 목표값으로 강제하지 않는 Shadow 스타일",
    endings: ["해요체 경향이 상대적으로 우세", "정확한 어미 비율은 생성 목표값으로 사용하지 않음"],
    cadence: "사진 비중이 높고 사진과 짧은 설명을 자주 교차하는 경향. 현재 입력 사진 수에 맞춰 축약",
    grouping: "단독 이미지 중심 경향. 관측된 묶음 수치는 생성 목표값으로 사용하지 않음",
    placement: ["도입을 짧게 하고 이른 시점에 첫 사진 역할을 배치", "사진 사이에는 장면에 필요한 설명만 간결하게 연결"],
  },
  "food-observed-02": {
    signature: "해요체 경향과 낮은 강조 밀도, 비교적 완만한 사진 전환을 참고하되 불완전한 이미지 묶음 수치는 제외한 Shadow 스타일",
    endings: ["해요체 경향이 상대적으로 우세", "정확한 어미 비율은 생성 목표값으로 사용하지 않음"],
    cadence: "사진 비중은 높지만 01보다 전환이 완만한 경향. 현재 입력 사진 수와 정보 구조를 우선",
    grouping: "단독 이미지 위주로 해석. 0값이 포함된 평균 묶음 길이는 생성 목표값으로 사용하지 않음",
    placement: ["주제 설명 뒤 필요한 위치에 첫 사진 역할을 배치", "사진 사이 설명은 짧되 정보가 끊기지 않게 연결"],
  },
  "food-observed-03": {
    signature: "합니다체·리액션이 함께 관측된 긴 문장과 사진-텍스트 교차를 참고하되 단일 출처 편향을 강제하지 않는 Shadow 스타일",
    endings: ["합니다체 경향이 상대적으로 우세하고 해요체가 혼합됨", "단일 출처의 정확한 어미 비율은 생성 목표값으로 사용하지 않음"],
    cadence: "사진 비중이 높고 사진과 설명의 교차가 잦은 경향. 현재 입력 사진 수에 맞춰 재구성",
    grouping: "단독 이미지 중심 경향. 관측된 묶음 수치는 생성 목표값으로 사용하지 않음",
    placement: ["핵심 맥락을 짧게 제시한 뒤 첫 사진 역할을 배치", "사진 사이에는 관찰 기준이나 설명을 한 호흡으로 연결"],
  },
};

const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");
const clone = (value) => JSON.parse(JSON.stringify(value));
const rate = (a, b) => b ? Math.round(a / b * 1e6) / 1e6 : 0;

function parseArgs() {
  return Object.fromEntries(process.argv.slice(2).flatMap((item) => {
    const match = item.match(/^--([^=]+)=(.*)$/s);
    return match ? [[match[1], match[2]]] : [];
  }));
}

function canonicalUrl(value) {
  const url = new URL(String(value).trim());
  url.hash = "";
  url.search = "";
  url.hostname = url.hostname.toLowerCase();
  url.pathname = url.pathname.replace(/\/+$/, "");
  return url.toString().replace(/\/$/, "");
}

function assertNumbers(value, where = "root") {
  if (typeof value === "number") return assert.ok(Number.isFinite(value), `${where}: non-finite number`);
  if (Array.isArray(value)) return value.forEach((entry, index) => assertNumbers(entry, `${where}[${index}]`));
  if (!value || typeof value !== "object") return;
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === "number" && /Rate$/.test(key)) assert.ok(entry >= 0 && entry <= 1, `${where}.${key}: rate outside 0..1`);
    assertNumbers(entry, `${where}.${key}`);
  }
}

function coverageParts(member, presetId) {
  const c = member.coverage;
  assert.ok(c, `${presetId}: coverage missing`);
  const keys = ["totalListed", "observed", "textEligible", "visualEligible", "mixedEligible", "minimalObservable", "unobservable", "trueFailed"];
  keys.forEach((key) => assert.ok(Number.isInteger(c[key]) && c[key] >= 0, `${presetId}: invalid ${key}`));
  const visualOnly = c.visualEligible - c.mixedEligible;
  const textOnly = c.textEligible - c.mixedEligible;
  assert.ok(visualOnly >= 0 && textOnly >= 0, `${presetId}: eligibility underflow`);
  assert.equal(c.mixedEligible + visualOnly + textOnly + c.minimalObservable, c.observed, `${presetId}: eligibility partition mismatch`);
  assert.equal(c.observed + c.unobservable + c.trueFailed, c.totalListed, `${presetId}: listed accounting mismatch`);
  assert.match(c.corpusDigest, /^[a-f0-9]{64}$/i, `${presetId}: invalid corpus digest`);
  return { visualOnly, textOnly };
}

function aggregate(preset) {
  const keys = ["totalListed", "observed", "textEligible", "visualEligible", "mixedEligible", "visualOnly", "textOnly", "minimalObservable", "unobservable", "trueFailed"];
  const out = Object.fromEntries(keys.map((key) => [key, 0]));
  for (const member of preset.sourceMeta.members) {
    const parts = coverageParts(member, preset.id);
    for (const key of keys.filter((key) => !["visualOnly", "textOnly"].includes(key))) out[key] += member.coverage[key];
    out.visualOnly += parts.visualOnly;
    out.textOnly += parts.textOnly;
  }
  return {
    ...out,
    failureRate: rate(out.trueFailed, out.totalListed),
    successRate: rate(out.observed, out.totalListed),
    textCoverageOfObserved: rate(out.textEligible, out.observed),
    visualCoverageOfObserved: rate(out.visualEligible, out.observed),
  };
}

function validateDocument(document, digest) {
  assert.equal(digest, SOURCE_SHA, "input SHA-256 differs from the approved artifact");
  assert.equal(document.schemaVersion, 2);
  assert.match(document.generatedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(document.deduplicatedSources, true);
  assert.equal(document.deduplicationKey, "canonical source URL within app category");
  assert.equal(Object.keys(document.categories || {}).length, 19);
  const presets = Object.values(document.categories).flatMap((category) => category.presets || []);
  assert.equal(presets.length, 62);
  assertNumbers(document);

  const pairs = new Set();
  const sourceUrls = new Set();
  let memberSlots = 0;
  let globalUnobservable = 0;
  for (const [categoryId, category] of Object.entries(document.categories)) {
    for (const preset of category.presets) {
      assert.equal(preset.categoryId, categoryId);
      assert.ok(preset.sourceMeta?.members?.length);
      for (const member of preset.sourceMeta.members) {
        memberSlots += 1;
        const pair = `${categoryId}|${canonicalUrl(member.sourceUrl)}`;
        assert.ok(!pairs.has(pair), `duplicate category source: ${pair}`);
        pairs.add(pair);
        sourceUrls.add(canonicalUrl(member.sourceUrl));
        assert.ok(member.theme && member.platform && Number.isInteger(member.rank));
        assert.ok(Array.isArray(member.matchedThemes) && member.matchedThemes.includes(member.theme), `${preset.id}: matchedThemes missing`);
        coverageParts(member, preset.id);
        globalUnobservable += member.coverage.unobservable;
      }
    }
  }
  assert.equal(pairs.size, memberSlots);
  assert.equal(sourceUrls.size, document.inputBlogs, "inputBlogs differs from unique canonical sources");

  const food = document.categories.food;
  assert.deepEqual(food.presets.map((p) => p.id).sort(), [...FOOD_IDS].sort());
  const foodUrls = new Set();
  const candidates = FOOD_IDS.map((id) => {
    const preset = food.presets.find((item) => item.id === id);
    assert.equal(preset.sourceMeta.schemaVersion, 2);
    assert.equal(preset.sourceMeta.kind, "blogchart-top10-full-corpus");
    assert.equal(preset.sourceMeta.blogCount, preset.sourceMeta.members.length);
    preset.sourceMeta.members.forEach((member) => {
      const url = canonicalUrl(member.sourceUrl);
      assert.ok(!foodUrls.has(url), `food source duplicated: ${url}`);
      foodUrls.add(url);
    });
    const totals = aggregate(preset);
    assert.equal(totals.totalListed, preset.sourceMeta.totalListedPosts);
    assert.equal(totals.observed, preset.sourceMeta.analyzedPosts);
    assert.equal(totals.trueFailed, preset.sourceMeta.failedPosts);
    assert.ok(Math.abs(totals.successRate - preset.sourceMeta.successRate) <= 0.0001);
    return { preset, totals };
  });
  return { categories: 19, presets: 62, memberSlots, uniqueCategoryUrlPairs: pairs.size, uniqueSourceUrls: sourceUrls.size, globalUnobservable, candidates };
}

function shadowDNA(preset) {
  const dna = clone(preset.dna);
  const q = QUALITATIVE[preset.id];
  assert.ok(q);
  dna.signature = q.signature;
  dna.evidenceSummary += " Shadow 비교 전용이며 정식 인증·자동 승격 근거로 사용할 수 없습니다.";
  dna.voice.summary += " (정성 경향만 적용)";
  dna.voice.endings = q.endings;
  if (dna.voice.metrics) delete dna.voice.metrics.avgParagraphSentences;
  dna.mood.visualMood = dna.visual.summary;
  dna.structure.fixedPrinciples = ["사용자가 제공한 사실과 관찰 범위만 사용", "관측 수치는 고정 템플릿이나 생성 목표값으로 강제하지 않음"];
  dna.imageRhythm.cadence = q.cadence;
  dna.imageRhythm.grouping = q.grouping;
  dna.imageRhythm.placementRules = q.placement;
  dna.imageRhythm.adaptationRules = [
    "현재 보유 사진 수와 사진 역할에 맞춰 섹션을 압축하거나 분산",
    "사진 수보다 글의 정보 흐름과 사실성을 우선",
    "관측된 정확한 이미지 개수·전환 횟수·간격을 복제하지 않음",
  ];
  return dna;
}

function installTsLoader() {
  const original = Module._extensions[".ts"];
  Module._extensions[".ts"] = function loadTypeScript(module, filename) {
    const output = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      fileName: filename,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, resolveJsonModule: true },
    }).outputText;
    module._compile(output, filename);
  };
  return () => original ? Module._extensions[".ts"] = original : delete Module._extensions[".ts"];
}

function comparePrompts(workspace, candidates) {
  const restore = installTsLoader();
  try {
    const { CATEGORY_BLOG_DNA_PRESETS, CATEGORY_BLOG_DNA_LIBRARY_META } = require(path.join(workspace, "lib/domain/category-blog-dna.ts"));
    const { buildPrompt } = require(path.join(workspace, "lib/application/build-prompt.ts"));
    assert.equal(CATEGORY_BLOG_DNA_LIBRARY_META.biasCorrected, false, "uncertified V2 became active");
    assert.equal(CATEGORY_BLOG_DNA_PRESETS.length, 45);
    const curated = CATEGORY_BLOG_DNA_PRESETS.find((preset) => preset.id === "food-photo-diary");
    assert.ok(curated);
    const input = {
      platformId: "naver", categoryId: "food", freeTopic: "제철 사과를 고르고 보관할 때 확인할 기준", attributes: {},
      extraConditions: "확인된 사실: 비교 대상은 같은 품종이며 표면 손상 여부·향·단단함만 관찰했다. 방문 장소·가격·구매 경험은 제공되지 않았다.",
      styleId: "custom", styleIntensity: 3, structureId: "auto", length: "medium", imageCount: 4,
      blogDNAApply: { voice: true, mood: true, structure: true, imageRhythm: true, visual: true },
      recentLayoutFingerprints: ["질문 도입 → 선택 기준 → 보관 팁 → 사진 역할 4개 → 체크리스트 마무리"],
      variationNonce: "food-shadow-fixed-20261015",
    };
    const profiles = [{ id: curated.id, label: curated.label, dna: curated.dna, kind: "curated-control" }, ...candidates.map(({ preset }) => ({
      id: preset.id, label: SHADOW_LABELS[preset.id], dna: shadowDNA(preset), kind: "observed-shadow",
    }))];
    const results = profiles.map((profile) => {
      const prompt = buildPrompt({ ...input, customStyle: profile.dna.signature, styleProfileName: profile.label, blogDNA: profile.dna });
      const start = prompt.indexOf("[Blog DNA —");
      const end = prompt.indexOf("\n\n[제목 전략]", start);
      assert.ok(start >= 0 && end > start);
      const dnaSection = prompt.slice(start, end);
      return {
        ...profile, prompt, dnaSection, promptSha256: hash(prompt), dnaSectionSha256: hash(dnaSection), promptChars: prompt.length,
        styleDescription: { signature: profile.dna.signature, voice: profile.dna.voice.summary, structure: profile.dna.structure.summary, image: profile.dna.imageRhythm.cadence },
      };
    });
    assert.equal(new Set(results.map((r) => r.promptSha256)).size, 4);
    assert.equal(new Set(results.map((r) => r.dnaSectionSha256)).size, 4);
    for (const result of results.filter((r) => r.kind === "observed-shadow")) {
      assert.match(result.dnaSection, /Shadow 비교 전용/);
      assert.doesNotMatch(result.dnaSection, /avgParagraphSentences/);
      assert.doesNotMatch(result.dnaSection, /(?:합니다체|해요체|죠\/쥬체|평서체) 비율 \d+%/);
      assert.doesNotMatch(result.dnaSection, /게시글당 이미지 중앙값 \d+개|평균 이미지 묶음 길이 \d|첫 이미지 전 텍스트 컴포넌트 중앙값/);
      assert.match(result.prompt, /방문 장소·가격·구매 경험은 제공되지 않았다/);
    }
    return { input, libraryMeta: CATEGORY_BLOG_DNA_LIBRARY_META, results };
  } finally {
    restore();
  }
}

function immutable(target, bytes) {
  if (fs.existsSync(target)) {
    assert.equal(hash(fs.readFileSync(target)), hash(bytes), `${target}: immutable snapshot differs`);
    return "reused";
  }
  fs.writeFileSync(target, bytes, { flag: "wx", mode: 0o444 });
  fs.chmodSync(target, 0o444);
  return "created";
}

function writeMarkdown(report, target) {
  const lines = [
    "# Food Blog DNA V2 Shadow Mode 보고서", "",
    `- Shadow Mode: **${report.status.shadowMode}**`, `- 정식 활성화: **${report.status.activation}**`,
    `- 원본 SHA-256: \`${report.source.sha256}\``, `- schemaVersion / generatedAt: ${report.source.schemaVersion} / ${report.source.generatedAt}`,
    `- 범위: ${report.source.categories} categories / ${report.source.presets} presets`, "- 활성 로더·사용자 선택 UI·앱용 V2 JSON: 변경 없음", "",
    "## 후보별 근거", "", "| 순위 | 후보 | 제안 label | 출처 | listed / observed / failed | text / visual / visual-only / text-only | 실패율 | 판정 |", "|---:|---|---|---:|---|---|---:|---|",
  ];
  report.candidates.forEach((c) => lines.push(`| ${c.rank} | ${c.id} | ${c.shadowLabel} | ${c.blogCount} | ${c.metrics.totalListed} / ${c.metrics.observed} / ${c.metrics.trueFailed} | ${c.metrics.textEligible} / ${c.metrics.visualEligible} / ${c.metrics.visualOnly} / ${c.metrics.textOnly} | ${(c.metrics.failureRate * 100).toFixed(3)}% | ${c.assessment} |`));
  lines.push("", "## 통계 정의와 Shadow 변환", "");
  report.metricDefinitions.forEach((item) => lines.push(`- **${item.metric}**: ${item.definition} ${item.handling}`));
  lines.push("", "## Curated 대비 프롬프트", "");
  report.promptComparison.forEach((p) => lines.push(`- **${p.id} / ${p.label}** — \`${p.promptSha256}\`, ${p.promptChars} chars; Voice: ${p.styleDescription.voice}; Image: ${p.styleDescription.image}`));
  lines.push("", "## 추천과 약점", "");
  report.candidates.forEach((c) => lines.push(`- **${c.rank}. ${c.id}** — ${c.differentiation} 약점: ${c.weakness}`));
  lines.push("", "## 활성화 보류", "");
  report.activationHoldReasons.forEach((reason) => lines.push(`- ${reason}`));
  fs.writeFileSync(target, `${lines.join("\n")}\n`, "utf8");
}

function main() {
  const options = parseArgs();
  const workspace = process.cwd();
  const inputPath = path.resolve(options.input || process.env.BLOTORI_V2_SHADOW_INPUT || DEFAULT_INPUT);
  const bytes = fs.readFileSync(inputPath);
  const digest = hash(bytes);
  const document = JSON.parse(bytes.toString("utf8"));
  const validation = validateDocument(document, digest);
  const comparison = comparePrompts(workspace, validation.candidates);

  const root = path.resolve(workspace, "tmp-blog-corpus");
  const snapshotDir = path.resolve(options["snapshot-dir"] || path.join(root, "shadow-food-v2", digest.slice(0, 16)));
  const relative = path.relative(root, snapshotDir);
  assert.ok(relative && !relative.startsWith("..") && !path.isAbsolute(relative), "snapshot must stay under tmp-blog-corpus");
  fs.mkdirSync(snapshotDir, { recursive: true });
  const originalCopy = path.join(snapshotDir, "category-blog-presets-v2.source-original.json");
  const foodSnapshot = path.join(snapshotDir, "food-observed-candidates.source-snapshot.json");
  const extracted = Buffer.from(`${JSON.stringify({
    snapshotSchemaVersion: 1,
    original: { sha256: digest, schemaVersion: document.schemaVersion, generatedAt: document.generatedAt, source: document.source, deduplicatedSources: document.deduplicatedSources, deduplicationKey: document.deduplicationKey, inputBlogs: document.inputBlogs },
    food: document.categories.food,
  }, null, 2)}\n`);
  const originalAction = immutable(originalCopy, bytes);
  const foodAction = immutable(foodSnapshot, extracted);

  const ranked = {
    "food-observed-01": [1, "7개 출처와 가장 큰 표본, 잦은 사진-텍스트 교차가 curated보다 선명함.", "122건 실패가 남고 공식 전역·post-level 재현 인증은 별도 필요.", "SHADOW_READY / activation BLOCKED"],
    "food-observed-02": [2, "낮은 강조와 01보다 완만한 전환으로 비교 축이 분명함.", "출처 2개이며 avgImageRunLength=0.5는 run이 없는 0값의 영향을 받아 직접 지침에서 제외.", "SHADOW_ONLY / bias BLOCKED"],
    "food-observed-03": [3, "합니다체·리액션·긴 문장 경향으로 다른 후보와 구분됨.", "단일 출처라 개인 특성이 카테고리 DNA로 과대 일반화될 위험이 큼.", "SHADOW_ONLY / single-source BLOCKED"],
  };
  const candidates = validation.candidates.map(({ preset, totals }) => ({
    id: preset.id, rank: ranked[preset.id][0], originalLabel: preset.label, shadowLabel: SHADOW_LABELS[preset.id], blogCount: preset.sourceMeta.blogCount,
    differentiation: ranked[preset.id][1], weakness: ranked[preset.id][2], assessment: ranked[preset.id][3], metrics: totals,
    sourceMeta: preset.sourceMeta,
    provenance: preset.sourceMeta.members.map((m) => ({ sourceUrl: m.sourceUrl, theme: m.theme, matchedThemes: m.matchedThemes, rank: m.rank, corpusDigest: m.coverage.corpusDigest })),
    observedMetrics: { avgSentenceChars: preset.dna.voice.metrics.avgSentenceChars, avgParagraphSentences: preset.dna.voice.metrics.avgParagraphSentences, endings: preset.dna.voice.endings, imageCadence: preset.dna.imageRhythm.cadence, imageGrouping: preset.dna.imageRhythm.grouping, imagePlacement: preset.dna.imageRhythm.placementRules },
  }));

  const promptDir = path.join(snapshotDir, "prompts");
  fs.mkdirSync(promptDir, { recursive: true });
  comparison.results.forEach((result) => fs.writeFileSync(path.join(promptDir, `${result.id}.txt`), result.prompt, "utf8"));
  const report = {
    reportSchemaVersion: 1, evaluatedAt: new Date().toISOString(),
    status: { shadowMode: "PASS", activation: "BLOCKED", reason: "격리 비교는 통과했으나 공식 인증과 편향 조건은 충족하지 않음." },
    source: { inputPath, sha256: digest, schemaVersion: document.schemaVersion, generatedAt: document.generatedAt, categories: validation.categories, presets: validation.presets, inputBlogs: document.inputBlogs, memberSlots: validation.memberSlots, uniqueCategoryUrlPairs: validation.uniqueCategoryUrlPairs, uniqueSourceUrls: validation.uniqueSourceUrls, globalUnobservable: validation.globalUnobservable, deduplicatedSources: document.deduplicatedSources },
    metricDefinitions: [
      { metric: "avgParagraphSentences", definition: "synthesize-category-presets.mjs에서 관측 없이 0으로 고정된 placeholder.", handling: "Shadow DNA에서 삭제해 프롬프트에 주입하지 않음." },
      { metric: "어미 비율", definition: "textEligible 문장 분모로 블로그별 rate를 낸 뒤 군집에서 블로그를 동일 가중 평균하며 noun/other는 표시 문자열에서 빠짐.", handling: "정확한 %를 제거하고 상대적 우세 경향만 사용." },
      { metric: "이미지 리듬", definition: "visualEligible 분포의 블로그별 중앙값을 군집에서 동일 가중 평균하며 run이 없으면 avgImageRunLength=0.", handling: "정확한 개수·전환·묶음 길이를 제거하고 정성 경향만 사용." },
    ],
    candidates, promptFixture: comparison.input,
    promptComparison: comparison.results.map((r) => ({ id: r.id, label: r.label, kind: r.kind, promptSha256: r.promptSha256, dnaSectionSha256: r.dnaSectionSha256, promptChars: r.promptChars, styleDescription: r.styleDescription })),
    activeLibrary: comparison.libraryMeta,
    activationHoldReasons: [
      "활성 라이브러리는 계속 schemaVersion 1 / biasCorrected=false인 curated·V1 fallback이며 로더와 UI는 수정하지 않음.",
      "이 파일만으로 공식 전역 true-failure, 19개 카테고리별 인증, post-level 재현성을 새로 인증하지 않음.",
      "food-observed-02는 2개 출처와 불완전한 묶음 수치, food-observed-03은 단일 출처 편향이 있음.",
      "원시 label이 세 후보 모두 같아 정식 UI에 노출하지 않고 보고서 제안 label만 사용함.",
    ],
    snapshot: { directory: snapshotDir, originalCopy, originalAction, foodSnapshot, foodAction, promptDirectory: promptDir, gitIgnoredByContract: "/tmp-blog-corpus/" },
  };
  const jsonReport = path.join(snapshotDir, "food-v2-shadow-report.json");
  const mdReport = path.join(snapshotDir, "food-v2-shadow-report.md");
  fs.writeFileSync(jsonReport, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeMarkdown(report, mdReport);
  console.log(JSON.stringify({ status: report.status, source: report.source, candidates: candidates.map(({ id, rank, shadowLabel, blogCount, metrics, assessment }) => ({ id, rank, shadowLabel, blogCount, metrics, assessment })), promptComparison: report.promptComparison, snapshot: report.snapshot, reports: { jsonReport, mdReport } }, null, 2));
}

main();
