"""Read-only diagnosis of Blotori cursor: localhost vs LAN Next dev hydration.

Collect failed JS requests, console warnings/errors, hydration, pointer events,
loaded scripts and cursor state at matched desktop viewport. No app file edits.
"""
from __future__ import annotations
import argparse,json
from pathlib import Path
from playwright.sync_api import sync_playwright

def inspect(page):
 return page.evaluate("""() => {
   const paw=document.querySelector('.toriPawCursor');
   const pic=paw?.querySelector('img');
   return {url:location.href,ready:document.readyState,reactRoot:!!document.querySelector('nextjs-portal'),
     pawMounted:!!paw,pawClass:paw?.className??null,
     pawDisplay:paw?getComputedStyle(paw).display:null,
     pawOpacity:paw?getComputedStyle(paw).opacity:null,
     active:document.documentElement.classList.contains('blotori-paw-active'),
     pointerFine:matchMedia('(pointer:fine)').matches,
     hover:matchMedia('(hover:hover)').matches,
     reducedMotion:matchMedia('(prefers-reduced-motion:reduce)').matches,
     imgLoaded:!!pic?.complete&&pic.naturalWidth>0,
     scripts:[...document.scripts].map(s=>s.src).filter(Boolean).slice(-12)};
 }""")
def main():
 p=argparse.ArgumentParser()
 p.add_argument('--local',default='http://localhost:3001/')
 p.add_argument('--network',default='http://172.30.1.21:3001/')
 p.add_argument('--output',default='artifacts/blotori-network-hydration.json')
 a=p.parse_args()
 reports=[]
 with sync_playwright() as pw:
  browser=pw.chromium.launch(headless=True)
  try:
   for name,url in [('local',a.local),('network',a.network)]:
    context=browser.new_context(viewport={'width':1440,'height':900},device_scale_factor=1)
    page=context.new_page()
    events={'consoleErrors':[],'pageErrors':[],'failedRequests':[],'httpErrors':[]}
    page.on('console',lambda msg:events['consoleErrors'].append(msg.text[:400]) if msg.type in ('error','warning') else None)
    page.on('pageerror',lambda err:events['pageErrors'].append(str(err)[:400]))
    page.on('requestfailed',lambda req:events['failedRequests'].append({'url':req.url[:250],'failure':req.failure}))
    page.on('response',lambda resp:events['httpErrors'].append({'url':resp.url[:250],'status':resp.status}) if resp.status>=400 else None)
    try:
     response=page.goto(url,wait_until='networkidle',timeout=20000)
     page.mouse.move(120,120)
     page.mouse.move(440,320)
     page.wait_for_timeout(1400)
     state=inspect(page)
     state.update(label=name,httpStatus=response.status if response else None,events=events)
     state['browserOrigin']=page.evaluate('location.origin')
    except Exception as exc:
     state={'label':name,'error':str(exc)[:500],'events':events}
    reports.append(state)
    context.close()
  finally:browser.close()
 dest=Path(a.output);dest.parent.mkdir(parents=True,exist_ok=True)
 dest.write_text(json.dumps(reports,ensure_ascii=False,indent=2),encoding='utf-8')
 print(json.dumps(reports,ensure_ascii=False,indent=2))
 print('REPORT',dest)
 print('DIAGNOSIS_ONLY / NO_PROJECT_FILES_CHANGED')
if __name__=='__main__':main()
