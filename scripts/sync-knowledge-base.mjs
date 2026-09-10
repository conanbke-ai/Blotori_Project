import { createReadStream, existsSync, promises as fs, readFileSync } from "node:fs";
import path from "node:path";
import OpenAI from "openai";

const SUPPORTED_EXTENSIONS = new Set([".doc", ".docx", ".html", ".json", ".md", ".pdf", ".pptx", ".txt"]);
const SKIP_FILE_NAMES = new Set(["README.md", "README_KO.md", "RAG_INGESTION_POLICY.md", "SOURCES.csv"]);

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

async function collectKnowledgeFiles(root) {
  const files = [];
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
      files.push(fullPath);
    }
  }
  await walk(root);
  return files.sort((a, b) => a.localeCompare(b));
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
const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) throw new Error("OPENAI_API_KEY가 없습니다. .env.local에 API 키를 먼저 설정해 주세요.");

const appendMode = process.argv.includes("--append");
const knowledgeRoot = path.resolve(projectRoot, process.env.BLOTORI_KNOWLEDGE_DIR || "knowledge-base");
if (!existsSync(knowledgeRoot)) throw new Error(`Knowledge Base 디렉터리를 찾지 못했습니다: ${knowledgeRoot}`);

const knowledgeFiles = await collectKnowledgeFiles(knowledgeRoot);
if (!knowledgeFiles.length) throw new Error("업로드할 전문자료가 없습니다. knowledge-base 아래에 PDF/DOCX/MD/TXT 등 지원 파일을 넣어 주세요.");

const client = new OpenAI({ apiKey });
let vectorStoreId = appendMode ? process.env.OPENAI_VECTOR_STORE_ID?.trim() : undefined;
if (appendMode && !vectorStoreId) throw new Error("--append 모드에는 OPENAI_VECTOR_STORE_ID가 필요합니다.");
if (!appendMode) {
  const date = new Date().toISOString().slice(0, 10);
  const vectorStore = await client.vectorStores.create({ name: `Blotori Knowledge Base ${date}` });
  vectorStoreId = vectorStore.id;
  console.log(`새 vector store 생성: ${vectorStoreId}`);
}
if (!vectorStoreId) throw new Error("vector store id를 준비하지 못했습니다.");

console.log(`전문자료 ${knowledgeFiles.length}개 업로드 시작`);
const vectorStoreFileIds = [];
for (let index = 0; index < knowledgeFiles.length; index += 1) {
  const filePath = knowledgeFiles[index];
  console.log(`[${index + 1}/${knowledgeFiles.length}] ${path.relative(knowledgeRoot, filePath)}`);
  const uploaded = await client.files.create({ file: createReadStream(filePath), purpose: "assistants" });
  const attached = await client.vectorStores.files.create(vectorStoreId, { file_id: uploaded.id });
  vectorStoreFileIds.push(attached.id);
}

await waitForVectorStoreFiles(client, vectorStoreId, vectorStoreFileIds);
await upsertEnvLocal(projectRoot, { OPENAI_VECTOR_STORE_ID: vectorStoreId, BLOTORI_RAG_ENABLED: "true" });
console.log("Knowledge Base 동기화 완료");
console.log(`OPENAI_VECTOR_STORE_ID=${vectorStoreId}`);
console.log(".env.local에 vector store id와 BLOTORI_RAG_ENABLED=true를 반영했습니다.");
