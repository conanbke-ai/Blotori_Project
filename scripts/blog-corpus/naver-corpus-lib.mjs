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
    const node=$(el);
    const cls=node.attr("class")||"";
    let type="other";
    if(/image/i.test(cls)) type="image";
    else if(/text/i.test(cls)) type="text";
    else if(/map/i.test(cls)) type="map";
    else if(/quote/i.test(cls)) type="quote";
    else if(/horizontal|line/i.test(cls)) type="divider";
    else if(/video/i.test(cls)) type="video";
    seq.push({type,textChars:type==="text"?clean(node.text()).length:0});
  });
  let maxImageRun=0,run=0,imageComponents=0,imageRunCount=0,imageRunTotal=0;
  let textImageTransitions=0,prev=null,textBeforeFirstImage=0,seenImage=false;
  const textGaps=[];
  let gapTextComponents=0;
  for(const item of seq){
    const t=item.type;
    if(!seenImage && t==="text") textBeforeFirstImage++;
    if(t==="image"){
      if(!run){imageRunCount++; if(seenImage) textGaps.push(gapTextComponents); gapTextComponents=0;}
      run++; imageComponents++; imageRunTotal++; maxImageRun=Math.max(maxImageRun,run); seenImage=true;
    }else{
      run=0;
      if(seenImage && t==="text") gapTextComponents++;
    }
    if(prev && ((prev==="image"&&t==="text")||(prev==="text"&&t==="image"))) textImageTransitions++;
    if(t==="image"||t==="text") prev=t;
  }
  const avgImageRunLength=imageRunCount?Math.round(imageRunTotal/imageRunCount*100)/100:0;
  const avgTextComponentsBetweenImageRuns=textGaps.length?Math.round(textGaps.reduce((a,b)=>a+b,0)/textGaps.length*100)/100:0;
  return {sequenceLength:seq.length,imageComponents,maxImageRun,imageRunCount,avgImageRunLength,textImageTransitions,textBeforeFirstImage,avgTextComponentsBetweenImageRuns};
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
    titleLength:Number(meta.titleLength||0),
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
    imageRunCount:seq.imageRunCount,
    avgImageRunLength:seq.avgImageRunLength,
    textImageTransitions:seq.textImageTransitions,
    textComponentsBeforeFirstImage:seq.textBeforeFirstImage,
    avgTextComponentsBetweenImageRuns:seq.avgTextComponentsBetweenImageRuns,
    hashtagCount:countMatches(text,/(?:^|\s)#[0-9A-Za-z가-힣_]+/gu),
    mapCount:root.find('.se-map,.se-component[class*="map"]').length,
    videoCount:root.find('video,.se-video,.se-component[class*="video"]').length,
    closingParagraphChars:blocks.length?blocks.at(-1).length:0,
    closingHasHashtag:blocks.length&&/(?:^|\s)#[0-9A-Za-z가-힣_]+/u.test(blocks.at(-1))?1:0,
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

export async function fetchNaverPostListPageMetrics(blogId,pagePosts,pageNo,{delayMs=120}={}){
  const url=`https://blog.naver.com/PostList.naver?blogId=${encodeURIComponent(blogId)}&categoryNo=0&currentPage=${pageNo}`;
  const html=await fetchText(url,{referer:`https://blog.naver.com/${blogId}`});
  const pageLogs=[...html.matchAll(/logNo[=:"'&]+(\d{8,})/g)].map(m=>m[1]);
  const uniqueLogs=[...new Set(pageLogs)].slice(0,pagePosts.length);
  const expected=pagePosts.map(p=>String(p.logNo));
  if(uniqueLogs.length!==expected.length||uniqueLogs.some((id,i)=>id!==expected[i])){
    throw new Error(`BATCH_LOG_MISMATCH page=${pageNo} expected=${expected.join(",")} actual=${uniqueLogs.join(",")}`);
  }
  const $=cheerio.load(html);
  const roots=$(".se-main-container").toArray();
  if(roots.length<pagePosts.length){
    throw new Error(`BATCH_ROOT_MISMATCH page=${pageNo} expected=${pagePosts.length} actual=${roots.length}`);
  }
  const metrics=pagePosts.map((post,i)=>parseNaverPostMetrics($.html(roots[i]),post));
  if(delayMs) await sleep(delayMs);
  return metrics;
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

function representativePosts(rows,count=3){
  if(!rows.length) return [];
  const keys=["textChars","avgSentenceChars","avgParagraphChars","imageCount","imagesPer1000Chars","shortParagraphRate","headingCount","maxConsecutiveImageComponents"];
  const med=Object.fromEntries(keys.map(k=>[k,quantile(rows.map(r=>r[k]),.5)]));
  const scale=Object.fromEntries(keys.map(k=>[k,Math.max(1,quantile(rows.map(r=>r[k]),.75)-quantile(rows.map(r=>r[k]),.25))]));
  return [...rows].map(r=>{
    const distance=keys.reduce((a,k)=>a+Math.abs(num(r[k])-med[k])/scale[k],0);
    return {logNo:r.logNo,date:r.date,distance:Math.round(distance*1000)/1000};
  }).sort((a,b)=>a.distance-b.distance).slice(0,count);
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
      imageRunCount:stats(analyzed,"imageRunCount"),
      avgImageRunLength:stats(analyzed,"avgImageRunLength"),
      textImageTransitions:stats(analyzed,"textImageTransitions"),
      textComponentsBeforeFirstImage:stats(analyzed,"textComponentsBeforeFirstImage"),
      avgTextComponentsBetweenImageRuns:stats(analyzed,"avgTextComponentsBetweenImageRuns"),
      hashtagCount:stats(analyzed,"hashtagCount"),
      titleLength:stats(analyzed,"titleLength"),
      closingParagraphChars:stats(analyzed,"closingParagraphChars"),
      closingHasHashtag:stats(analyzed,"closingHasHashtag"),
      mapCount:stats(analyzed,"mapCount"),
      videoCount:stats(analyzed,"videoCount"),
      galleryLike:stats(analyzed,"galleryLike"),
    },
    voice:{endings,punctuation},
    representativePosts:representativePosts(analyzed,3),
    structuralTotals:{
      images:analyzed.reduce((a,r)=>a+r.imageCount,0),
      headings:analyzed.reduce((a,r)=>a+r.headingCount,0),
      strong:analyzed.reduce((a,r)=>a+r.strongCount,0),
      lists:analyzed.reduce((a,r)=>a+r.listItemCount,0),
      quotes:analyzed.reduce((a,r)=>a+r.quoteCount,0),
      links:analyzed.reduce((a,r)=>a+r.linkCount,0),
      maps:analyzed.reduce((a,r)=>a+r.mapCount,0),
      videos:analyzed.reduce((a,r)=>a+r.videoCount,0),
      hashtags:analyzed.reduce((a,r)=>a+r.hashtagCount,0),
    },
    failures:failures.slice(0,100),
  };
}

export const parseBlogPostMetrics = parseNaverPostMetrics;
