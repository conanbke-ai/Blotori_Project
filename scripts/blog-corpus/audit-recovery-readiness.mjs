import fs from "node:fs";
import path from "node:path";
import { canonicalizeSourceUrl, classifyRequestError, recoveryRequestKey } from "./recovery-checkpoint-lib.mjs";

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const name of fs.readdirSync(dir)) {
    const file = path.join(dir, name);
    const stat = fs.statSync(file);
    if (stat.isDirectory()) walk(file, files);
    else if (name.endsWith(".json") && name !== "summary.json" && name !== "coverage.json") files.push(file);
  }
  return files;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function allPresets(library) {
  return Object.values(library.categories ?? {}).flatMap((category) => category.presets ?? []);
}

function rawMetricRows(value, rows = []) {
  if (Array.isArray(value)) {
    for (const item of value) rawMetricRows(item, rows);
    return rows;
  }
  if (!value || typeof value !== "object") return rows;
  if (value.logNo != null && value.eligibility && value.textChars != null && value.imageCount != null) rows.push(value);
  for (const child of Object.values(value)) rawMetricRows(child, rows);
  return rows;
}

function failureRequestRows(document) {
  return (document.failures ?? []).filter((failure) => failure?.logNo).map((failure) => failureRequestRow(document, failure));
}

function failureRequestRow(document, failure) {
  const status = Number(failure.status) || Number(String(failure.message ?? "").match(/HTTP\s+(\d{3})/i)?.[1]) || null;
  const message = String(failure.message ?? "");
  const classification = classifyRequestError(Object.assign(new Error(message), { status }));
  return {
    key: recoveryRequestKey(document.sourceUrl, { logNo: failure.logNo }),
    sourceUrl: canonicalizeSourceUrl(document.sourceUrl),
    logNo: String(failure.logNo),
    status,
    message,
    retryable: classification.retryable,
    permanent: classification.permanent,
    classification: classification.kind,
  };
}

function checkpointIndex(entry) {
  const relative = entry.data.recoveryCheckpoint?.file;
  const file = relative ? path.resolve(path.dirname(entry.file), relative) : null;
  if (!file || !fs.existsSync(file)) return null;
  const events = fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
  const manifest = [...events].reverse().find((event) => event.type === "manifest");
  const discovery = [...events].reverse().find((event) => event.type === "discovery");
  if (!manifest) {
    return discovery?.outcome === "failure" && discovery.permanent === true
      ? { complete: true, recoveryRows: [], permanentRows: [] }
      : { complete: false, recoveryRows: [], permanentRows: [] };
  }
  const states = new Map();
  for (const event of events) if (event.type === "result") states.set(event.key, event);
  const recoveryRows = [];
  const permanentRows = [];
  for (const item of manifest.requests ?? []) {
    const state = states.get(item.key);
    if (state?.outcome === "success") continue;
    const row = {
      key: item.key,
      sourceUrl: canonicalizeSourceUrl(entry.data.sourceUrl),
      logNo: String(item.requestId),
      status: state?.status ?? null,
      message: String(state?.message ?? "checkpoint_pending"),
      retryable: !state?.permanent,
      permanent: Boolean(state?.permanent),
      classification: state?.classification ?? "checkpoint_pending",
    };
    if (row.permanent) permanentRows.push(row); else recoveryRows.push(row);
  }
  return { complete: true, recoveryRows, permanentRows };
}

const corpusDir = process.argv[2];
const presetFile = process.argv[3];
const coverageFile = process.argv[4];
const presetId = process.argv[5] || "gaming-entertainment-observed-03";
const requireComplete = process.argv.includes("--require-complete");
if (!corpusDir || !presetFile || !coverageFile) {
  throw new Error("Usage: node audit-recovery-readiness.mjs <corpus-dir> <preset-json> <coverage-json> [preset-id] [--require-complete]");
}

