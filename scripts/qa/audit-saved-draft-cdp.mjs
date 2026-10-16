// Read-only analysis of an EXISTING Chrome tab and its active IndexedDB draft.
// Requires a Chrome instance explicitly launched with remote debugging enabled.
// Never launches a fresh profile, navigates, writes to IndexedDB, or calls an API.
// Example: BLOTORI_QA_CDP_URL=http://127.0.0.1:9222 BLOTORI_QA_URL=https://localhost:3001 node scripts/qa/audit-saved-draft-cdp.mjs
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const cdp = process.env.BLOTORI_QA_CDP_URL;
const target = process.env.BLOTORI_QA_URL;
if (!cdp || !target) {
  console.error('BLOCKED: set BLOTORI_QA_CDP_URL and BLOTORI_QA_URL to audit an existing Chrome tab.');
  process.exit(2);
}
const endpoint = new URL(cdp);
const site = new URL(target);
if (!['127.0.0.1', 'localhost', '[::1]'].includes(endpoint.hostname) ||
    !['http:', 'https:'].includes(endpoint.protocol)) {
  throw Error('BLOCKED: CDP endpoint must be local to this computer');
}
if (!['http:', 'https:'].includes(site.protocol)) throw Error('BLOCKED: invalid site origin');
const browser = await chromium.connectOverCDP(cdp);
try {
  const pages = browser.contexts().flatMap(context => context.pages());
  // No navigation or page interactions; use only an already-open matching tab.
  const page = pages.find(p => {
    try { return new URL(p.url()).origin === site.origin; } catch { return false; }
  });
  if (!page) {
    console.log('BLOCKED: no existing browser tab for ' + site.origin + '. Open Blotori in that Chrome instance first.');
    process.exitCode = 2;
  } else {
    const result = await page.evaluate(async () => {
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
    const dir = path.resolve('artifacts/draft-quality');
    fs.mkdirSync(dir,{recursive:true});
    const output = path.join(dir,'saved-draft-audit.json');
    fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');
    console.log('SAVED_DRAFT_AUDIT',result.status,JSON.stringify(result.metrics ?? {}));
    console.log('REPORT',output);
    if (result.status !== 'AUTOMATED_REVIEW_COMPLETE') process.exitCode = 2;
  }
} finally {
  // Disconnect only. This script never closes the user's tabs or browser.
  await browser.close();
}
