import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

// Run against the existing mock production app. No generation or paid API calls.
const baseURL = process.env.BLOTORI_QA_URL || 'http://127.0.0.1:3000';
const outputDir = 'visual-qa-artifacts';
const title = '글과 이미지를 엮어, 이야기를 완성해요.';
const description = '자료를 넣고 문체를 고르면, 게시할 수 있는 블로그 초안과 이미지 가이드까지 한 흐름으로 완성해요.';
const viewports = [
  ['wide', 1920], ['desktop', 1440], ['tablet', 1024], ['narrow', 900],
  ['tablet-small', 768], ['phone-wide', 600], ['mobile', 390], ['mobile-small', 320],
];
fs.mkdirSync(outputDir, { recursive: true });

async function measureHeader(page) {
  return page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const rect = (node) => {
      const r = node.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
    };
    const header = document.querySelector('.workspaceHeader');
    const mark = header.querySelector('.blotoriBrandMark');
    const copy = header.querySelector('.brandCopy');
    const heading = copy.querySelector('h1');
    const paragraph = copy.querySelector('p');
    const image = mark.querySelector('img');
    const splitWords = [];
    for (const element of [heading, paragraph]) {
      if (!element.getClientRects().length) continue;
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const node = walker.currentNode;
        for (const match of node.textContent.matchAll(/\S+/g)) {
          const range = document.createRange();
          range.setStart(node, match.index);
          range.setEnd(node, match.index + match[0].length);
          const lines = new Set([...range.getClientRects()].map((r) => Math.round(r.top)));
          if (lines.size > 1) splitWords.push(match[0]);
        }
      }
    }
    // Only the header's visible controls belong in its geometry. Diagnostic
    // popover contents can retain layout rectangles while <details> is closed.
    const checked = [mark, copy, heading, paragraph,
      ...header.querySelectorAll('.workspaceTopActions > button, .workspaceTopActions > details > summary')];
    const clipped = checked.filter((node) => node.checkVisibility()).flatMap((node) => {
      const bounds = rect(node);
      const parent = rect(header);
      return bounds.left < parent.left - 1 || bounds.right > parent.right + 1
        || bounds.top < parent.top - 1 || bounds.bottom > parent.bottom + 1
        || node.scrollWidth > node.clientWidth + 1
        ? [{ className: node.className, bounds, scrollWidth: node.scrollWidth, clientWidth: node.clientWidth }] : [];
    });
    return {
      header: rect(header), mark: rect(mark), copy: rect(copy),
      title: heading.textContent, description: paragraph.textContent,
      titlePhrases: [...heading.querySelectorAll('.brandPhrase')].map((node) => ({
        text: node.textContent, ...rect(node), lineHeight: parseFloat(getComputedStyle(node).lineHeight),
      })),
      forcedBreaks: copy.querySelectorAll('br').length,
      image: { src: image.getAttribute('src'), loaded: image.complete && image.naturalWidth > 0 },
      splitWords, clipped,
      documentOverflow: document.documentElement.scrollWidth > innerWidth + 1,
    };
  });
}

const browser = await chromium.launch({ headless: true });
const results = [];
const failures = [];
try {
  for (const [name, width] of viewports) {
    const context = await browser.newContext({ viewport: { width, height: 1100 } });
    const page = await context.newPage();
    try {
      await page.goto(baseURL, { waitUntil: 'networkidle' });
      const platform = page.locator('select').filter({ has: page.locator('option[value="naver"]') }).first();
      for (const platformName of ['naver', 'wordpress']) {
        await platform.selectOption(platformName);
        const state = await measureHeader(page);
        const label = `${name}-${platformName}`;
        await page.locator('.workspaceHeader').screenshot({ path: path.join(outputDir, `header-${label}.png`) });
        try {
          assert.equal(state.title, title, `${label}: preserve the original title`);
          assert.equal(state.description, description, `${label}: preserve the original description`);
          assert.equal(state.image.src, '/blotori-feather-mark.png', `${label}: preserve the approved logo`);
          assert.equal(state.image.loaded, true, `${label}: logo must decode`);
          assert.equal(state.forcedBreaks, 0, `${label}: use natural wrapping, not forced line breaks`);
          assert.deepEqual(state.splitWords, [], `${label}: Korean words must remain intact`);
          assert.deepEqual(state.clipped, [], `${label}: header content must remain inside the header`);
          assert.equal(state.documentOverflow, false, `${label}: no horizontal document overflow`);
          assert.equal(state.titlePhrases.length, 2, `${label}: headline has two semantic clauses`);
          for (const phrase of state.titlePhrases) {
            assert.ok(phrase.height <= phrase.lineHeight + 1, `${label}: headline clause should fit without an internal break`);
          }
          if (width <= 600) {
            assert.ok(state.copy.top - state.mark.bottom >= 15, `${label}: stacked logo needs vertical breathing room`);
            assert.ok(Math.abs(state.copy.left - state.mark.left) <= 1, `${label}: stacked logo and copy must align`);
          } else {
            assert.ok(state.copy.left - state.mark.right >= 23, `${label}: logo and copy need a clear horizontal gap`);
          }
          const [first, second] = state.titlePhrases;
          if (width >= 1440) {
            assert.ok(Math.abs(first.top - second.top) <= 1, `${label}: a wide header must not force a title break`);
          }
          if (first.width + second.width > state.copy.width + 1) {
            assert.ok(second.top > first.top, `${label}: a headline that cannot fit should break at the comma`);
          }
          results.push({ name: label, width, passed: true, ...state });
          console.log(`PASS header ${label}`);
        } catch (error) {
          failures.push(`${label}: ${error.message}`);
          results.push({ name: label, width, passed: false, error: error.message, ...state });
          console.error(`FAIL header ${label}`, error.message);
        }
      }
    } finally {
      await context.close();
    }
  }
} finally {
  fs.writeFileSync(path.join(outputDir, 'brand-header-results.json'), JSON.stringify(results, null, 2));
  await browser.close();
}

assert.deepEqual(failures, [], `Brand header failures:\n${failures.join('\n')}`);
