import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { getQaDeviceScaleFactor, getQaTargets } from './browser-qa-targets.mjs';

const targets = getQaTargets({ requireNetwork: true });
const deviceScaleFactor = getQaDeviceScaleFactor();
const outputDir = process.env.BLOTORI_QA_OUTPUT_DIR || 'visual-qa-artifacts/dual-environment';
const viewports = [
  { name: 'wide', width: 1920, height: 1080 },
  { name: 'desktop', width: 1440, height: 1000 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'mobile', width: 390, height: 844 },
];
fs.mkdirSync(outputDir, { recursive: true });

async function preflight(target) {
  let response;
  try {
    response = await fetch(target.baseURL, {
      headers: { 'cache-control': 'no-cache', pragma: 'no-cache' },
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    throw new Error(`${target.name} is not reachable at ${target.baseURL}: ${error.message}`);
  }
  const body = await response.text();
  assert.equal(response.ok, true, `${target.name} HTTP ${response.status} at ${target.baseURL}`);
  return {
    status: response.status,
    contentType: response.headers.get('content-type'),
    bodyDigest: crypto.createHash('sha256').update(body).digest('hex'),
    hasWorkspaceMarkup: body.includes('workspaceV2'),
  };
}

async function settle(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}

async function collectMetrics(page) {
  return page.evaluate(() => {
    const rounded = (value) => Math.round(value * 100) / 100;
    const inspect = (selector) => {
      const node = document.querySelector(selector);
      if (!node) return null;
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return {
        visible: node.checkVisibility(),
        rect: {
          left: rounded(rect.left), top: rounded(rect.top), right: rounded(rect.right),
          bottom: rounded(rect.bottom), width: rounded(rect.width), height: rounded(rect.height),
        },
        display: style.display,
        position: style.position,
        overflowX: style.overflowX,
        overflowY: style.overflowY,
        gridTemplateColumns: style.gridTemplateColumns,
        gap: style.gap,
        objectFit: style.objectFit,
        backgroundColor: style.backgroundColor,
        clientWidth: node.clientWidth,
        scrollWidth: node.scrollWidth,
        clientHeight: node.clientHeight,
        scrollHeight: node.scrollHeight,
      };
    };
    const mark = document.querySelector('.blotoriBrandMark');
    const copy = document.querySelector('.brandCopy');
    const logo = document.querySelector('.blotoriBrandMark img');
    const markRect = mark?.getBoundingClientRect();
    const copyRect = copy?.getBoundingClientRect();
    const visibleMobilePanels = [...document.querySelectorAll('[data-mobile-panel]')]
      .filter((node) => node.checkVisibility()).map((node) => node.getAttribute('data-mobile-panel'));
    return {
      viewport: {
        innerWidth, innerHeight, devicePixelRatio,
        visualScale: rounded(visualViewport?.scale || 1),
      },
      document: {
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        clientHeight: document.documentElement.clientHeight,
        scrollHeight: document.documentElement.scrollHeight,
        bodyOverflowX: getComputedStyle(document.body).overflowX,
        bodyOverflowY: getComputedStyle(document.body).overflowY,
        horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1,
      },
      workspaceClass: document.querySelector('.workspaceV2')?.className || null,
      reviewLayout: document.querySelector('.workspaceV2')?.dataset.reviewLayout || null,
      visibleMobilePanels,
      header: inspect('.workspaceHeader'),
      brandMark: inspect('.blotoriBrandMark'),
      brandCopy: inspect('.brandCopy'),
      logo: {
        ...inspect('.blotoriBrandMark img'),
        src: logo?.getAttribute('src') || null,
        naturalWidth: logo?.naturalWidth || 0,
        naturalHeight: logo?.naturalHeight || 0,
      },
      logoCopyGap: markRect && copyRect ? rounded(copyRect.left - markRect.right) : null,
      emptyState: inspect('.workspaceEmpty'),
      emptyMascot: inspect('.blotoriMascotEmpty'),
      settings: inspect('.settingsRail'),
      preview: inspect('.previewStage'),
      inspector: inspect('.inspectorRail'),
      inspectorBody: inspect('.inspectorBody'),
      cssResources: [...document.styleSheets].map((sheet) => {
        try { return new URL(sheet.href, location.href).pathname; } catch { return sheet.href; }
      }).filter(Boolean).sort(),
    };
  });
}

async function verifyIndependentScroll(page, width) {
  return page.evaluate((viewportWidth) => {
    const result = { windowBefore: scrollY, windowAfter: scrollY, panels: {} };
    for (const selector of ['.settingsRail', '.previewStage', '.inspectorBody']) {
      const node = document.querySelector(selector);
      if (!node || !node.checkVisibility()) continue;
      const before = node.scrollTop;
      if (node.scrollHeight > node.clientHeight + 1) node.scrollTop = Math.min(80, node.scrollHeight - node.clientHeight);
      result.panels[selector] = {
        scrollable: node.scrollHeight > node.clientHeight + 1,
        before,
        after: node.scrollTop,
        overflowY: getComputedStyle(node).overflowY,
      };
      node.scrollTop = before;
    }
    result.windowAfter = scrollY;
    result.desktop = viewportWidth >= 768;
    return result;
  }, width);
}

async function capture(browser, target, viewport) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    screen: { width: viewport.width, height: viewport.height },
    deviceScaleFactor,
    reducedMotion: 'reduce',
    colorScheme: 'light',
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
    serviceWorkers: 'block',
  });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  page.setDefaultTimeout(15_000);
  const browserErrors = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));
  try {
    const response = await page.goto(target.baseURL, { waitUntil: 'networkidle' });
    assert.ok(response, `${target.name}/${viewport.name}: navigation produced no HTTP response`);
    assert.equal(response.ok(), true, `${target.name}/${viewport.name}: HTTP ${response.status()}`);
    await page.locator('.workspaceV2').waitFor({ state: 'visible' });
    await settle(page);
    const initialMetrics = await collectMetrics(page);
    const initialScreenshotPath = path.join(outputDir, `${target.name}-${viewport.name}-${viewport.width}-input.png`);
    const initialScreenshot = await page.screenshot({
      path: initialScreenshotPath, fullPage: true, animations: 'disabled',
    });
    if (!initialMetrics.emptyMascot?.visible) {
      const previewStep = page.getByRole('button', { name: '초안', exact: true });
      assert.equal(await previewStep.isVisible(), true,
        `${target.name}/${viewport.name}: hidden empty state must be reachable from the preview step`);
      await previewStep.click();
      await settle(page);
    }
    const metrics = await collectMetrics(page);
    assert.equal(metrics.viewport.innerWidth, viewport.width);
    assert.equal(metrics.viewport.innerHeight, viewport.height);
    assert.equal(metrics.viewport.devicePixelRatio, deviceScaleFactor);
    assert.equal(metrics.viewport.visualScale, 1, `${target.name}/${viewport.name}: browser zoom must remain 100%`);
    assert.equal(metrics.document.horizontalOverflow, false, `${target.name}/${viewport.name}: horizontal overflow`);
    assert.equal(metrics.logo.src, '/blotori-feather-mark.png');
    assert.ok(metrics.logo.naturalWidth > 0 && metrics.logo.naturalHeight > 0, 'Approved logo must decode');
    assert.ok(metrics.emptyMascot?.visible, 'Empty-state mascot must be visible');
    assert.equal(metrics.emptyMascot.objectFit, 'contain', 'Empty-state mascot must preserve its aspect ratio');
    assert.deepEqual(browserErrors, [], `${target.name}/${viewport.name}: browser errors`);

    const scroll = await verifyIndependentScroll(page, viewport.width);
    if (!metrics.workspaceClass.includes('workspaceSingle')) {
      assert.equal(scroll.windowBefore, scroll.windowAfter, `${target.name}/${viewport.name}: panel scroll moved the document`);
      assert.equal(metrics.document.scrollHeight, metrics.document.clientHeight,
        `${target.name}/${viewport.name}: desktop/tablet document must not scroll`);
    } else {
      assert.equal(metrics.visibleMobilePanels.length, 1, `${target.name}/${viewport.name}: exactly one mobile panel must be visible`);
    }

    const screenshotPath = path.join(outputDir, `${target.name}-${viewport.name}-${viewport.width}.png`);
    const screenshot = await page.screenshot({ path: screenshotPath, fullPage: true, animations: 'disabled' });
    return {
      target: target.name,
      viewport,
      status: response.status(),
      initialMetrics,
      metrics,
      scroll,
      initialScreenshotPath,
      initialScreenshotDigest: crypto.createHash('sha256').update(initialScreenshot).digest('hex'),
      screenshotPath,
      screenshotDigest: crypto.createHash('sha256').update(screenshot).digest('hex'),
    };
  } finally {
    await context.close();
  }
}

