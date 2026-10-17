import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { getQaDeviceScaleFactor, getQaTargets } from './browser-qa-targets.mjs';

// Run against the production build with BLOTORI_MOCK_MODE=true and no API key.
// This uses the real generation endpoint and React state, not a synthetic DOM.
const targets = getQaTargets();
const deviceScaleFactor = getQaDeviceScaleFactor();
const coreFlowOnly = process.env.BLOTORI_QA_CORE_FLOW === 'true';
const ignoreHTTPSErrors = process.env.BLOTORI_QA_IGNORE_HTTPS_ERRORS === 'true';
const outputDir = process.env.BLOTORI_QA_OUTPUT_DIR || 'visual-qa-artifacts';
const modalWindowScroll = new WeakMap();
const scenarios = coreFlowOnly ? [
  { name: 'mobile-390x844', width: 390, height: 844, layout: 'compact', single: true },
  { name: 'tablet-768x1024', width: 768, height: 1024, layout: 'compact', single: true },
  { name: 'desktop-1440x900', width: 1440, height: 900, layout: 'wide', single: false },
] : [
  { name: 'desktop', width: 1440, height: 1100, layout: 'wide', single: false },
  { name: 'tablet', width: 1024, height: 1100, layout: 'compact', single: false },
  { name: 'narrow', width: 900, height: 900, layout: 'compact', single: true },
  { name: 'mobile', width: 390, height: 844, layout: 'compact', single: true },
  { name: 'mobile-small', width: 320, height: 740, layout: 'compact', single: true },
];
fs.mkdirSync(outputDir, { recursive: true });

async function settle(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}

async function screenshot(page, name) {
  await settle(page);
  await page.screenshot({ path: path.join(outputDir, `responsive-${name}.png`), fullPage: true });
  if (coreFlowOnly) {
    await page.screenshot({ path: path.join(outputDir, `responsive-${name}-viewport.png`), fullPage: false });
  }
}

async function assertLayout(page, layout, single) {
  await page.waitForFunction((expected) => {
    const root = document.querySelector('.workspaceV2');
    return root?.dataset.reviewLayout === expected.layout
      && Boolean(document.querySelector('.workspaceSingle')) === expected.single;
  }, { layout, single });
  assert.equal(await page.locator('.inspectorRail').count(), 1, 'There must be exactly one inspector, including when closed');
  assert.equal(await page.locator('.inspectorRail').evaluate((node) => node.tagName), 'DIALOG', 'Inspector must use a native dialog');
}

async function assertDialogState(page, { open, modal }) {
  await page.waitForFunction((expected) => {
    const dialog = document.querySelector('.inspectorRail');
    return dialog?.open === expected.open && dialog.matches(':modal') === expected.modal;
  }, { open, modal });
  assert.equal(await page.locator('.inspectorRail').isVisible(), open, 'Closed compact inspector must not occupy or cover the workspace');
  assert.equal(await page.locator('.inspectorRail').count(), 1, 'Inspector duplication detected');
  assert.equal(await page.evaluate(() => document.querySelector('.inspectorRail') === window.__responsiveQaInspector), true,
    'Responsive transitions must retain the same inspector DOM node');
}

async function assertNoHorizontalOverflow(page, label) {
  const violations = await page.evaluate(() => {
    const tolerance = 2;
    const failures = [];
    for (const [name, node] of [
      ['document', document.documentElement],
      ['body', document.body],
      ...['.workspaceV2', '.workspaceGridV2', '.previewStage', '.blogScroller', '.inspectorRail', '.inspectorBody']
        .map((selector) => [selector, document.querySelector(selector)]),
    ]) {
      if (!node || !node.getClientRects().length || !node.clientWidth) continue;
      if (node.scrollWidth > node.clientWidth + tolerance) {
        failures.push({ name, clientWidth: node.clientWidth, scrollWidth: node.scrollWidth });
      }
      if (name === '.inspectorRail' || name === '.previewStage') {
        const rect = node.getBoundingClientRect();
        if (rect.left < -tolerance || rect.right > innerWidth + tolerance) {
          failures.push({ name, left: rect.left, right: rect.right, viewport: innerWidth });
        }
      }
    }
    return failures;
  });
  assert.deepEqual(violations, [], `${label}: horizontal overflow ${JSON.stringify(violations)}`);
}

