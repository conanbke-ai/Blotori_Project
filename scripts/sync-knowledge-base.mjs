import { createReadStream, existsSync, promises as fs, readFileSync } from "node:fs";
import path from "node:path";
import OpenAI from "openai";

const SUPPORTED_EXTENSIONS = new Set([".doc", ".docx", ".html", ".json", ".md", ".pdf", ".pptx", ".txt"]);
const SKIP_FILE_NAMES = new Set(["README.md", "README_KO.md", "RAG_INGESTION_POLICY.md", "SOURCES.csv"]);
const COMMERCIAL_ALLOWED = new Set(["ALLOW", "ALLOW_WITH_ATTRIBUTION"]);
const RESEARCH_ALLOWED = new Set(["ALLOW", "ALLOW_WITH_ATTRIBUTION", "RESEARCH_ONLY"]);

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return;
  const text = readFileSync(filePath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index < 1) continue;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function parseCsvLine(line) {
  const values = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (char === "," && !quoted) {
      values.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  values.push(current);
  return values.map((value) => value.trim());
}

function loadSourceManifest(root) {
  const manifestPath = path.join(root, "_meta", "SOURCES.csv");
  if (!existsSync(manifestPath)) {
    throw new Error(`Knowledge source manifest가 없습니다: ${manifestPath}`);
  }

  const rows = readFileSync(manifestPath, "utf8").split(/\r?\n/).filter(Boolean);
  if (rows.length < 2) throw new Error("Knowledge source manifest에 데이터 행이 없습니다.");
  const headers = parseCsvLine(rows[0]);
  const byId = new Map();

  for (const row of rows.slice(1)) {
    const values = parseCsvLine(row);
    const record = Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
    const sourceId = record.source_id?.trim();
    if (!sourceId) continue;
    byId.set(sourceId, record);
  }
  return byId;
}

function sourceIdFromFileName(filePath) {
  const base = path.basename(filePath);
  const match = base.match(/^([A-Za-z]+\d+)(?:[_\-.]|$)/);
  return match?.[1] ?? null;
}

function resolveProfile() {
  const arg = process.argv.find((value) => value.startsWith("--profile="));
  const requested = (arg?.split("=")[1] || process.env.BLOTORI_KNOWLEDGE_PROFILE || "commercial").toLowerCase();
  if (!["commercial", "research"].includes(requested)) {
    throw new Error(`지원하지 않는 Knowledge profile입니다: ${requested}`);
  }
  return requested;
}

function evaluateManifestRecord(record, profile) {
  if (!record) return { include: false, reason: "manifest 미등록" };
  const status = (record.commercial_status || "REVIEW_REQUIRED").toUpperCase();
  const ingestDefault = String(record.ingest_default).toLowerCase() === "true";

  if (!ingestDefault) return { include: false, reason: `ingest_default=false (${status})` };

  const allowed = profile === "commercial" ? COMMERCIAL_ALLOWED : RESEARCH_ALLOWED;
  if (!allowed.has(status)) return { include: false, reason: `${profile} profile에서 ${status} 제외` };

  return { include: true, reason: status };
}

async function collectKnowledgeFiles(root, manifest, profile) {
  const included = [];
  const excluded = [];

  async function walk(current) {
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      if (entry.isDirectory() && entry.name === "_meta") continue;
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }
      const extension = path.extname(entry.name).toLowerCase();
      if (!SUPPORTED_EXTENSIONS.has(extension) || SKIP_FILE_NAMES.has(entry.name)) continue;

      const sourceId = sourceIdFromFileName(fullPath);
      const record = sourceId ? manifest.get(sourceId) : undefined;
      const decision = evaluateManifestRecord(record, profile);
      const item = {
        filePath: fullPath,
        relativePath: path.relative(root, fullPath),
        sourceId,
        record,
        reason: decision.reason,
      };
      (decision.include ? included : excluded).push(item);
    }
  }

  await walk(root);
  included.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  excluded.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  return { included, excluded };
}

function printPlan(profile, included, excluded) {
  console.log(`Knowledge profile: ${profile}`);
  console.log(`포함 ${included.length}개 / 제외 ${excluded.length}개`);
  for (const item of included) {
    console.log(`  INCLUDE ${item.sourceId ?? "-"}  ${item.relativePath}  [${item.reason}]`);
  }
  for (const item of excluded) {
    console.log(`  EXCLUDE ${item.sourceId ?? "-"}  ${item.relativePath}  [${item.reason}]`);
  }
}

