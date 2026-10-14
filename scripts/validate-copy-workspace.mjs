import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';

const baseURL = process.env.BLOTORI_QA_URL || 'http://127.0.0.1:3000';
const artifacts = 'visual-qa-artifacts';
fs.mkdirSync(artifacts, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];
const imageBytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');

async function saved(page) {
  await page.locator('.draftStorageStatus[data-state="saved"]').waitFor();
}
async function currentWorkspace(page) {
  return page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => { const req = indexedDB.open('blotori-draft-workspace', 1); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(['meta', 'workspaces']);
        const pointer = tx.objectStore('meta').get('activeWorkspace');
        pointer.onsuccess = () => { const req = tx.objectStore('workspaces').get(pointer.result.draftId); req.onsuccess = () => resolve(req.result); };
        tx.onerror = () => reject(tx.error);
      });
    } finally { db.close(); }
  });
}
async function generate(page) {
  await page.goto(baseURL, { waitUntil: 'networkidle' });
  const platform = page.locator('select').filter({ has: page.locator('option[value="naver"]') }).first();
  await platform.selectOption('naver');
  await page.locator('textarea[placeholder*="주제를 문장이나 단어로 자유롭게 입력"]').fill('서식 복사와 이미지 보관 테스트');
  const responsePromise = page.waitForResponse((response) => response.url().endsWith('/api/generate') && response.request().method() === 'POST');
  await page.getByRole('button', { name: /블로그 초안 만들기/ }).click();
  const response = await responsePromise;
  assert.equal(response.status(), 200);
  const payload = await response.json();
  assert.equal(payload.mode, 'mock', 'This suite must never use paid generation');
  await page.locator('.generationOverlay').waitFor({ state: 'hidden' });
  await saved(page);
  return platform;
}