async function assertControlVisible(locator, label) {
  assert.equal(await locator.isVisible(), true, `${label} must be visible`);
  const result = await locator.evaluate((node) => {
    const rect = node.getBoundingClientRect();
    const dialog = node.closest('dialog');
    const bounds = dialog?.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const hit = document.elementFromPoint(x, y);
    return {
      inViewport: rect.left >= -1 && rect.top >= -1 && rect.right <= innerWidth + 1 && rect.bottom <= innerHeight + 1,
      inDialog: !bounds || (rect.left >= bounds.left - 1 && rect.right <= bounds.right + 1
        && rect.top >= bounds.top - 1 && rect.bottom <= bounds.bottom + 1),
      reachable: hit === node || node.contains(hit),
    };
  });
  assert.deepEqual(result, { inViewport: true, inDialog: true, reachable: true }, `${label} is clipped or covered: ${JSON.stringify(result)}`);
}

async function launcherFor(page) {
  const mobile = page.locator('.mobileReviewLauncher:visible');
  const launcher = await mobile.count() ? mobile.first() : page.locator('.reviewLauncher:visible').first();
  await launcher.waitFor({ state: 'visible' });
  assert.match((await launcher.innerText()).replace(/\s/g, ''), /이미지·검수/, 'Launcher should clearly identify 이미지·검수');
  return launcher;
}

async function openInspector(page) {
  const launcher = await launcherFor(page);
  await launcher.click();
  await assertDialogState(page, { open: true, modal: true });
  await assertControlVisible(page.locator('.inspectorClose'), 'Inspector close button');
  assert.equal(await page.locator('.inspectorRail').evaluate((node) => node.contains(document.activeElement)), true,
    'Opening the dialog must move focus inside');
  // Playwright may scroll the page to reach the launcher. Take the baseline
  // after the click so only modal dismissal/focus restoration is compared.
  await settle(page);
  modalWindowScroll.set(page, await page.evaluate(() => window.scrollY));
  return launcher;
}

async function closeInspector(page, launcher, method) {
  if (method === 'escape') await page.keyboard.press('Escape');
  else await page.locator('.inspectorClose').click();
  await assertDialogState(page, { open: false, modal: false });
  await page.waitForFunction((node) => document.activeElement === node, await launcher.elementHandle());
  assert.equal(await launcher.evaluate((node) => node === document.activeElement), true,
    `${method} must return focus to the actual opening button`);
  await settle(page);
  const expectedScroll = modalWindowScroll.get(page);
  const actualScroll = await page.evaluate(() => window.scrollY);
  assert.ok(Number.isFinite(expectedScroll), 'Modal window-scroll baseline must exist');
  assert.ok(Math.abs(actualScroll - expectedScroll) <= 2,
    `${method} must preserve window scroll when restoring focus: ${expectedScroll} → ${actualScroll}`);
}

async function assertModalFocus(page) {
  const dialog = page.locator('.inspectorRail');
  await page.locator('.segmentedMode button').first().evaluate((node) => node.focus());
  assert.equal(await dialog.evaluate((node) => node.contains(document.activeElement)), true,
    'Native modal must prevent focus entering background controls');

  const focusableCount = await dialog.locator('button:visible, input:visible, textarea:visible, select:visible, a[href]:visible').count();
  for (let index = 0; index < focusableCount + 3; index += 1) {
    await page.keyboard.press('Tab');
    assert.equal(await dialog.evaluate((node) => node.contains(document.activeElement)), true,
      `Tab escaped the modal after ${index + 1} steps`);
  }
  await page.keyboard.press('Shift+Tab');
  assert.equal(await dialog.evaluate((node) => node.contains(document.activeElement)), true, 'Reverse Tab escaped the modal');
}

