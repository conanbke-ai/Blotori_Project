// Isolated dual-Origin Mock E2E: no CDP, real Chrome profile, DB migration, or paid API.
// BLOTORI_LOCAL_URL=https://localhost:3001 BLOTORI_NETWORK_URL=https://172.30.1.21:3001 node scripts/qa/validate-dual-origin-draft-storage.mjs
import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const origins = [['localhost', process.env.BLOTORI_LOCAL_URL], ['network', process.env.BLOTORI_NETWORK_URL]];
if (origins.some(([, url]) => !url)) {
  console.error('BLOCKED: set both BLOTORI_LOCAL_URL and BLOTORI_NETWORK_URL.');
  process.exit(2);
}
for (const [, url] of origins) {
  const parsed = new URL(url);
  if (!['https:', 'http:'].includes(parsed.protocol)) throw new Error('Invalid test URL');
}
if (new URL(origins[0][1]).origin === new URL(origins[1][1]).origin) {
  throw new Error('BLOCKED: two different Origins required');
}
const browser = await chromium.launch({ headless: true });
const results = [];
const draftFor = (name) => ({
  title: '격리 QA 원고 ' + name,
  titleCandidates: ['격리 QA 원고 ' + name], summary: 'Mock E2E',
  intro: ['테스트 도입'], sections: [{ id: 'sec-1', heading: '첫 내용', paragraphs: ['저장과 복원을 검사합니다.'] }],
  closing: ['테스트 마무리'], tags: ['QA'], images: [], warnings: [],
});
try {
  for (const [name, origin] of origins) {
    // A new non-persistent context is intentionally discarded after every Origin.
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
    let calls = 0;
    try {
      await context.route('**/api/generate', route => {
        if (route.request().method() !== 'POST') return route.abort('blockedbyclient');
        calls++;
        return route.fulfill({ status: 200, contentType: 'application/json',
          body: JSON.stringify({ draft: draftFor(name), mode: 'mock', requestId: 'isolated-' + name }) });
      });
      await context.route('**/api/health**', route => route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ ok: true, keyDetected: true, verified: false, model: 'offline-only', message: 'QA' }),
      }));
      const page = await context.newPage();
      const failures = [];
      page.on('pageerror', error => failures.push(error.message));
      const response = await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 15000 });
      assert.equal(response?.status(), 200, 'page HTTP');
      await page.locator('.workspaceV2').waitFor();
      await page.locator('.draftStorageStatus[data-state="ready"]').waitFor();
      const platform = page.locator('.settingsRail select').filter({ has: page.locator('option[value="naver"]') }).first();
      await platform.selectOption('naver');
      await page.locator('.settingsRail textarea[placeholder*="주제"]').first().fill('격리 QA 원고 ' + name);
      await page.waitForFunction(() => {
        const button = document.querySelector('.settingsRail .generatePrimary');
        return !!button && !button.disabled;
      }, null, { timeout: 10000 });
      await page.locator('.settingsRail .generatePrimary').click();
      await page.locator('.draftStorageStatus[data-state="saved"]').waitFor({ timeout: 12000 });
      await page.getByText('격리 QA 원고 ' + name, { exact: true }).first().waitFor();
      assert.equal(calls, 1);
      const before = await page.evaluate(async () => {
        const databases = await indexedDB.databases();
        if (!databases.some(x => x.name === 'blotori-draft-workspace')) throw new Error('DB_MISSING');
        return new Promise((resolve, reject) => {
          const open = indexedDB.open('blotori-draft-workspace');
          open.onerror = () => reject(open.error);
          open.onsuccess = () => {
            const db = open.result;
            const tx = db.transaction('workspaces', 'readonly');
            const count = tx.objectStore('workspaces').count();
            count.onsuccess = () => resolve(count.result);
            tx.oncomplete = () => db.close();
            tx.onerror = () => reject(tx.error);
          };
        });
      });
      assert.ok(before >= 1, 'one stored draft expected');
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.locator('.draftStorageStatus[data-state="ready"], .draftStorageStatus[data-state="saved"]').first().waitFor({ timeout: 12000 });
      await page.getByText('격리 QA 원고 ' + name, { exact: true }).first().waitFor({ timeout: 12000 });
      assert.equal(calls, 1, 'reload must never regenerate');
      assert.deepEqual(failures, [], 'no JS page errors');
      results.push({ origin: name, status: 'PASS', mockedGenerateCalls: calls, storedDraftCount: before, restored: true });
    } catch (error) {
      results.push({ origin: name, status: 'FAIL', reason: String(error).slice(0, 550) });
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}
for (const r of results) console.log('DUAL_ORIGIN_DRAFT_STORAGE', JSON.stringify(r));
if (results.some(x => x.status !== 'PASS')) process.exitCode = 1;
else console.log('DUAL_ORIGIN_DRAFT_STORAGE PASS 2/2 (isolated contexts, zero paid calls)');
