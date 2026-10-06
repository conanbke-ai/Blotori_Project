import crypto from "node:crypto";
import * as cheerio from "cheerio";

const UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36";
const sleep=(ms)=>new Promise((resolve)=>setTimeout(resolve,ms));
const clean=(s)=>(s||"").replace(/[\u200B-\u200D\uFEFF]/g,"").replace(/\s+/g," ").trim();

async function fetchText(url,{referer,attempts=3}={}){
  let last;
  for(let i=0;i<attempts;i++){
    try{
      const res=await fetch(url,{headers:{"user-agent":UA,"accept-language":"ko-KR,ko;q=0.9",...(referer?{referer}:{})}});
      if(!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    }catch(error){
      last=error;
      if(i<attempts-1) await sleep(400*(i+1));
    }
  }
  throw last;
}

export async function listAllNaverPosts(blogId,{delayMs=120,maxPages=10000}={}){
  const posts=[];
  const seen=new Set();
  const countPerPage=30;
  for(let page=1;page<=maxPages;page++){
    const url=`https://blog.naver.com/PostTitleListAsync.naver?blogId=${encodeURIComponent(blogId)}&viewdate=&currentPage=${page}&categoryNo=0&parentCategoryNo=&countPerPage=${countPerPage}`;
    const raw=await fetchText(url,{referer:`https://blog.naver.com/${blogId}`});
    let parsed;
    try{
      const normalized=raw.replace(/^\uFEFF/,"").trim().replace(/\\'/g,"'");
      parsed=JSON.parse(normalized);
    }catch{
      const start=raw.indexOf("{"),end=raw.lastIndexOf("}");
      try{parsed=JSON.parse(raw.slice(start,end+1).replace(/\\'/g,"'"));}
      catch{throw new Error(`POST_LIST_INVALID_JSON page=${page} prefix=${JSON.stringify(raw.slice(0,80))}`);}
    }
    const list=Array.isArray(parsed.postList)?parsed.postList:[];
    const totalCount=Number(parsed.totalCount||0);
    if(!list.length) break;
    let fresh=0;
    for(const item of list){
      const logNo=String(item.logNo||"");
      if(!logNo||seen.has(logNo)) continue;
      seen.add(logNo); fresh++;
      let title="";
      try{title=decodeURIComponent(String(item.title||"").replace(/\+/g," "));}catch{title=String(item.title||"");}
      posts.push({
        logNo,
        titleLength:title.length,
        date:String(item.addDate||""),
        categoryNo:String(item.categoryNo||""),
        openType:String(item.openType||""),
        blocked:Boolean(Number(item.isPostBlocked||0)),
        notOpen:Boolean(Number(item.isPostNotOpen||0)),
      });
    }
    if(fresh===0||list.length<countPerPage||(totalCount>0&&posts.length>=totalCount)) break;
    if(delayMs) await sleep(delayMs);
  }
  return posts;
}

function sentencesFrom(blocks){
  const out=[];
  for(const block of blocks){
    const chunks=block.split(/(?<=[.!?。！？])\s+|\n+/u).map(clean).filter(Boolean);
    if(chunks.length) out.push(...chunks);
    else if(block) out.push(block);
  }
  return out;
}

function countMatches(text,re){
  return [...text.matchAll(re)].length;
}

function classifyEnding(sentence){
  const s=sentence.replace(/[\s"'”’\])}>~…!?.。！？]+$/u,"");
  if(/(?:합니다|됩니다|입니다|습니다|했습니다|였습니다|겠습니다)$/u.test(s)) return "formal";
  if(/(?:해요|돼요|이에요|예요|어요|아요|했어요|였어요|네요|군요|거든요|더라고요|잖아요)$/u.test(s)) return "haeyo";
  if(/(?:죠|쥬)$/u.test(s)) return "jyo";
  if(/(?:다|했다|였다|한다|된다|이다)$/u.test(s)) return "plain";
  if(/(?:음|임|함)$/u.test(s)) return "noun";
  return "other";
}

function componentSequence($,root){
  const seq=[];
  root.find(".se-component").each((_,el)=>{
    const cls=$(el).attr("class")||"";
    let type="other";
    if(/image/i.test(cls)) type="image";
    else if(/text/i.test(cls)) type="text";
    else if(/map/i.test(cls)) type="map";
    else if(/quote/i.test(cls)) type="quote";
    else if(/horizontal|line/i.test(cls)) type="divider";
    else if(/video/i.test(cls)) type="video";
    seq.push(type);
  });
  let maxImageRun=0,run=0,imageComponents=0;
  for(const t of seq){
    if(t==="image"){run++;imageComponents++;maxImageRun=Math.max(maxImageRun,run);} else run=0;
  }
  return {sequenceLength:seq.length,imageComponents,maxImageRun};
}

function pickRoot($){
  const selectors=[".se-main-container",".se-viewer","#postViewArea",".post-view",".post_ct","article","main"];
  let best=$("body"),bestScore=0,bestSelector="body";
  for(const selector of selectors){
    $(selector).each((_,el)=>{
      const node=$(el);
      const score=clean(node.text()).length+node.find("img").length*90+node.find(".se-component").length*15;
      if(score>bestScore){best=node;bestScore=score;bestSelector=selector;}
    });
  }
  return {root:best,selector:bestSelector};
}

export function parseNaverPostMetrics(html,meta={}){
  const $=cheerio.load(html);
  $("script,style,noscript").remove();
  const {root,selector}=pickRoot($);
  const paragraphSelector=root.find(".se-text-paragraph").length
    ? ".se-text-paragraph"
    : "p,h1,h2,h3,h4,blockquote,li,figcaption";
  const blocks=[];
  root.find(paragraphSelector).each((_,el)=>{
    const t=clean($(el).text());
    if(t&&(!blocks.length||blocks[blocks.length-1]!==t)) blocks.push(t);
  });
  if(!blocks.length){
    const t=clean(root.text()); if(t) blocks.push(t);
  }
  const text=blocks.join("\n");
  const sentences=sentencesFrom(blocks);
  const endings={formal:0,haeyo:0,jyo:0,plain:0,noun:0,other:0};
  for(const s of sentences) endings[classifyEnding(s)]++;

  const imageCount=root.find("img").length;
  const seq=componentSequence($,root);
  const centered=root.find('[style*="text-align: center"],[style*="text-align:center"],.se-text-paragraph-align-center').length;
  const left=root.find('[style*="text-align: left"],[style*="text-align:left"],.se-text-paragraph-align-left').length;
  const headingCount=root.find("h1,h2,h3,h4,.se-module-text h5").length;
  const strongCount=root.find("strong,b").length;
  const listItemCount=root.find("li").length;
  const quoteCount=root.find("blockquote,.se-quote").length;
  const linkCount=root.find("a[href]").length;
  const galleryLike=root.find('.se-imageGroup,.se-component[class*="imageGroup"],.se-module-image-group').length;

  return {
    logNo:String(meta.logNo||""),
    date:String(meta.date||""),
    rootSelector:selector,
    textChars:text.length,
    blockCount:blocks.length,
    paragraphCount:blocks.length,
    sentenceCount:sentences.length,
    avgSentenceChars:sentences.length?Math.round(sentences.reduce((a,b)=>a+b.length,0)/sentences.length*10)/10:0,
    avgParagraphChars:blocks.length?Math.round(blocks.reduce((a,b)=>a+b.length,0)/blocks.length*10)/10:0,
    shortParagraphRate:blocks.length?Math.round(blocks.filter(x=>x.length<=60).length/blocks.length*1000)/1000:0,
    imageCount,
    imagesPer1000Chars:text.length?Math.round(imageCount/text.length*1000000)/1000:0,
    headingCount,
    strongCount,
    listItemCount,
    quoteCount,
    linkCount,
    galleryLike,
    centeredBlockCount:centered,
    leftBlockCount:left,
    componentSequenceLength:seq.sequenceLength,
    imageComponentCount:seq.imageComponents,
    maxConsecutiveImageComponents:seq.maxImageRun,
    endings,
    punctuation:{
      question:countMatches(text,/\?/g),
      exclamation:countMatches(text,/!/g),
      ellipsis:countMatches(text,/(?:\.{2,}|…+)/g),
      laugh:countMatches(text,/(?:ㅋ{2,}|ㅎ{2,})/gu),
      cry:countMatches(text,/(?:ㅠ{2,}|ㅜ{2,})/gu),
      emoji:countMatches(text,/\p{Extended_Pictographic}/gu),
    },
  };
}

export async function fetchNaverPostMetrics(blogId,post,{delayMs=120}={}){
  const url=`https://blog.naver.com/PostView.naver?blogId=${encodeURIComponent(blogId)}&logNo=${encodeURIComponent(post.logNo)}&redirect=Dlog&widgetTypeCall=true`;
  const html=await fetchText(url,{referer:`https://blog.naver.com/${blogId}`});
  if(delayMs) await sleep(delayMs);
  return parseNaverPostMetrics(html,post);
}

const num=(x)=>Number.isFinite(Number(x))?Number(x):0;
function quantile(values,q){
  const v=values.map(num).filter(Number.isFinite).sort((a,b)=>a-b);
  if(!v.length) return 0;
  const pos=(v.length-1)*q,base=Math.floor(pos),rest=pos-base;
  return Math.round((v[base]+(v[base+1]!==undefined?rest*(v[base+1]-v[base]):0))*100)/100;
}
function stats(rows,key){
  const v=rows.map(r=>num(r[key]));
  if(!v.length) return {mean:0,p25:0,median:0,p75:0,p90:0};
  const mean=v.reduce((a,b)=>a+b,0)/v.length;
  return {mean:Math.round(mean*100)/100,p25:quantile(v,.25),median:quantile(v,.5),p75:quantile(v,.75),p90:quantile(v,.9)};
}
function sumNested(rows,group,key){
  return rows.reduce((a,r)=>a+num(r[group]?.[key]),0);
}

export function aggregateNaverBlogCorpus(blogId,listed,analyzed,failures=[]){
  const digest=crypto.createHash("sha256");
  for(const r of analyzed){
    digest.update([r.logNo,r.textChars,r.paragraphCount,r.sentenceCount,r.imageCount,r.avgSentenceChars,r.avgParagraphChars].join(":")+"\n");
  }
  const totalSentences=analyzed.reduce((a,r)=>a+r.sentenceCount,0)||1;
  const endings={};
  for(const k of ["formal","haeyo","jyo","plain","noun","other"]){
    const n=analyzed.reduce((a,r)=>a+num(r.endings?.[k]),0);
    endings[k]={count:n,rate:Math.round(n/totalSentences*10000)/10000};
  }
  const punctuation={};
  for(const k of ["question","exclamation","ellipsis","laugh","cry","emoji"]){
    const n=sumNested(analyzed,"punctuation",k);
    const chars=analyzed.reduce((a,r)=>a+r.textChars,0)||1;
    punctuation[k]={count:n,per1000Chars:Math.round(n/chars*1000000)/1000};
  }
  const dates=listed.map(p=>p.date).filter(Boolean).sort();
  return {
    schemaVersion:1,
    platform:"naver",
    blogId,
    sourceUrl:`https://blog.naver.com/${blogId}`,
    generatedAt:new Date().toISOString(),
    coverage:{
      totalListed:listed.length,
      analyzed:analyzed.length,
      failed:failures.length,
      successRate:listed.length?Math.round(analyzed.length/listed.length*10000)/10000:0,
      firstDate:dates[0]||null,
      lastDate:dates.at(-1)||null,
      corpusDigest:digest.digest("hex"),
    },
    distributions:{
      textChars:stats(analyzed,"textChars"),
      paragraphCount:stats(analyzed,"paragraphCount"),
      sentenceCount:stats(analyzed,"sentenceCount"),
      avgSentenceChars:stats(analyzed,"avgSentenceChars"),
      avgParagraphChars:stats(analyzed,"avgParagraphChars"),
      shortParagraphRate:stats(analyzed,"shortParagraphRate"),
      imageCount:stats(analyzed,"imageCount"),
      imagesPer1000Chars:stats(analyzed,"imagesPer1000Chars"),
      headingCount:stats(analyzed,"headingCount"),
      strongCount:stats(analyzed,"strongCount"),
      centeredBlockCount:stats(analyzed,"centeredBlockCount"),
      maxConsecutiveImageComponents:stats(analyzed,"maxConsecutiveImageComponents"),
      galleryLike:stats(analyzed,"galleryLike"),
    },
    voice:{endings,punctuation},
    structuralTotals:{
      images:analyzed.reduce((a,r)=>a+r.imageCount,0),
      headings:analyzed.reduce((a,r)=>a+r.headingCount,0),
      strong:analyzed.reduce((a,r)=>a+r.strongCount,0),
      lists:analyzed.reduce((a,r)=>a+r.listItemCount,0),
      quotes:analyzed.reduce((a,r)=>a+r.quoteCount,0),
      links:analyzed.reduce((a,r)=>a+r.linkCount,0),
    },
    failures:failures.slice(0,100),
  };
}

export const parseBlogPostMetrics = parseNaverPostMetrics;