async function assertSelectedTab(page, name) {
  const dialog = page.locator('.inspectorRail');
  const selected = dialog.getByRole('tab', { name, exact: true });
  assert.equal(await selected.getAttribute('aria-selected'), 'true', `${name} must be selected`);
  assert.equal(await selected.getAttribute('tabindex'), '0', 'Selected tab must be the roving tab stop');
  assert.equal(await selected.evaluate((node) => node === document.activeElement), true, 'Arrow/Home/End should move tab focus');
  assert.equal(await dialog.locator('[role="tab"][aria-selected="true"]').count(), 1, 'Exactly one tab may be selected');
  assert.equal(await dialog.locator('[role="tab"][tabindex="0"]').count(), 1, 'Exactly one tab belongs in the tab order');
  const tabId = await selected.getAttribute('id');
  const panelId = await selected.getAttribute('aria-controls');
  assert.ok(tabId && panelId, 'Tabs need stable IDs and aria-controls');
  const panels = dialog.getByRole('tabpanel');
  assert.equal(await panels.count(), 1, 'Exactly one tabpanel must be exposed in the accessibility tree');
  assert.equal(await panels.getAttribute('id'), panelId, 'Selected tab must control the exposed panel');
  assert.equal(await panels.getAttribute('aria-labelledby'), tabId, 'Tabpanel must be labelled by its tab');
  assert.equal(await page.evaluate((id) => [...document.querySelectorAll('[id]')].filter((node) => node.id === id).length, panelId), 1,
    'Tabpanel IDs must not be duplicated');
}

async function testTabs(page, imageCount) {
  const dialog = page.locator('.inspectorRail');
  assert.equal(await dialog.getByRole('tablist').count(), 1);
  assert.equal(await dialog.getByRole('tab').count(), 2);
  await dialog.getByRole('tab', { name: '이미지', exact: true }).click();
  await assertSelectedTab(page, '이미지');
  assert.equal(await dialog.locator('.promptCard').count(), imageCount, 'Every image must have one prompt card');
  await assertControlVisible(dialog.getByRole('tab', { name: '이미지', exact: true }), 'Images tab');
  await assertControlVisible(dialog.getByRole('tab', { name: '검수', exact: true }), 'QA tab');
  for (const [key, expected] of [
    ['ArrowRight', '검수'], ['ArrowRight', '이미지'], ['ArrowLeft', '검수'],
    ['Home', '이미지'], ['End', '검수'], ['Home', '이미지'],
  ]) {
    await page.keyboard.press(key);
    await assertSelectedTab(page, expected);
    if (expected === '검수') {
      assert.equal(await dialog.locator('.qualityInspector').isVisible(), true, 'QA content should be reachable');
      assert.equal(await dialog.locator('.qaChecklist').count(), 1, 'QA content should not be duplicated');
    }
  }
}

