import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const CHECKPOINT_SCHEMA_VERSION = 2;
const RAW_METRIC_SCHEMA_VERSION = 1;
const RAW_NUMERIC_FEATURE_FIELDS = [
  "titleLength", "textChars", "blockCount", "paragraphCount", "sentenceCount",
  "avgSentenceChars", "avgParagraphChars", "shortParagraphRate", "imageCount",
  "imagesPer1000Chars", "headingCount", "strongCount", "listItemCount", "quoteCount",
  "linkCount", "galleryLike", "centeredBlockCount", "leftBlockCount",
  "componentSequenceLength", "imageComponentCount", "maxConsecutiveImageComponents",
  "imageRunCount", "avgImageRunLength", "textImageTransitions",
  "textComponentsBeforeFirstImage", "avgTextComponentsBetweenImageRuns", "hashtagCount",
  "mapCount", "videoCount", "closingParagraphChars", "closingHasHashtag",
];
const ENDING_FIELDS = ["formal", "haeyo", "jyo", "plain", "noun", "other"];
const PUNCTUATION_FIELDS = ["question", "exclamation", "ellipsis", "laugh", "cry", "emoji"];
const RETRYABLE_NETWORK_CODES = new Set([
  "ECONNABORTED", "ECONNREFUSED", "ECONNRESET", "EHOSTUNREACH", "ENETDOWN",
  "ENETRESET", "ENETUNREACH", "ETIMEDOUT", "UND_ERR_CONNECT_TIMEOUT",
]);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}

function stableJson(value) {
  return JSON.stringify(stable(value));
}

function sha256(value) {
  return crypto.createHash("sha256").update(typeof value === "string" ? value : stableJson(value)).digest("hex");
}

function assertFiniteFields(value, fields, prefix) {
  for (const field of fields) {
    if (typeof value?.[field] !== "number" || !Number.isFinite(value[field])) throw new Error(`RAW_METRIC_FIELD_INVALID ${prefix}${field}`);
  }
}

export function validateRawMetric(metric, requestId = null) {
  if (!metric || typeof metric !== "object" || Array.isArray(metric)) throw new Error("RAW_METRIC_OBJECT_REQUIRED");
  if (!String(metric.logNo ?? "")) throw new Error("RAW_METRIC_POST_ID_REQUIRED");
  if (requestId != null && String(metric.logNo) !== String(requestId)) throw new Error("RAW_METRIC_POST_ID_MISMATCH");
  if (typeof metric.rootSelector !== "string" || typeof metric.contentClass !== "string" || typeof metric.date !== "string") {
    throw new Error("RAW_METRIC_TEXT_FIELDS_INVALID");
  }
  for (const field of ["text", "visual", "observable"]) {
    if (typeof metric.eligibility?.[field] !== "boolean") throw new Error(`RAW_METRIC_ELIGIBILITY_INVALID ${field}`);
  }
  assertFiniteFields(metric, RAW_NUMERIC_FEATURE_FIELDS, "");
  assertFiniteFields(metric.endings, ENDING_FIELDS, "endings.");
  assertFiniteFields(metric.punctuation, PUNCTUATION_FIELDS, "punctuation.");
  return stable(metric);
}

export function canonicalizeSourceUrl(value) {
  const url = new URL(String(value));
  url.hash = "";
  url.hostname = url.hostname.toLowerCase();
  if (url.hostname === "m.blog.naver.com") url.hostname = "blog.naver.com";
  if ((url.protocol === "https:" && url.port === "443") || (url.protocol === "http:" && url.port === "80")) url.port = "";
  url.protocol = "https:";
  url.pathname = url.pathname.replace(/\/{2,}/g, "/").replace(/\/$/, "") || "/";
  url.searchParams.sort();
  return url.href.replace(/\/$/, "");
}

export function requestIdentity(request) {
  if (request?.logNo != null && String(request.logNo)) return String(request.logNo);
  if (request?.url) return canonicalizeSourceUrl(request.url);
  throw new Error("RECOVERY_REQUEST_ID_REQUIRED");
}

