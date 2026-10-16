// Read-only audit across local and LAN Origins using EXISTING Chrome tabs.
// No navigation, IndexedDB writes, API calls, browser-profile creation or UI changes.
// CDP must be enabled explicitly on an already-running Chrome debugging instance.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const cdp = process.env.BLOTORI_QA_CDP_URL;
const localRaw = process.env.BLOTORI_LOCAL_URL;
const networkRaw = process.env.BLOTORI_NETWORK_URL;
if (!cdp || !localRaw || !networkRaw) {
  console.error('BLOCKED: specify BLOTORI_QA_CDP_URL, BLOTORI_LOCAL_URL and BLOTORI_NETWORK_URL.');
  process.exit(2);
}
const endpoint = new URL(cdp);
if (!['127.0.0.1', 'localhost', '[::1]'].includes(endpoint.hostname) ||
    endpoint.protocol !== 'http:') throw Error('BLOCKED: CDP endpoint must use local HTTP');
const origins = [['localhost', new URL(localRaw)], ['network', new URL(networkRaw)]];
if (origins.some(([, url]) => !['http:', 'https:'].includes(url.protocol)) ||
    origins[0][1].origin === origins[1][1].origin) {
  throw Error('BLOCKED: provide two different valid HTTP(S) Origins');
}

async function auditPage(page) {
  return await page.evaluate(async () => {
        const name = 'blotori-draft-workspace';
        // Prevent indexedDB.open() from accidentally creating an empty database.
        if (typeof indexedDB.databases !== 'function') return { status: 'BLOCKED_DB_DISCOVERY_UNAVAILABLE' };
        const databases = await indexedDB.databases();
        if (!databases.some(db => db.name === name)) return { status: 'NO_EXISTING_DATABASE' };
        return await new Promise(resolve => {
          const request = indexedDB.open(name); // existing DB only
          request.onerror = () => resolve({ status: 'DB_OPEN_FAILED', error: request.error?.name });
          request.onblocked = () => resolve({ status: 'DB_OPEN_BLOCKED' });
          request.onupgradeneeded = () => { request.transaction?.abort(); resolve({ status: 'BLOCKED_SCHEMA_CHANGE' }); };
          request.onsuccess = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains('meta') || !db.objectStoreNames.contains('workspaces')) {
              db.close(); resolve({ status: 'BLOCKED_SCHEMA_MISMATCH' }); return;
            }
            const tx = db.transaction(['meta', 'workspaces'], 'readonly');
            const pointer = tx.objectStore('meta').get('activeWorkspace');
            let settled = false;
            const finish = value => { if (!settled) { settled = true; db.close(); resolve(value); } };
            tx.onerror = () => finish({ status: 'DB_READ_FAILED', error: tx.error?.name });
            pointer.onsuccess = () => {
              const id = pointer.result?.draftId;
              if (typeof id !== 'string' || !id) { finish({ status: 'NO_ACTIVE_DRAFT' }); return; }
              const req = tx.objectStore('workspaces').get(id);
              req.onsuccess = () => {
                const workspace = req.result;
                if (!workspace?.draft) { finish({ status: 'MISSING_ACTIVE_DRAFT' }); return; }
                const draft = workspace.draft;
                const normalize = x => String(x ?? '').trim().toLowerCase().replace(/\\s+/g, ' ');
                const sections = Array.isArray(draft.sections) ? draft.sections : [];
                const headings = sections.map(s => normalize(s.heading)).filter(Boolean);
                const paragraphs = [...(draft.intro ?? []), ...sections.flatMap(s => s.paragraphs ?? []), ...(draft.closing ?? [])].map(normalize).filter(Boolean);
                const warnings = Array.isArray(draft.warnings) ? draft.warnings : [];
                // Keep content and private text in the browser. Export aggregate counts only.
                finish({ status: 'AUTOMATED_REVIEW_COMPLETE', platformId: workspace.platformId,
                  updatedAt: workspace.updatedAt, metrics: {
                    sectionCount: sections.length, paragraphCount: paragraphs.length,
                    imagePlanCount: Array.isArray(draft.images) ? draft.images.length : 0,
                    duplicateHeadingCount: headings.length - new Set(headings).size,
                    duplicateParagraphCount: paragraphs.length - new Set(paragraphs).size,
                    warningCount: warnings.length, missingTitle: !normalize(draft.title),
                    missingIntro: !(draft.intro ?? []).some(x => normalize(x)),
                    missingClosing: !(draft.closing ?? []).some(x => normalize(x)),
                  },
                  caveat: 'Manual factual accuracy, DNA adherence and subjective writing quality remain unverified. Original generation input is not stored with this draft.'
                });
              };
            };
          };
        });
      });
}
const results = [];
const browser = await chromium.connectOverCDP(cdp);
try {
  const pages = browser.contexts().flatMap(context => context.pages());
  for (const [name, url] of origins) {
    const page = pages.find(p => {
      try { return new URL(p.url()).origin === url.origin; } catch { return false; }
    });
    if (!page) {
      results.push({ originName: name, origin: url.origin, status: 'BLOCKED_NO_EXISTING_TAB' });
      continue;
    }
    try {
      const audit = await auditPage(page);
      results.push({ originName: name, origin: url.origin, ...audit });
    } catch (error) {
      results.push({ originName: name, origin: url.origin, status: 'BLOCKED_READ_ERROR',
        error: error instanceof Error ? error.name : 'UnknownError' });
    }
  }
} finally {
  // Disconnect from CDP without closing user tabs or changing browser data.
  await browser.close();
}
const dir = path.resolve('artifacts/draft-quality');
fs.mkdirSync(dir, { recursive: true });
const report = path.join(dir, 'saved-draft-dual-origin-audit.json');
fs.writeFileSync(report, JSON.stringify({ results }, null, 2) + '\n');
for (const r of results) console.log('SAVED_DRAFT_AUDIT', r.originName, r.status, JSON.stringify(r.metrics ?? {}));
console.log('REPORT', report);
if (results.some(r => r.status !== 'AUTOMATED_REVIEW_COMPLETE')) process.exitCode = 2;