async function prepareDraft(page, scenario, platform, target) {
  const navigationResponse = await page.goto(target.baseURL, { waitUntil: 'networkidle' });
  assert.ok(navigationResponse?.ok(), `${target.name}: HTTP response must be successful`);
  await page.locator('.workspaceV2').waitFor({ state: 'visible' });
  await assertLayout(page, scenario.layout, scenario.single);
  await page.evaluate(() => { window.__responsiveQaInspector = document.querySelector('.inspectorRail'); });
  await assertDialogState(page, { open: scenario.layout === 'wide', modal: false });
  if (scenario.layout === 'wide') {
    assert.equal(await page.locator('.inspectorRail').evaluate((node) => node.contains(document.activeElement)), false,
      'The persistent inspector must not steal initial focus from the document');
  }
  const health = await page.request.get(`${target.baseURL}/api/health`);
  assert.equal(health.ok(), true, 'Mock server health endpoint must be reachable');
  assert.equal((await health.json()).keyDetected, false, 'Do not run mock regression with a real API key configured');

  const platformSelect = page.locator('select').filter({ has: page.locator('option[value="naver"]') }).first();
  await platformSelect.selectOption(platform);
  await page.locator('textarea[placeholder*="주제를 문장이나 단어로 자유롭게 입력"]').fill('집에서 하는 목 스트레칭과 스마트폰 자세 관리');
  const [response] = await Promise.all([
    page.waitForResponse((result) => new URL(result.url()).pathname === '/api/generate' && result.request().method() === 'POST'),
    page.getByRole('button', { name: /블로그 초안 만들기/ }).click(),
  ]);
  assert.equal(response.ok(), true, `Draft generation failed: ${response.status()}`);
  const result = await response.json();
  assert.equal(result.mode, 'mock', 'Responsive regression must use deterministic mock drafts');
  assert.ok(result.draft?.images?.length >= 2, 'Fixture must include multiple image locations');
  await page.locator('.blogPaper').waitFor({ state: 'visible' });
  await page.locator('.generationOverlay').waitFor({ state: 'hidden' });
  const dismissToast = page.getByRole('button', { name: '완료 알림 닫기' });
  if (await dismissToast.isVisible()) await dismissToast.click();
  await settle(page);
  await assertDialogState(page, { open: scenario.layout === 'wide', modal: false });
  assert.equal(await page.locator('.blogPaper').count(), 1, 'There must be only one preview draft');
  assert.equal(await page.locator('.imageSlot').count(), result.draft.images.length, 'Preview image locations must not be duplicated');
  await assertNoHorizontalOverflow(page, `${platform}/${scenario.name} generated`);
  const titleCopy = page.locator('.headerActions').getByRole('button', { name: /^제목 복사/ });
  await titleCopy.waitFor({ state: 'visible' });
  assert.equal(await titleCopy.evaluate((node) => {
    const range = document.createRange();
    range.selectNodeContents(node);
    return range.getClientRects().length;
  }), 1, 'Title copy label must remain one readable line, not a vertical stack of characters');
  return result.draft;
}

async function editDraft(page, label) {
  await page.getByRole('button', { name: '직접 편집', exact: true }).click();
  const values = {
    title: `반응형 검수 보존 테스트 ${label}`,
    paragraph: `직접 수정한 본문입니다. ${label}에서 이미지·검수를 열고 닫아도 이 문장은 그대로 유지되어야 합니다.`,
    prompt: `직접 수정한 이미지 프롬프트입니다. ${label}. 글자와 로고 없이 표현합니다.`,
  };
  await page.locator('.titleEdit').fill(values.title);
  await page.locator('.paragraphEdit').first().fill(values.paragraph);
  await page.locator('.blogScroller').evaluate((node) => {
    node.scrollTo({ top: Math.min(380, node.scrollHeight - node.clientHeight), behavior: 'instant' });
  });
  await settle(page);
  values.previewScroll = await page.locator('.blogScroller').evaluate((node) => node.scrollTop);
  assert.ok(values.previewScroll > 0, 'Fixture must exercise a nonzero preview scroll position');
  return values;
}

async function assertEditsPreserved(page, values, checkPreviewScroll = true) {
  assert.equal(await page.locator('.titleEdit').inputValue(), values.title, 'Title edit was lost');
  assert.equal(await page.locator('.paragraphEdit').first().inputValue(), values.paragraph, 'Body edit was lost');
  if (checkPreviewScroll) {
    const scroll = await page.locator('.blogScroller').evaluate((node) => node.scrollTop);
    assert.ok(Math.abs(scroll - values.previewScroll) <= 2,
      `Preview scroll changed while opening/closing review: ${values.previewScroll} → ${scroll}`);
  }
}

async function assertInspectorScroll(page, expected) {
  await page.waitForFunction((top) => Math.abs(document.querySelector('.inspectorBody').scrollTop - top) <= 2, expected);
}

