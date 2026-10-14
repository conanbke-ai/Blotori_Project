import assert from 'node:assert/strict';
import fs from 'node:fs';
import Module, { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const sourcePath = new URL('../lib/infrastructure/draft-workspace-storage.ts', import.meta.url);
const compiled = ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
  fileName: sourcePath.pathname,
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const fixture = {
  id: 'draft-first', platformId: 'naver', updatedAt: '2026-10-14T05:00:00.000Z',
  draft: {
    title: '원본 제목', summary: '설명', titleCandidates: ['원본 제목', '제목 후보'],
    presentation: { titleAlign: 'center', density: 'airy' },
    intro: ['원본 도입'], closing: ['마무리'], tags: ['원본'], warnings: [],
    sections: [{ id: 'section-1', heading: '본문', paragraphs: ['원본 문단'], presentation: { emphasis: [{ phrase: '원본', kind: 'accent' }] } }],
    images: [{ id: 'IMG-01', role: 'HERO', label: '대표 이미지', placement: '도입 앞', afterSectionId: null, ratio: '16:9', size: '문서 너비', prompt: 'Original prompt', display: { widthPercent: 75, align: 'right' } }],
  },
};

// No IndexedDB polyfill: these checks genuinely exercise the unavailable environment
// and input validation. Use the default invocation in browser-enabled CI for durability.
const module = new Module(sourcePath.pathname);
module.filename = sourcePath.pathname;
module._compile(compiled, sourcePath.pathname);
const storage = module.exports;
for (const action of [() => storage.loadActiveWorkspace(), () => storage.loadDraftImages('draft-first'), () => storage.saveWorkspace(fixture)]) {
  await assert.rejects(action, { name: 'DraftStorageError', code: 'unavailable' });
}
const invalidWorkspaces = [
  { ...fixture, id: '' },
  { ...fixture, platformId: 'unrecognized-platform' },
  { ...fixture, updatedAt: 'invalid date' },
  { ...fixture, draft: { ...fixture.draft, intro: [null] } },
  { ...fixture, draft: { ...fixture.draft, sections: [...fixture.draft.sections, ...fixture.draft.sections] } },
  { ...fixture, draft: { ...fixture.draft, images: [...fixture.draft.images, ...fixture.draft.images] } },
  { ...fixture, draft: { ...fixture.draft, titleCandidates: 3 } },
  { ...fixture, draft: { ...fixture.draft, presentation: { density: 'invalid' } } },
];
for (const display of [null, {}, { widthPercent: 0, align: 'left' }, { widthPercent: 125, align: 'left' }, { widthPercent: '50', align: 'center' }, { widthPercent: 50, align: 'justify' }, { widthPercent: 50 }]) {
  invalidWorkspaces.push({ ...fixture, draft: { ...fixture.draft, images: [{ ...fixture.draft.images[0], display }] } });
}
for (const workspace of invalidWorkspaces) await assert.rejects(() => storage.saveWorkspace(workspace), { code: 'corrupt' });
await assert.rejects(() => storage.saveDraftImage({ draftId: 'd', imageId: 'i', name: 'image.png', updatedAt: fixture.updatedAt, blob: 'not a blob' }), { code: 'corrupt' });
await assert.rejects(() => storage.loadDraftImages(''), { code: 'corrupt' });
await assert.rejects(() => storage.deleteDraftImage('d', ''), { code: 'corrupt' });
console.log('Draft storage unit QA PASS: unavailable IndexedDB rejects explicitly; malformed workspace, image and key inputs reject.');

if (!process.argv.includes('--unit')) {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true });
  const failures = [];
  const checks = [];
  const baseURL = process.env.BLOTORI_QA_URL || 'http://127.0.0.1:3000';
  const code = `(function () { const exports = {}; ${compiled}\nwindow.__draftStorage = exports; })();`;
  const attach = async (page) => {
    await page.goto(`${baseURL}/__draft-storage-qa`, { waitUntil: 'domcontentloaded' });
    await page.addScriptTag({ content: code });
  };
  const context = await browser.newContext();
  await context.route('**/__draft-storage-qa', (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Draft storage QA</title>' }));
  const page = await context.newPage();
  page.on('pageerror', (error) => failures.push(error.message));
  try {
    await attach(page);
    checks.push(...await page.evaluate(async (fixture) => {
      const s = window.__draftStorage;
      const results = [];
      const check = (condition, label) => { if (!condition) throw new Error(label); results.push(label); };
      const expectError = async (action, code) => {
        try { await action(); } catch (error) { check(error instanceof s.DraftStorageError && error.code === code, `Expected ${code} error`); return; }
        throw new Error(`Expected ${code} rejection`);
      };
      const raw = async (stores, mode, work) => {
        const db = await new Promise((resolve, reject) => {
          const request = indexedDB.open('blotori-draft-workspace', 1);
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        try {
          return await new Promise((resolve, reject) => {
            const tx = db.transaction(stores, mode);
            let result;
            tx.oncomplete = () => resolve(result);
            tx.onabort = () => reject(tx.error);
            work(tx, (value) => { result = value; });
          });
        } finally { db.close(); }
      };
      const read = (store, key) => raw([store], 'readonly', (tx, result) => {
        const request = tx.objectStore(store).get(key);
        request.onsuccess = () => result(request.result);
      });
      const put = (store, value) => raw([store], 'readwrite', (tx) => tx.objectStore(store).put(value));
      check(await s.loadActiveWorkspace() === null, 'New database has no active draft');
      check((await s.loadDraftImages(fixture.id)).length === 0, 'New database has no image attachments');
      const ids = new Set(Array.from({ length: 100 }, () => s.createDraftId()));
      check(ids.size === 100, 'New draft IDs are distinct');

      const first = structuredClone(fixture);
      const queued = s.saveWorkspace(first);
      first.draft.title = 'MUTATED AFTER SAVE INVOCATION';
      await queued;
      check((await s.loadActiveWorkspace()).draft.title === fixture.draft.title, 'Queued save snapshots the supplied workspace immediately');
      const writes = Array.from({ length: 40 }, (_, i) => s.saveWorkspace({
        ...fixture, platformId: i === 39 ? 'tistory' : 'naver', draft: { ...fixture.draft, title: `Ordered title ${i}` },
      }));
      await Promise.all(writes);
      const latest = await s.loadActiveWorkspace();
      check(latest.draft.title === 'Ordered title 39' && latest.platformId === 'tistory', 'Rapid saves preserve invocation order');
      check(latest.id === fixture.id && JSON.stringify(latest.draft.images) === JSON.stringify(fixture.draft.images), 'Platform changes retain stable draft and image IDs');
      check(latest.draft.images[0].display.widthPercent === 75 && latest.draft.images[0].display.align === 'right', 'Image display width and alignment survive platform changes');
      check(JSON.stringify(latest.draft.sections) === JSON.stringify(fixture.draft.sections), 'Presentation and section data survive save and load');

      const originalBytes = new Uint8Array([0, 255, 4, 3, 2, 1, 128]);
      const file = new File([originalBytes], '원본 사진.png', { type: 'image/png' });
      const image = { draftId: fixture.id, imageId: 'IMG-01', blob: file, name: file.name, updatedAt: fixture.updatedAt };
      await s.saveDraftImage(image);
      const [loadedImage] = await s.loadDraftImages(fixture.id);
      check(loadedImage.name === file.name && loadedImage.blob.type === file.type, 'Original filename and MIME type persist');
      check(JSON.stringify([...new Uint8Array(await loadedImage.blob.arrayBuffer())]) === JSON.stringify([...originalBytes]), 'Original image bytes survive IndexedDB structured cloning');
      await s.saveDraftImage({ ...image, draftId: 'draft-second', blob: new Blob(['second'], { type: 'image/jpeg' }), name: 'second.jpg' });
      check((await s.loadDraftImages('draft-second')).length === 1 && (await s.loadDraftImages(fixture.id)).length === 1, 'Identical image IDs remain isolated by draft ID');
      await s.deleteDraftImage('draft-second', 'IMG-01');
      check((await s.loadDraftImages('draft-second')).length === 0 && (await s.loadDraftImages(fixture.id)).length === 1, 'Deleting one attachment preserves other drafts');
      const second = { ...fixture, id: 'draft-second', platformId: 'wordpress' };
      await s.saveWorkspace(second);
      check((await read('workspaces', fixture.id)).draft.title === latest.draft.title, 'Changing active draft does not delete previous workspaces');
      check((await s.loadDraftImages(fixture.id)).length === 1, 'Changing active draft does not delete previous images');

      // Force failure after the workspace put was scheduled, before active-pointer put.
      // The first write must roll back rather than leaving a partial successful save.
      const originalPut = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function (...args) {
        if (this.name === 'meta') throw new DOMException('Simulated quota limit', 'QuotaExceededError');
        return originalPut.apply(this, args);
      };
      try {
        await expectError(() => s.saveWorkspace({ ...latest, draft: { ...latest.draft, title: 'MUST ROLL BACK' } }), 'quota');
      } finally { IDBObjectStore.prototype.put = originalPut; }
      check((await s.loadActiveWorkspace()).id === second.id, 'Quota failure preserves the previously active pointer');
      check((await read('workspaces', fixture.id)).draft.title === latest.draft.title, 'Quota failure atomically rolls back the workspace update');
      await s.saveWorkspace(latest);
      check((await s.loadActiveWorkspace()).id === fixture.id, 'A failed mutation does not poison future saves');

      const broken = { ...latest, draft: { ...latest.draft, sections: [{ id: 'section-1' }] } };
      await put('workspaces', broken);
      await expectError(() => s.loadActiveWorkspace(), 'corrupt');
      check(JSON.stringify(await read('workspaces', fixture.id)) === JSON.stringify(broken), 'Corrupt workspace load leaves the stored record unchanged');
      await s.saveWorkspace(latest);
      const brokenDisplay = { ...latest, draft: { ...latest.draft, images: [{ ...latest.draft.images[0], display: { widthPercent: 500, align: 'justify' } }] } };
      await put('workspaces', brokenDisplay);
      await expectError(() => s.loadActiveWorkspace(), 'corrupt');
      check(JSON.stringify(await read('workspaces', fixture.id)) === JSON.stringify(brokenDisplay), 'Malformed loaded image display is rejected without changing stored data');
      await s.saveWorkspace(latest);
      const brokenImage = { ...image, blob: 'CORRUPT' };
      await put('images', brokenImage);
      await expectError(() => s.loadDraftImages(fixture.id), 'corrupt');
      check((await read('images', [fixture.id, 'IMG-01'])).blob === 'CORRUPT', 'Corrupt image load does not delete the attachment');
      await s.saveDraftImage(image);
      await put('meta', { key: 'activeWorkspace', draftId: 'missing-draft' });
      await expectError(() => s.loadActiveWorkspace(), 'corrupt');
      check((await read('meta', 'activeWorkspace')).draftId === 'missing-draft', 'Dangling active pointer is reported, not silently reset');
      await s.saveWorkspace(latest);
      await raw(['meta'], 'readwrite', (tx) => tx.objectStore('meta').delete('activeWorkspace'));
      await expectError(() => s.loadActiveWorkspace(), 'corrupt');
      check((await read('workspaces', fixture.id)).draft.title === latest.draft.title, 'Missing active pointer does not disguise or erase existing drafts');
      await s.saveWorkspace(latest);
      return results;
    }, fixture));

    // A new JS realm restores from actual persisted IndexedDB, with no in-memory state.
    await attach(page);
    const restored = await page.evaluate(async () => {
      const s = window.__draftStorage;
      const workspace = await s.loadActiveWorkspace();
      const images = await s.loadDraftImages(workspace.id);
      return { workspace, imageCount: images.length, name: images[0].name, bytes: [...new Uint8Array(await images[0].blob.arrayBuffer())] };
    });
    assert.equal(restored.workspace.id, fixture.id);
    assert.equal(restored.workspace.platformId, 'tistory');
    assert.equal(restored.workspace.draft.title, 'Ordered title 39');
    assert.deepEqual(restored.workspace.draft.images[0].display, { widthPercent: 75, align: 'right' });
    assert.equal(restored.imageCount, 1);
    assert.equal(restored.name, '원본 사진.png');
    assert.deepEqual(restored.bytes, [0, 255, 4, 3, 2, 1, 128]);
    checks.push('Full page reload restores workspace, selected platform, original image filename and exact bytes');

    for (const scenario of ['unavailable', 'malformed-schema', 'newer-schema']) {
      const isolatedContext = await browser.newContext();
      await isolatedContext.route('**/__draft-storage-qa', (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Draft storage failure QA</title>' }));
      const isolatedPage = await isolatedContext.newPage();
      try {
        await isolatedPage.goto(`${baseURL}/__draft-storage-qa`);
        await isolatedPage.evaluate(async (scenario) => {
          if (scenario === 'unavailable') {
            Object.defineProperty(window, 'indexedDB', { configurable: true, get() { throw new DOMException('Disabled by browser policy', 'SecurityError'); } });
            return;
          }
          await new Promise((resolve, reject) => {
            const request = indexedDB.open('blotori-draft-workspace', scenario === 'newer-schema' ? 2 : 1);
            request.onupgradeneeded = () => request.result.createObjectStore('sentinel').put('KEEP', 'original');
            request.onerror = () => reject(request.error);
            request.onsuccess = () => { request.result.close(); resolve(); };
          });
        }, scenario);
        await isolatedPage.addScriptTag({ content: code });
        const errorCode = await isolatedPage.evaluate(async () => {
          try { await window.__draftStorage.loadActiveWorkspace(); return 'DID NOT REJECT'; } catch (error) { return error.code; }
        });
        assert.equal(errorCode, scenario === 'unavailable' ? 'unavailable' : 'corrupt', scenario);
        if (scenario !== 'unavailable') {
          const sentinel = await isolatedPage.evaluate(() => new Promise((resolve, reject) => {
            const request = indexedDB.open('blotori-draft-workspace');
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
              const db = request.result;
              const tx = db.transaction('sentinel', 'readonly');
              const read = tx.objectStore('sentinel').get('original');
              tx.oncomplete = () => { db.close(); resolve(read.result); };
              tx.onabort = () => { db.close(); reject(tx.error); };
            };
          }));
          assert.equal(sentinel, 'KEEP', 'Opening incompatible storage must not clear pre-existing data');
        }
        checks.push(`${scenario}: clear failure without destructive reset`);
      } finally { await isolatedContext.close(); }
    }
    assert.deepEqual(failures, [], 'No uncaught browser errors');
    fs.mkdirSync('visual-qa-artifacts', { recursive: true });
    fs.writeFileSync('visual-qa-artifacts/draft-storage-results.json', JSON.stringify({ status: 'passed', checks }, null, 2));
    console.log(`Draft storage browser QA PASS: ${checks.length} checks including exact-byte reload, mutation order, rollback, corrupted records and schema preservation.`);
  } catch (error) {
    fs.mkdirSync('visual-qa-artifacts', { recursive: true });
    fs.writeFileSync('visual-qa-artifacts/draft-storage-results.json', JSON.stringify({ status: 'failed', checks, failures, error: String(error) }, null, 2));
    throw error;
  } finally {
    await context.close();
    await browser.close();
  }
}
