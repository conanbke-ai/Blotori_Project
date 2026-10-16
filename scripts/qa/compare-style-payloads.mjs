// Zero-cost controlled comparison of STYLE REQUESTS (not AI writing quality).
// Both Localhost and Network, isolated browsers, intercepted POST /api/generate.
// BLOTORI_LOCAL_URL=https://localhost:3001 BLOTORI_NETWORK_URL=https://172.30.1.21:3001 node scripts/qa/compare-style-payloads.mjs
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const targets = [['localhost',process.env.BLOTORI_LOCAL_URL],['network',process.env.BLOTORI_NETWORK_URL]];
if (targets.some(([,url]) => !url)) { console.error('BLOCKED: two Origin URLs required'); process.exit(2); }
if (new URL(targets[0][1]).origin === new URL(targets[1][1]).origin) throw new Error('Two distinct Origins required');
const results = [];
const browser = await chromium.launch({headless:true});
try {
  for (const [name,url] of targets) {
    const context = await browser.newContext({viewport:{width:1440,height:900},serviceWorkers:'block'});
    const captured = [];
    try {
      await context.route('**/api/health**',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,keyDetected:true,verified:false,message:'Offline QA'})}));
      await context.route('**/api/generate',route=>{
        if (route.request().method()==='POST') captured.push(route.request().postDataJSON());
        return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Offline audit: no paid request was sent'})});
      });
      const page = await context.newPage();
      const response = await page.goto(url,{waitUntil:'domcontentloaded',timeout:20000});
      assert.equal(response?.status(),200);
      await page.locator('.draftStorageStatus[data-state="ready"]').waitFor({timeout:15000});
      const platform = page.locator('.settingsRail select').filter({has:page.locator('option[value="naver"]')}).first();
      const category = page.locator('.settingsRail select').filter({has:page.locator('option[value="naver"]')}).locator('xpath=following::select[1]');
      await platform.selectOption('naver');
      const categoryValues = await category.locator('option').evaluateAll(options=>options.map(x=>x.value).filter(Boolean));
      assert.ok(categoryValues.length);
      await category.selectOption(categoryValues[0]);
      const style = page.locator('.unifiedWritingGroup select').filter({has:page.locator('option[value^="category:"]')}).first();
      const options = await style.locator('option[value^="category:"]').evaluateAll(list=>list.map(x=>x.value));
      assert.ok(options.length,'category DNA preset missing');
      const intensity = page.locator('.unifiedWritingGroup label.field').filter({hasText:'문체 강도'}).locator('select');
      const topic = page.locator('.settingsRail textarea[placeholder*="주제"]').first();
      await topic.fill('QA: 동일한 근거의 음식점 정보 안내. 미확인 방문 사실과 가격을 만들지 말 것.');
      const generate = page.locator('.settingsRail .generatePrimary');
      async function capture(tag, level, preset) {
        if (preset) await style.selectOption(options[0]);
        else await style.selectOption('builtin:custom');
        await intensity.selectOption(String(level));
        await page.waitForFunction(() => {
          const b=document.querySelector('.settingsRail .generatePrimary');
          return !!b && !b.disabled;
        },null,{timeout:10000});
        const n=captured.length;
        await generate.click();
        await page.waitForFunction(previous=>!!document.querySelector('.settingsRail .errorBox') && previous === 0 || !!document.querySelector('.settingsRail .errorBox'),null,{timeout:10000});
        await page.waitForTimeout(80);
        assert.equal(captured.length,n+1,tag+' must submit exactly once');
        return captured.at(-1);
      }
      // Use the same category DNA, topic and form for intensity comparison.
      const low = await capture('dna-1',1,true);
      const mid = await capture('dna-3',3,true);
      const high = await capture('dna-5',5,true);
      const noDna = await capture('no-dna',5,false);
      for (const [label,payload,level] of [['low',low,1],['mid',mid,3],['high',high,5]]) {
        assert.equal(payload.styleIntensity,level,label);
        assert.ok(payload.blogDNA?.voice?.summary,label+' DNA missing');
        assert.equal(payload.blogDNAApply?.visual,true);
      }
      assert.equal(noDna.blogDNA,undefined,'Control unexpectedly includes category DNA');
      assert.equal(low.freeTopic,high.freeTopic,'Input topic drift');
      assert.equal(low.platformId,high.platformId);
      assert.notEqual(low.styleIntensity,high.styleIntensity);
      const safe = {origin:name,status:'PASS',requests:captured.length,
        intensity:[low.styleIntensity,mid.styleIntensity,high.styleIntensity],
        dnaPresent:[!!low.blogDNA,!!mid.blogDNA,!!high.blogDNA,!!noDna.blogDNA],
        fixedTopic:low.freeTopic===mid.freeTopic && mid.freeTopic===high.freeTopic,
        conclusion:'REQUEST_WIRING_ONLY: writing quality is not evaluated'};
      results.push(safe);
    } catch(e) {
      results.push({origin:name,status:'FAIL',reason:String(e).slice(0,500)});
    } finally {await context.close();}
  }
} finally {await browser.close();}
const out=path.resolve('artifacts/style-comparison/request-comparison.json');
fs.mkdirSync(path.dirname(out),{recursive:true});
fs.writeFileSync(out,JSON.stringify({results},null,2)+'\n');
for(const result of results) console.log('STYLE_REQUEST_COMPARISON',JSON.stringify(result));
if(results.some(r=>r.status!=='PASS'))process.exitCode=1;
else console.log('STYLE_REQUEST_COMPARISON PASS 2/2 (zero paid calls, not real AI quality)');