export function recoveryRequestKey(sourceUrl, request) {
  return `${canonicalizeSourceUrl(sourceUrl)}\u0000${requestIdentity(request)}`;
}

export function parseRetryAfterMs(value, nowMs = Date.now()) {
  if (value == null || String(value).trim() === "") return null;
  const raw = String(value).trim();
  if (/^\d+(?:\.\d+)?$/.test(raw)) return Math.max(0, Math.ceil(Number(raw) * 1000));
  const timestamp = Date.parse(raw);
  if (!Number.isFinite(timestamp)) return null;
  return Math.max(0, timestamp - nowMs);
}

export function computeRetryDelayMs({
  attempt,
  retryAfterMs = null,
  baseDelayMs = 500,
  maxDelayMs = 30_000,
  jitterRatio = 0.2,
  random = Math.random,
}) {
  const exponent = Math.max(0, Number(attempt || 1) - 1);
  const capped = Math.min(maxDelayMs, baseDelayMs * (2 ** exponent));
  const jitter = capped * Math.max(0, jitterRatio) * ((Math.max(0, Math.min(1, random())) * 2) - 1);
  const exponential = Math.max(0, Math.ceil(capped + jitter));
  return Math.max(exponential, Number.isFinite(retryAfterMs) ? retryAfterMs : 0);
}

function statusFrom(error) {
  if (Number.isFinite(Number(error?.status))) return Number(error.status);
  const match = String(error?.message || error || "").match(/HTTP\s+(\d{3})/i);
  return match ? Number(match[1]) : null;
}

export function classifyRequestError(error) {
  const status = statusFrom(error);
  const retryAfterMs = Number.isFinite(Number(error?.retryAfterMs)) ? Number(error.retryAfterMs) : null;
  if (String(error?.message || error) === "blocked_or_not_open") {
    return { status: null, kind: "source_marked_unavailable", retryable: false, permanent: true, retryAfterMs: null };
  }
  if (status === 429) return { status, kind: "rate_limited", retryable: true, permanent: false, retryAfterMs };
  if (status === 403) {
    const kind = error?.wwwAuthenticate ? "authentication_or_permission_required" : "access_forbidden";
    return { status, kind, retryable: false, permanent: true, retryAfterMs };
  }
  if (status === 401) return { status, kind: "authentication_required", retryable: false, permanent: true, retryAfterMs };
  if (status === 404) return { status, kind: "not_found", retryable: false, permanent: true, retryAfterMs };
  if (status === 408 || status === 425 || (status != null && status >= 500)) {
    return { status, kind: "transient_http", retryable: true, permanent: false, retryAfterMs };
  }
  const code = String(error?.cause?.code || error?.code || "");
  if (RETRYABLE_NETWORK_CODES.has(code) || error instanceof TypeError) {
    return { status, kind: "network_transient", retryable: true, permanent: false, retryAfterMs };
  }
  return { status, kind: "request_failed", retryable: false, permanent: true, retryAfterMs };
}

export class CorpusHttpError extends Error {
  constructor(url, response) {
    super(`HTTP ${response.status}`);
    this.name = "CorpusHttpError";
    this.status = response.status;
    this.url = url;
    this.retryAfter = response.headers?.get?.("retry-after") ?? null;
    this.retryAfterMs = parseRetryAfterMs(this.retryAfter);
    this.wwwAuthenticate = response.headers?.get?.("www-authenticate") ?? null;
  }
}

