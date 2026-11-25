import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const [projectDirectory, appUrl] = process.argv.slice(2);
assert.ok(projectDirectory && appUrl, "Usage: node validate-generation-single-flight-browser.mjs <product-directory> <loopback-url>");
const app = new URL(appUrl);
assert.ok(
  ["http:", "https:"].includes(app.protocol) && ["localhost", "127.0.0.1", "[::1]"].includes(app.hostname)
    && !app.username && !app.password && app.pathname === "/" && !app.search && !app.hash,
  "Use an isolated signed-out loopback app started with mock generation and no Provider key.",
);
const requireProject = createRequire(resolve(projectDirectory, "package.json"));
const { chromium } = requireProject("playwright");
const topicText = "생성 중복 검증용 합성 주제";
const editedSummary = "브라우저에서 직접 편집한 초안 요약입니다.";
const failure = {
  error: "격리 테스트가 만든 생성 실패입니다.",
  code: "UPSTREAM_TIMEOUT",
  requestId: "single-flight-synthetic-error",
};

function readWorkspace(page) {
  return page.evaluate(() => new Promise((resolveSnapshot, reject) => {
    const open = indexedDB.open("blotori-draft-workspace", 1);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const database = open.result;
      const tx = database.transaction(["meta", "workspaces"], "readonly");
      const active = tx.objectStore("meta").get("activeWorkspace");
      let snapshot;
      tx.onerror = () => reject(tx.error);
      tx.oncomplete = () => {
        database.close();
        resolveSnapshot(snapshot);
      };
      active.onsuccess = () => {
        const pointer = active.result;
        if (!pointer) return;
        const workspace = tx.objectStore("workspaces").get(pointer.draftId);
        workspace.onsuccess = () => { snapshot = { pointer, workspace: workspace.result }; };
      };
    };
  }));
}

function waitForGeneration(page) {
  return page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.origin === app.origin && url.pathname === "/api/generate" && response.request().method() === "POST";
  });
}

async function expectMock(response) {
  assert.equal(response.status(), 200, "Start the isolated server with BLOTORI_MOCK_MODE=true and no OpenAI key.");
  const result = await response.json();
  assert.equal(result.mode, "mock");
  assert.ok(result.draft?.title);
  assert.ok(result.requestId);
  assert.equal(response.headers()["x-blotori-request-id"], result.requestId);
  return result;
}

