import { chromium } from "playwright";
const url="https://blog.aladin.co.kr/714960143";
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1280,height:1200},locale:"ko-KR",userAgent:"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36"});
const page=await context.newPage();
const res=await page.goto(url,{waitUntil:"domcontentloaded",timeout:30000});
await page.waitForTimeout(1000);
const data=await page.evaluate(()=>{
 const clean=s=>(s||"").replace(/\s+/g," ").trim();
 return {
  statusText:document.title,
  textLength:clean(document.body?.innerText).length,
  links:[...document.querySelectorAll("a[href]")].map(a=>({text:clean(a.textContent),href:a.href})).filter(x=>/714960143|category|CommunityType|page=|MyPaper/i.test(x.href+" "+x.text)).slice(0,300),
  body:clean(document.body?.innerText).slice(0,3000)
 };
});
console.log("ALADIN_BROWSER",res?.status(),page.url(),JSON.stringify(data));
await browser.close();
