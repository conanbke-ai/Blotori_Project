import { existsSync, promises as fs, readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(process.cwd(), process.env.BLOTORI_KNOWLEDGE_DIR || "knowledge-base");
const manifestPath = path.join(root, "_meta", "SOURCES.csv");
const strict = process.argv.includes("--strict");
const SUPPORTED = new Set([".doc", ".docx", ".html", ".json", ".md", ".pdf", ".pptx", ".txt"]);
const COMMERCIAL_ALLOWED = new Set(["ALLOW", "ALLOW_WITH_ATTRIBUTION"]);
const STATUS_ALLOWED = new Set(["ALLOW", "ALLOW_WITH_ATTRIBUTION", "REVIEW_REQUIRED", "RESEARCH_ONLY", "EXCLUDE"]);

function parseCsv(text) {
  const rows = []; let row = []; let field = ""; let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i], n = text[i + 1];
    if (c === '"' && quoted && n === '"') { field += '"'; i += 1; }
    else if (c === '"') quoted = !quoted;
    else if (c === "," && !quoted) { row.push(field); field = ""; }
    else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && n === "\n") i += 1;
      row.push(field); field = "";
      if (row.some((v) => v.trim())) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field || row.length) { row.push(field); if (row.some((v) => v.trim())) rows.push(row); }
  if (!rows.length) return [];
  const headers = rows[0].map((v) => v.trim());
  return rows.slice(1).map((values, index) => ({
    __line: index + 2,
    ...Object.fromEntries(headers.map((h, i) => [h, (values[i] ?? "").trim()])),
  }));
}

function expectedDirectory(row) {
  const domain = (row.domain || "").toLowerCase();
  const topic = (row.topic || "").toLowerCase().replace(/[_\s]+/g, "-");
  if ((row.commercial_status || "").toUpperCase() === "RESEARCH_ONLY") return "_research-only";
  if (domain === "rehabilitation") {
    if (topic.includes("guideline")) return "rehabilitation/guidelines";
    if (topic.includes("neck") || topic.includes("cervical")) return "rehabilitation/cervical-neck";
    if (topic.includes("thoracic")) return "rehabilitation/thoracic";
    if (topic.includes("shoulder") || topic.includes("rotator")) return "rehabilitation/shoulder";
    if (topic.includes("lumbar") || topic.includes("low-back")) return "rehabilitation/lumbar";
    if (topic.includes("hip") || topic.includes("pelvis")) return "rehabilitation/hip-pelvis";
    if (topic.includes("knee")) return "rehabilitation/knee";
    if (topic.includes("ankle") || topic.includes("foot")) return "rehabilitation/ankle-foot";
    if (topic.includes("posture")) return "rehabilitation/posture";
    if (topic.includes("workplace") || topic.includes("office")) return "rehabilitation/exercise/workplace";
    if (topic.includes("anatom") || topic.includes("kines")) return "rehabilitation/anatomy-kinesiology";
    return "rehabilitation/exercise/general";
  }
  if (domain === "patient-education") {
    if (topic.includes("behaviour") || topic.includes("behavior") || topic.includes("motivational")) return "patient-education/behavior-change";
    if (topic.includes("literacy")) return "patient-education/health-literacy";
    return "patient-education/general";
  }
  if (domain === "pain-science") {
    if (topic.includes("central-sensit")) return "pain-science/central-sensitization";
    if (topic.includes("multimodal") || topic.includes("psychological")) return "pain-science/multimodal";
    return "pain-science/chronic-pain";
  }
  if (domain === "seo") {
    if (topic.includes("naver")) return "seo/naver";
    if (topic.includes("tistory")) return "seo/tistory";
    if (topic.includes("wordpress")) return "seo/wordpress";
    return "seo/writing-psychology";
  }
  return null;
}