async function testCopyActions(page) {
  const feedback = page.locator('[data-copy-result]');
  const evidence = { secureContext: await page.evaluate(() => window.isSecureContext), messages: [] };
  for (const [selector, label] of [
    ['[data-copy-platform]', 'rich'],
    ['[data-copy-plain]', 'plain'],
    ['[data-copy-image-guide]', 'image-guide'],
  ]) {
    const button = page.locator(selector);
    if (!await button.count()) continue;
    await button.click();
    await feedback.waitFor({ state: 'visible' });
    const message = (await feedback.innerText()).trim();
    assert.doesNotMatch(message, /복사하지 못했어요/, `${label} copy failed despite isolated clipboard permission: ${message}`);
    if (label === 'rich') {
      assert.match(message, /이미지 0\/\d+개만 포함됐어요/, 'Rich copy without uploaded assets must report omission');
      assert.doesNotMatch(await button.innerText(), /✓/, 'Missing images must not appear fully copied');
    } else {
      await page.waitForFunction((buttonSelector) => document.querySelector(buttonSelector)?.textContent?.includes('✓'), selector);
    }
    evidence.messages.push({ label, message });
  }
  assert.equal(evidence.messages.length, 3, 'Rich, plain and image-guide copy actions must all be reachable');
  return evidence;
}

async function assertSavedAndReloaded(page, scenario, platform, values, imageCount, name) {
  const storage = page.locator('.draftStorageStatus');
  await page.waitForFunction(() => document.querySelector('.draftStorageStatus')?.getAttribute('data-state') === 'saved');
  const savedMessage = (await storage.innerText()).trim();
  assert.match(savedMessage, /저장됨/, 'Edited draft must reach the browser auto-saved state');
  await screenshot(page, `${name}-saved`);

  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('.workspaceV2').waitFor({ state: 'visible' });
  await page.locator('.blogPaper').waitFor({ state: 'visible' });
  await assertLayout(page, scenario.layout, scenario.single);
  await page.evaluate(() => { window.__responsiveQaInspector = document.querySelector('.inspectorRail'); });
  assert.equal(await page.locator('select').filter({ has: page.locator('option[value="naver"]') }).first().inputValue(), platform,
    'Reload must restore the selected platform');
  assert.equal((await page.locator('.previewTitle').innerText()).trim(), values.title, 'Reload must restore the edited title');
  assert.equal(await page.locator('.imageSlot').count(), imageCount, 'Reload must restore every image slot exactly once');

  await page.getByRole('button', { name: '직접 편집', exact: true }).click();
  await assertEditsPreserved(page, values, false);
  if (scenario.layout === 'compact') await openInspector(page);
  assert.equal(await page.locator('.promptTextarea').first().inputValue(), values.prompt, 'Reload must restore edited image guidance');
  await assertNoHorizontalOverflow(page, `${name} reloaded`);
  await screenshot(page, `${name}-reloaded`);
  return { savedMessage, restoredMessage: (await storage.innerText()).trim() };
}

async function testImageJump(page) {
  const card = page.locator('.inspectorRail .promptCard').last();
  const imageId = (await card.locator('.promptTop strong').innerText()).trim();
  const jump = card.getByRole('button', { name: '본문 위치 보기', exact: true });
  assert.equal(await jump.count(), 1, 'Each image guide needs an action to locate it in the preview');
  await jump.click();
  await assertDialogState(page, { open: false, modal: false });
  await page.waitForFunction((id) => {
    const slot = [...document.querySelectorAll('.imageSlot')].find((node) => node.dataset.imageId === id);
    if (!slot || document.activeElement !== slot) return false;
    const rect = slot.getBoundingClientRect();
    const scroller = document.querySelector('.blogScroller').getBoundingClientRect();
    return rect.bottom > Math.max(0, scroller.top) && rect.top < Math.min(innerHeight, scroller.bottom);
  }, imageId);
  assert.equal(await page.locator('.previewStage').isVisible(), true, 'Jump must reveal the preview on single-panel screens');
}

