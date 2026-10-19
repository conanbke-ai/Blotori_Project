// Windows HTTPS acceptance preflight. No real OpenAI requests, no Naver login automation.
// Run against already running Blotori HTTPS endpoints with trusted local certificates.
import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';

const local = process.env.BLOTORI_LOCAL_URL || 'https://localhost:3001';
const network = process.env.BLOTORI_NETWORK_URL || 'https://172.30.1.21:3001';
const targets = [['localhost', local], ['network', network]];
if (targets.some(([,url])=>!url.startsWith('https://'))) throw new Error('HTTPS origins required');
const browser = await chromium.launch({headless:true});
let failed = false;
try {
  for(const [name,url] of targets){
    const ctx=await browser.newContext({ignoreHTTPSErrors:false,serviceWorkers:'block'});
    try{
      const page=await ctx.newPage();
      const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:15000});
      if(response?.status()!==200) throw new Error('HTTP '+response?.status());
      await page.locator('.draftStorageStatus[data-state="ready"]').waitFor({timeout:15000});
      console.log('HTTPS_ORIGIN_PREFLIGHT',JSON.stringify({origin:name,status:'PASS',url}));
    }catch(error){
      failed=true;
      console.error('HTTPS_ORIGIN_PREFLIGHT',JSON.stringify({origin:name,status:'FAIL',url,error:String(error).slice(0,700)}));
    }finally{await ctx.close();}
  }
}finally{await browser.close();}
if(failed)process.exit(1);

for(const script of [
  'scripts/qa/validate-dual-origin-draft-storage.mjs',
  'scripts/qa/validate-pack-dual-origin.mjs',
  'scripts/qa/validate-editorial-visual-dual-origin.mjs',
  'scripts/qa/validate-image-clipboard-dual-origin.mjs'
]){
  console.log('RUN',script);
  const result=spawnSync(process.execPath,[script],{
    stdio:'inherit',env:{...process.env,BLOTORI_LOCAL_URL:local,BLOTORI_NETWORK_URL:network},
    shell:false,timeout:180000
  });
  if(result.error || result.status!==0){
    console.error('HTTPS_QA_FAIL',script,result.error?.message||'exit='+result.status);
    process.exit(1);
  }
}
console.log('HTTPS_QA_PASS Both origins; mocked generate only. Naver SmartEditor paste remains UNVERIFIED.');
