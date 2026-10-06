import { chromium } from "playwright";
import fs from "node:fs";

const url = "https://blog.naver.com/PostView.nhn?blogId=roooad&logNo=224167447687&redirect=Dlog&widgetTypeCall=true";
const outDir = "tmp-naver-blog-test";
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1280, height: 1400 },
  locale: "ko-KR",
  userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36",
});
const page = await context.newPage();
page.on("console", (msg) => {
  if (msg.type() === "error") console.log("PAGE_CONSOLE_ERROR", msg.text().slice(0, 400));
});
page.on("pageerror", (err) => console.log("PAGE_ERROR", err.message.slice(0, 400)));

const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForTimeout(3000);
console.log("NAV_STATUS", response?.status(), "FINAL_URL", page.url(), "TITLE", await page.title());

const frames = [];
for (const [index, frame] of page.frames().entries()) {
  try {
    const data = await frame.evaluate(() => {
      const clean = (s) => (s || "").replace(/\s+/g, " ").trim();
      const text = clean(document.body?.innerText || "");
      const headings = [...document.querySelectorAll("h1,h2,h3,h4")]
        .map((el) => clean(el.textContent))
        .filter(Boolean)
        .slice(0, 40);
      const blocks = [...document.querySelectorAll("p,blockquote,li,figcaption")]
        .map((el) => {
          const r = el.getBoundingClientRect();
          const s = getComputedStyle(el);
          return {
            text: clean(el.textContent).slice(0, 600),
            top: Math.round(r.top + scrollY),
            width: Math.round(r.width),
            height: Math.round(r.height),
            align: s.textAlign,
            fontSize: s.fontSize,
            fontWeight: s.fontWeight,
            marginTop: s.marginTop,
            marginBottom: s.marginBottom,
          };
        })
        .filter((x) => x.text)
        .slice(0, 220);
      const images = [...document.images]
        .map((img) => {
          const r = img.getBoundingClientRect();
          return {
            alt: clean(img.alt).slice(0, 200),
            src: (img.currentSrc || img.src || "").slice(0, 500),
            top: Math.round(r.top + scrollY),
            width: Math.round(r.width),
            height: Math.round(r.height),
          };
        })
        .filter((x) => x.width > 8 && x.height > 8)
        .slice(0, 160);
      return {
        url: location.href,
        title: document.title,
        textLength: text.length,
        textPreview: text.slice(0, 20000),
        headings,
        blocks,
        images,
        bodyHeight: document.body?.scrollHeight || 0,
      };
    });
    frames.push({ index, ...data });
  } catch (err) {
    frames.push({ index, url: frame.url(), error: String(err) });
  }
}
frames.sort((a,b)=>(b.textLength||0)+(b.images?.length||0)*120-((a.textLength||0)+(a.images?.length||0)*120));
console.log("FRAME_SUMMARY", JSON.stringify(frames.map(f => ({
  index:f.index,url:f.url,title:f.title,textLength:f.textLength||0,images:f.images?.length||0,headings:f.headings?.slice(0,8)||[],error:f.error
})), null, 2));

const richest = frames[0];
fs.writeFileSync(`${outDir}/evidence.json`, JSON.stringify({ requested:url, finalUrl:page.url(), richest, frames }, null, 2));
await page.screenshot({ path: `${outDir}/page.jpg`, fullPage: true, type: "jpeg", quality: 58 });

if (!richest || (richest.textLength || 0) < 1000) {
  console.error("RESULT BLOCKED_OR_TOO_LITTLE_TEXT", richest?.textLength || 0);
  process.exitCode = 2;
} else {
  console.log("RESULT RENDER_CAPTURE_PASS", "textLength", richest.textLength, "images", richest.images?.length || 0);
  console.log("TEXT_PREVIEW_START");
  console.log((richest.textPreview || "").slice(0, 7000));
  console.log("TEXT_PREVIEW_END");
}
await browser.close();
