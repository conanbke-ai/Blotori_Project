import { chromium } from "playwright";

const url = process.env.BLOGCHART_URL || "https://www.blogchart.co.kr/chart/theme_list?page=&week=&theme=diet";
const browser = await chromium.launch({headless:true});
const page = await browser.newPage({viewport:{width:1440,height:1400}, locale:"ko-KR"});
await page.goto(url,{waitUntil:"domcontentloaded",timeout:30000});
await page.waitForTimeout(1500);

const data=await page.evaluate(()=>{
  const clean=s=>(s||"").replace(/\s+/g," ").trim();
  const selects=[...document.querySelectorAll("select")].map(s=>({
    name:s.getAttribute("name"), id:s.id,
    options:[...s.options].map(o=>({text:clean(o.textContent),value:o.value,selected:o.selected}))
  }));
  const forms=[...document.forms].map(f=>({
    action:f.action,method:f.method,
    inputs:[...f.querySelectorAll("input,select")].map(el=>({
      tag:el.tagName.toLowerCase(),name:el.getAttribute("name"),value:el.value,
      type:el.getAttribute("type")
    }))
  }));
  const anchors=[...document.querySelectorAll("a[href]")].map(a=>({text:clean(a.textContent),href:a.href,onclick:a.getAttribute("onclick")})).filter(x=>x.text||x.onclick);
  const buttons=[...document.querySelectorAll("button,[role=button]")].map(b=>({text:clean(b.textContent),onclick:b.getAttribute("onclick"),data:[...b.attributes].filter(a=>a.name.startsWith("data-")).map(a=>[a.name,a.value])}));
  const rows=[...document.querySelectorAll("tr")].map(tr=>clean(tr.textContent)).filter(Boolean).slice(0,30);
  return {
    title:document.title,
    url:location.href,
    selects, forms,
    anchors:anchors.filter(a=>/IT리뷰|건강\/의학|게임|결혼정보|국내여행|낚시|도서정보|마케팅|부동산정보|뷰티|스포츠|반려동물|육아|음식정보|인테리어정보|자동차리뷰|재테크정보|취업정보|캠핑|패션\/스타일|해외여행|스타\/방송인|디자인\/편집|등산|음악|만화\/애니|방송\/연예|교육\/학문|사진|다이어트|영화/.test(a.text)),
    buttons:buttons.filter(a=>a.text),
    rows,
    bodyText:clean(document.body?.innerText).slice(0,10000)
  };
});
console.log(JSON.stringify(data,null,2));
await browser.close();
