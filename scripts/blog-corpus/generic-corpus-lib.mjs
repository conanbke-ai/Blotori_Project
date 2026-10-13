import * as cheerio from "cheerio";
import fs from "node:fs";
import { parseBlogPostMetrics, aggregateNaverBlogCorpus } from "./naver-corpus-lib.mjs";
import { RecoveryCheckpoint, fetchTextWithRetry } from "./recovery-checkpoint-lib.mjs";

const UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36";
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));

async function fetchText(url,{attempts=5,retryOptions={}}={}){
  return fetchTextWithRetry(url,{
    headers:{"user-agent":UA,"accept-language":"ko-KR,ko;q=0.9"},
    attempts,
    ...retryOptions,
  });
}
const locs=(xml)=>[...xml.matchAll(/<loc>([\s\S]*?)<\/loc>/gi)].map(m=>m[1].replace(/&amp;/g,"&").trim()).filter(Boolean);

async function readSitemap(url,origin,seen,depth=0,retryOptions={},discoveryState={successful:0,errors:[]}){
  if(depth>3||seen.has(url)) return [];
  seen.add(url);
  let xml;
  try{xml=await fetchText(url,{retryOptions});discoveryState.successful++;}
  catch(error){discoveryState.errors.push(error);return [];}
  const urls=locs(xml);
  const children=urls.filter(x=>/\.xml(?:$|\?)/i.test(x)||/sitemap/i.test(x)&&x.endsWith(".xml"));
  if(children.length&&/<sitemapindex/i.test(xml)){
    const nested=[];
    for(const child of children.slice(0,50)) nested.push(...await readSitemap(child,origin,seen,depth+1,retryOptions,discoveryState));
    return nested;
  }
  return urls.filter(x=>{try{return new URL(x).origin===origin;}catch{return false;}});
}

export async function discoverTistoryPosts(baseUrl,{retryOptions={}}={}){
  const base=new URL(baseUrl);
  const candidates=[new URL("/sitemap.xml",base.origin).href,new URL("/sitemap_index.xml",base.origin).href];
  const seen=new Set();
  const discoveryState={successful:0,errors:[]};
  let urls=[];
  for(const sitemap of candidates){
    urls.push(...await readSitemap(sitemap,base.origin,seen,0,retryOptions,discoveryState));
    if(urls.length) break;
  }
  if(discoveryState.successful===0&&discoveryState.errors.length) throw discoveryState.errors.at(-1);
  urls=[...new Set(urls)];
  const posts=urls.filter(url=>{
    try{
      const p=new URL(url).pathname;
      return /^\/\d+\/?$/.test(p)||/^\/entry\//.test(p);
    }catch{return false;}
  });
  return posts.map(url=>({url,date:"",logNo:new URL(url).pathname.replace(/\D/g,"")||url}));
}

export async function discoverAladinPosts(baseUrl,{delayMs=120,maxPages=10000,retryOptions={}}={}){
  const base=new URL(baseUrl);
  const user=base.pathname.split("/").filter(Boolean)[0];
  if(!user) return [];
  const found=new Map();
  let emptyPages=0;
  let successfulPageFetches=0;
  let lastFetchError=null;
  for(let page=1;page<=maxPages;page++){
    const url=`${base.origin}/${user}/category/0?CommunityType=MyPaper&page=${page}&cnt=50`;
    let html;
    try{html=await fetchText(url,{retryOptions});successfulPageFetches++;}
    catch(error){
      lastFetchError=error;
      emptyPages++;
      if(emptyPages>=2) break;
      continue;
    }
    const $=cheerio.load(html);
    let fresh=0;
    $("a[href]").each((_,a)=>{
      const href=$(a).attr("href")||"";
      let u;
      try{u=new URL(href,url);}catch{return;}
      if(u.hostname!==base.hostname) return;
      const re=new RegExp(`^/${user}/(\\d+)/?$`);
      const m=u.pathname.match(re);
      if(!m) return;
      if(!found.has(u.href)){found.set(u.href,{url:u.href,date:"",logNo:m[1]});fresh++;}
    });
    if(fresh===0) emptyPages++; else emptyPages=0;
    if(emptyPages>=2) break;
    if(delayMs) await sleep(delayMs);
  }
  if(successfulPageFetches===0){
    if(lastFetchError) throw lastFetchError;
    throw new Error("BLOCKED_BY_SOURCE: no successful page response");
  }
  return [...found.values()];
}