const coverage = readJson(coverageFile);
const library = readJson(presetFile);
const documents = walk(corpusDir).map((file) => ({ file, data: readJson(file) })).filter((entry) => entry.data?.coverage && entry.data?.sourceUrl);
const bySource = new Map();
for (const entry of documents) {
  const canonical = canonicalizeSourceUrl(entry.data.sourceUrl);
  if (!bySource.has(canonical)) bySource.set(canonical, []);
  bySource.get(canonical).push(entry);
}

let storedFailureRecords = 0;
let indexedFailureRecords = 0;
let missingFailureRecords = 0;
let checkpointedSources = 0;
let collectionFailureRecords = 0;
const uniqueKnownRequests = new Set();
const uniqueRetryableRequests = new Set();
const uniquePermanentRequests = new Set();
const statusSamples = new Map();
const requestStatusSamples = new Map();
const representativePostIds = new Set();
const rawFeaturePostIds = new Set();
for (const entry of documents) {
  const { data } = entry;
  const failures = data.failures ?? [];
  const checkpoint = checkpointIndex(entry);
  const legacyIndexed = failureRequestRows(data);
  const indexed = checkpoint?.complete ? [...checkpoint.recoveryRows, ...checkpoint.permanentRows] : legacyIndexed;
  storedFailureRecords += failures.length;
  collectionFailureRecords += failures.filter((failure) => failure.stage === "list").length;
  indexedFailureRecords += indexed.length;
  missingFailureRecords += checkpoint?.complete ? 0 : Math.max(0, Number(data.coverage.failed || 0) - legacyIndexed.length);
  if (checkpoint?.complete) checkpointedSources++;
  for (const failure of failures) {
    const status = Number(failure.status) || Number(String(failure.message ?? "").match(/HTTP\s+(\d{3})/i)?.[1]) || null;
    const label = status ? `HTTP ${status}` : String(failure.message ?? "unknown");
    statusSamples.set(label, (statusSamples.get(label) || 0) + 1);
  }
  for (const row of indexed) {
    uniqueKnownRequests.add(row.key);
    if (row.retryable) uniqueRetryableRequests.add(row.key);
    if (row.permanent) uniquePermanentRequests.add(row.key);
    const label = row.status ? `HTTP ${row.status}` : row.message || "unknown";
    requestStatusSamples.set(label, (requestStatusSamples.get(label) || 0) + 1);
  }
  for (const representative of [...(data.representativeTextPosts ?? []), ...(data.representativeVisualPosts ?? [])]) {
    if (representative?.logNo != null) representativePostIds.add(`${canonicalizeSourceUrl(data.sourceUrl)}\u0000${representative.logNo}`);
  }
  for (const metric of rawMetricRows(data)) {
    rawFeaturePostIds.add(`${canonicalizeSourceUrl(data.sourceUrl)}\u0000${metric.logNo}`);
  }
}

const totalListed = Number(coverage.totalListed || 0);
const totalObserved = Number(coverage.observed ?? coverage.analyzed ?? 0);
const totalParsed = documents.reduce((sum, entry) => sum + Number(entry.data.coverage?.parsed ?? entry.data.coverage?.analyzed ?? 0), 0);
const totalUnobservable = documents.reduce((sum, entry) => sum + Number(entry.data.coverage?.unobservable ?? 0), 0);
const failedBefore = Number(coverage.failed || 0);
const postFailureRecords = failedBefore - collectionFailureRecords;
const listedOutcomeGap = totalListed - totalParsed;
const maxAllowedFailures = Math.floor(totalListed * 0.02);
const globalMinimumRecovery = Math.max(0, failedBefore - maxAllowedFailures);
const preset = allPresets(library).find((item) => item.id === presetId);
if (!preset) throw new Error(`PRESET_NOT_FOUND ${presetId}`);
const presetListed = Number(preset.sourceMeta?.totalListedPosts || 0);
const presetObserved = Number(preset.sourceMeta?.analyzedPosts || 0);
const presetFailed = Number(preset.sourceMeta?.failedPosts || 0);
const presetRequiredObserved = Math.ceil(presetListed * 0.65);
const presetMinimumRecovery = Math.max(0, presetRequiredObserved - presetObserved);
const presetSources = new Set((preset.sourceMeta?.members ?? []).map((member) => canonicalizeSourceUrl(member.sourceUrl)));
const presetKnownRequests = new Set();
const presetRetryableRequests = new Set();
const presetPermanentRequests = new Set();
for (const sourceUrl of presetSources) {
  for (const entry of bySource.get(sourceUrl) ?? []) {
    const checkpoint = checkpointIndex(entry);
    const rows = checkpoint?.complete ? [...checkpoint.recoveryRows, ...checkpoint.permanentRows] : failureRequestRows(entry.data);
    for (const row of rows) {
      presetKnownRequests.add(row.key);
      if (row.retryable) presetRetryableRequests.add(row.key);
      if (row.permanent) presetPermanentRequests.add(row.key);
    }
  }
}

