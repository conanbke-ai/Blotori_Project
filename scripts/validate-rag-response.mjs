import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const strict = args.includes("--strict");
const requireRag = args.includes("--require-rag") || strict;
const jsonArg = args.find((arg) => !arg.startsWith("--"));

if (!jsonArg) {
  console.error("사용법: node scripts/validate-rag-response.mjs <draft.json> [--require-rag] [--strict]");
  process.exit(2);
}

const projectRoot = process.cwd();
const draftPath = path.resolve(projectRoot, jsonArg);
const manifestPath = path.resolve(projectRoot, process.env.BLOTORI_KNOWLEDGE_MANIFEST || "knowledge-base/_meta/SOURCES.csv");

if (!existsSync(draftPath)) {
  console.error(`draft JSON을 찾지 못했습니다: ${draftPath}`);
  process.exit(2);
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    const n = text[i + 1];
    if (c === '"' && quoted && n === '"') {
      field += '"';
      i += 1;
    } else if (c === '"') quoted = !quoted;
    else if (c === "," && !quoted) {
      row.push(field);
      field = "";
    } else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && n === "\n") i += 1;
      row.push(field);
      field = "";
      if (row.some((v) => v.trim())) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field || row.length) {
    row.push(field);
    if (row.some((v) => v.trim())) rows.push(row);
  }
  if (!rows.length) return [];
  const headers = rows[0].map((v) => v.trim());
  return rows.slice(1).map((values) => Object.fromEntries(headers.map((h, i) => [h, (values[i] ?? "").trim()])));
}

function collectDraftText(draft) {
  const chunks = [draft.title, draft.summary, ...(draft.intro ?? [])];
  for (const section of draft.sections ?? []) {
    chunks.push(section.heading, ...(section.paragraphs ?? []));
  }
  chunks.push(...(draft.closing ?? []));
  return chunks.filter(Boolean).join("\n");
}

function findGlossarySection(draft) {
  return (draft.sections ?? []).find((section) => {
    const id = String(section.id ?? "").toLowerCase();
    const heading = String(section.heading ?? "").replace(/\s+/g, "");
    const style = section.presentation?.visualStyle;
    return style === "glossary" || id.includes("glossary") || heading.includes("용어해설");
  });
}

function parseGlossaryTerms(section) {
  if (!section) return [];
  return (section.paragraphs ?? [])
    .map((paragraph) => String(paragraph).trim())
    .map((paragraph) => paragraph.replace(/^\*\s*/, ""))
    .map((paragraph) => paragraph.split(/[:：]/, 1)[0]?.trim())
    .filter(Boolean);
}

const draft = JSON.parse(readFileSync(draftPath, "utf8"));
const blockers = [];
const warnings = [];
const info = [];
const block = (code, message) => blockers.push({ code, message });
const warn = (code, message) => warnings.push({ code, message });

if (!draft || typeof draft !== "object") block("DRAFT_INVALID", "JSON root가 객체가 아닙니다.");
if (!draft.title) block("TITLE_MISSING", "title이 없습니다.");
if (!Array.isArray(draft.sections)) block("SECTIONS_MISSING", "sections 배열이 없습니다.");

const grounding = draft.knowledgeGrounding;
if (requireRag) {
  if (!grounding?.enabled) block("RAG_NOT_ENABLED", "knowledgeGrounding.enabled=true가 아닙니다.");
  if (!grounding?.used) block("RAG_NOT_USED", "file_search 결과가 실제 원고에 사용된 흔적이 없습니다.");
  if (!Array.isArray(grounding?.sourceNames) || grounding.sourceNames.length === 0) {
    block("RAG_SOURCE_EMPTY", "참조 source filename이 없습니다.");
  }
  if (!Number.isFinite(grounding?.resultCount) || grounding.resultCount < 1) {
    warn("RAG_RESULT_COUNT_ZERO", "file_search resultCount가 0입니다. citation만 잡힌 경우인지 확인하세요.");
  }
}

const manifestIds = new Set();
if (existsSync(manifestPath)) {
  for (const row of parseCsv(readFileSync(manifestPath, "utf8"))) {
    if (row.source_id) manifestIds.add(row.source_id.toUpperCase());
  }
} else {
  warn("MANIFEST_NOT_FOUND", `manifest를 찾지 못했습니다: ${manifestPath}`);
}

