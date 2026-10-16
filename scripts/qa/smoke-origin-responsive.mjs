// Origin-specific, zero-cost UI/function smoke. No generate POST and no paid APIs.
// Usage: BLOTORI_LOCAL_URL=http://127.0.0.1:3001 BLOTORI_NETWORK_URL=http://LAN_IP:3001 node scripts/qa/smoke-origin-responsive.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const local = process.env.BLOTORI_LOCAL_URL;
const network = process.env.BLOTORI_NETWORK_URL;
if (!local || !network) {
  console.error('BLOCKED: specify both BLOTORI_LOCAL_URL and BLOTORI_NETWORK_URL. No default ports/IPs.');
  process.exit(2);
}
const out = path.resolve(process.env.BLOTORI_QA_OUTPUT_DIR || 'artifacts/origin-smoke');
fs.mkdirSync(out, { recursive: true });
const viewports = [{name:'mobile',width:390,height:844},{name:'tablet',width:768,height:1024},{name:'desktop',width:1440,height:900}];
const browser = await chromium.launch({headless:true});
const results = [];
try {
  for (const [originName, origin] of [['localhost',local],['network',network]]) {
    for (const viewport of viewports) {
      const context = await browser.newContext({viewport:{width:viewport.width,height:viewport.height}, deviceScaleFactor:1, serviceWorkers:'block'});
      await context.route('**/api/generate', route => route.abort('blockedbyclient'));
      const page = await context.newPage();
      const problems = [];
      const responseFailures = [];
      page.on('pageerror', error => problems.push('PAGE_ERROR '+error.message.slice(0,200)));
      page.on('response', response => {
        if (response.status() >= 400 && /\.(?:css|js|png|webp)(?:\?|$)|\/_next\//.test(response.url())) {
          responseFailures.push(response.status()+' '+response.url().slice(0,180));
        }
      });
      page.on('requestfailed', request => responseFailures.push('REQUEST_FAILED '+request.url().slice(0,180)));
      page.on('request', request => {
        if (request.method()==='POST' && new URL(request.url()).pathname==='/api/generate') {
          problems.push('FORBIDDEN_GENERATION_REQUEST_BLOCKED');
        }
      });
      let status = 'FAIL';
      try {
        const response = await page.goto(origin, {waitUntil:'domcontentloaded',timeout:15000});
        if (!response || response.status()!==200) throw Error('HTTP '+(response?.status()??'none'));
        await page.locator('.workspaceV2').waitFor({timeout:7000});
        await page.locator('.workspaceHeader .blotoriBrandMark img').waitFor({timeout:7000});
        await page.waitForFunction(width => {
          const root=document.querySelector('.workspaceV2');
          if (!root) return false;
          return width<=768
            ? root.classList.contains('workspaceSingle') && root.dataset.reviewLayout==='compact'
            : !root.classList.contains('workspaceSingle') && root.dataset.reviewLayout==='wide';
        }, viewport.width, {timeout:7000});
        await page.evaluate(()=>document.fonts.ready);
        const info = await page.evaluate(()=>{
          const selectors=['.workspaceV2','.workspaceGridV2','.settingsRail','.previewStage','.workspaceEmpty','.emptyMascotStage','.emptyCopy'];
          const rects={};
          for (const selector of selectors) {
            const el=document.querySelector(selector);
            if (!el) continue;
            const r=el.getBoundingClientRect();
            rects[selector]={x:Math.round(r.x),y:Math.round(r.y),width:Math.round(r.width),height:Math.round(r.height),scrollWidth:el.scrollWidth,clientWidth:el.clientWidth,display:getComputedStyle(el).display};
          }
          const img=document.querySelector('.blotoriBrandMark img');
          return {origin:location.origin, width:innerWidth, height:innerHeight, bodyOverflow:document.documentElement.scrollWidth>innerWidth+2, rects, logoLoaded:!!img?.complete&&img.naturalWidth>0, headerText:document.querySelector('.workspaceHeader h1')?.textContent};
        });
        if (info.bodyOverflow) problems.push('DOCUMENT_HORIZONTAL_OVERFLOW');
        if (!info.logoLoaded) problems.push('BRAND_IMAGE_FAILED');
        const stage=info.rects['.workspaceEmpty'];
        if (stage && stage.width > 0 && stage.height > 0 && viewport.width > 760) {
          const a=info.rects['.emptyMascotStage'], b=info.rects['.emptyCopy'];
          if (!a || !b || a.width<60 || b.width<80) problems.push('EMPTY_STATE_COLLAPSED');
          else if (viewport.width>=1181 && a.y+b.height<b.y-200) problems.push('EMPTY_STATE_SEPARATED');
        }
        const inputs=page.locator('[data-mobile-panel="settings"]');
        const mobileTab=page.getByRole('button',{name:/입력.*문체/}).first();
        if (viewport.width<=760 && await mobileTab.count()) await mobileTab.click();
        if (await inputs.count()===0) problems.push('SETTINGS_MISSING');
        else {
          const platform=page.locator('.settingsRail select').filter({has:page.locator('option[value="naver"]')}).first();
          const topic=page.locator('.settingsRail textarea[placeholder*="주제"]').first();
          const button=page.locator('.settingsRail .generatePrimary');
          if (!await platform.count() || !await topic.count() || !await button.count()) {
            problems.push('CORE_INPUT_CONTROLS_MISSING');
          } else {
            await platform.selectOption('naver');
            await topic.fill('브라우저 UI QA 테스트: 유료 생성은 실행하지 않음');
            try {
              await button.waitFor({ state: 'visible', timeout: 3000 });
              await page.waitForFunction(() => {
                const button = document.querySelector('.settingsRail .generatePrimary');
                return button && !button.disabled;
              }, null, { timeout: 3000 });
            } catch {
              problems.push('GENERATION_STAYS_DISABLED_AFTER_VALID_INPUT');
            }
          }
        }
        await page.screenshot({path:path.join(out,originName+'-'+viewport.name+'.png'),fullPage:true});
        problems.push(...responseFailures.slice(0,12));
        status=problems.length?'FAIL':'PASS';
        results.push({originName,viewport:viewport.name,status,problems,info});
      } catch(error) {
        problems.push('BLOCKED_OR_RUNTIME_FAILURE '+String(error.message).slice(0,240));
        results.push({originName,viewport:viewport.name,status:'BLOCKED',problems});
      } finally {
        await context.close();
      }
      console.log(originName,viewport.name,results.at(-1).status,problems.join(' | '));
    }
  }
} finally {await browser.close();}
fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(results,null,2));
const counts=Object.fromEntries(['PASS','FAIL','BLOCKED'].map(s=>[s,results.filter(r=>r.status===s).length]));
console.log('ORIGIN_RESPONSIVE_SMOKE',JSON.stringify(counts));
if (counts.FAIL || counts.BLOCKED) process.exitCode=1;