export async function fetchGenericPostMetrics(post,{delayMs=120,retryOptions={}}={}){
  const html=await fetchText(post.url,{attempts:retryOptions.attempts??5,retryOptions});
  if(delayMs) await sleep(delayMs);
  return parseBlogPostMetrics(html,{logNo:post.logNo,date:post.date});
}

export async function collectGenericBlogCorpus(target,{
  delayMs=120,maxPosts=Infinity,concurrency=3,checkpointPath=null,maxAttempts=8,requireCheckpoint=false,
}={}){
  const {url,platform}=target;
  let listed=[];
  const listFailures=[];
  if(requireCheckpoint&&(!checkpointPath||!fs.existsSync(checkpointPath))) throw new Error(`RECOVERY_CHECKPOINT_REQUIRED ${checkpointPath||url}`);
  const checkpoint=checkpointPath?new RecoveryCheckpoint(checkpointPath,{sourceUrl:url,platform,identity:new URL(url).hostname}):null;
  if(requireCheckpoint&&(!checkpointPath||(!checkpoint?.manifest&&!checkpoint?.discovery))){
    checkpoint?.close();
    throw new Error(`RECOVERY_CHECKPOINT_REQUIRED ${checkpointPath||url}`);
  }
  if(checkpoint?.manifest){
    listed=checkpoint.requests().map((entry)=>entry.request);
  }else if(checkpoint?.discovery?.outcome==="failure"&&(checkpoint.discovery.permanent||Number(checkpoint.discovery.attemptsTotal||0)>=maxAttempts)){
    listFailures.push({
      stage:"list",message:checkpoint.discovery.message,classification:checkpoint.discovery.classification,
      status:checkpoint.discovery.status,attempts:checkpoint.discovery.attemptsTotal,permanent:checkpoint.discovery.permanent,
    });
    console.log("GENERIC_DISCOVERY_FAILURE_RESUME",url,checkpoint.discovery.classification,checkpoint.discovery.attemptsTotal);
  }else{
    try{
      const retryOptions={
        attempts:Math.max(1,maxAttempts-Number(checkpoint?.discovery?.attemptsTotal||0)),
        onRetry:({attempt,delayMs:waitMs,classification})=>console.log("GENERIC_LIST_RETRY",url,attempt,classification.kind,waitMs),
      };
      if(platform==="tistory") listed=await discoverTistoryPosts(url,{retryOptions});
      else if(/blog\.aladin\.co\.kr/i.test(new URL(url).hostname)) listed=await discoverAladinPosts(url,{delayMs,retryOptions});
      else throw new Error("UNSUPPORTED_GENERIC_PLATFORM");
      checkpoint?.initializeManifest(listed);
    }catch(e){
      checkpoint?.recordDiscoveryFailure(e);
      listFailures.push({
        stage:"list",message:String(e),classification:e?.recoveryClassification?.kind||null,status:e?.status||null,
        attempts:checkpoint?.discovery?.attemptsTotal||1,permanent:e?.recoveryClassification?.permanent??null,
      });
    }
  }
  const selected=listed.slice(0,Number.isFinite(maxPosts)?maxPosts:listed.length);
  if(!checkpoint){
    const analyzed=[];
    const failures=[...listFailures];
    let cursor=0,completed=0;
    async function worker(){
      while(true){
        const i=cursor++;
        if(i>=selected.length) return;
        const post=selected[i];
        try{analyzed.push(await fetchGenericPostMetrics(post,{delayMs}));}
        catch(e){failures.push({logNo:post.logNo,stage:"post",message:String(e).slice(0,300)});}
        completed++;
        if(completed%50===0||completed===selected.length) console.log("GENERIC_PROGRESS",url,completed,selected.length,"ok",analyzed.length,"fail",failures.length);
      }
    }
    await Promise.all(Array.from({length:Math.min(Math.max(1,concurrency),Math.max(1,selected.length))},()=>worker()));
    const key=new URL(url).hostname+new URL(url).pathname.replace(/\W+/g,"_");
    const aggregate=aggregateNaverBlogCorpus(key,listed,analyzed,failures);
    aggregate.platform=platform;
    aggregate.blogId=null;
    aggregate.sourceUrl=url;
    aggregate.fullCoverage=selected.length===listed.length&&!failures.some(x=>x.stage==="list");
    aggregate.requestedPosts=selected.length;
    return aggregate;
  }
  const selectedIds=new Set(selected.map((post)=>String(post.logNo||post.url)));
  const selectedEntries=checkpoint.requests().filter((entry)=>selectedIds.has(String(entry.requestId)));
  const pending=selectedEntries.filter((entry)=>{
    const state=checkpoint.stateFor(entry);
    return !state||(state.outcome!=="success"&&!state.permanent&&Number(state.attemptsTotal||0)<maxAttempts);
  });
  let cursor=0,completed=0;
  async function worker(){
    while(true){
      const i=cursor++;
      if(i>=pending.length) return;
      const entry=pending[i],post=entry.request;
      const prior=checkpoint.stateFor(entry);
      let attemptsUsed=0;
      try{
        const metric=await fetchGenericPostMetrics(post,{
          delayMs,
          retryOptions:{
            attempts:Math.max(1,maxAttempts-Number(prior?.attemptsTotal||0)),
            onAttempt:()=>{attemptsUsed++;},
            onRetry:({attempt,delayMs:waitMs,classification})=>console.log("GENERIC_POST_RETRY",url,entry.requestId,attempt,classification.kind,waitMs),
          },
        });
        checkpoint.recordSuccess(entry,metric,{attemptsUsed:Math.max(1,attemptsUsed)});
      }catch(e){checkpoint.recordFailure(entry,e,{attemptsUsed:Math.max(1,attemptsUsed)});}
      completed++;
      if(completed%50===0||completed===pending.length){
        const summary=checkpoint.summary({maxAttempts});
        console.log("GENERIC_PROGRESS",url,completed,pending.length,"ok",summary.succeeded,"fail",summary.failed,"retryable",summary.retryable);
      }
    }
  }
  await Promise.all(Array.from({length:Math.min(Math.max(1,concurrency),Math.max(1,pending.length))},()=>worker()));
  checkpoint.flush();
  const checkpointSummary=checkpoint.summary({maxAttempts});
  const analyzed=[];
  const failures=[...listFailures];
  for(const entry of selectedEntries){
    const state=checkpoint.stateFor(entry);
    if(state?.outcome==="success") analyzed.push(state.metric);
    else if(state?.outcome==="failure") failures.push({
      logNo:entry.request?.logNo||entry.requestId,url:entry.request?.url,stage:"post",message:state.message,
      status:state.status,classification:state.classification,attempts:state.attemptsTotal,permanent:state.permanent,
    });
  }
  const key=new URL(url).hostname+new URL(url).pathname.replace(/\W+/g,"_");
  const aggregate=aggregateNaverBlogCorpus(key,listed,analyzed,failures);
  aggregate.platform=platform;
  aggregate.blogId=null;
  aggregate.sourceUrl=url;
  aggregate.fullCoverage=selected.length===listed.length&&!failures.some(x=>x.stage==="list");
  aggregate.requestedPosts=selected.length;
  aggregate.recoveryCheckpoint={file:checkpointPath,...checkpointSummary};
  checkpoint.close();
  return aggregate;
}