const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, permissions: ['clipboard-read', 'clipboard-write'], reducedMotion: 'reduce' });
const page = await context.newPage();
page.setDefaultTimeout(15_000);
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
try {
  const platform = await generate(page);
  await page.getByRole('button', { name: '직접 편집', exact: true }).click();
  const edited = '사용자가 수정한 원문 <script>실행 금지</script> & 이미지 옆 문단';
  await page.locator('.paragraphEdit').first().fill(edited);
  await saved(page);
  await page.getByRole('button', { name: '미리보기', exact: true }).click();
  let workspace = await currentWorkspace(page);
  const image = workspace.draft.images[0];
  const section = workspace.draft.sections.find((item) => item.presentation?.visualStyle !== 'glossary');
  assert.ok(image && section);
  await page.getByLabel(`${image.id} 원본 이미지 선택`, { exact: true }).setInputFiles({ name: 'original.png', mimeType: 'image/png', buffer: imageBytes });
  await page.locator(`[data-draft-image="${image.id}"]`).waitFor();
  await page.getByLabel(`${image.id} 삽입 위치`, { exact: true }).selectOption(section.id);
  await page.getByLabel(`${image.id} 표시 너비`, { exact: true }).selectOption('50');
  await page.getByLabel(`${image.id} 사진 정렬`, { exact: true }).selectOption('right');
  await saved(page);
  workspace = await currentWorkspace(page);
  assert.equal(workspace.draft.images[0].afterSectionId, section.id);
  assert.deepEqual(workspace.draft.images[0].display, { widthPercent: 50, align: 'right' });
  assert.equal(await page.locator(`[data-image-id="${image.id}"]`).evaluate((node) => node.closest('.articleSection')?.querySelector('h3')?.textContent), section.heading);
  const canonical = structuredClone(workspace);

  for (const target of ['tistory', 'wordpress', 'blogger', 'brunch', 'other', 'naver']) {
    await platform.selectOption(target);
    await saved(page);
    const next = await currentWorkspace(page);
    assert.equal(next.id, canonical.id, 'Platform switching must preserve draft identity');
    assert.deepEqual(next.draft, canonical.draft, `${target} must preserve text/style/image metadata`);
    assert.equal(await page.locator('[data-copy-platform]').count(), target === 'brunch' ? 0 : 1);
    assert.equal(await page.locator(`[data-draft-image="${image.id}"]`).count(), 1);
  }

  await page.locator('[data-copy-platform]').click();
  await page.getByText('서식을 포함해 복사했어요. 붙여넣은 편집기에서 최종 서식을 확인해 주세요.', { exact: true }).waitFor();
  const clipboard = await page.evaluate(async () => {
    const [item] = await navigator.clipboard.read();
    return { types: item.types, html: await (await item.getType('text/html')).text(), text: await (await item.getType('text/plain')).text() };
  });
  assert.ok(clipboard.types.includes('text/html') && clipboard.types.includes('text/plain'));
  assert.ok(clipboard.html.includes('&lt;script&gt;'));
  assert.ok(clipboard.text.includes(edited));
  assert.ok(clipboard.text.includes('표시 너비 50% · 오른쪽 정렬'));
  assert.ok(!clipboard.html.includes('blob:'), 'Local image URLs must never escape as external image embeds');
  await page.locator('.platformExportDetails > summary').click();
  assert.equal(await page.locator('[data-export-preview] script').count(), 0);
  assert.ok((await page.locator('[data-export-preview]').textContent()).includes(edited));
  results.push({ name: 'actual browser dual-MIME clipboard', status: 'passed' });

  await page.locator('[data-copy-plain]').click();
  assert.ok((await page.evaluate(() => navigator.clipboard.readText())).includes(edited));
  await page.evaluate(() => { Object.defineProperty(navigator.clipboard, 'write', { configurable: true, value: async () => { throw new DOMException('fixture denied', 'NotAllowedError'); } }); });
  await page.locator('[data-copy-platform]').click();
  await page.getByText('텍스트만 복사됐어요. 이 환경에서는 서식 복사를 완료하지 못했어요.', { exact: true }).waitFor();
  assert.ok((await page.evaluate(() => navigator.clipboard.readText())).includes(edited));
  await page.evaluate(() => { Object.defineProperty(navigator.clipboard, 'writeText', { configurable: true, value: async () => { throw new DOMException('fixture denied', 'NotAllowedError'); } }); });
  await page.locator('[data-copy-platform]').click();
  await page.getByText(/복사하지 못했어요. 브라우저 권한/).waitFor();
  results.push({ name: 'truthful rich/plain fallback and denied feedback', status: 'passed' });

  await page.reload({ waitUntil: 'networkidle' });
  await saved(page);
  assert.deepEqual((await currentWorkspace(page)).draft, canonical.draft);
  const restoredImage = page.locator(`[data-draft-image="${image.id}"]`);
  await restoredImage.waitFor();
  await page.waitForFunction((id) => { const img = document.querySelector(`[data-draft-image="${id}"]`); return img?.complete && img.naturalWidth > 0; }, image.id);
  assert.equal(await restoredImage.evaluate((node) => node.style.width), '50%');
  const restoredBytes = await restoredImage.evaluate(async (node) => Array.from(new Uint8Array(await (await fetch(node.src)).arrayBuffer())));
  assert.deepEqual(Buffer.from(restoredBytes), imageBytes, 'Stored originals must be byte-identical after reload');
  assert.equal(await page.getByLabel(`${image.id} 삽입 위치`, { exact: true }).inputValue(), section.id);
  results.push({ name: 'platform switch, anchor movement, width/alignment and reload preserve original bytes', status: 'passed' });
  await page.screenshot({ path: `${artifacts}/copy-workspace-persisted.png`, fullPage: true });

  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === 'workspaces') throw new DOMException('fixture capacity failure', 'QuotaExceededError');
      return original.apply(this, args);
    };
  });
  await page.getByRole('button', { name: '직접 편집', exact: true }).click();
  await page.locator('.paragraphEdit').first().fill('저장 실패 시 이전 원고 보호');
  await page.locator('.draftStorageStatus[data-state="error"]').waitFor();
  assert.deepEqual((await currentWorkspace(page)).draft, canonical.draft, 'Failed autosave must retain last committed draft');
  results.push({ name: 'storage failure is visible and prior saved draft survives', status: 'passed' });
  assert.deepEqual(errors, [], 'Unexpected browser errors');
} catch (error) {
  results.push({ name: 'copy/workspace flow', status: 'failed', error: error.stack || String(error), pageErrors: errors });
  await page.screenshot({ path: `${artifacts}/copy-workspace-failure.png`, fullPage: true }).catch(() => {});
  throw error;
} finally {
  await context.close();
  await browser.close();
  fs.writeFileSync(`${artifacts}/copy-workspace-results.json`, JSON.stringify({ externalNaverPaste: 'NOT_RUN', results }, null, 2));
  console.log(JSON.stringify(results));
}
