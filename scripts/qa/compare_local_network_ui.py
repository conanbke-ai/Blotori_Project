"""Compare UI and cursor state between localhost and LAN hosts using one Chromium context.
Read-only; no app changes, no Chrome settings changes, no browser cache clearing.
Run with Playwright Python installed and a local server reachable at both URLs.
"""
from __future__ import annotations
import argparse,json
from pathlib import Path

JS="""() => {
 const root=document.documentElement;
 const paw=document.querySelector('.toriPawCursor,.tori-cat-cursor,#untoriApprovedCursor,#untoriPawRuntime,.bunny-cursor');
 const img=paw?.querySelector('img');
 const rect=paw?.getBoundingClientRect();
 return {
   href:location.href,
   innerWidth:innerWidth,innerHeight:innerHeight,
   devicePixelRatio:devicePixelRatio,
   visualScale:visualViewport?.scale ?? null,
   documentWidth:root.scrollWidth,
   bodyWidth:document.body.getBoundingClientRect().width,
   pointerFine:matchMedia('(pointer:fine)').matches,
   hover:matchMedia('(hover:hover)').matches,
   reducedMotion:matchMedia('(prefers-reduced-motion:reduce)').matches,
   nativeCursor:getComputedStyle(document.body).cursor,
   cursorClass:root.className,
   pawMounted:!!paw,
   pawClass:paw?.className ?? null,
   pawDisplay:paw?getComputedStyle(paw).display:null,
   pawOpacity:paw?getComputedStyle(paw).opacity:null,
   pawSize:rect?{width:rect.width,height:rect.height}:null,
   imageSrc:img?.currentSrc??null,
   imageLoaded:!!img?.complete && img.naturalWidth>0,
   imageNaturalWidth:img?.naturalWidth??null
 };
}"""
def main():
 p=argparse.ArgumentParser()
 p.add_argument('--local',required=True)
 p.add_argument('--network',required=True)
 p.add_argument('--out',default='artifacts/local-network-ui')
 args=p.parse_args()
 try:
  from playwright.sync_api import sync_playwright
 except ImportError:
  raise SystemExit('BLOCKED: Playwright not installed in this Python environment')
 dest=Path(args.out);dest.mkdir(parents=True,exist_ok=True)
 report=[]
 with sync_playwright() as pw:
  browser=pw.chromium.launch(headless=True)
  try:
   for width,height in ((1440,900),(390,844)):
    context=browser.new_context(viewport={'width':width,'height':height},device_scale_factor=1)
    for label,url in (('localhost',args.local),('network',args.network)):
     page=context.new_page()
     errors=[]
     page.on('pageerror',lambda err:errors.append(str(err)[:300]))
     try:
      response=page.goto(url,wait_until='domcontentloaded',timeout=15000)
      page.wait_for_timeout(700)
      if width==1440:
       page.mouse.move(440,320)
       page.wait_for_timeout(300)
      item=page.evaluate(JS)
      item.update(label=label,viewport=width,httpStatus=response.status if response else None,jsErrors=errors)
      path=dest/f'{label}-{width}.png'
      page.screenshot(path=str(path),full_page=True)
      item['screenshot']=str(path)
     except Exception as exc:
      item={'label':label,'viewport':width,'error':str(exc)[:300]}
     report.append(item)
     page.close()
    context.close()
  finally:browser.close()
 out=dest/'report.json'
 out.write_text(json.dumps(report,indent=2,ensure_ascii=False),encoding='utf-8')
 print(json.dumps(report,ensure_ascii=False,indent=2))
 print('REPORT',out)
 print('NOTE: Playwright context is isolated; Chrome saved site zoom may differ from these measurements.')
if __name__=='__main__':main()
