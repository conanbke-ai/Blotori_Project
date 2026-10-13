import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { aggregateNaverBlogCorpus } from "./naver-corpus-lib.mjs";
import {
  RecoveryCheckpoint,
  canonicalizeSourceUrl,
  checkpointResult,
  classifyRequestError,
  computeRetryDelayMs,
  fetchTextWithRetry,
  parseRetryAfterMs,
  runCheckpointedRequests,
} from "./recovery-checkpoint-lib.mjs";

const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "blotori-recovery-fixture-"));
const rawMetric = (logNo, overrides = {}) => ({
  logNo, date: "20260101", rootSelector: ".fixture", contentClass: "minimal",
  titleLength: 0, textChars: 0, blockCount: 0, paragraphCount: 0, sentenceCount: 0,
  avgSentenceChars: 0, avgParagraphChars: 0, shortParagraphRate: 0, imageCount: 0,
  imagesPer1000Chars: 0, headingCount: 0, strongCount: 0, listItemCount: 0,
  quoteCount: 0, linkCount: 0, galleryLike: 0, centeredBlockCount: 0, leftBlockCount: 0,
  componentSequenceLength: 0, imageComponentCount: 0, maxConsecutiveImageComponents: 0,
  imageRunCount: 0, avgImageRunLength: 0, textImageTransitions: 0,
  textComponentsBeforeFirstImage: 0, avgTextComponentsBetweenImageRuns: 0, hashtagCount: 0,
  mapCount: 0, videoCount: 0, closingParagraphChars: 0, closingHasHashtag: 0,
  endings: { formal: 0, haeyo: 0, jyo: 0, plain: 0, noun: 0, other: 0 },
  punctuation: { question: 0, exclamation: 0, ellipsis: 0, laugh: 0, cry: 0, emoji: 0 },
  eligibility: { text: false, visual: false, observable: true },
  ...overrides,
});
try {
  assert.equal(canonicalizeSourceUrl("http://M.BLOG.NAVER.COM/demo/"), "https://blog.naver.com/demo");
  assert.equal(parseRetryAfterMs("2"), 2000);
  assert.equal(parseRetryAfterMs("Thu, 01 Jan 2026 00:00:03 GMT", Date.parse("2026-01-01T00:00:00Z")), 3000);
  assert.equal(computeRetryDelayMs({ attempt: 3, baseDelayMs: 100, maxDelayMs: 1000, jitterRatio: 0, retryAfterMs: 900 }), 900);

  const waits = [];
  const responseStatuses = [];
  let fetchCalls = 0;
  const retryText = await fetchTextWithRetry("https://example.com/rate-limited", {
    attempts: 3,
    baseDelayMs: 10,
    jitterRatio: 0,
    sleepImpl: async (ms) => waits.push(ms),
    onResponse: ({ status }) => responseStatuses.push(status),
    fetchImpl: async () => {
      fetchCalls++;
      if (fetchCalls === 1) return { ok: false, status: 429, headers: { get: (name) => name === "retry-after" ? "2" : null } };
      return { ok: true, status: 200, headers: { get: () => null }, text: async () => "ok" };
    },
  });
  assert.equal(retryText, "ok");
  assert.equal(fetchCalls, 2);
  assert.deepEqual(waits, [2000]);
  assert.deepEqual(responseStatuses, [429, 200]);

  const discoveryFile = path.join(temporaryRoot, "discovery.jsonl");
  const discovery = new RecoveryCheckpoint(discoveryFile, {
    sourceUrl: "https://example.com/unavailable",
    platform: "tistory",
    identity: "example.com",
  });
  discovery.recordDiscoveryFailure(Object.assign(new Error("HTTP 403"), { status: 403, attemptsUsed: 1 }));
  const discoveryReopened = new RecoveryCheckpoint(discoveryFile, {
    sourceUrl: "https://example.com/unavailable",
    platform: "tistory",
    identity: "example.com",
  });
  assert.deepEqual(discoveryReopened.summary().discoveryFailure, {
    status: 403, classification: "access_forbidden", attempts: 1, permanent: true,
  });
  discovery.close();
  discoveryReopened.close();

  for (const status of [403, 404]) {
    let calls = 0;
    await assert.rejects(() => fetchTextWithRetry(`https://example.com/${status}`, {
      attempts: 5,
      sleepImpl: async () => assert.fail("permanent failures must not sleep/retry"),
      fetchImpl: async () => {
        calls++;
        return { ok: false, status, headers: { get: () => null } };
      },
    }));
    assert.equal(calls, 1);
    const classification = classifyRequestError(Object.assign(new Error(`HTTP ${status}`), { status }));
    assert.equal(classification.permanent, true);
    assert.equal(classification.retryable, false);
  }
  assert.equal(classifyRequestError(Object.assign(new Error("HTTP 403"), {
    status: 403, wwwAuthenticate: "Bearer realm=fixture",
  })).kind, "authentication_or_permission_required");

  const checkpointFile = path.join(temporaryRoot, "checkpoint.jsonl");
  const checkpoint = new RecoveryCheckpoint(checkpointFile, {
    sourceUrl: "https://blog.naver.com/example/",
    platform: "naver",
    identity: "example",
  });
  const requests = [
    { logNo: "a", date: "1" },
    { logNo: "a", date: "1" },
    { logNo: "b", date: "2" },
    { logNo: "c", date: "3" },
    { logNo: "d", date: "4" },
  ];
  const manifest = checkpoint.initializeManifest(requests);
  assert.equal(manifest.duplicates, 1);
  assert.equal(checkpoint.requests().length, 4);

  const calls = new Map();
  const worker = async (request) => {
    calls.set(request.logNo, (calls.get(request.logNo) || 0) + 1);
    if (request.logNo === "b" && calls.get("b") === 1) {
      throw Object.assign(new Error("HTTP 429"), { status: 429, retryAfterMs: 1000, attemptsUsed: 1 });
    }
    if (request.logNo === "c") throw Object.assign(new Error("HTTP 403"), { status: 403, attemptsUsed: 1 });
    return checkpointResult(rawMetric(request.logNo), 1);
  };

  const interrupted = await runCheckpointedRequests({ checkpoint, worker, concurrency: 2, maxAttempts: 4, maxRequests: 2 });
  assert.equal(interrupted.processed, 2);
  assert.equal(checkpoint.stateFor({ logNo: "a" }).outcome, "success");
  assert.equal(checkpoint.stateFor({ logNo: "b" }).outcome, "failure");

  const resumed = await runCheckpointedRequests({ checkpoint, worker, concurrency: 3, maxAttempts: 4 });
  assert.equal(resumed.processed, 3);
  assert.deepEqual(Object.fromEntries(calls), { a: 1, b: 2, c: 1, d: 1 });
  const materialized = checkpoint.materialize();
  assert.deepEqual(materialized.successes.map((item) => item.logNo), ["a", "b", "d"]);
  assert.equal(materialized.failures.length, 1);
  assert.equal(materialized.failures[0].classification, "access_forbidden");
  assert.equal(materialized.pending.length, 0);
  const aggregate = aggregateNaverBlogCorpus("example", requests.filter((item, index) => index !== 1), materialized.successes, materialized.failures);
  assert.equal(aggregate.coverage.totalListed, 4);
  assert.equal(aggregate.coverage.analyzed, 3);
  assert.equal(aggregate.coverage.failed, 1);
  assert.equal(aggregate.coverage.postFailed, 1);
  assert.equal(aggregate.coverage.collectionFailed, 0);
  assert.equal(aggregate.coverage.unprocessedListed, 0);
  const listFailureAggregate = aggregateNaverBlogCorpus("unlisted", [], [], [{ stage: "list", message: "HTTP 403" }]);
  assert.equal(listFailureAggregate.coverage.totalListed, 0);
  assert.equal(listFailureAggregate.coverage.trueFailed, 1);
  assert.equal(listFailureAggregate.coverage.postFailed, 0);
  assert.equal(listFailureAggregate.coverage.collectionFailed, 1);

  const idempotent = await runCheckpointedRequests({ checkpoint, worker, concurrency: 3, maxAttempts: 4 });
  assert.equal(idempotent.processed, 0);
  assert.deepEqual(Object.fromEntries(calls), { a: 1, b: 2, c: 1, d: 1 });
  const eventCountBeforeDuplicate = checkpoint.summary().eventCount;
  assert.equal(checkpoint.recordSuccess({ logNo: "d" }, rawMetric("d")).reused, true);
  assert.equal(checkpoint.summary().eventCount, eventCountBeforeDuplicate);
  assert.throws(() => checkpoint.recordSuccess({ logNo: "d" }, rawMetric("d", { textChars: 1 })), /CHECKPOINT_SUCCESS_CONFLICT/);
  assert.throws(() => checkpoint.recordSuccess({ logNo: "c" }, rawMetric("c")), /CHECKPOINT_PERMANENT_FAILURE_IMMUTABLE/);
  assert.throws(() => checkpoint.recordSuccess({ logNo: "d" }, { logNo: "d" }), /RAW_METRIC_TEXT_FIELDS_INVALID/);

  checkpoint.flush();
  const checkpointSummary = checkpoint.summary();
  assert.equal(checkpointSummary.unsyncedEvents, 0);
  assert.equal(checkpointSummary.rawMetricSchemaVersion, 1);
  checkpoint.close();

  const reopened = new RecoveryCheckpoint(checkpointFile, {
    sourceUrl: "https://blog.naver.com/example",
    platform: "naver",
    identity: "example",
  });
  assert.equal(reopened.initializeManifest(requests).reused, true);
  assert.deepEqual(reopened.materialize(), materialized);
  assert.throws(() => reopened.initializeManifest([...requests, { logNo: "new" }]), /CHECKPOINT_MANIFEST_MISMATCH/);

  const tamperedFile = path.join(temporaryRoot, "tampered.jsonl");
  const tampered = fs.readFileSync(checkpointFile, "utf8").replace('"textChars":0', '"textChars":1');
  fs.writeFileSync(tamperedFile, tampered, "utf8");
  assert.throws(() => new RecoveryCheckpoint(tamperedFile, {
    sourceUrl: "https://blog.naver.com/example",
    platform: "naver",
    identity: "example",
  }), /CHECKPOINT_EVENT_DIGEST_MISMATCH/);

  reopened.close();
  fs.appendFileSync(checkpointFile, "{\"type\":", "utf8");
  const interruptedTail = new RecoveryCheckpoint(checkpointFile, {
    sourceUrl: "https://blog.naver.com/example",
    platform: "naver",
    identity: "example",
  });
  assert.equal(interruptedTail.truncatedTail, true);
  assert.deepEqual(interruptedTail.materialize(), materialized);
  assert.equal(interruptedTail.recordSuccess({ logNo: "d" }, rawMetric("d"), { attemptsUsed: 1 }).reused, true);
  interruptedTail.close();
  const repaired = new RecoveryCheckpoint(checkpointFile, {
    sourceUrl: "https://blog.naver.com/example",
    platform: "naver",
    identity: "example",
  });
  assert.equal(repaired.truncatedTail, false);
  assert.deepEqual(repaired.materialize(), materialized);
  repaired.close();

  console.log("RECOVERY_CHECKPOINT_PASS", JSON.stringify({
    retryAfterMs: waits[0],
    discoveryFailure: discoveryReopened.summary().discoveryFailure,
    uniqueRequests: checkpoint.requests().length,
    calls: Object.fromEntries(calls),
    succeeded: materialized.successes.length,
    permanentFailures: materialized.failures.length,
    mergedCoverage: aggregate.coverage,
    idempotentProcessed: idempotent.processed,
    checkpointSchemaVersion: checkpointSummary.schemaVersion,
    rawMetricSchemaVersion: checkpointSummary.rawMetricSchemaVersion,
    hashChainedEvents: checkpointSummary.eventCount,
    checkpointBytes: fs.statSync(checkpointFile).size,
    truncatedTailRecovered: interruptedTail.truncatedTail,
    truncatedTailWritable: !repaired.truncatedTail,
  }));
} finally {
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}
