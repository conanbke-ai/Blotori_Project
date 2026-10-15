import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { getQaTargets } from './browser-qa-targets.mjs';

const targets = getQaTargets({ requireNetwork: true });
const outputDir = process.env.BLOTORI_QA_OUTPUT_DIR || 'visual-qa-artifacts/publishing-browser';
const viewports = [
  { name: 'wide', width: 1920, height: 1080 },
  { name: 'desktop', width: 1440, height: 1000 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'mobile', width: 390, height: 844 },
];
fs.mkdirSync(outputDir, { recursive: true });

async function generateCuratedDraft(page, baseURL) {
  await page.goto(baseURL, { waitUntil: 'networkidle' });
  await page.locator('.workspaceV2').waitFor({ state: 'visible' });
  await page.locator('select').filter({ has: page.locator('option[value="naver"]') }).first().selectOption('naver');
  await page.locator('select').filter({ has: page.locator('option[value="food"]') }).selectOption('food');
  const styleSelect = page.locator('select').filter({ has: page.locator('option[value="category:food-photo-diary"]') });
  await styleSelect.waitFor();
  await styleSelect.selectOption('category:food-photo-diary');
  await page.locator('textarea[placeholder*="주제를 문장이나 단어로 자유롭게 입력"]').fill('가을 제철 재료를 고르는 기준');

  const requestPromise = page.waitForRequest((request) => request.url().endsWith('/api/generate') && request.method() === 'POST');
  const responsePromise = page.waitForResponse((response) => response.url().endsWith('/api/generate') && response.request().method() === 'POST');
  await page.getByRole('button', { name: /블로그 초안 만들기/ }).click();
  const [request, response] = await Promise.all([requestPromise, responsePromise]);
  const payload = request.postDataJSON();
  const result = await response.json();
  assert.equal(response.status(), 200);
  assert.equal(result.mode, 'mock', 'Publishing browser QA must never call the paid API');
  assert.equal(payload.presetId || null, null);
  assert.equal(payload.blogDNA?.version, 2);
  for (const dimension of ['voice', 'mood', 'structure', 'imageRhythm', 'visual']) {
    assert.ok(payload.blogDNA?.[dimension], `curated Blog DNA ${dimension} must be explicit in the request`);
    assert.equal(payload.blogDNAApply?.[dimension], true, `${dimension} must be enabled`);
  }
  assert.match(payload.styleProfileName, /사진|맛집|푸드/);
  await page.locator('.generationOverlay').waitFor({ state: 'hidden' });
  await page.locator('.draftStorageStatus[data-state="saved"]').waitFor();

  const details = page.locator('.platformExportDetails');
  for (let index = 0; index < 2; index += 1) {
    if (!(await details.nth(index).getAttribute('open'))) await details.nth(index).locator('summary').click();
  }
  const bodyPreview = await page.locator('[data-export-preview]').textContent();
  const imageGuide = await page.locator('[data-image-guide-preview]').textContent();
  assert.doesNotMatch(bodyPreview, /IMG-\d|삽입\s*·|표시 너비|1200[×x]675/);
  assert.match(imageGuide, /IMG-01-HERO/);
  assert.match(imageGuide, /게시용 본문과 별도/);
  assert.match(imageGuide, /원본 이미지 첨부 여부는 자동 판정하지 않습니다/);

  await page.locator('[data-copy-platform]').click();
  await page.locator('[data-copy-result]').filter({ hasText: '서식을 포함해 복사했어요' }).waitFor();
  const clipboard = await page.evaluate(async () => {
    const [item] = await navigator.clipboard.read();
    return {
      types: item.types,
      html: item.types.includes('text/html') ? await (await item.getType('text/html')).text() : '',
      text: await (await item.getType('text/plain')).text(),
    };
  });
  assert.ok(clipboard.types.includes('text/html') && clipboard.types.includes('text/plain'));
  assert.doesNotMatch(`${clipboard.text}\n${clipboard.html}`, /IMG-\d|삽입\s*·|표시 너비|1200[×x]675/);
  await page.locator('[data-copy-image-guide]').click();
  await page.locator('[data-copy-image-guide]').filter({ hasText: '가이드 복사됨' }).waitFor();
  const copiedGuide = await page.evaluate(() => navigator.clipboard.readText());
  assert.match(copiedGuide, /IMG-01-HERO/);
  assert.match(copiedGuide, /이미지 제작 프롬프트/);
  return {
    mode: result.mode,
    styleProfileName: payload.styleProfileName,
    blogDNADimensions: ['voice', 'mood', 'structure', 'imageRhythm', 'visual'],
    bodyCharacters: bodyPreview.length,
    imageGuideCharacters: imageGuide.length,
    clipboardTypes: clipboard.types,
  };
}