async function upsertEnvLocal(projectRoot, values) {
  const envPath = path.join(projectRoot, ".env.local");
  let text = existsSync(envPath) ? await fs.readFile(envPath, "utf8") : "";
  for (const [key, value] of Object.entries(values)) {
    const pattern = new RegExp(`^${key}=.*$`, "m");
    const line = `${key}=${value}`;
    text = pattern.test(text) ? text.replace(pattern, line) : `${text.trimEnd()}${text.trim() ? "\n" : ""}${line}\n`;
  }
  await fs.writeFile(envPath, text, "utf8");
}

async function waitForVectorStoreFiles(client, vectorStoreId, vectorStoreFileIds) {
  const expected = new Set(vectorStoreFileIds);
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    const page = await client.vectorStores.files.list(vectorStoreId, { limit: 100 });
    const matched = (page.data ?? []).filter((item) => expected.has(item.id));
    const failed = matched.filter((item) => item.status === "failed" || item.status === "cancelled");
    if (failed.length) throw new Error(`벡터스토어 색인 실패: ${failed.map((item) => item.id).join(", ")}`);
    const completed = matched.filter((item) => item.status === "completed");
    process.stdout.write(`\r색인 상태: ${completed.length}/${expected.size} 완료`);
    if (completed.length === expected.size) {
      process.stdout.write("\n");
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  process.stdout.write("\n");
  throw new Error("벡터스토어 색인 확인 시간이 초과되었습니다. OpenAI 대시보드에서 파일 상태를 확인해 주세요.");
}

const projectRoot = process.cwd();
loadEnvFile(path.join(projectRoot, ".env.local"));
loadEnvFile(path.join(projectRoot, ".env"));

const appendMode = process.argv.includes("--append");
const dryRun = process.argv.includes("--dry-run");
const profile = resolveProfile();
const knowledgeRoot = path.resolve(projectRoot, process.env.BLOTORI_KNOWLEDGE_DIR || "knowledge-base");
if (!existsSync(knowledgeRoot)) throw new Error(`Knowledge Base 디렉터리를 찾지 못했습니다: ${knowledgeRoot}`);

const manifest = loadSourceManifest(knowledgeRoot);
const { included, excluded } = await collectKnowledgeFiles(knowledgeRoot, manifest, profile);
printPlan(profile, included, excluded);

if (!included.length) {
  throw new Error("현재 profile에서 업로드 허용된 전문자료가 없습니다. 파일명 source_id와 _meta/SOURCES.csv 상태를 확인해 주세요.");
}

if (dryRun) {
  console.log("dry-run 완료: OpenAI 업로드는 수행하지 않았습니다.");
  process.exit(0);
}

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) throw new Error("OPENAI_API_KEY가 없습니다. .env.local에 API 키를 먼저 설정해 주세요.");

const client = new OpenAI({ apiKey });
let vectorStoreId = appendMode ? process.env.OPENAI_VECTOR_STORE_ID?.trim() : undefined;
if (appendMode && !vectorStoreId) throw new Error("--append 모드에는 OPENAI_VECTOR_STORE_ID가 필요합니다.");
if (!appendMode) {
  const date = new Date().toISOString().slice(0, 10);
  const vectorStore = await client.vectorStores.create({ name: `Blotori Knowledge Base ${profile} ${date}` });
  vectorStoreId = vectorStore.id;
  console.log(`새 vector store 생성: ${vectorStoreId}`);
}
if (!vectorStoreId) throw new Error("vector store id를 준비하지 못했습니다.");

console.log(`전문자료 ${included.length}개 업로드 시작`);
const vectorStoreFileIds = [];
for (let index = 0; index < included.length; index += 1) {
  const item = included[index];
  console.log(`[${index + 1}/${included.length}] ${item.sourceId} ${item.relativePath}`);
  const uploaded = await client.files.create({ file: createReadStream(item.filePath), purpose: "assistants" });
  const attached = await client.vectorStores.files.create(vectorStoreId, {
    file_id: uploaded.id,
    attributes: {
      source_id: item.sourceId,
      domain: item.record?.domain || "unknown",
      topic: item.record?.topic || "unknown",
      priority: item.record?.priority || "P2",
      evidence_type: item.record?.evidence_type || "other",
      commercial_status: item.record?.commercial_status || "REVIEW_REQUIRED",
    },
  });
  vectorStoreFileIds.push(attached.id);
}

await waitForVectorStoreFiles(client, vectorStoreId, vectorStoreFileIds);
await upsertEnvLocal(projectRoot, {
  OPENAI_VECTOR_STORE_ID: vectorStoreId,
  BLOTORI_RAG_ENABLED: "true",
  BLOTORI_KNOWLEDGE_PROFILE: profile,
});
console.log("Knowledge Base 동기화 완료");
console.log(`OPENAI_VECTOR_STORE_ID=${vectorStoreId}`);
console.log(`BLOTORI_KNOWLEDGE_PROFILE=${profile}`);
