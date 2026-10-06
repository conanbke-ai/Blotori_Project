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
    return [...document.querySelectorAll("tr")]
      .map((tr) => {
        const text = clean(tr.textContent);
        const match = text.match(/^(\d{1,2})\s+(?:\d+\s+)?blog\.naver\.com\/([A-Za-z0-9_.-]+)\s+(.+?)\s+(?:(?:[가-힣A-Za-z]+\|?)+\s+)?([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+MAX$/);
        if (!match) return null;
        const [, rank, blogId, tail] = match;
        return {
          rank: Number(rank),
          blogId,
          url: `https://blog.naver.com/${blogId}`,
          rowText: text,
          nameGuess: tail.slice(0, 120),
        };
      })
      .filter(Boolean)
      .filter((row) => row.rank >= 1 && row.rank <= 10)
      .slice(0, 10);
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