async function testResize(page, values, imageCount) {
  // Begin with a modal open, retain the same node, edits and focused input through both modes.
  await page.locator('.promptTextarea').first().evaluate((node) => node.focus({ preventScroll: true }));
  await page.setViewportSize({ width: 1440, height: 1100 });
  await assertLayout(page, 'wide', false);
  await assertDialogState(page, { open: true, modal: false });
  await assertEditsPreserved(page, values, false);
  assert.equal(await page.locator('.promptTextarea').first().evaluate((node) => node === document.activeElement), true,
    'Resizing to a persistent rail must preserve focus in the active prompt editor');
  assert.equal(await page.locator('.promptTextarea').first().inputValue(), values.prompt);
  assert.equal(await page.locator('.promptCard').count(), imageCount);
  await page.locator('.titleEdit').evaluate((node) => node.focus({ preventScroll: true }));
  assert.equal(await page.locator('.titleEdit').evaluate((node) => node === document.activeElement), true,
    'Wide inspector must release modal inertness');
  await page.keyboard.press('Escape');
  await assertDialogState(page, { open: true, modal: false });
  await assertNoHorizontalOverflow(page, 'resized-wide');

  await page.setViewportSize({ width: 1024, height: 1100 });
  await assertLayout(page, 'compact', false);
  await assertDialogState(page, { open: false, modal: false });
  await assertEditsPreserved(page, values, false);
  const launcher = await openInspector(page);
  assert.equal(await page.locator('.promptTextarea').first().inputValue(), values.prompt);
  assert.equal(await page.locator('.promptCard').count(), imageCount);
  await closeInspector(page, launcher, 'escape');
  await assertNoHorizontalOverflow(page, 'resized-compact');
}

async function testSettingsSpace(page, values, imageCount) {
  // Keep viewport fixed: removing the settings rail alone must make room for
  // the persistent inspector, proving mode follows usable workspace space.
  assert.equal(page.viewportSize().width, 1024, 'Settings-space regression must run at a fixed tablet width');
  const toggle = page.getByRole('button', { name: '작성 설정 열기 또는 접기', exact: true });
  await toggle.click();
  await assertLayout(page, 'wide', false);
  await assertDialogState(page, { open: true, modal: false });
  assert.equal(await page.locator('.settingsRail').count(), 0, 'Collapsing settings must release its layout space');
  assert.equal(page.viewportSize().width, 1024, 'Viewport must not change when settings collapse');
  await assertEditsPreserved(page, values, false);
  assert.equal(await toggle.evaluate((node) => node === document.activeElement), true,
    'Opening a persistent rail by collapsing settings must keep focus on the settings toggle');
  assert.equal(await page.locator('.promptTextarea').first().inputValue(), values.prompt);
  assert.equal(await page.locator('.promptCard').count(), imageCount);
  await assertNoHorizontalOverflow(page, 'tablet-settings-collapsed');

  await toggle.click();
  await assertLayout(page, 'compact', false);
  await assertDialogState(page, { open: false, modal: false });
  assert.equal(await page.locator('.settingsRail').isVisible(), true, 'Expanding settings must restore the rail');
  assert.equal(page.viewportSize().width, 1024, 'Viewport must not change when settings expand');
  await assertEditsPreserved(page, values, false);
  await assertNoHorizontalOverflow(page, 'tablet-settings-expanded');
}

