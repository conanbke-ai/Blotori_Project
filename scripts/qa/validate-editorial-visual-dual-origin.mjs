// Assert that section visual styles render on both Origins with no paid API.
// Read-only output check with isolated, intercepted mock generation.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const targets=[['localhost',process.env.BLOTORI_LOCAL_URL],['network',process.env.BLOTORI_NETWORK_URL]];
if(targets.some(([,url])=>!url))throw Error('Set BLOTORI_LOCAL_URL and BLOTORI_NETWORK_URL');
const browser=await chromium.launch({headless:true});
const results=[];
const draft={
  title:'검증용 블로그 글',titleCandidates:['검증용 블로그 글'],summary:'렌더링 QA',
  intro:['검증용 도입 문단입니다.'],sections:[
    {id:'sec-1',heading:'한눈에 정리',paragraphs:['확인된 정보를 짧게 정리합니다.'],presentation:{visualStyle:'key-point',headingAlign:'left',bodyAlign:'left',emphasis:[{phrase:'확인된 정보',kind:'bold'}]}},
    {id:'sec-2',heading:'참고할 조건',paragraphs:['불확실한 값은 확인이 필요합니다.'],presentation:{visualStyle:'callout'}},
    {id:'sec-3',heading:'한 줄 메모',paragraphs:['짧은 인용과 해석을 구분합니다.'],presentation:{visualStyle:'quote'}}
  ],closing:['마무리 문단입니다.'],tags:['QA'],images:[],warnings:[]
};
try {
  for(const [name,url] of targets){
    const context=await browser.newContext({viewport:{width:1440,height:900},serviceWorkers:'block'});
    let requests=0;
    try{
      await context.route('**/api/generate',route=>{
        requests++;
        return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({draft,mode:'mock',requestId:'visual-qa'})});
      });
      await context.route('**/api/health**',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,keyDetected:true,verified:false,message:'QA'})}));
      const page=await context.newPage();
      const res=await page.goto(url,{waitUntil:'domcontentloaded'});
      assert.equal(res?.status(),200);
      await page.locator('.draftStorageStatus[data-state="ready"]').waitFor();
      await page.locator('.settingsRail select').filter({has:page.locator('option[value="naver"]')}).first().selectOption('naver');
      await page.locator('.settingsRail textarea[placeholder*="주제"]').first().fill('디자인 QA');
      const btn=page.locator('.settingsRail .generatePrimary');
      await page.waitForFunction(()=>!!document.querySelector('.settingsRail .generatePrimary') && !document.querySelector('.settingsRail .generatePrimary').disabled);
      await btn.click();
      await page.locator('.articleSection.visual-quote').waitFor();
      const visuals=await page.locator('.articleSection').evaluateAll(nodes=>nodes.map(node=>({
        className:node.className,background:getComputedStyle(node).backgroundColor,
        border:getComputedStyle(node).borderLeftWidth,width:node.getBoundingClientRect().width,
        sectionText:node.querySelector('h3')?.textContent
      })));
      for(const type of ['key-point','callout','quote']){
        const item=visuals.find(v=>v.className.includes('visual-'+type));
        assert.ok(item,'missing visual '+type);
        assert.ok(item.width>150,'collapsed visual '+type);
      }
      assert.equal(requests,1);
      results.push({origin:name,status:'PASS',visuals:visuals.map(({className,width})=>({className,width})),paidCalls:0});
    }catch(e){results.push({origin:name,status:'FAIL',reason:String(e).slice(0,480)});}
    finally{await context.close();}
  }
}finally{await browser.close();}
for(const result of results)console.log('EDITORIAL_VISUAL_QA',JSON.stringify(result));
if(results.some(r=>r.status!=='PASS'))process.exitCode=1;
else console.log('EDITORIAL_VISUAL_QA PASS 2/2 — mock, isolated, no paid API');
