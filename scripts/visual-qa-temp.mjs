import { chromium } from 'playwright';
import fs from 'fs';

const baseURL = 'http://127.0.0.1:3000';
const outputDir = 'visual-qa-artifacts';
fs.mkdirSync(outputDir, { recursive: true });

const viewports = [
  ['desktop', { width: 1440, height: 1100 }],
  ['tablet', { width: 1024, height: 1100 }],
  ['mobile', { width: 390, height: 844 }],
];

function attachDiagnostics(page, name) {
  page.on('pageerror', (error) => console.error(`[${name}] pageerror`, error.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.error(`[${name}] console`, msg.text());
  });
}

async function seedSavedStyle(page) {
  await page.evaluate(() => {
    localStorage.setItem('blotori.style-profiles.v1', JSON.stringify([{
      id: 'qa-style',
      name: 'QA 저장 문체',
      sourceType: 'manual',
      signature: '부드러운 해요체. 짧은 문단. 핵심을 먼저 말하고 마지막에 실천 팁을 제안한다.',
      defaultIntensity: 4,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }]));
    localStorage.setItem('blotori.selected-style.v1', 'qa-style');
  });
}

async function captureAssetStudio(page, name) {
  const referenceGroup = page.locator('.referenceMaterialGroup');
  await referenceGroup.waitFor({ state: 'visible', timeout: 10000 });
  const referenceInput = referenceGroup.locator('input[type="file"]');
  await referenceInput.setInputFiles({
    name: 'qa-reference.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('QA reference material for Blotori browser acceptance.'),
  });
  await page.waitForTimeout(250);
  const row = page.getByText('qa-reference.txt', { exact: true });
  if (!(await row.count())) throw new Error('reference material row did not render');

  const rail = page.locator('.settingsRail');
  const styleGroup = page.locator('.unifiedWritingGroup');
  await styleGroup.waitFor({ state: 'visible', timeout: 10000 });
  await styleGroup.scrollIntoViewIfNeeded();
  await page.waitForTimeout(180);
  await styleGroup.locator('.styleBuilder').evaluate((node) => { node.open = true; });
  await page.waitForTimeout(120);
  const selected = styleGroup.locator('select').first();
  if ((await selected.inputValue()) !== 'saved:qa-style') throw new Error(`saved style did not restore in unified selector: ${await selected.inputValue()}`);
  if (await page.getByRole('heading', { name: '기본 문체 · 글 구성' }).count()) throw new Error('legacy duplicate writing-style card still rendered');

  await page.screenshot({ path: `${outputDir}/${name}-asset-studio.png`, fullPage: true });
  await rail.evaluate((node) => { node.scrollTop = 0; });
}

async function prepareDraft(page, name) {
  await page.goto(baseURL, { waitUntil: 'networkidle' });
  await seedSavedStyle(page);
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('.workspaceV2').waitFor({ state: 'visible' });
  await page.waitForTimeout(600);

  const mascot = await page.locator('.blotoriMascotEmpty').evaluate((img) => ({
    src: img.src,
    complete: img.complete,
    naturalWidth: img.naturalWidth,
    naturalHeight: img.naturalHeight,
  }));
  console.log(`[${name}] empty-mascot`, mascot);
  if (!mascot.complete || mascot.naturalWidth === 0) throw new Error(`${name}: empty mascot failed to decode`);

  const canonical = await page.evaluate(async () => {
    const res = await fetch('/blotori-canonical-mini.webp');
    const blob = await res.blob();
    return { status: res.status, ok: res.ok, contentType: res.headers.get('content-type'), bytes: blob.size };
  });
  console.log(`[${name}] canonical-fetch`, canonical);
  if (!canonical.ok || canonical.bytes === 0) throw new Error(`${name}: canonical asset fetch failed`);

  await page.screenshot({ path: `${outputDir}/${name}-empty.png`, fullPage: true });
  if (name === 'desktop') await captureAssetStudio(page, name);

  const platform = page.locator('select').filter({ has: page.locator('option[value="naver"]') }).first();
  const topic = page.locator('textarea[placeholder*="주제를 문장이나 단어로 자유롭게 입력"]');
  const generate = page.getByRole('button', { name: /블로그 초안 만들기/ });
  console.log(`[${name}] qa-counts`, { platform: await platform.count(), topic: await topic.count(), generate: await generate.count() });
  await platform.selectOption('naver');
  await topic.fill('50대 목 스트레칭과 스마트폰 자세 관리 팁');
  console.log(`[${name}] qa-input`, { platform: await platform.inputValue(), topic: await topic.inputValue(), disabled: await generate.isDisabled() });

  const generation = generate.click();
  await page.locator('.generationOverlay').waitFor({ state: 'visible', timeout: 4000 });
  await page.screenshot({ path: `${outputDir}/${name}-loading.png`, fullPage: true });
  await generation;
  await page.locator('.generationOverlay').waitFor({ state: 'hidden', timeout: 10000 });
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${outputDir}/${name}-generated.png`, fullPage: true });
}

const browser = await chromium.launch({ headless: true });
let failed = false;
for (const [name, viewport] of viewports) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  attachDiagnostics(page, name);
  try {
    await prepareDraft(page, name);
  } catch (error) {
    failed = true;
    console.error(`visual QA failed: ${name}`, error);
  } finally {
    await context.close();
  }
}
await browser.close();
if (failed) process.exitCode = 1;