export async function fetchTextWithRetry(url, {
  headers = {},
  attempts = 5,
  baseDelayMs = 500,
  maxDelayMs = 30_000,
  jitterRatio = 0.2,
  fetchImpl = globalThis.fetch,
  sleepImpl = sleep,
  random = Math.random,
  onAttempt = null,
  onResponse = null,
  onRetry = null,
} = {}) {
  if (typeof fetchImpl !== "function") throw new Error("FETCH_IMPLEMENTATION_REQUIRED");
  const limit = Math.max(1, Number(attempts || 1));
  let lastError;
  for (let attempt = 1; attempt <= limit; attempt++) {
    try {
      onAttempt?.({ attempt, url });
      const response = await fetchImpl(url, { headers });
      onResponse?.({
        attempt,
        url,
        status: response.status,
        ok: response.ok,
        retryAfter: response.headers?.get?.("retry-after") ?? null,
      });
      if (!response.ok) throw new CorpusHttpError(url, response);
      return await response.text();
    } catch (error) {
      lastError = error;
      const classification = classifyRequestError(error);
      error.attemptsUsed = attempt;
      error.recoveryClassification = classification;
      if (!classification.retryable || attempt >= limit) throw error;
      const delayMs = computeRetryDelayMs({
        attempt,
        retryAfterMs: classification.retryAfterMs,
        baseDelayMs,
        maxDelayMs,
        jitterRatio,
        random,
      });
      onRetry?.({ attempt, delayMs, classification, url });
      await sleepImpl(delayMs);
    }
  }
  throw lastError;
}

function normalizeManifestRequests(sourceUrl, requests) {
  const entries = [];
  const seen = new Set();
  let duplicates = 0;
  for (const request of requests) {
    const key = recoveryRequestKey(sourceUrl, request);
    if (seen.has(key)) { duplicates++; continue; }
    seen.add(key);
    entries.push({ key, requestId: requestIdentity(request), request: stable(request) });
  }
  const digest = crypto.createHash("sha256").update(stableJson(entries)).digest("hex");
  return { entries, digest, duplicates };
}

