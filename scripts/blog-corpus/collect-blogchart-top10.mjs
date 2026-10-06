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
      const cells = [...tr.querySelectorAll("td")].map((td) => clean(td.textContent));
      const rowText = clean(tr.textContent);
      const rankText = cells.find((value) => /^\d{1,2}$/.test(value)) || rowText.match(/^\d{1,2}/)?.[0] || "";
      const rank = Number(rankText);
      if (!Number.isFinite(rank) || rank < 1 || rank > 10) continue;

      const anchors = [...tr.querySelectorAll("a[href]")].map((a) => ({
        href: a.href || "",
        text: clean(a.textContent),
      }));
      const external = anchors.find((a) => {
        try {
          const u = new URL(a.href);
          return /^https?:$/.test(u.protocol) && !/^(www\.)?blogchart\.co\.kr$/i.test(u.hostname);
        } catch {
          return false;
        }
      });
      const urlText = cells.find((value) => /(?:https?:\/\/)?(?:[A-Za-z0-9-]+\.)+[A-Za-z]{2,}/.test(value))
        || rowText.match(/(?:https?:\/\/)?(?:[A-Za-z0-9-]+\.)+[A-Za-z]{2,}(?:\/[^\s]*)?/)?.[0]
        || "";
      let url = external?.href || urlText;
      if (url && !/^https?:\/\//i.test(url)) url = "https://" + url;
      if (!url) continue;

      let hostname = "";
      let platform = "other";
      let blogId = null;
      try {
        const u = new URL(url);
        hostname = u.hostname.replace(/^www\./, "");
        if (/blog\.naver\.com$/i.test(hostname)) {
          platform = "naver";
          blogId = u.pathname.split("/").filter(Boolean)[0] || null;
          if (blogId) url = `https://blog.naver.com/${blogId}`;
        } else if (/tistory\.com$/i.test(hostname)) {
          platform = "tistory";
        } else if (/blog\.daum\.net$/i.test(hostname)) {
          platform = "daum";
        } else if (/brunch\.co\.kr$/i.test(hostname) || /brunch\.co\.kr$/i.test(hostname)) {
          platform = "brunch";
        }
      } catch {}

      const nameGuess = external?.text
        || cells.find((value) => value && !/^\d/.test(value) && value !== urlText)
        || hostname;
      out.push({
        rank,
        platform,
        blogId,
        hostname,
        url,
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
