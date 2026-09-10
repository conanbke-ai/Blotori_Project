import { existsSync, promises as fs, readFileSync } from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();
const knowledgeRoot = path.resolve(projectRoot, process.env.BLOTORI_KNOWLEDGE_DIR || "knowledge-base");
const manifestPath = path.join(knowledgeRoot, "_meta", "SOURCES.csv");
const apply = process.argv.includes("--apply");

const CANONICAL_DIRECTORIES = [
  "_meta/source-links",
  "_incoming/unclassified",
  "_research-only",
  "rehabilitation/guidelines",
  "rehabilitation/anatomy-kinesiology",
  "rehabilitation/cervical-neck",
  "rehabilitation/thoracic",
  "rehabilitation/shoulder",
  "rehabilitation/lumbar",
  "rehabilitation/hip-pelvis",
  "rehabilitation/knee",
  "rehabilitation/ankle-foot",
  "rehabilitation/posture",
  "rehabilitation/exercise/general",
  "rehabilitation/exercise/workplace",
  "patient-education/general",
  "patient-education/behavior-change",
  "patient-education/health-literacy",
  "pain-science/chronic-pain",
  "pain-science/central-sensitization",
  "pain-science/multimodal",
  "seo/naver",
  "seo/tistory",
  "seo/wordpress",
  "seo/writing-psychology",
];

const ROOT_META_FILES = new Set([
  "SOURCES.csv",
  "RAG_INGESTION_POLICY.md",
  "README_KO.md",
  "LICENSES.md",
]);

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"' && quoted && next === '"') {
      field += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(field);
      field = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(field);
      field = "";
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
    } else {
      field += char;
    }
  }

  if (field || row.length) {
    row.push(field);
    if (row.some((value) => value.trim())) rows.push(row);
  }

  if (!rows.length) return [];
  const headers = rows[0].map((value) => value.trim());
  return rows.slice(1).map((values) => Object.fromEntries(headers.map((header, index) => [header, (values[index] ?? "").trim()])));
}

function loadManifest() {
  if (!existsSync(manifestPath)) return new Map();
  const rows = parseCsv(readFileSync(manifestPath, "utf8"));
  return new Map(rows.filter((row) => row.source_id).map((row) => [row.source_id.toUpperCase(), row]));
}

function slug(value) {
  return (value || "").toLowerCase().replace(/[_\s]+/g, "-");
}