async function collectFiles(dir) {
  const out = [];
  async function walk(current) {
    for (const entry of await fs.readdir(current, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(full);
      else out.push(full);
    }
  }
  await walk(dir);
  return out;
}

const blockers = [];
const warnings = [];
const infos = [];
const block = (code, message) => blockers.push({ code, message });
const warn = (code, message) => warnings.push({ code, message });

if (!existsSync(root)) throw new Error(`knowledge-base를 찾지 못했습니다: ${root}`);
if (!existsSync(manifestPath)) throw new Error(`SOURCES.csv를 찾지 못했습니다: ${manifestPath}`);

const rows = parseCsv(readFileSync(manifestPath, "utf8"));
const byId = new Map();
for (const row of rows) {
  const id = (row.source_id || "").toUpperCase();
  if (!id) { block("MANIFEST_SOURCE_ID_MISSING", `SOURCES.csv line ${row.__line}: source_id 누락`); continue; }
  if (byId.has(id)) block("MANIFEST_DUPLICATE_ID", `${id}: source_id 중복 (lines ${byId.get(id).__line}, ${row.__line})`);
  else byId.set(id, row);
  const status = (row.commercial_status || "").toUpperCase();
  if (!STATUS_ALLOWED.has(status)) block("MANIFEST_STATUS_INVALID", `${id}: commercial_status=${row.commercial_status || "(empty)"}`);
  if (!row.domain || !row.topic || !row.title) block("MANIFEST_METADATA_MISSING", `${id}: domain/topic/title 필수값 확인 필요`);
  if (row.ingest_default === "true" && COMMERCIAL_ALLOWED.has(status)) {
    if (!row.license) block("COMMERCIAL_LICENSE_MISSING", `${id}: 상용 기본 색인 대상인데 license 누락`);
    if (!row.license_verified_on) block("COMMERCIAL_LICENSE_UNVERIFIED", `${id}: 상용 기본 색인 대상인데 license_verified_on 누락`);
    if (!row.url && !row.doi) warn("SOURCE_LOCATION_MISSING", `${id}: url/doi가 모두 비어 있음`);
  }
}

const files = await collectFiles(root);
const sourceFiles = [];
for (const file of files) {
  const rel = path.relative(root, file).split(path.sep).join("/");
  if (rel === "README.md" || rel.startsWith("_meta/")) continue;
  const ext = path.extname(file).toLowerCase();
  if (!SUPPORTED.has(ext)) { warn("UNSUPPORTED_FILE", `${rel}: RAG 지원 대상 확장자가 아님`); continue; }
  sourceFiles.push({ file, rel });
}

const seenFilesById = new Map();
for (const item of sourceFiles) {
  const name = path.basename(item.file);
  const match = name.toUpperCase().match(/^([A-Z]{1,4}\d{1,4})(?:[_\-\s.]|$)/);
  if (!match || !byId.has(match[1])) {
    if (item.rel.startsWith("_incoming/unclassified/")) warn("UNCLASSIFIED_FILE", `${item.rel}: SOURCES.csv 등록/파일명 source_id 보완 필요`);
    else block("UNREGISTERED_FILE", `${item.rel}: manifest source_id를 파일명 앞에 붙여야 함`);
    continue;
  }
  const id = match[1];
  const row = byId.get(id);
  if (!seenFilesById.has(id)) seenFilesById.set(id, []);
  seenFilesById.get(id).push(item.rel);
  const expected = expectedDirectory(row);
  if (expected && !(item.rel === expected || item.rel.startsWith(`${expected}/`))) {
    block("WRONG_DIRECTORY", `${item.rel}: ${id}의 canonical 경로는 ${expected}/`);
  }
  const status = (row.commercial_status || "").toUpperCase();
  if (item.rel.startsWith("_research-only/") && status !== "RESEARCH_ONLY") warn("RESEARCH_PATH_STATUS_MISMATCH", `${item.rel}: manifest status=${status}`);
  if (!item.rel.startsWith("_research-only/") && status === "RESEARCH_ONLY") block("RESEARCH_ONLY_OUTSIDE_QUARANTINE", `${item.rel}: _research-only/로 이동 필요`);
}

for (const [id, paths] of seenFilesById) {
  if (paths.length > 1) warn("MULTIPLE_FILES_PER_SOURCE", `${id}: ${paths.length}개 파일 (${paths.join(", ")})`);
}
for (const [id, row] of byId) {
  if (row.ingest_default === "true" && COMMERCIAL_ALLOWED.has((row.commercial_status || "").toUpperCase()) && !seenFilesById.has(id)) {
    warn("COMMERCIAL_SOURCE_FILE_MISSING", `${id}: 상용 기본 source지만 로컬 원문 파일이 없음`);
  }
}

infos.push(`manifest sources=${rows.length}`);
infos.push(`knowledge files=${sourceFiles.length}`);
infos.push(`registered source ids with files=${seenFilesById.size}`);

console.log(`Blotori Knowledge Audit · ${strict ? "STRICT" : "REPORT"}`);
for (const info of infos) console.log(`INFO  ${info}`);
for (const item of blockers) console.log(`BLOCK ${item.code} · ${item.message}`);
for (const item of warnings) console.log(`WARN  ${item.code} · ${item.message}`);
console.log(`\nresult: blockers=${blockers.length}, warnings=${warnings.length}`);

if (strict && blockers.length) {
  console.error("\nKnowledge audit 실패: blocker를 해결한 뒤 sync를 실행하세요.");
  process.exit(1);
}
