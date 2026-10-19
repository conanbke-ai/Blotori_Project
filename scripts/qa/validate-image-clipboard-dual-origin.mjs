import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const origins = [['localhost', process.env.BLOTORI_LOCAL_URL], ['network', process.env.BLOTORI_NETWORK_URL]];
if (origins.some(([, url]) => !url)) throw new Error('Both QA origins are required');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/2ZkAAAAASUVORK5CYII=', 'base64');
const draft = {
  title: '이미지 포함 복사 검증', titleCandidates: ['이미지 포함 복사 검증'],
  summary: 'QA', intro: ['도입부 문장'], sections: [
    { id: 'sec-1', heading: '본문 제목', paragraphs: ['본문 첫 번째 문장'], presentation: { visualStyle: 'callout' } },
  ], closing: ['끝맺음 문장'], tags: ['QA'],
  images: [{id:'img-1', role:'CONTEXT', label:'검증용 이미지', placement:'본문 제목 뒤', afterSectionId:'sec-1',
    ratio:'1:1', size:'1x1', prompt:'QA only', display:{widthPercent:50,align:'right'}}],
  warnings: []
};
const browser = await chromium.launch({headless:true});
const results=[];
try {
  for (const [name,url] of origins) {
    const ctx=await browser.newContext({serviceWorkers:'block',viewport:{width:1440,height:900}});
    try {
      await ctx.addInitScript(() => {
        window.__clipboardQA = [];
        class QAClipboardItem {
          constructor(data) { this.data=data; this.types=Object.keys(data); }
          async getType(type) { return await this.data[type]; }
        }
        Object.defineProperty(window, 'ClipboardItem', { configurable:true, value:QAClipboardItem });
        Object.defineProperty(navigator,'clipboard',{configurable:true,value:{
          write:async(items)=>{
            const item=items[0];
            const html=await (await item.getType('text/html')).text();
            const plain=await (await item.getType('text/plain')).text();
            window.__clipboardQA.push({html,plain,types:item.types});
          },
          writeText:async(plain)=>window.__clipboardQA.push({plain,types:['text/plain']})
        }});
      });
      let apiCalls=0;
      await ctx.route('**/api/generate', route=>{
        apiCalls++;
        return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({draft,mode:'mock',requestId:'clipboard-qa'})});
      });
      await ctx.route('**/api/health**',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,keyDetected:true,verified:false,message:'QA'})}));
      const page=await ctx.newPage();
      assert.equal((await page.goto(url,{waitUntil:'domcontentloaded'}))?.status(),200);
      await page.locator('.draftStorageStatus[data-state="ready"]').waitFor({timeout:15000});
      await page.locator('.settingsRail select').filter({has:page.locator('option[value="naver"]')}).first().selectOption('naver');
      await page.locator('.settingsRail textarea[placeholder*="주제"]').first().fill('이미지 복사 테스트');
      await page.locator('.settingsRail .generatePrimary').click();
      const fileInput=page.locator('.draftImageInput').first();
      await fileInput.waitFor({timeout:15000});
      await fileInput.setInputFiles({name:'qa-pixel.png',mimeType:'image/png',buffer:png});
      await page.locator('img[data-draft-image="img-1"]').waitFor({timeout:10000});
      await page.locator('[data-copy-platform]').click();
      await page.waitForFunction(()=>window.__clipboardQA?.length>0,null,{timeout:15000});
      const item=await page.evaluate(()=>window.__clipboardQA[0]);
      assert.ok(item.types.includes('text/html'));
      const encoded = item.html.match(/src="data:image\/png;base64,([^"]+)"/)?.[1];
      assert.ok(encoded, 'Missing embedded original PNG');
      assert.deepEqual(Buffer.from(encoded, 'base64'), png, 'Clipboard PNG bytes must match uploaded source');
      assert.ok(item.html.includes('img'),'Missing IMG element');
      assert.ok(item.html.includes('본문 첫 번째 문장'),'Missing document text');
      const sectionAt = item.html.indexOf('본문 첫 번째 문장');
      const imageAt = item.html.indexOf('data:image/png;base64,');
      assert.ok(imageAt > sectionAt, 'Image should remain after selected section');
      assert.match(item.html, /width\s*:\s*50%/, 'Copied HTML should retain 50% width');
      assert.match(item.html, /text-align\s*:\s*right/, 'Copied HTML should retain right alignment');
      assert.ok(item.plain.includes('본문 첫 번째 문장'),'Missing plain fallback text');
      assert.equal(apiCalls,1);
      results.push({origin:name,status:'PASS',images:1,rich:true,paidApiCalls:0});
    } catch(e) {results.push({origin:name,status:'FAIL',reason:String(e).slice(0,600)});}
    finally {await ctx.close();}
  }
} finally {await browser.close();}
for(const item of results)console.log('IMAGE_CLIPBOARD_QA',JSON.stringify(item));
if(results.some(x=>x.status!=='PASS'))process.exitCode=1;