const failureIndexComplete = missingFailureRecords === 0 && checkpointedSources === documents.length;
const result = {
  schemaVersion: 2,
  corpus: {
    targetDocuments: documents.length,
    canonicalSources: bySource.size,
    duplicateSourceMappings: documents.length - bySource.size,
    checkpointedSources,
    totalListed,
    totalObserved,
    totalParsed,
    totalUnobservable,
    failedBefore,
    failureRateBefore: totalListed ? failedBefore / totalListed : 0,
    maxAllowedFailures,
    minimumSuccessfulRecoveries: globalMinimumRecovery,
    storedFailureRecords,
    indexedFailureRecords,
    uniqueKnownRecoveryRequests: uniqueKnownRequests.size,
    uniqueRetryableRecoveryRequests: uniqueRetryableRequests.size,
    uniquePermanentFailureRequests: uniquePermanentRequests.size,
    missingFailureRecords,
    failureAccounting: {
      postFailureRecords,
      collectionFailureRecords,
      listedOutcomeGap,
      observedOutcomeGap: totalListed - totalObserved,
      missingPostFailureIds: Math.max(0, postFailureRecords - indexedFailureRecords),
      postAccountingValid: postFailureRecords === listedOutcomeGap,
      trueFailureAccountingValid: failedBefore === postFailureRecords + collectionFailureRecords,
      definition: "trueFailed = post request failures + source-list collection failures; collection failures have no totalListed denominator",
    },
    artifactRecovery: {
      exactFailurePostIds: uniqueKnownRequests.size,
      representativeSuccessPostIds: representativePostIds.size,
      rawPerPostFeatureRows: rawFeaturePostIds.size,
      exactMergeFromArtifacts: rawFeaturePostIds.size === totalParsed,
    },
    failureIndexComplete,
    statusSamples: Object.fromEntries([...statusSamples.entries()].sort((a, b) => b[1] - a[1])),
    requestStatusSamples: Object.fromEntries([...requestStatusSamples.entries()].sort((a, b) => b[1] - a[1])),
  },
  preset: {
    id: presetId,
    totalListed: presetListed,
    observedBefore: presetObserved,
    failedBefore: presetFailed,
    successRateBefore: Number(preset.sourceMeta?.successRate || 0),
    requiredObserved: presetRequiredObserved,
    minimumSuccessfulRecoveries: presetMinimumRecovery,
    knownRecoveryRequests: presetKnownRequests.size,
    retryableRecoveryRequests: presetRetryableRequests.size,
    permanentFailureRequests: presetPermanentRequests.size,
    sourceCount: presetSources.size,
  },
  recoverableWithoutRepeatingSuccesses: failureIndexComplete
    && uniqueRetryableRequests.size >= globalMinimumRecovery
    && presetRetryableRequests.size >= presetMinimumRecovery,
};

console.log(JSON.stringify(result, null, 2));
if (requireComplete && !result.recoverableWithoutRepeatingSuccesses) process.exitCode = 2;
