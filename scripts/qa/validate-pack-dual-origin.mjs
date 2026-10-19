// Offline dual-Origin pack contract E2E: import/export -> selection -> generation payload.
// No paid requests; a fresh Playwright browser context is used for each Origin.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const targets = [['localhost', process.env.BLOTORI_LOCAL_URL], ['network', process.env.BLOTORI_NETWORK_URL]];
if (targets.some(([, url]) => !url)) {
  console.error('BLOCKED: BLOTORI_LOCAL_URL and BLOTORI_NETWORK_URL are both required');
  process.exit(2);
}
const browser = await chromium.launch({ headless: true });
const results = [];
try {
  for (const [name, url] of targets) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true, serviceWorkers: 'block' });
    const payloads = [];
    try {
      await context.route('**/api/generate', async route => {
        if (route.request().method() === 'POST') payloads.push(route.request().postDataJSON());
        await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Offline pack QA: paid generation blocked' }) });
      });
      await context.route('**/api/health**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, keyDetected: true, verified: false, message: 'Offline QA' }) }));
      const page = await context.newPage();
      const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
      assert.equal(response?.status(), 200);
      await page.locator('.draftStorageStatus[data-state="ready"]').waitFor({ timeout: 15000 });
      const category = page.locator('.settingsRail select').filter({ has: page.locator('option[value=""]') }).nth(1);
      // The category select is the first select after the platform selector.
      const categoryOptions = await category.locator('option').evaluateAll(options => options.map(o => o.value).filter(Boolean));
      assert.ok(categoryOptions.length > 0, 'Expected built-in category options');
      await category.selectOption(categoryOptions[0]);
      const styleSelect = page.locator('.unifiedWritingGroup select').filter({ has: page.locator('option[value^="category:"]') }).first();
      const presetValues = await styleSelect.locator('option[value^="category:"]').evaluateAll(options => options.map(o => o.value));
      assert.ok(presetValues.length > 0, 'Category must offer a DNA preset');
      await styleSelect.selectOption(presetValues[0]);
      await page.getByRole('button', { name: '팩 내보내기' }).click();
      const chooser = page.getByRole('region', { name: '블로토리 팩 구성' });
      await chooser.waitFor();
      assert.ok((await chooser.locator('input[type="checkbox"]:checked').count()) >= 1, 'Selected category preset should be prechecked');
      const downloadPromise = page.waitForEvent('download');
      await chooser.getByRole('button', { name: '선택한 항목 저장' }).click();
      const download = await downloadPromise;
      const stream = await download.createReadStream();
      let raw = '';
      for await (const chunk of stream) raw += chunk.toString('utf8');
      const manifest = JSON.parse(raw);
      assert.equal(manifest.kind, 'blotori-pack');
      assert.equal(manifest.styles.length, 1);
      assert.ok(manifest.styles[0].blogDNA?.voice, 'Exported preset must include full Blog DNA');
      const packInput = page.locator('input[type="file"][accept*=".blotori"]');
      await packInput.setInputFiles({ name: 'offline-qa.blotori', mimeType: 'application/json', buffer: Buffer.from(raw) });
      await page.getByText(/문체 1개와 자료 0개를 가져왔어요/).waitFor({ timeout: 8000 });
      await page.waitForFunction(() => document.querySelectorAll('.unifiedWritingGroup select option[value^="saved:"]').length === 1, null, { timeout: 8000 });
      const imported = await styleSelect.locator('option[value^="saved:"]').evaluateAll(options => options.map(o => ({ value: o.value, text: o.textContent })));
      assert.equal(imported.length, 1);
      await styleSelect.selectOption(imported[0].value);
      await page.waitForFunction(expected => document.querySelector('.unifiedWritingGroup select option:checked')?.value === expected, imported[0].value, { timeout: 8000 });
      const platform = page.locator('.settingsRail select').filter({ has: page.locator('option[value="naver"]') }).first();
      await platform.selectOption('naver');
      await page.locator('.settingsRail textarea[placeholder*="주제"]').first().fill('오프라인 팩 적용 검증');
      await page.waitForFunction(() => {
        const p = document.querySelector('.settingsRail select option[value="naver"]')?.parentElement;
        const text = document.querySelector('.settingsRail textarea[placeholder*="주제"]');
        return p?.value === 'naver' && text?.value === '오프라인 팩 적용 검증';
      }, null, { timeout: 8000 });
      await page.waitForFunction(() => {
        const button = document.querySelector('.settingsRail .generatePrimary');
        return Boolean(button && !button.disabled);
      }, null, { timeout: 10000 });
      const posted = page.waitForRequest(request => request.method() === 'POST' && new URL(request.url()).pathname === '/api/generate', { timeout: 10000 });
      await page.locator('.settingsRail .generatePrimary').click();
      try { await posted; } catch (error) {
        const state = await page.evaluate(() => ({
          platform: document.querySelector('.settingsRail select option[value="naver"]')?.parentElement?.value,
          topic: document.querySelector('.settingsRail textarea[placeholder*="주제"]')?.value,
          style: document.querySelector('.unifiedWritingGroup select option:checked')?.value,
          buttonDisabled: document.querySelector('.settingsRail .generatePrimary')?.disabled,
          buttonText: document.querySelector('.settingsRail .generatePrimary')?.textContent,
          errorText: document.querySelector('.settingsRail .errorBox')?.textContent,
          storage: document.querySelector('.draftStorageStatus')?.textContent,
          layout: document.querySelector('.workspaceV2')?.dataset.reviewLayout,
        }));
        throw new Error('NO_GENERATE_POST ' + JSON.stringify(state) + ' ' + String(error));
      }
      await page.waitForFunction(() => document.querySelector('.settingsRail .errorBox'), null, { timeout: 10000 });
      assert.equal(payloads.length, 1, name + ': intercepted generation count');
      assert.equal(payloads[0].styleId, 'custom');
      assert.ok(payloads[0].blogDNA?.voice, 'Imported pack DNA must reach generation request');
      assert.equal(payloads[0].blogDNAApply?.visual, true);
      results.push({ origin: name, status: 'PASS', stylesExported: manifest.styles.length, stylesImported: imported.length, paidCalls: 0 });
    } catch (error) {
      results.push({ origin: name, status: 'FAIL', reason: String(error).slice(0, 650) });
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}
for (const result of results) console.log('PACK_DUAL_ORIGIN', JSON.stringify(result));
if (results.some(result => result.status !== 'PASS')) process.exitCode = 1;
else console.log('PACK_DUAL_ORIGIN PASS 2/2 — no paid API calls');