export class RecoveryCheckpoint {
  constructor(file, {
    sourceUrl, platform, identity = null, now = () => new Date().toISOString(), syncEvery = 25,
  }) {
    this.file = path.resolve(String(file));
    this.sourceUrl = String(sourceUrl);
    this.canonicalSourceUrl = canonicalizeSourceUrl(sourceUrl);
    this.platform = String(platform);
    this.identity = identity == null ? null : String(identity);
    this.now = now;
    this.syncEvery = Math.max(1, Number(syncEvery || 1));
    this.header = null;
    this.manifest = null;
    this.discovery = null;
    this.states = new Map();
    this.manifestEntries = new Map();
    this.truncatedTail = false;
    this.eventCount = 0;
    this.lastEventDigest = null;
    this.unsyncedEvents = 0;
    this.fd = null;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    this.#load();
    if (this.header) this.#validateHeader();
    this.fd = fs.openSync(this.file, "a");
    if (!this.header) this.#append({
      type: "header",
      schemaVersion: CHECKPOINT_SCHEMA_VERSION,
      rawMetricSchemaVersion: RAW_METRIC_SCHEMA_VERSION,
      sourceUrl: this.sourceUrl,
      canonicalSourceUrl: this.canonicalSourceUrl,
      platform: this.platform,
      identity: this.identity,
      createdAt: this.now(),
    });
    if (!this.header) throw new Error("CHECKPOINT_HEADER_REQUIRED");
    this.#validateHeader();
  }

  #load() {
    if (!fs.existsSync(this.file)) return;
    const raw = fs.readFileSync(this.file, "utf8");
    const lines = raw.split(/\r?\n/);
    const validLines = [];
    for (let index = 0; index < lines.length; index++) {
      const line = lines[index];
      if (!line.trim()) continue;
      let event;
      try { event = JSON.parse(line); }
      catch (error) {
        const hasLaterContent = lines.slice(index + 1).some((item) => item.trim());
        if (!hasLaterContent) {
          this.truncatedTail = true;
          fs.writeFileSync(this.file, validLines.length ? `${validLines.join("\n")}\n` : "", "utf8");
          break;
        }
        throw new Error(`CHECKPOINT_CORRUPT line=${index + 1}: ${error}`);
      }
      validLines.push(line);
      this.#verifyEvent(event, index + 1);
      this.#apply(event);
    }
  }

  #verifyEvent(event, lineNumber = null) {
    const supplied = String(event?.eventDigest ?? "");
    if (!supplied) throw new Error(`CHECKPOINT_EVENT_DIGEST_REQUIRED${lineNumber ? ` line=${lineNumber}` : ""}`);
    if ((event.previousEventDigest ?? null) !== this.lastEventDigest) {
      throw new Error(`CHECKPOINT_EVENT_CHAIN_MISMATCH${lineNumber ? ` line=${lineNumber}` : ""}`);
    }
    const payload = { ...event };
    delete payload.eventDigest;
    if (sha256(payload) !== supplied) throw new Error(`CHECKPOINT_EVENT_DIGEST_MISMATCH${lineNumber ? ` line=${lineNumber}` : ""}`);
    this.lastEventDigest = supplied;
    this.eventCount++;
  }

  #validateHeader() {
    if (this.header.schemaVersion !== CHECKPOINT_SCHEMA_VERSION) throw new Error("CHECKPOINT_SCHEMA_MISMATCH");
    if (this.header.rawMetricSchemaVersion !== RAW_METRIC_SCHEMA_VERSION) throw new Error("CHECKPOINT_RAW_METRIC_SCHEMA_MISMATCH");
    if (this.header.canonicalSourceUrl !== this.canonicalSourceUrl) throw new Error("CHECKPOINT_SOURCE_MISMATCH");
    if (this.header.platform !== this.platform) throw new Error("CHECKPOINT_PLATFORM_MISMATCH");
    if ((this.header.identity ?? null) !== this.identity) throw new Error("CHECKPOINT_IDENTITY_MISMATCH");
  }

  #apply(event) {
    if (event.type === "header") {
      if (this.header) throw new Error("CHECKPOINT_DUPLICATE_HEADER");
      this.header = event;
    } else if (event.type === "manifest") {
      const normalized = normalizeManifestRequests(this.sourceUrl, (event.requests ?? []).map((entry) => entry.request));
      if (normalized.digest !== event.digest || normalized.entries.length !== event.requests?.length) throw new Error("CHECKPOINT_MANIFEST_DIGEST_MISMATCH");
      for (let index = 0; index < normalized.entries.length; index++) {
        if (normalized.entries[index].key !== event.requests[index].key || normalized.entries[index].requestId !== event.requests[index].requestId) {
          throw new Error("CHECKPOINT_MANIFEST_ENTRY_MISMATCH");
        }
      }
      this.manifest = event;
      this.manifestEntries = new Map(event.requests.map((entry) => [entry.key, entry]));
    } else if (event.type === "discovery") {
      this.discovery = event;
    } else if (event.type === "result") {
      if (event.outcome === "success") {
        if (event.rawMetricSchemaVersion !== RAW_METRIC_SCHEMA_VERSION) throw new Error("CHECKPOINT_RESULT_SCHEMA_MISMATCH");
        const metric = validateRawMetric(event.metric, event.requestId);
        if (sha256(metric) !== event.metricDigest) throw new Error("CHECKPOINT_RESULT_DIGEST_MISMATCH");
      }
      this.states.set(event.key, event);
    }
  }

  #append(event, { forceSync = event.type !== "result" } = {}) {
    if (this.fd == null) throw new Error("CHECKPOINT_CLOSED");
    const payload = { ...event, previousEventDigest: this.lastEventDigest };
    const complete = { ...payload, eventDigest: sha256(payload) };
    fs.writeSync(this.fd, `${JSON.stringify(complete)}\n`, null, "utf8");
    this.unsyncedEvents++;
    this.#verifyEvent(complete);
    this.#apply(complete);
    if (forceSync || this.unsyncedEvents >= this.syncEvery) this.flush();
  }

  flush() {
    if (this.fd != null && this.unsyncedEvents > 0) {
      fs.fsyncSync(this.fd);
      this.unsyncedEvents = 0;
    }
  }

  close() {
    if (this.fd == null) return;
    this.flush();
    fs.closeSync(this.fd);
    this.fd = null;
  }

  initializeManifest(requests) {
    const normalized = normalizeManifestRequests(this.sourceUrl, requests);
    if (this.manifest) {
      if (this.manifest.digest !== normalized.digest) throw new Error("CHECKPOINT_MANIFEST_MISMATCH");
      return { ...this.manifest, duplicates: normalized.duplicates, reused: true };
    }
    const event = {
      type: "manifest",
      digest: normalized.digest,
      requests: normalized.entries,
      requestCount: normalized.entries.length,
      duplicateRequests: normalized.duplicates,
      createdAt: this.now(),
    };
    this.#append({ type: "discovery", outcome: "success", requestCount: normalized.entries.length, updatedAt: this.now() });
    this.#append(event);
    return { ...event, duplicates: normalized.duplicates, reused: false };
  }

  recordDiscoveryFailure(error, { attemptsUsed = null } = {}) {
    const classification = error?.recoveryClassification ?? classifyRequestError(error);
    const used = Math.max(1, Number(attemptsUsed ?? error?.attemptsUsed ?? 1));
    this.#append({
      type: "discovery", outcome: "failure",
      status: classification.status,
      classification: classification.kind,
      retryable: classification.retryable,
      permanent: classification.permanent,
      retryAfterMs: classification.retryAfterMs,
      attemptsTotal: Number(this.discovery?.attemptsTotal || 0) + used,
      message: String(error?.message || error).slice(0, 500),
      updatedAt: this.now(),
    });
  }

  requests() {
    return this.manifest?.requests ?? [];
  }

  stateFor(entryOrRequest) {
    const key = entryOrRequest?.key ?? recoveryRequestKey(this.sourceUrl, entryOrRequest);
    return this.states.get(key) ?? null;
  }

  recordSuccess(entryOrRequest, metric, { attemptsUsed = 1 } = {}) {
    const key = entryOrRequest?.key ?? recoveryRequestKey(this.sourceUrl, entryOrRequest);
    const requestId = entryOrRequest?.requestId ?? requestIdentity(entryOrRequest);
    if (!this.manifestEntries.has(key)) throw new Error("CHECKPOINT_REQUEST_NOT_IN_MANIFEST");
    const prior = this.states.get(key);
    if (prior?.permanent) throw new Error("CHECKPOINT_PERMANENT_FAILURE_IMMUTABLE");
    const normalizedMetric = validateRawMetric(metric, requestId);
    const metricDigest = sha256(normalizedMetric);
    if (prior?.outcome === "success") {
      if (prior.metricDigest !== metricDigest) throw new Error("CHECKPOINT_SUCCESS_CONFLICT");
      return { reused: true, metricDigest };
    }
    this.#append({
      type: "result", key, requestId, outcome: "success",
      rawMetricSchemaVersion: RAW_METRIC_SCHEMA_VERSION,
      metric: normalizedMetric,
      metricDigest,
      attemptsTotal: Number(prior?.attemptsTotal || 0) + Math.max(1, Number(attemptsUsed || 1)),
      updatedAt: this.now(),
    });
    return { reused: false, metricDigest };
  }

  recordFailure(entryOrRequest, error, { attemptsUsed = null, extra = null } = {}) {
    const key = entryOrRequest?.key ?? recoveryRequestKey(this.sourceUrl, entryOrRequest);
    const requestId = entryOrRequest?.requestId ?? requestIdentity(entryOrRequest);
    if (!this.manifestEntries.has(key)) throw new Error("CHECKPOINT_REQUEST_NOT_IN_MANIFEST");
    const prior = this.states.get(key);
    if (prior?.outcome === "success") throw new Error("CHECKPOINT_SUCCESS_IMMUTABLE");
    const classification = error?.recoveryClassification ?? classifyRequestError(error);
    const used = Math.max(1, Number(attemptsUsed ?? error?.attemptsUsed ?? 1));
    this.#append({
      type: "result", key, requestId, outcome: "failure",
      status: classification.status,
      classification: classification.kind,
      retryable: classification.retryable,
      permanent: classification.permanent,
      retryAfterMs: classification.retryAfterMs,
      attemptsTotal: Number(prior?.attemptsTotal || 0) + used,
      message: String(error?.message || error).slice(0, 500),
      extra,
      updatedAt: this.now(),
    });
  }

  pendingEntries({ maxAttempts = 8 } = {}) {
    return this.requests().filter((entry) => {
      const state = this.states.get(entry.key);
      if (!state) return true;
      if (state.outcome === "success" || state.permanent) return false;
      return Number(state.attemptsTotal || 0) < maxAttempts;
    });
  }

  materialize() {
    const successes = [];
    const failures = [];
    const pending = [];
    for (const entry of this.requests()) {
      const state = this.states.get(entry.key);
      if (state?.outcome === "success") successes.push(state.metric);
      else if (state?.outcome === "failure") failures.push({
        logNo: entry.request?.logNo ?? entry.requestId,
        url: entry.request?.url,
        stage: "post",
        message: state.message,
        status: state.status,
        classification: state.classification,
        attempts: state.attemptsTotal,
        permanent: state.permanent,
      });
      else pending.push(entry.request);
    }
    return { successes, failures, pending };
  }

  summary({ maxAttempts = 8 } = {}) {
    const materialized = this.materialize();
    return {
      sourceUrl: this.canonicalSourceUrl,
      schemaVersion: CHECKPOINT_SCHEMA_VERSION,
      rawMetricSchemaVersion: RAW_METRIC_SCHEMA_VERSION,
      manifestDigest: this.manifest?.digest ?? null,
      total: this.requests().length,
      succeeded: materialized.successes.length,
      failed: materialized.failures.length,
      pending: materialized.pending.length,
      retryable: this.pendingEntries({ maxAttempts }).length,
      duplicateRequests: this.manifest?.duplicateRequests ?? 0,
      discoveryFailure: this.discovery?.outcome === "failure" ? {
        status: this.discovery.status,
        classification: this.discovery.classification,
        attempts: this.discovery.attemptsTotal,
        permanent: this.discovery.permanent,
      } : null,
      eventCount: this.eventCount,
      lastEventDigest: this.lastEventDigest,
      unsyncedEvents: this.unsyncedEvents,
      truncatedTail: this.truncatedTail,
    };
  }
}