const browser = await chromium.launch();
const releaseFirst = Promise.withResolvers();
let context;
try {
  context = await browser.newContext({
    ignoreHTTPSErrors: true,
    serviceWorkers: "block",
    viewport: { width: 1440, height: 985 },
  });
  const health = await context.request.get(new URL("/api/health", app).href, { maxRedirects: 0, maxRetries: 0 });
  assert.equal(health.status(), 200);
  assert.equal((await health.json()).keyDetected, false, "Disable all Provider keys before running this fixture.");

  const posts = [];
  const forwarded = [];
  const blocked = [];
  let injectFailure = false;
  await context.route("**/*", async (route) => {
    const request = route.request();
    const requestUrl = new URL(request.url());
    if (requestUrl.origin !== app.origin || requestUrl.pathname === "/api/health" && requestUrl.searchParams.get("verify") === "1") {
      blocked.push(requestUrl.origin);
      await route.abort("blockedbyclient");
      return;
    }
    if (requestUrl.pathname !== "/api/generate" || request.method() !== "POST") {
      await route.continue();
      return;
    }
    const number = posts.push(request.postDataJSON());
    if (injectFailure) {
      await route.fulfill({ status: 502, json: failure, headers: { "x-blotori-request-id": failure.requestId } });
      return;
    }
    forwarded.push(number);
    const response = await route.fetch({ maxRedirects: 0, maxRetries: 0, timeout: 15_000 });
    if (number === 1) await releaseFirst.promise;
    await route.fulfill({ response });
  });

  // Count fetch dispatches synchronously in the page, before the held response can
  // change React's rendered button. Also count the real POSTs seen by Playwright.
  await context.addInitScript(() => {
    const originalFetch = window.fetch.bind(window);
    window.generationFixtureDispatchCount = 0;
    window.fetch = (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input), window.location.href);
      const method = init?.method ?? (input instanceof Request ? input.method : "GET");
      if (url.origin === window.location.origin && url.pathname === "/api/generate" && method.toUpperCase() === "POST") {
        window.generationFixtureDispatchCount += 1;
      }
      return originalFetch(input, init);
    };
  });

  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  await page.goto(app.href, { waitUntil: "domcontentloaded" });
  const storage = page.locator(".draftStorageStatus");
  await storage.and(page.locator('[data-state="ready"]')).waitFor();
  await page.getByLabel("게시 플랫폼 *").selectOption("wordpress");
  await page.getByLabel("자유 주제·추가 설명").fill(topicText);
  const generate = page.locator(".settingsRail .generatePrimary");
  assert.equal(await generate.isEnabled(), true);

  const sameTaskDispatches = await generate.evaluate((button) => {
    const before = window.generationFixtureDispatchCount;
    for (let count = 0; count < 2; count += 1) {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    }
    return window.generationFixtureDispatchCount - before;
  });
  assert.equal(sameTaskDispatches, 1, "Same-task clicks must dispatch exactly one POST while a response is pending.");
  await generate.and(page.locator(":disabled")).waitFor();
  const duringPending = await generate.evaluate((button) => {
    const before = window.generationFixtureDispatchCount;
    button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    return window.generationFixtureDispatchCount - before;
  });
  assert.equal(duringPending, 0, "The in-flight button must reject a later click.");
  const pending = waitForGeneration(page);
  releaseFirst.resolve();
  const first = await expectMock(await pending);
  await generate.and(page.locator(":enabled")).waitFor();
  assert.equal(posts.length, 1);

  const [secondResponse] = await Promise.all([waitForGeneration(page), generate.click()]);
  const second = await expectMock(secondResponse);
  assert.notEqual(second.requestId, first.requestId, "An intentional new generation receives a new request ID.");
  assert.deepEqual(posts[1], posts[0], "The same input remains eligible for an intentional second generation.");
  assert.deepEqual(forwarded, [1, 2], "Exactly two POSTs reached the real mock adapter route.");
  await generate.and(page.locator(":enabled")).waitFor();
  await page.locator(".blogPaper .previewTitle").getByText(second.draft.title, { exact: true }).waitFor();

  await page.getByRole("button", { name: "직접 편집", exact: true }).click();
  const summary = page.locator(".blogPaper .summaryEdit");
  await summary.fill(editedSummary);
  await storage.and(page.locator('[data-state="saved"]')).waitFor();
  const before = await readWorkspace(page);
  assert.equal(before?.workspace?.draft.summary, editedSummary);

  injectFailure = true;
  const [failed] = await Promise.all([waitForGeneration(page), generate.click()]);
  assert.equal(failed.status(), 502);
  await page.getByRole("alert").filter({ hasText: "시간이 초과돼 생성 결과를 확인하지 못했어요." }).waitFor();
  assert.equal(await summary.inputValue(), editedSummary);
  assert.deepEqual(await readWorkspace(page), before, "Failure must leave the saved draft and active pointer exactly intact.");
  await generate.and(page.locator(":enabled")).waitFor();
  assert.equal(posts.length, 3, "Failure must not automatically start generation again.");

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator(".blogPaper .summary").getByText(editedSummary, { exact: true }).waitFor();
  const restored = await readWorkspace(page);
  assert.deepEqual(restored.pointer, before.pointer);
  assert.deepEqual(restored.workspace.draft, before.workspace.draft);
  assert.equal(restored.workspace.id, before.workspace.id);
  assert.equal(posts.length, 3, "Restoring the editor must not start generation again.");

  console.log(JSON.stringify({
    result: "BLOTORI_GENERATION_SINGLE_FLIGHT_BROWSER_PASS",
    sameTaskDispatches,
    duringPending,
    browserPosts: posts.length,
    realMockRoutePosts: forwarded.length,
    syntheticErrors: posts.length - forwarded.length,
    blockedRequests: blocked.length,
    existingDraftPreserved: true,
    manualEditRestored: true,
    automaticReplays: 0,
  }));
} finally {
  releaseFirst.resolve();
  await context?.unrouteAll({ behavior: "ignoreErrors" });
  await browser.close();
}
