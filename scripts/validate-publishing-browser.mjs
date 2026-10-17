import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { load } from 'cheerio';
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
const ignoreHTTPSErrors = process.env.BLOTORI_QA_IGNORE_HTTPS_ERRORS === 'true';
const imageBytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');

async function currentWorkspace(page) {
  return page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('blotori-draft-workspace', 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(['meta', 'workspaces'], 'readonly');
        const pointer = tx.objectStore('meta').get('activeWorkspace');
        pointer.onsuccess = () => {
          const request = tx.objectStore('workspaces').get(pointer.result.draftId);
          request.onsuccess = () => resolve(request.result);
        };
        tx.onerror = () => reject(tx.error);
      });
    } finally { db.close(); }
  });
}

async function uploadClipboardImages(page) {
  const workspace = await currentWorkspace(page);
  assert.ok(workspace.draft.images.length >= 4, 'Fixture needs three uploaded images and one missing slot');
  const sections = workspace.draft.sections.filter((section) => section.presentation?.visualStyle !== 'glossary');
  assert.ok(sections.length >= 2);
  const plans = workspace.draft.images.slice(0, 3);
  const placements = [null, sections[0].id, sections[1].id];
  const widths = ['75', '50', '25'];
  const aligns = ['right', 'left', 'center'];
  for (let index = 0; index < plans.length; index += 1) {
    const plan = plans[index];
    await page.getByLabel(`${plan.id} 원본 이미지 선택`, { exact: true }).setInputFiles({
      name: `fixture-${index + 1}.png`, mimeType: 'image/png', buffer: imageBytes,
    });
    await page.locator(`[data-draft-image="${plan.id}"]`).waitFor();
    await page.getByLabel(`${plan.id} 삽입 위치`, { exact: true }).selectOption(placements[index] ?? '');
    await page.getByLabel(`${plan.id} 표시 너비`, { exact: true }).selectOption(widths[index]);
    await page.getByLabel(`${plan.id} 사진 정렬`, { exact: true }).selectOption(aligns[index]);
  }
  await page.locator('.draftStorageStatus[data-state="saved"]').waitFor();
  return { workspace: await currentWorkspace(page), uploaded: plans.map((plan) => plan.id), missing: workspace.draft.images[3].id };
}

