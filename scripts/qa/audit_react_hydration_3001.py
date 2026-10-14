"""Read-only diagnosis: is Next.js hydration failing only for LAN host?
Requires playwright in current Python env. No application edits or server restart.
"""
import argparse, json
from pathlib import Path
from playwright.sync_api import sync_playwright

JS = r"""() => {
 const perf=performance.getEntriesByType('resource');
 const js=perf.filter(e=>/\\.js(?:\\?|$)/.test(e.name));
 const root=document.documentElement;
 const content=document.querySelector('main') || document.body;
 const reactMarkers=[...document.querySelectorAll('*')].filter(
  el=>Object.keys(el).some(k=>k.startsWith('__reactContainer$') || k.startsWith('__reactFiber$'))
 ).length;
 const globals=Object.keys(window).filter(k=>k.startsWith('__next') || k.startsWith('__NEXT') || k.startsWith('__react')).slice(0,20);
 return {
  href:location.href,secureContext:isSecureContext,ready:document.readyState,
  htmlLength:root.outerHTML.length,mainLength:content?.innerHTML.length||0,
  reactMarkers,globals,
  clientComponentCursor:!!document.querySelector('.toriPawCursor'),
  pawEnabled:root.classList.contains('blotori-paw-active'),
  pointerFine:matchMedia('(pointer:fine)').matches,
  resourceJs:js.length,resourceJsDecodedBytes:js.reduce((n,e)=>n+(e.decodedBodySize||0),0),
  nextFlightScripts:document.querySelectorAll('script:not([src])').length,
  forms:document.querySelectorAll('form').length,
  buttons:document.querySelectorAll('button').length,
  reactDOMEvents:document.querySelectorAll('[data-reactroot]').length
 };
}"""

def main():
 parser=argparse.ArgumentParser()
 parser.add_argument('--local',default='http://localhost:3001/')
 parser.add_argument('--network',default='http://172.30.1.21:3001/')
 parser.add_argument('--output',default='artifacts/hydration-3001.json')
 a=parser.parse_args()
 rows=[]
 with sync_playwright() as p:
  browser=p.chromium.launch(headless=True)
  try:
   for label,url in [('local',a.local),('network',a.network)]:
    context=browser.new_context(viewport={'width':1440,'height':900},device_scale_factor=1)
    page=context.new_page()
    logs={'console':[],'pageErrors':[],'requestFailures':[],'badResponses':[],'webSockets':[]}
    page.on('console',lambda m:logs['console'].append({'type':m.type,'text':m.text[:500]}) if m.type in ('error','warning') else None)
    page.on('pageerror',lambda e:logs['pageErrors'].append(str(e)[:500]))
    page.on('requestfailed',lambda r:logs['requestFailures'].append({'url':r.url[:250],'failure':r.failure}))
    page.on('response',lambda r:logs['badResponses'].append({'url':r.url[:250],'status':r.status}) if r.status>=400 else None)
    page.on('websocket',lambda ws:logs['webSockets'].append(ws.url))
    record={'label':label}
    try:
     response=page.goto(url,wait_until='domcontentloaded',timeout=20000)
     record['status']=response.status if response else None
     record['headers']=dict(response.headers) if response else {}
     page.wait_for_timeout(1200)
     record['beforeMove']=page.evaluate(JS)
     page.mouse.move(200,200)
     page.mouse.move(440,320,steps=10)
     page.wait_for_timeout(1200)
     record['afterMove']=page.evaluate(JS)
    except Exception as e:record['error']=str(e)[:500]
    record['logs']=logs
    rows.append(record)
    context.close()
  finally:browser.close()
 path=Path(a.output);path.parent.mkdir(parents=True,exist_ok=True)
 path.write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding='utf-8')
 for row in rows:
  state=row.get('afterMove',{})
  print(row['label'].upper(), 'status=',row.get('status'),
        'reactMarkers=',state.get('reactMarkers'),'cursor=',state.get('clientComponentCursor'),
        'jsResources=',state.get('resourceJs'),'JSerrors=',len(row['logs']['pageErrors']))
  print('webSockets=',row['logs']['webSockets'][:3])
  print('consoleErrors=',row['logs']['console'][:5])
 print('REPORT',path)
 print('No source, npm dependencies, server settings, or ports modified.')
if __name__=='__main__':main()
