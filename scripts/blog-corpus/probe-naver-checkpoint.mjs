import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fetchNaverPostMetrics, listAllNaverPosts } from "./naver-corpus-lib.mjs";
import { RecoveryCheckpoint, classifyRequestError, runCheckpointedRequests } from "./recovery-checkpoint-lib.mjs";

function arg(name, fallback = null) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? (process.argv[index + 1] ?? true) : fallback;
}

function fileDigest(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

const blogId = String(arg("blog", ""));
const outputDir = path.resolve(String(arg("output", "")));
const archivedAggregateFile = arg("archived-aggregate");
const excludeCheckpointFile = arg("exclude-checkpoint");
const listPages = Math.max(1, Math.min(20, Number(arg("list-pages", "1"))));
const maxHttpAttempts = Math.max(2, Math.min(120, Number(arg("max-http-attempts", "30"))));
const maxPosts = Math.max(1, Math.min(100, Number(arg("max-posts", "20")), maxHttpAttempts - listPages));
const maxAttemptsPerRequest = Math.max(1, Number(arg("max-attempts", "4")));
const delayMs = Math.max(1000, Number(arg("delay-ms", "1200")));
const phaseOnePosts = Math.max(1, Number(arg("phase-one-posts", "9")));
const concurrency = Number(arg("concurrency", "1"));
const batch = String(arg("batch", "false")) === "true";
const resumeOnly = String(arg("resume-only", "false")) === "true";
if (!blogId || !arg("output")) throw new Error("Usage: --blog <id> --output <new-dir> [--archived-aggregate <json>]");
if (maxHttpAttempts <= listPages) throw new Error("PROBE_HTTP_BUDGET_TOO_SMALL_FOR_LISTING");
if (concurrency !== 1) throw new Error("PROBE_CONCURRENCY_MUST_BE_ONE");
if (batch) throw new Error("PROBE_BATCH_MUST_BE_FALSE");
if (resumeOnly && !fs.existsSync(outputDir)) throw new Error(`PROBE_OUTPUT_MISSING ${outputDir}`);
if (!resumeOnly && fs.existsSync(outputDir)) throw new Error(`PROBE_OUTPUT_EXISTS ${outputDir}`);
if (!resumeOnly) fs.mkdirSync(outputDir, { recursive: false });

const sourceUrl = `https://blog.naver.com/${blogId}`;
const checkpointFile = path.join(outputDir, "checkpoint.jsonl");
const reportFile = path.join(outputDir, "report.json");
if (resumeOnly) {
  const beforeSha256 = fileDigest(checkpointFile);
  const beforeBytes = fs.statSync(checkpointFile).size;
  const checkpoint = new RecoveryCheckpoint(checkpointFile, {
    sourceUrl,
    platform: "naver",
    identity: blogId,
    syncEvery: 1,
  });
  const beforeSummary = checkpoint.summary({ maxAttempts: maxAttemptsPerRequest });
  let workerCalls = 0;
  const resumed = await runCheckpointedRequests({
    checkpoint,
    concurrency: 1,
    maxAttempts: maxAttemptsPerRequest,
    worker: async () => {
      workerCalls++;
      throw new Error("RESUME_WORKER_MUST_NOT_RUN");
    },
  });
  checkpoint.close();
  const afterSha256 = fileDigest(checkpointFile);
  const afterBytes = fs.statSync(checkpointFile).size;
  assert.equal(resumed.processed, 0);
  assert.equal(workerCalls, 0);
  assert.equal(beforeSha256, afterSha256);
  assert.equal(beforeBytes, afterBytes);
  assert.equal(beforeSummary.eventCount, resumed.eventCount);
  const resumeReport = {
    schemaVersion: 1,
    probeOnly: true,
    resumeOnly: true,
    blogId,
    generatedAt: new Date().toISOString(),
    httpAttempts: 0,
    workerCalls,
    processed: resumed.processed,
    beforeSha256,
    afterSha256,
    beforeBytes,
    afterBytes,
    beforeEventCount: beforeSummary.eventCount,
    afterEventCount: resumed.eventCount,
    succeeded: resumed.succeeded,
    failed: resumed.failed,
    pending: resumed.pending,
    idempotent: true,
  };
  fs.writeFileSync(path.join(outputDir, "resume-report.json"), `${JSON.stringify(resumeReport, null, 2)}\n`, "utf8");
  console.log("NAVER_CHECKPOINT_RESUME", JSON.stringify(resumeReport));
  process.exit(0);
}
const startedAtMs = Date.now();
const excludedPostIds = new Set();
let exclusion = null;
if (excludeCheckpointFile) {
  const resolved = path.resolve(String(excludeCheckpointFile));
  const excludedCheckpoint = new RecoveryCheckpoint(resolved, {
    sourceUrl,
    platform: "naver",
    identity: blogId,
    syncEvery: 1,
  });
  const excludedMaterialized = excludedCheckpoint.materialize();
  const excludedSummary = excludedCheckpoint.summary();
  excludedCheckpoint.close();
  for (const metric of excludedMaterialized.successes) excludedPostIds.add(String(metric.logNo));
  exclusion = {
    checkpointFile: resolved,
    checkpointSha256: fileDigest(resolved),
    manifestDigest: excludedSummary.manifestDigest,
    successfulPostIds: excludedPostIds.size,
  };
}
const responseLog = [];
const retryLog = [];
let httpAttempts = 0;
let currentTotalCount = null;
let listedPagePosts = [];
let stoppedOn403 = false;
let stopReason = null;
let phaseOneSummary = null;
let phaseOneDigest = null;
let resumeConsistent = false;
let probeTargetCount = 0;
const pageSnapshots = [];

const remainingBudget = () => Math.max(0, maxHttpAttempts - httpAttempts);
const retryOptions = () => ({
  attempts: Math.max(1, Math.min(maxAttemptsPerRequest, remainingBudget())),
  baseDelayMs: 1000,
  maxDelayMs: 30_000,
  jitterRatio: 0.2,
  onAttempt: ({ attempt, url }) => {
    if (httpAttempts >= maxHttpAttempts) throw new Error("PROBE_HTTP_BUDGET_EXHAUSTED");
    httpAttempts++;
    console.log("PROBE_HTTP_ATTEMPT", httpAttempts, maxHttpAttempts, attempt, url);
  },
  onResponse: ({ attempt, url, status, ok, retryAfter }) => {
    responseLog.push({ sequence: responseLog.length + 1, attempt, url, status, ok, retryAfter });
  },
  onRetry: ({ attempt, delayMs: waitMs, classification, url }) => {
    retryLog.push({ attempt, delayMs: waitMs, classification: classification.kind, status: classification.status, url });
    console.log("PROBE_RETRY", attempt, classification.kind, waitMs, url);
  },
});

function postUrl(logNo) {
  return `https://blog.naver.com/PostView.naver?blogId=${encodeURIComponent(blogId)}&logNo=${encodeURIComponent(logNo)}&redirect=Dlog&widgetTypeCall=true`;
}

function canonicalPostUrl(logNo) {
  return `https://blog.naver.com/${encodeURIComponent(blogId)}/${encodeURIComponent(logNo)}`;
}

async function processEntries(checkpoint, entries, limit = Infinity) {
  let processed = 0;
  for (const entry of entries) {
    if (processed >= limit || remainingBudget() <= 0 || stoppedOn403) break;
    const before = httpAttempts;
    try {
      const metric = await fetchNaverPostMetrics(blogId, entry.request, {
        delayMs,
        retryOptions: retryOptions(),
      });
      checkpoint.recordSuccess(entry, {
        ...metric,
        postUrl: entry.request.url,
        canonicalPostUrl: entry.request.canonicalUrl,
      }, {
        attemptsUsed: Math.max(1, httpAttempts - before),
      });
    } catch (error) {
      const classification = error?.recoveryClassification ?? classifyRequestError(error);
      checkpoint.recordFailure(entry, error, { attemptsUsed: Math.max(1, httpAttempts - before) });
      if (classification.status === 403) {
        stoppedOn403 = true;
        stopReason = classification.kind;
      } else if (classification.status === 429) {
        stopReason = "rate_limit_retry_exhausted";
        break;
      }
    }
    processed++;
  }
  checkpoint.flush();
  return processed;
}

let checkpoint = new RecoveryCheckpoint(checkpointFile, {
  sourceUrl,
  platform: "naver",
  identity: blogId,
  syncEvery: 1,
});

try {
  listedPagePosts = await listAllNaverPosts(blogId, {
    delayMs,
    maxPages: listPages,
    retryOptions: retryOptions(),
    onPage: (snapshot) => {
      currentTotalCount = snapshot.totalCount;
      pageSnapshots.push(snapshot);
    },
  });
  const probePosts = listedPagePosts
    .filter((post) => !post.blocked && !post.notOpen)
    .filter((post) => !excludedPostIds.has(String(post.logNo)))
    .slice(0, maxPosts)
    .map((post) => ({ ...post, url: postUrl(post.logNo), canonicalUrl: canonicalPostUrl(post.logNo) }));
  probeTargetCount = probePosts.length;
  checkpoint.initializeManifest(probePosts);
  await processEntries(checkpoint, checkpoint.pendingEntries({ maxAttempts: maxAttemptsPerRequest }), phaseOnePosts);
  phaseOneSummary = checkpoint.summary({ maxAttempts: maxAttemptsPerRequest });
  const beforeRestart = checkpoint.materialize();
  checkpoint.close();
  phaseOneDigest = fileDigest(checkpointFile);

  checkpoint = new RecoveryCheckpoint(checkpointFile, {
    sourceUrl,
    platform: "naver",
    identity: blogId,
    syncEvery: 1,
  });
  assert.deepEqual(checkpoint.materialize(), beforeRestart);
  assert.equal(checkpoint.summary().manifestDigest, phaseOneSummary.manifestDigest);
  resumeConsistent = true;
  await processEntries(checkpoint, checkpoint.pendingEntries({ maxAttempts: maxAttemptsPerRequest }));
} catch (error) {
  const classification = error?.recoveryClassification ?? classifyRequestError(error);
  if (!checkpoint.manifest) checkpoint.recordDiscoveryFailure(error, { attemptsUsed: Math.max(1, httpAttempts) });
  if (classification.status === 403) {
    stoppedOn403 = true;
    stopReason = classification.kind;
  } else {
    stopReason = stopReason ?? classification.kind;
  }
} finally {
  checkpoint.flush();
  checkpoint.close();
}

const verified = new RecoveryCheckpoint(checkpointFile, {
  sourceUrl,
  platform: "naver",
  identity: blogId,
  syncEvery: 1,
});
const finalSummary = verified.summary({ maxAttempts: maxAttemptsPerRequest });
const materialized = verified.materialize();
const rawMetricPostIds = materialized.successes.map((metric) => String(metric.logNo));
const rawMetricUrls = materialized.successes.map((metric) => metric.postUrl);
const rawMetricCanonicalUrls = materialized.successes.map((metric) => metric.canonicalPostUrl);
assert.equal(new Set(rawMetricPostIds).size, rawMetricPostIds.length);
assert.equal(rawMetricPostIds.length, rawMetricUrls.filter(Boolean).length);
assert.equal(rawMetricPostIds.length, rawMetricCanonicalUrls.filter(Boolean).length);
assert.ok(httpAttempts <= maxHttpAttempts);
assert.equal(finalSummary.unsyncedEvents, 0);
verified.close();

let archivedAggregate = null;
if (archivedAggregateFile) archivedAggregate = JSON.parse(fs.readFileSync(path.resolve(String(archivedAggregateFile)), "utf8"));
const archivedKnownIds = new Set([
  ...(archivedAggregate?.failures ?? []).map((item) => String(item.logNo ?? "")),
  ...(archivedAggregate?.representativeTextPosts ?? []).map((item) => String(item.logNo ?? "")),
  ...(archivedAggregate?.representativeVisualPosts ?? []).map((item) => String(item.logNo ?? "")),
].filter(Boolean));
const listedIds = listedPagePosts.map((post) => String(post.logNo));
const responseStatuses = Object.fromEntries([...new Set(responseLog.map((item) => item.status))]
  .sort((a, b) => a - b)
  .map((status) => [String(status), responseLog.filter((item) => item.status === status).length]));
const checkpointEvents = fs.readFileSync(checkpointFile, "utf8").split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
const metricRecords = checkpointEvents
  .filter((event) => event.type === "result" && event.outcome === "success")
  .map((event) => ({
    postId: event.requestId,
    canonicalUrl: event.metric.canonicalPostUrl,
    requestUrl: event.metric.postUrl,
    metricDigest: event.metricDigest,
    eligibility: event.metric.eligibility,
    textChars: event.metric.textChars,
    imageCount: event.metric.imageCount,
  }));
const successfulListResponses = responseLog.filter((item) => item.status === 200 && item.url.includes("PostTitleListAsync.naver")).length;
const successfulPostResponses = responseLog.filter((item) => item.status === 200 && item.url.includes("PostView.naver")).length;
const durationSeconds = Math.round((Date.now() - startedAtMs) / 100) / 10;
const report = {
  schemaVersion: 1,
  probeOnly: true,
  blogId,
  sourceUrl,
  generatedAt: new Date().toISOString(),
  policy: { batch, concurrency, delayMs, listPages, maxPosts, maxHttpAttempts, maxAttemptsPerRequest, stopOn403: true, bypassUsed: false },
  requests: { httpAttempts, responseStatuses, responses: responseLog, retries: retryLog, stoppedOn403, stopReason },
  throughput: {
    durationSeconds,
    successfulPostsPerMinute: durationSeconds > 0 ? Math.round(finalSummary.succeeded / durationSeconds * 6000) / 100 : 0,
  },
  exclusion,
  listing: {
    listHttpAttempts: responseLog.filter((item) => item.url.includes("PostTitleListAsync.naver")).length,
    successfulPages: successfulListResponses,
    pageSnapshots,
    currentTotalCount,
    listedPagePostIds: listedIds,
    archivedTotalListed: archivedAggregate?.coverage?.totalListed ?? null,
    totalCountDelta: currentTotalCount == null || archivedAggregate?.coverage?.totalListed == null
      ? null : currentTotalCount - Number(archivedAggregate.coverage.totalListed),
    oldManifestAvailable: false,
    exactAddedRemovedComparison: null,
    comparisonReason: "run 37568100548 artifacts do not contain the full prior post manifest",
    overlapWithArchivedKnownIds: listedIds.filter((id) => archivedKnownIds.has(id)),
  },
  checkpoint: {
    file: path.basename(checkpointFile),
    bytes: fs.statSync(checkpointFile).size,
    sha256: fileDigest(checkpointFile),
    phaseOneSha256: phaseOneDigest,
    phaseOneSummary,
    finalSummary,
    resumeConsistent,
    rawMetricPostIds,
    rawMetricUrls,
    rawMetricCanonicalUrls,
    metricRecords,
    failures: materialized.failures,
  },
  nextStepEligible: httpAttempts <= maxHttpAttempts
    && successfulListResponses === listPages
    && successfulPostResponses === probeTargetCount
    && responseLog.every((item) => item.status === 200 || item.status === 429)
    && finalSummary.succeeded === probeTargetCount
    && finalSummary.failed === 0
    && finalSummary.pending === 0
    && !stoppedOn403
    && resumeConsistent
    && httpAttempts <= maxHttpAttempts,
};
fs.writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log("NAVER_CHECKPOINT_PROBE", JSON.stringify(report));
if (!report.nextStepEligible) process.exitCode = 2;
