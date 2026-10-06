import { chromium } from "playwright";
import fs from "node:fs";

const seed = "https://www.blogchart.co.kr/chart/theme_list";
const outDir = "tmp-blogchart-seed";
fs.mkdirSync(outDir,{recursive:true});

const browser = await chromium.launch({headless:true});
const context = await browser.newContext({
  viewport:{width:1440,height:1100},
  locale:"ko-KR",
  userAgent:"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36"
});
const page=await context.newPage();
await page.goto(seed,{waitUntil:"domcontentloaded",timeout:30000});
await page.waitForTimeout(1500);

const themeLinks=await page.evaluate(()=>{
  const clean=s=>(s||"").replace(/\s+/g," ").trim();
  const links=[...document.querySelectorAll('a[href*="/chart/theme_list"]')].map(a=>({
    label:clean(a.textContent),
    href:a.href
  })).filter(x=>x.label && x.href.includes("theme="));
  const seen=new Set();
  return links.filter(x=>{const k=x.label+"|"+x.href;if(seen.has(k))return false;seen.add(k);return true;});
});
console.log("THEMES",themeLinks.length,JSON.stringify(themeLinks));

const themes=[];
for (const item of themeLinks.slice(0,40)) {
  try {
    await page.goto(item.href,{waitUntil:"domcontentloaded",timeout:30000});
    await page.waitForTimeout(500);
    const data=await page.evaluate((label)=>{
      const clean=s=>(s||"").replace(/\s+/g," ").trim();
      const anchors=[...document.querySelectorAll('a[href*="blog.naver.com"]')];
      const blogs=[];
      const seen=new Set();
      for (const a of anchors) {
        let href=a.href;
        const m=href.match(/https?:\/\/blog\.naver\.com\/([A-Za-z0-9_.-]+)/i);
        if(!m) continue;
        const url=`https://blog.naver.com/${m[1]}`;
        if(seen.has(url)) continue;
        seen.add(url);
        const row=a.closest("tr") || a.parentElement?.parentElement;
        const text=clean(row?.textContent);
        blogs.push({rank:blogs.length+1,url,name:clean(a.textContent)||m[1],rowText:text.slice(0,500)});
        if(blogs.length>=10) break;
      }
      return {label,title:document.title,blogs};
    },item.label);
    if(data.blogs.length>=5) themes.push({...item,...data});
    console.log("THEME",item.label,data.blogs.length);
  } catch (e) {
    console.log("THEME_FAIL",item.label,String(e).slice(0,250));
  }
}
fs.writeFileSync(`${outDir}/blogchart-top10.json`,JSON.stringify({
  capturedAt:new Date().toISOString(),
  source:seed,
  themes
},null,2));
console.log("RESULT",JSON.stringify(themes.map(t=>({label:t.label,count:t.blogs.length}))));
await browser.close();
