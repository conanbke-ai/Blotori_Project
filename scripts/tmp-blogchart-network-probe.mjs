import { chromium } from "playwright";

const url="https://www.blogchart.co.kr/chart/theme_list?page=&week=&theme=diet";
const browser=await chromium.launch({headless:true});
const ctx=await browser.newContext({
  viewport:{width:1440,height:1100},
  locale:"ko-KR",
  userAgent:"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36"
});
const page=await ctx.newPage();
const seen=[];
page.on("request",req=>{
  const t=req.resourceType();
  const u=req.url();
  if(["xhr","fetch","document","script"].includes(t)) seen.push({type:t,method:req.method(),url:u,postData:req.postData()?.slice(0,1200)});
});
page.on("response",async res=>{
  const req=res.request();
  const t=req.resourceType();
  if(["xhr","fetch"].includes(t)){
    let body="";
    try{body=(await res.text()).slice(0,4000)}catch{}
    console.log("XHR_RESPONSE",JSON.stringify({status:res.status(),type:t,url:res.url(),body}));
  }
});
const res=await page.goto(url,{waitUntil:"networkidle",timeout:30000});
console.log("PAGE_STATUS",res?.status(),"TITLE",await page.title());
console.log("REQUESTS",JSON.stringify(seen,null,2));
console.log("HTML_SNIP",(await page.content()).slice(0,30000));
await browser.close();
