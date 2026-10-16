// Zero-cost browser test of draft audit rendering and live edit updates.
// BLOTORI_QA_URL=https://localhost:3001 node scripts/qa/validate-draft-audit-ui.mjs
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const origin = process.env.BLOTORI_QA_URL;
if (!origin) throw new Error('Set BLOTORI_QA_URL explicitly');
const browser = await chromium.launch({ headless: true });
const draft = {
  title: '검수 테스트 원고', titleCandidates: ['검수 테스트 원고'],
  summary: '오프라인 QA', intro: ['검수 테스트 시작'],
  sections: [
    { id: 'sec-1', heading: '중복 제목', paragraphs: ['첫 번째 단락입니다.'] },
    { id: 'sec-2', heading: '중복 제목', paragraphs: ['두 번째 단락입니다.'] },
  ],
  closing: ['마무리입니다.'], tags: ['테스트'], images: [], warnings: [],
};
let generationCount = 0;
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
try {
  await context.route('**/api/generate', async route => {
    generationCount++;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ draft, mode: 'mock', requestId: 'qa-offline' }) });
  });
  // The health endpoint is mocked to guarantee no external health verification.
  await context.route('**/api/health**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ ok: true, keyDetected: true, verified: false, model: 'offline-qa', message: 'Offline QA' }),
  }));
  const page = await context.newPage();
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  await page.locator('.workspaceV2').waitFor();
  await page.locator('.settingsRail select option[value="naver"]').first().waitFor({ state: 'attached' });
  const platform = page.locator('.settingsRail select').filter({ has: page.locator('option[value="naver"]') }).first();
  await platform.selectOption('naver');
  await page.locator('.settingsRail textarea[placeholder*="주제"]').first().fill('품질 검수 UI 오프라인 테스트');
  const generate = page.locator('.settingsRail .generatePrimary');
  await generate.waitFor({ state: 'visible' });
  try {
    await page.waitForFunction(() => {
      const button = document.querySelector('.settingsRail .generatePrimary');
      return !!button && !button.disabled;
    }, null, { timeout: 8000 });
  } catch (error) {
    const state = await page.evaluate(() => ({
      storage: document.querySelector('.draftStorageStatus')?.textContent,
      storageState: document.querySelector('.draftStorageStatus')?.getAttribute('data-state'),
      platform: document.querySelector('.settingsRail select:has(option[value="naver"])')?.value,
      topic: document.querySelector('.settingsRail textarea[placeholder*="주제"]')?.value,
      buttonDisabled: document.querySelector('.settingsRail .generatePrimary')?.disabled,
      buttonText: document.querySelector('.settingsRail .generatePrimary')?.textContent,
      requirements: document.querySelector('.settingsRail .inputRequirement')?.textContent,
      pageErrors: document.querySelector('.errorBox')?.textContent,
    }));
    throw new Error('GENERATION_BUTTON_NOT_READY ' + JSON.stringify(state) + ' (' + String(error) + ')');
  }
  await generate.click();
  await page.getByRole('tab', { name: '검수' }).click();
  const inspector = page.locator('.qualityInspector');
  await inspector.getByText('게시 전 초안 품질 확인', { exact: false }).waitFor();
  await inspector.getByText('같은 소제목이 반복됩니다.', { exact: false }).waitFor();
  assert.equal(generationCount, 1, 'Only one intercepted draft request is allowed');

  await page.getByRole('button', { name: '직접 편집' }).click();
  const headings = page.locator('.sectionHeadingEdit');
  assert.ok(await headings.count() >= 2, 'Editable section headings must exist');
  await headings.nth(1).fill('고유한 제목');
  await inspector.getByText('같은 소제목이 반복됩니다.', { exact: false }).waitFor({ state: 'detached' });
  assert.equal(generationCount, 1, 'Editing must not call the generator');
  console.log('DRAFT_AUDIT_UI_E2E PASS: intercepted generation, audit visible, edit refresh, zero paid calls');
} finally {
  await context.close();
  await browser.close();
}
