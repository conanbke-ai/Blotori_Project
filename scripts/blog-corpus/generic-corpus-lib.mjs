import * as cheerio from "cheerio";
import { parseBlogPostMetrics, aggregateNaverBlogCorpus } from "./naver-corpus-lib.mjs";

const UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36";
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));

async function fetchText(url,{attempts=3}={}){
  let last;
  for(let i=0;i<attempts;i++){
    try{
      const res=await fetch(url,{headers:{"user-agent":UA,"accept-language":"ko-KR,ko;q=0.9"}});
      if(!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    }catch(e){last=e;if(i<attempts-1)await sleep(400*(i+1));}
  }
  throw last;
}
const locs=(xml)=>[...xml.matchAll(/<loc>([\s\S]*?)<\/loc>/gi)].map(m=>m[1].replace(/&amp;/g,"&").trim()).filter(Boolean);

async function readSitemap(url,origin,seen,depth=0){
  if(depth>3||seen.has(url)) return [];
  seen.add(url);
  let xml;
  try{xml=await fetchText(url);}catch{return [];}
  const urls=locs(xml);
  const children=urls.filter(x=>/\.xml(?:$|\?)/i.test(x)||/sitemap/i.test(x)&&x.endsWith(".xml"));
  if(children.length&&/<sitemapindex/i.test(xml)){
    const nested=[];
    for(const child of children.slice(0,50)) nested.push(...await readSitemap(child,origin,seen,depth+1));
    return nested;
  }
  return urls.filter(x=>{try{return new URL(x).origin===origin;}catch{return false;}});
}

export async function discoverTistoryPosts(baseUrl){
  const base=new URL(baseUrl);
  const candidates=[new URL("/sitemap.xml",base.origin).href,new URL("/sitemap_index.xml",base.origin).href];
  const seen=new Set();
  let urls=[];
  for(const sitemap of candidates){
    urls.push(...await readSitemap(sitemap,base.origin,seen));
    if(urls.length) break;
  }
  urls=[...new Set(urls)];
  const posts=urls.filter(url=>{
    try{
      const p=new URL(url).pathname;
      return /^\/\d+\/?$/.test(p)||/^\/entry\//.test(p);
    }catch{return false;}
  });
  return posts.map(url=>({url,date:"",logNo:new URL(url).pathname.replace(/\D/g,"")||url}));
}

export async function discoverAladinPosts(baseUrl,{delayMs=120,maxPages=10000}={}){
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
    try{html=await fetchText(url);successfulPageFetches++;}
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
  if(successfulPageFetches===0) throw new Error(`BLOCKED_BY_SOURCE: ${String(lastFetchError||"no successful page response")}`);
  return [...found.values()];
}

export async function fetchGenericPostMetrics(post,{delayMs=120}={}){
  const html=await fetchText(post.url);
  if(delayMs) await sleep(delayMs);
  return parseBlogPostMetrics(html,{logNo:post.logNo,date:post.date});
}

export async function collectGenericBlogCorpus(target,{delayMs=120,maxPosts=Infinity,concurrency=3}={}){
  const {url,platform}=target;
  let listed=[];
  const failures=[];
  try{
    if(platform==="tistory") listed=await discoverTistoryPosts(url);
    else if(/blog\.aladin\.co\.kr/i.test(new URL(url).hostname)) listed=await discoverAladinPosts(url,{delayMs});
    else throw new Error("UNSUPPORTED_GENERIC_PLATFORM");
  }catch(e){failures.push({stage:"list",message:String(e)});}
  const selected=listed.slice(0,Number.isFinite(maxPosts)?maxPosts:listed.length);
  const analyzed=[];
  let cursor=0,completed=0;
  async function worker(){
    while(true){
      const i=cursor++;
      if(i>=selected.length) return;
      const post=selected[i];
      try{
        const metric=await fetchGenericPostMetrics(post,{delayMs});
        if(metric.textChars<20) throw new Error("EMPTY_OR_TOO_SHORT");
        analyzed.push(metric);
      }catch(e){failures.push({logNo:post.logNo,stage:"post",message:String(e).slice(0,300)});}
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
