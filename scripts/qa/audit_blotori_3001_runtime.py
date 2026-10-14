"""Read-only 3001-origin comparison for Next.js app initialization and cursor.

Run from Tori_Common_Project with Python Playwright. Does not modify Blotori.
"""
import argparse
import hashlib
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

INSTRUMENT = r"""
(() => {
  const state = window.__toriAudit = { listenerTypes: {}, moves: 0, pointerTargets: [], mutations: 0 };
  const add = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function(type, callback, options) {
    if (type.startsWith('pointer') || type.startsWith('mouse')) {
      const owner = this === window ? 'window' : this === document ? 'document' :
        this === document.documentElement ? 'html' : this?.nodeName || 'other';
      const key = owner + ':' + type;
      state.listenerTypes[key] = (state.listenerTypes[key] || 0) + 1;
    }
    return add.call(this, type, callback, options);
  };
  add.call(window, 'pointermove', e => {
    state.moves += 1;
    if (state.pointerTargets.length < 5) state.pointerTargets.push(
      e.target?.tagName + (e.target?.className && typeof e.target.className === 'string'
        ? '.' + e.target.className.slice(0, 70) : '')
    );
  }, {capture:true, passive:true});
  add.call(document, 'DOMContentLoaded', () => {
    new MutationObserver(() => {state.mutations++;}).observe(document.documentElement, {subtree:true,childList:true});
  }, {once:true});
})();
"""

STATE = r"""() => {
  const s = window.__toriAudit || {};
  const paw = document.querySelector('.toriPawCursor');
  const img = paw?.querySelector('img');
  const scripts = [...document.scripts].filter(x=>x.src).map(x=>x.src);
  const el = document.elementFromPoint(440,320);
  const all = [...document.querySelectorAll('button, input, textarea, a[href]')];
  return {
    origin:location.origin, ready:document.readyState,
    secureContext:isSecureContext,
    htmlLength:document.documentElement.outerHTML.length,
    domControls:all.length,
    controlSamples:all.slice(0,7).map(e=>({tag:e.tagName,text:(e.innerText||e.getAttribute('aria-label')||'').slice(0,50)})),
    cursorMounted:!!paw, cursorClass:paw?.className||null,
    cursorOpacity:paw?getComputedStyle(paw).opacity:null,
    nativeCursor:el?getComputedStyle(el).cursor:null,
    pawActive:document.documentElement.classList.contains('blotori-paw-active'),
    imageLoaded:!!img?.complete && img.naturalWidth>0,
    pointerFine:matchMedia('(pointer:fine)').matches,
    hover:matchMedia('(hover:hover)').matches,
    reducedMotion:matchMedia('(prefers-reduced-motion:reduce)').matches,
    moveEventsSeen:s.moves||0, pointerTargets:s.pointerTargets||[],
    registeredListeners:s.listenerTypes||{},
    mutationBatches:s.mutations||0,
    scriptsCount:scripts.length,
    scriptPaths:scripts.map(x=>new URL(x).pathname).slice(0,20)
  };
}"""

def digest(body):
    return hashlib.sha256(body).hexdigest()[:20]

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--local',default='http://localhost:3001/')
    parser.add_argument('--network',default='http://172.30.1.21:3001/')
    parser.add_argument('--output',default='artifacts/blotori-3001-runtime.json')
    args=parser.parse_args()
    results=[]
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True)
        try:
            for label,url in [('local',args.local),('network',args.network)]:
                ctx=browser.new_context(viewport={'width':1440,'height':900},device_scale_factor=1)
                ctx.add_init_script(INSTRUMENT)
                page=ctx.new_page()
                problems={'pageErrors':[],'consoleWarnings':[],'failedRequests':[],'badHttp':[]}
                page.on('pageerror',lambda e:problems['pageErrors'].append(str(e)[:500]))
                page.on('console',lambda m:problems['consoleWarnings'].append(m.text[:400]) if m.type in ('error','warning') else None)
                page.on('requestfailed',lambda r:problems['failedRequests'].append({'url':r.url[:180],'failure':r.failure}))
                page.on('response',lambda r:problems['badHttp'].append({'url':r.url[:180],'status':r.status}) if r.status>=400 else None)
                row={'label':label,'requestedUrl':url}
                try:
                    res=page.goto(url,wait_until='domcontentloaded',timeout=20000)
                    row['documentHttp']=res.status if res else None
                    row['documentSha256Prefix']=digest(res.body()) if res else None
                    page.wait_for_timeout(1500)
                    row['beforeMove']=page.evaluate(STATE)
                    page.mouse.move(110,100)
                    page.mouse.move(440,320,steps=8)
                    page.wait_for_timeout(1200)
                    row['afterMove']=page.evaluate(STATE)
                    row['pageHtmlSha256Prefix']=digest(page.content().encode('utf-8'))
                except Exception as e:
                    row['error']=str(e)[:700]
                row['problems']=problems
                results.append(row)
                ctx.close()
        finally:
            browser.close()
    path=Path(args.output)
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
    for r in results:
        a=r.get('afterMove',{})
        b=r.get('beforeMove',{})
        print(f"=== {r['label'].upper()} ===")
        print('http=',r.get('documentHttp'),'htmlHash=',r.get('documentSha256Prefix'),
              'secure=',a.get('secureContext'),'controls=',a.get('domControls'))
        print('moves=',a.get('moveEventsSeen'),'listenerTypes=',a.get('registeredListeners'))
        print('cursorBefore=',b.get('cursorMounted'),'cursorAfter=',a.get('cursorMounted'),
              'active=',a.get('pawActive'),'imageLoaded=',a.get('imageLoaded'))
        print('JS errors=',len(r['problems']['pageErrors']),
              'http errors=',len(r['problems']['badHttp']),
              'request failures=',len(r['problems']['failedRequests']))
        print('console=',r['problems']['consoleWarnings'][:3])
        if 'error' in r: print('ERROR:',r['error'])
    print('REPORT',path)
    print('READ_ONLY: existing dev server and local project files unchanged')
if __name__=='__main__':main()