export function checkpointResult(value, attemptsUsed = 1) {
  return { checkpointResult: true, value, attemptsUsed };
}

export async function runCheckpointedRequests({
  checkpoint,
  worker,
  concurrency = 1,
  maxAttempts = 8,
  maxRequests = Infinity,
  onProgress = null,
}) {
  const selected = checkpoint.pendingEntries({ maxAttempts }).slice(0, Number.isFinite(maxRequests) ? maxRequests : undefined);
  const inFlight = new Set();
  let cursor = 0;
  let completed = 0;
  async function runner() {
    while (true) {
      const index = cursor++;
      if (index >= selected.length) return;
      const entry = selected[index];
      if (inFlight.has(entry.key)) throw new Error(`DUPLICATE_IN_FLIGHT ${entry.key}`);
      inFlight.add(entry.key);
      const prior = checkpoint.stateFor(entry);
      const remainingAttempts = Math.max(1, maxAttempts - Number(prior?.attemptsTotal || 0));
      try {
        const result = await worker(entry.request, { entry, prior, remainingAttempts });
        if (result?.checkpointResult === true) checkpoint.recordSuccess(entry, result.value, { attemptsUsed: result.attemptsUsed });
        else checkpoint.recordSuccess(entry, result);
      } catch (error) {
        checkpoint.recordFailure(entry, error);
      } finally {
        inFlight.delete(entry.key);
        completed++;
        onProgress?.({ completed, selected: selected.length, summary: checkpoint.summary({ maxAttempts }) });
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(Math.max(1, concurrency), Math.max(1, selected.length)) }, () => runner()));
  return { processed: selected.length, ...checkpoint.summary({ maxAttempts }) };
}
