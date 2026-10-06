import { chromium } from "playwright";
import fs from "node:fs";

const ROOT = "https://www.blogchart.co.kr/chart/theme_list";
const OUT = "tmp-blog-corpus/blogchart-top10-v1.json";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1200 }, locale: "ko-KR" });

await page.goto(ROOT + "?theme=diet", { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForTimeout(600);

const themes = await page.evaluate(() => {
  const clean = (s) => (s || "").replace(/\s+/g, " ").trim();
  return [...document.querySelectorAll('a[onclick^="goCate"]')]
    .map((a) => {
      const onclick = a.getAttribute("onclick") || "";
      const code = onclick.match(/goCate\(["']([^"']+)/)?.[1] || "";
      return { label: clean(a.textContent), code };
    })
    .filter((x) => x.label && x.code);
});

const snapshots = [];
for (const theme of themes) {
  const url = `${ROOT}?page=&week=&theme=${encodeURIComponent(theme.code)}`;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(250);
  const rows = await page.evaluate(() => {
    const clean = (s) => (s || "").replace(/\s+/g, " ").trim();
    const out = [];
    for (const tr of document.querySelectorAll("tr")) {
      const link = tr.querySelector('a[href*="blog.naver.com"]');
      if (!link) continue;
      const href = link.href || "";
      const match = href.match(/blog\.naver\.com\/([A-Za-z0-9_.-]+)/i);
      if (!match) continue;
      const cells = [...tr.querySelectorAll("td")].map((td) => clean(td.textContent));
      const rowText = clean(tr.textContent);
      const rankText = cells.find((value) => /^\d{1,2}$/.test(value)) || rowText.match(/^\d{1,2}/)?.[0] || "";
      const rank = Number(rankText);
      if (!Number.isFinite(rank) || rank < 1 || rank > 10) continue;
      const blogId = match[1];
      const nameGuess = clean(link.textContent) || cells.find((value) => value && !/^\d/.test(value) && !value.includes("blog.naver.com")) || blogId;
      out.push({
        rank,
        blogId,
        url: `https://blog.naver.com/${blogId}`,
        rowText,
        nameGuess: nameGuess.slice(0, 120),
      });
    }
    return out.sort((a,b)=>a.rank-b.rank).slice(0,10);
  });
  console.log("THEME_RESULT", theme.code, theme.label, rows.length);
  snapshots.push({ ...theme, url, blogs: rows });
}

fs.mkdirSync("tmp-blog-corpus", { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({
  version: 1,
  source: "BlogChart theme chart",
  capturedAt: new Date().toISOString(),
  themes: snapshots,
}, null, 2));
console.log("SUMMARY", JSON.stringify(snapshots.map((t) => ({ code: t.code, label: t.label, count: t.blogs.length }))));
await browser.close();