async function runScenario(page, scenario, platform, target) {
  const name = `${target.name}-${platform}-${scenario.name}`;
  const draft = await prepareDraft(page, scenario, platform, target);
  await screenshot(page, `${name}-${scenario.layout === 'wide' ? 'persistent' : 'closed'}`);
  const copyEvidence = coreFlowOnly ? await testCopyActions(page) : null;

  if (scenario.layout === 'wide') {
    await testTabs(page, draft.images.length);
    await page.keyboard.press('Escape');
    await assertDialogState(page, { open: true, modal: false });
    const values = await editDraft(page, name);
    await page.locator('.promptTextarea').first().fill(values.prompt);
    await assertEditsPreserved(page, values);
    await assertNoHorizontalOverflow(page, `${name} edited`);
    const storageEvidence = coreFlowOnly
      ? await assertSavedAndReloaded(page, scenario, platform, values, draft.images.length, name)
      : null;
    return { copyEvidence, storageEvidence };
  }

  let launcher = await openInspector(page);
  await testTabs(page, draft.images.length);
  await assertNoHorizontalOverflow(page, `${name} modal`);
  await screenshot(page, `${name}-open`);
  await assertModalFocus(page);
  await closeInspector(page, launcher, 'escape');

  const values = await editDraft(page, name);
  launcher = await openInspector(page);
  await assertEditsPreserved(page, values);
  await page.locator('.promptTextarea').first().fill(values.prompt);
  const body = page.locator('.inspectorBody');
  await body.evaluate((node) => {
    node.scrollTo({ top: Math.min(240, node.scrollHeight - node.clientHeight), behavior: 'instant' });
  });
  await settle(page);
  const inspectorScroll = await body.evaluate((node) => node.scrollTop);
  assert.ok(inspectorScroll > 0, 'Fixture must exercise independent inspector scrolling');

  for (const method of ['button', 'escape', 'button']) {
    await closeInspector(page, launcher, method);
    await assertEditsPreserved(page, values);
    launcher = await openInspector(page);
    await assertInspectorScroll(page, inspectorScroll);
    await assertEditsPreserved(page, values);
    assert.equal(await page.locator('.promptTextarea').first().inputValue(), values.prompt, 'Image prompt edit was lost');
    assert.equal(await page.locator('.promptCard').count(), draft.images.length, 'Opening review duplicated image guides');
    await assertControlVisible(page.locator('.inspectorClose'), 'Sticky close button after body scroll');
    await assertControlVisible(page.locator('.inspectorRail').getByRole('tab', { name: '검수', exact: true }), 'Sticky QA tab after body scroll');
  }

  await testImageJump(page);
  await assertEditsPreserved(page, values, false);
  await assertNoHorizontalOverflow(page, `${name} image jump`);
  if (scenario.name === 'tablet') {
    await openInspector(page);
    await testResize(page, values, draft.images.length);
    await testSettingsSpace(page, values, draft.images.length);
  }
  const storageEvidence = coreFlowOnly
    ? await assertSavedAndReloaded(page, scenario, platform, values, draft.images.length, name)
    : null;
  return { copyEvidence, storageEvidence };
}

const results = [];
const browser = await chromium.launch({ headless: true });
try {
  for (const target of targets) {
   for (const platform of coreFlowOnly ? ['naver'] : ['naver', 'wordpress']) {
    for (const scenario of scenarios) {
      const name = `${target.name}-${platform}-${scenario.name}`;
      const context = await browser.newContext({
        viewport: { width: scenario.width, height: scenario.height },
        deviceScaleFactor,
        reducedMotion: 'reduce',
        permissions: coreFlowOnly ? ['clipboard-read', 'clipboard-write'] : [],
        ignoreHTTPSErrors,
      });
      const page = await context.newPage();
      page.setDefaultTimeout(12_000);
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      try {
        const evidence = await runScenario(page, scenario, platform, target);
        assert.deepEqual(errors, [], `${name}: unexpected browser errors`);
        results.push({ name, status: 'passed', viewport: { width: scenario.width, height: scenario.height }, evidence });
        console.log(`PASS responsive inspector: ${name}`);
      } catch (error) {
        results.push({ name, status: 'failed', error: error.stack || String(error), pageErrors: errors });
        console.error(`FAIL responsive inspector: ${name}`, error);
        await screenshot(page, `${name}-failure`).catch((captureError) => console.error('Failure screenshot unavailable:', captureError.message));
      } finally {
        await context.close();
      }
    }
   }
  }
} finally {
  await browser.close();
  fs.writeFileSync(path.join(outputDir, 'responsive-inspector-results.json'), JSON.stringify(results, null, 2));
}

const failed = results.filter((result) => result.status === 'failed');
assert.equal(failed.length, 0, `${failed.length}/${results.length} responsive inspector scenarios failed. See visual-qa-artifacts/responsive-inspector-results.json.`);
console.log(`All ${results.length} responsive inspector scenarios passed.`);