for (const sourceName of grounding?.sourceNames ?? []) {
  const match = String(sourceName).toUpperCase().match(/^([A-Z]{1,4}\d{1,4})(?:[_\-\s.]|$)/);
  if (!match) {
    warn("SOURCE_ID_NOT_IN_FILENAME", `${sourceName}: 파일명 앞에 source_id가 없습니다.`);
    continue;
  }
  if (manifestIds.size && !manifestIds.has(match[1])) {
    block("SOURCE_NOT_REGISTERED", `${sourceName}: SOURCES.csv에 ${match[1]}가 없습니다.`);
  }
}

const glossary = findGlossarySection(draft);
const glossaryTerms = parseGlossaryTerms(glossary);
if (glossaryTerms.length > 5) block("GLOSSARY_TOO_MANY", `전문용어 ${glossaryTerms.length}개: 기본 상한 5개 초과`);

const bodySections = (draft.sections ?? []).filter((section) => section !== glossary);
const bodyText = [draft.title, draft.summary, ...(draft.intro ?? []), ...bodySections.flatMap((section) => [section.heading, ...(section.paragraphs ?? [])]), ...(draft.closing ?? [])]
  .filter(Boolean)
  .join("\n");

for (const term of glossaryTerms) {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const marked = new RegExp(`${escaped}\\*`, "g");
  const markedCount = (bodyText.match(marked) ?? []).length;
  if (markedCount === 0) block("GLOSSARY_TERM_NOT_MARKED", `${term}: 본문 최초 등장 별표가 없습니다.`);
  if (markedCount > 1) block("GLOSSARY_TERM_MARKED_MULTIPLE", `${term}: 본문 별표가 ${markedCount}회 있습니다.`);
}

const allText = collectDraftText(draft);
const absoluteCausalityPatterns = [
  /(?:자세|거북목|전방머리자세|근육|관절|골반|척추).{0,18}(?:때문에|원인으로|원인이 되어|유발해서|유발하여).{0,20}(?:통증|질환|디스크|염증)/g,
  /(?:통증|질환|디스크|염증).{0,18}(?:원인은|원인이|때문이다|때문입니다).{0,18}(?:자세|거북목|전방머리자세|근육|관절|골반|척추)/g,
  /(?:반드시|무조건|100%|완치|확실히 치료|완벽히 교정)/g,
];
for (const pattern of absoluteCausalityPatterns) {
  const matches = [...allText.matchAll(pattern)].map((match) => match[0]);
  if (matches.length) warn("MEDICAL_OVERCLAIM_RISK", matches.slice(0, 3).join(" | "));
}

const evidenceLanguage = ["관련될 수", "영향을 줄 수", "도움이 될 수", "개인차", "평가", "근거", "연구"].filter((token) => allText.includes(token));
if (requireRag && evidenceLanguage.length === 0) {
  warn("EVIDENCE_LANGUAGE_WEAK", "근거 기반 건강 글인데 불확실성/개인차를 표현하는 문구가 거의 없습니다.");
}

info.push(`sections=${Array.isArray(draft.sections) ? draft.sections.length : 0}`);
info.push(`glossaryTerms=${glossaryTerms.length}`);
info.push(`ragEnabled=${Boolean(grounding?.enabled)}`);
info.push(`ragUsed=${Boolean(grounding?.used)}`);
info.push(`sources=${grounding?.sourceNames?.length ?? 0}`);
info.push(`searchResults=${grounding?.resultCount ?? 0}`);

console.log(`Blotori RAG Response QA · ${strict ? "STRICT" : "REPORT"}`);
console.log(`draft: ${path.relative(projectRoot, draftPath)}`);
for (const item of info) console.log(`INFO  ${item}`);
for (const item of blockers) console.log(`BLOCK ${item.code} · ${item.message}`);
for (const item of warnings) console.log(`WARN  ${item.code} · ${item.message}`);
console.log(`\nresult: blockers=${blockers.length}, warnings=${warnings.length}`);

if (strict && (blockers.length > 0 || warnings.some((item) => item.code === "MEDICAL_OVERCLAIM_RISK"))) {
  console.error("\nRAG response QA 실패: blocker 또는 의료 과장 위험을 해결하세요.");
  process.exit(1);
}