const report = {
  generatedAt: new Date().toISOString(),
  deviceScaleFactor,
  targets: {},
  comparisons: [],
};
const browser = await chromium.launch({ headless: true });
try {
  for (const target of targets) {
    report.targets[target.name] = { baseURL: target.baseURL, preflight: await preflight(target), captures: [] };
    for (const viewport of viewports) {
      const result = await capture(browser, target, viewport);
      report.targets[target.name].captures.push(result);
      console.log(`PASS ${target.name} ${viewport.width}x${viewport.height}`);
    }
  }

  for (const viewport of viewports) {
    const local = report.targets.localhost.captures.find((item) => item.viewport.name === viewport.name);
    const network = report.targets.network.captures.find((item) => item.viewport.name === viewport.name);
    const comparison = {
      viewport: viewport.name,
      metricsEqual: false,
      initialScreenshotEqual: local.initialScreenshotDigest === network.initialScreenshotDigest,
      screenshotEqual: local.screenshotDigest === network.screenshotDigest,
    };
    try {
      assert.deepEqual(network.initialMetrics, local.initialMetrics);
      assert.deepEqual(network.metrics, local.metrics);
      assert.deepEqual(network.scroll, local.scroll);
      comparison.metricsEqual = true;
    } catch (error) {
      comparison.error = error.message;
    }
    report.comparisons.push(comparison);
    assert.equal(comparison.metricsEqual, true, `${viewport.name}: computed style/geometry differs`);
    assert.equal(comparison.initialScreenshotEqual, true, `${viewport.name}: input-step screenshot pixels differ`);
    assert.equal(comparison.screenshotEqual, true, `${viewport.name}: screenshot pixels differ`);
    console.log(`PASS parity ${viewport.width}x${viewport.height}`);
  }
} finally {
  await browser.close();
  fs.writeFileSync(path.join(outputDir, 'dual-environment-results.json'), JSON.stringify(report, null, 2));
}

console.log('Localhost and Network browser rendering are equivalent for all required viewports.');