async function captureViewport(page, targetName, viewport) {
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  const metrics = await page.evaluate(() => {
    const panel = document.querySelector('.platformExportPanel');
    const actionBar = document.querySelector('.previewActionBar');
    return {
      innerWidth,
      innerHeight,
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1,
      reviewLayout: document.querySelector('.workspaceV2')?.dataset.reviewLayout,
      visibleMobilePanels: [...document.querySelectorAll('[data-mobile-panel]')]
        .filter((node) => node.checkVisibility()).map((node) => node.getAttribute('data-mobile-panel')),
      exportPanelVisible: panel?.checkVisibility() ?? false,
      actionBarVisible: actionBar?.checkVisibility() ?? false,
      copyButtons: [...document.querySelectorAll('[data-copy-platform],[data-copy-plain],[data-copy-image-guide],[data-copy-tags]')]
        .filter((node) => node.checkVisibility()).map((node) => ({
          label: node.textContent?.trim(),
          width: node.getBoundingClientRect().width,
          height: node.getBoundingClientRect().height,
          scrollWidth: node.scrollWidth,
          whiteSpace: getComputedStyle(node).whiteSpace,
        })),
    };
  });
  assert.equal(metrics.horizontalOverflow, false, `${targetName}/${viewport.name}: horizontal overflow`);
  assert.equal(metrics.exportPanelVisible, true, `${targetName}/${viewport.name}: export panel hidden`);
  assert.equal(metrics.actionBarVisible, true, `${targetName}/${viewport.name}: copy action bar hidden`);
  assert.equal(metrics.copyButtons.length, 4, `${targetName}/${viewport.name}: all copy actions must remain reachable`);
  for (const button of metrics.copyButtons) {
    assert.ok(button.width > 0 && button.height >= 40, `${targetName}/${viewport.name}: ${button.label} touch target`);
    if (viewport.width <= 600) assert.equal(button.whiteSpace, 'nowrap');
    assert.ok(button.scrollWidth <= button.width + 1, `${targetName}/${viewport.name}: ${button.label} label overflows`);
  }
  const pagePath = path.join(outputDir, `${targetName}-${viewport.name}-${viewport.width}.png`);
  const exportPath = path.join(outputDir, `${targetName}-${viewport.name}-${viewport.width}-export.png`);
  await page.screenshot({ path: pagePath, fullPage: true, animations: 'disabled' });
  await page.locator('.platformExportPanel').screenshot({ path: exportPath, animations: 'disabled' });
  return { viewport, metrics, pagePath, exportPath };
}

const report = { generatedAt: new Date().toISOString(), targets: {}, externalNaverEditorPaste: 'NOT_RUN' };
const browser = await chromium.launch({ headless: true });
try {
  for (const target of targets) {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      screen: { width: 1440, height: 1000 },
      permissions: ['clipboard-read', 'clipboard-write'],
      reducedMotion: 'reduce',
      colorScheme: 'light',
      locale: 'ko-KR',
      timezoneId: 'Asia/Seoul',
      serviceWorkers: 'block',
    });
    const page = await context.newPage();
    page.setDefaultTimeout(20_000);
    const browserErrors = [];
    page.on('pageerror', (error) => browserErrors.push(error.message));
    try {
      const generation = await generateCuratedDraft(page, target.baseURL);
      const captures = [];
      for (const viewport of viewports) captures.push(await captureViewport(page, target.name, viewport));
      assert.deepEqual(browserErrors, [], `${target.name}: browser errors`);
      report.targets[target.name] = { baseURL: target.baseURL, generation, captures, browserErrors };
      console.log(`PASS ${target.name}: curated DNA payload, reader body/image guide clipboard separation, 1920/1440/768/390 responsive screenshots`);
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
  fs.writeFileSync(path.join(outputDir, 'publishing-browser-results.json'), JSON.stringify(report, null, 2));
}

console.log('PUBLISHING_BROWSER_QA_PASS');