function resolveFromManifest(row) {
  const domain = slug(row.domain);
  const topic = slug(row.topic);
  const commercialStatus = (row.commercial_status || "").toUpperCase();

  if (commercialStatus === "RESEARCH_ONLY") return "_research-only";

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
    if (topic.includes("exercise")) return "rehabilitation/exercise/general";
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

function resolveByKeywords(fileName) {
  const name = fileName.toLowerCase().replace(/[_-]+/g, " ");
  const has = (...terms) => terms.some((term) => name.includes(term));

  if (has("naver", "네이버")) return "seo/naver";
  if (has("tistory", "티스토리")) return "seo/tistory";
  if (has("wordpress")) return "seo/wordpress";
  if (has("copywriting", "writing psychology", "psychology of writing", "작문", "글쓰기", "대화기술", "심리학")) return "seo/writing-psychology";

  if (has("patient education", "환자교육")) return "patient-education/general";
  if (has("motivational interviewing", "behaviour change", "behavior change", "동기강화")) return "patient-education/behavior-change";
  if (has("health literacy", "low literacy", "건강문해")) return "patient-education/health-literacy";

  if (has("central sensitization", "central sensitisation", "중추감작")) return "pain-science/central-sensitization";
  if (has("pain neuroscience", "chronic pain", "통증과학", "만성통증")) return "pain-science/chronic-pain";
  if (has("psychological treatment", "multimodal", "multidisciplinary")) return "pain-science/multimodal";

  if (has("guideline", "clinical practice guideline", "who package", "가이드라인")) return "rehabilitation/guidelines";
  if (has("cervical", "neck pain", "forward head", "목통증", "거북목", "전방머리")) return "rehabilitation/cervical-neck";
  if (has("thoracic", "흉추")) return "rehabilitation/thoracic";
  if (has("shoulder", "rotator cuff", "견관절", "어깨", "회전근개")) return "rehabilitation/shoulder";
  if (has("lumbar", "low back", "back pain", "요통", "허리")) return "rehabilitation/lumbar";
  if (has("hip", "pelvis", "고관절", "골반")) return "rehabilitation/hip-pelvis";
  if (has("knee", "무릎")) return "rehabilitation/knee";
  if (has("ankle", "foot", "발목", "족부")) return "rehabilitation/ankle-foot";
  if (has("posture", "자세")) return "rehabilitation/posture";
  if (has("workplace", "office worker", "사무직")) return "rehabilitation/exercise/workplace";
  if (has("exercise", "rehabilitation program", "운동", "재활")) return "rehabilitation/exercise/general";
  if (has("anatomy", "kinesiology", "biomechanics", "해부학", "운동학", "생체역학")) return "rehabilitation/anatomy-kinesiology";

  return "_incoming/unclassified";
}

function extractSourceId(fileName, manifest) {
  const match = fileName.toUpperCase().match(/^([A-Z]{1,4}\d{1,4})(?:[_\-\s.]|$)/);
  if (!match) return null;
  return manifest.has(match[1]) ? match[1] : null;
}

function isCanonicalPath(relativePath) {
  const normalized = relativePath.split(path.sep).join("/");
  return CANONICAL_DIRECTORIES.some((dir) => normalized === dir || normalized.startsWith(`${dir}/`));
}

async function collectCandidates(root) {
  const files = [];
  async function walk(current) {
    for (const entry of await fs.readdir(current, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue;
      const full = path.join(current, entry.name);
      const relative = path.relative(root, full);
      if (entry.isDirectory()) {
        if (isCanonicalPath(relative)) continue;
        await walk(full);
        continue;
      }
      if (relative === "README.md") continue;
      files.push(full);
    }
  }
  await walk(root);
  return files;
}

async function uniqueDestination(directory, fileName) {
  const parsed = path.parse(fileName);
  let target = path.join(directory, fileName);
  let counter = 2;
  while (existsSync(target)) {
    target = path.join(directory, `${parsed.name}_${counter}${parsed.ext}`);
    counter += 1;
  }
  return target;
}

if (!existsSync(knowledgeRoot)) throw new Error(`knowledge-base를 찾지 못했습니다: ${knowledgeRoot}`);
const manifest = loadManifest();
const candidates = await collectCandidates(knowledgeRoot);
const plan = [];

for (const sourcePath of candidates) {
  const fileName = path.basename(sourcePath);
  const relative = path.relative(knowledgeRoot, sourcePath).split(path.sep).join("/");
  const extension = path.extname(fileName).toLowerCase();

  let destinationDir;
  let reason;

  if (extension === ".url") {
    destinationDir = "_meta/source-links";
    reason = "source link";
  } else if (ROOT_META_FILES.has(fileName)) {
    destinationDir = "_meta";
    reason = "knowledge metadata";
  } else {
    const sourceId = extractSourceId(fileName, manifest);
    const row = sourceId ? manifest.get(sourceId) : null;
    destinationDir = row ? resolveFromManifest(row) : resolveByKeywords(fileName);
    reason = row ? `manifest ${sourceId}` : "filename keyword fallback";
  }

  const destination = path.join(knowledgeRoot, destinationDir, fileName);
  if (path.resolve(sourcePath) === path.resolve(destination)) continue;
  plan.push({ sourcePath, relative, destinationDir, fileName, reason });
}

console.log(`Blotori Knowledge Base organizer · ${apply ? "APPLY" : "DRY RUN"}`);
console.log(`root: ${knowledgeRoot}`);
console.log(`files to organize: ${plan.length}`);
console.log("");

for (const item of plan) {
  console.log(`- ${item.relative}`);
  console.log(`  -> ${item.destinationDir}/${item.fileName} (${item.reason})`);
}

if (!apply) {
  console.log("\n실제 이동 전 미리보기입니다. 적용하려면 `npm run knowledge:organize`를 실행하세요.");
  process.exit(0);
}

for (const directory of CANONICAL_DIRECTORIES) {
  await fs.mkdir(path.join(knowledgeRoot, directory), { recursive: true });
}

for (const item of plan) {
  const directory = path.join(knowledgeRoot, item.destinationDir);
  await fs.mkdir(directory, { recursive: true });
  const target = await uniqueDestination(directory, item.fileName);
  await fs.rename(item.sourcePath, target);
}

console.log(`\n정리 완료: ${plan.length}개 파일 이동`);
console.log("분류되지 않은 파일은 knowledge-base/_incoming/unclassified에서 확인하세요.");