async function generateCuratedDraft(page, baseURL) {
  await page.goto(baseURL, { waitUntil: 'networkidle' });
  await page.locator('.workspaceV2').waitFor({ state: 'visible' });
  assert.equal(await page.evaluate(() => isSecureContext), true, `${baseURL}: Clipboard image QA requires a secure context`);
  const healthResponse = await page.request.get(`${baseURL}/api/health`);
  assert.equal(healthResponse.ok(), true);
  const health = await healthResponse.json();
  assert.equal(health.keyDetected, false, 'Stop before generation if a paid API key is visible to the QA server');
  assert.equal(health.verified, false, 'QA must never perform a paid API verification call');
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
  const attached = await uploadClipboardImages(page);

  const details = page.locator('.platformExportDetails');
  for (let index = 0; index < 2; index += 1) {
    if (!(await details.nth(index).getAttribute('open'))) await details.nth(index).locator('summary').click();
  }
  const bodyPreview = await page.locator('[data-export-preview]').textContent();
  const imageGuide = await page.locator('[data-image-guide-preview]').textContent();
  assert.doesNotMatch(bodyPreview, /IMG-\d|삽입\s*·|표시 너비|1200[×x]675/);
  assert.match(imageGuide, /IMG-01-HERO/);
  assert.match(imageGuide, /게시용 본문과 별도/);
  assert.match(imageGuide, /서식 포함 복사는 이 브라우저에 저장된/);

  await page.locator('[data-copy-platform]').click();
  await page.locator('[data-copy-result]').filter({ hasText: '이미지 3/4개만 포함됐어요' }).waitFor();
  assert.doesNotMatch(await page.locator('[data-copy-platform]').textContent(), /복사됨|✓/, 'Partial image copy must not look completely successful');
  const clipboard = await page.evaluate(async () => {
    const [item] = await navigator.clipboard.read();
    return {
      types: item.types,
      html: item.types.includes('text/html') ? await (await item.getType('text/html')).text() : '',
      text: await (await item.getType('text/plain')).text(),
    };
  });
  assert.ok(clipboard.types.includes('text/html') && clipboard.types.includes('text/plain'));
  assert.doesNotMatch(clipboard.text, /IMG-\d|삽입\s*·|표시 너비|1200[×x]675/);
  const $ = load(clipboard.html);
  const images = $('img').map((_, node) => ({
    src: $(node).attr('src'), alt: $(node).attr('alt'), style: $(node).attr('style'), parentStyle: $(node).parent().attr('style'),
  })).get();
  assert.equal(images.length, 3, 'Only the three uploaded images belong in clipboard HTML');
  assert.deepEqual(images.map((image) => image.alt), attached.workspace.draft.images.slice(0, 3).map((image) => image.label));
  for (const image of images) {
    assert.match(image.src, /^data:image\/png;base64,/);
    assert.deepEqual(Buffer.from(image.src.slice(image.src.indexOf(',') + 1), 'base64'), imageBytes, 'Clipboard data URL must preserve original bytes');
  }
  assert.match(images[0].style, /width:75%/); assert.match(images[0].parentStyle, /text-align:right/);
  assert.match(images[1].style, /width:50%/); assert.match(images[1].parentStyle, /text-align:left/);
  assert.match(images[2].style, /width:25%/); assert.match(images[2].parentStyle, /text-align:center/);
  const blocks = $('p').toArray();
  const textBlockIndex = (text) => blocks.findIndex((node) => $(node).text() === text);
  const imageBlockIndex = (index) => blocks.indexOf($('img').eq(index).parent()[0]);
  assert.ok(imageBlockIndex(0) < textBlockIndex(attached.workspace.draft.intro[0]), 'Hero image must precede intro');
  assert.ok(textBlockIndex(attached.workspace.draft.sections[0].paragraphs.at(-1)) < imageBlockIndex(1), 'Second image must follow first section');
  assert.ok(textBlockIndex(attached.workspace.draft.sections[1].paragraphs.at(-1)) < imageBlockIndex(2), 'Third image must follow second section');
  assert.ok(!images.some((image) => image.alt === attached.workspace.draft.images[3].label), 'Missing slot must not become an image');
  assert.match(await page.locator('[data-copy-result]').textContent(), /네이버 스마트에디터.*아직 확인되지/);

  await page.locator('[data-copy-plain]').click();
  const plainClipboard = await page.evaluate(() => navigator.clipboard.readText());
  assert.ok(plainClipboard.includes(attached.workspace.draft.intro[0]));
  assert.doesNotMatch(plainClipboard, /data:image|IMG-\d/);

  await page.evaluate(() => {
    window.__qaOriginalGetAll = IDBIndex.prototype.getAll;
    IDBIndex.prototype.getAll = function () { throw new DOMException('fixture blocked read', 'InvalidStateError'); };
  });
  await page.locator('[data-copy-platform]').click();
  await page.locator('[data-copy-result]').filter({ hasText: '저장된 이미지를 읽지 못해' }).waitFor();
  assert.ok((await page.evaluate(() => navigator.clipboard.readText())).includes(attached.workspace.draft.intro[0]));
  await page.evaluate(() => { IDBIndex.prototype.getAll = window.__qaOriginalGetAll; delete window.__qaOriginalGetAll; });
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
    secureContext: true,
    uploadedImages: images.length,
    plannedImages: attached.workspace.draft.images.length,
    originalBytesPreserved: true,
    storageReadFailureFallback: 'plain-text-with-explicit-warning',
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

const report = { generatedAt: new Date().toISOString(), targets: {}, externalNaverEditorPaste: 'UNVERIFIED', ignoreHTTPSErrors };
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
      ignoreHTTPSErrors,
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
      console.log(`PASS ${target.name}: keyless Mock, three embedded image bytes/anchors/styles, partial/storage failure feedback, 1920/1440/768/390 screenshots`);
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
  fs.writeFileSync(path.join(outputDir, 'publishing-browser-results.json'), JSON.stringify(report, null, 2));
}

console.log('PUBLISHING_BROWSER_QA_PASS');
