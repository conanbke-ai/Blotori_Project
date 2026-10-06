import fs from "node:fs";
import path from "node:path";
import { listAllNaverPosts, fetchNaverPostMetrics, aggregateNaverBlogCorpus } from "./naver-corpus-lib.mjs";

function arg(name,fallback=null){
  const index=process.argv.indexOf(`--${name}`);
  return index>=0 ? (process.argv[index+1] ?? true) : fallback;
}
const blogId=arg("blog");
const seedPath=arg("seed");
const theme=arg("theme");
const outputDir=String(arg("output","tmp-blog-corpus/naver"));
const delayMs=Number(arg("delay-ms","120"));
const maxPostsRaw=arg("max-posts");
const maxPosts=maxPostsRaw?Number(maxPostsRaw):Infinity;

if(!blogId&&!seedPath) throw new Error("Use --blog <id> or --seed <json> [--theme code]");

let targets=[];
if(blogId){
  targets=[{blogId:String(blogId),rank:null,theme:theme||null,url:`https://blog.naver.com/${blogId}`}];
}else{
  const seed=JSON.parse(fs.readFileSync(String(seedPath),"utf8"));
  const themes=theme ? seed.themes.filter((t)=>t.code===theme) : seed.themes;
  targets=themes.flatMap((t)=>t.blogs
    .filter((b)=>b.platform==="naver"&&b.blogId)
    .map((b)=>({blogId:b.blogId,rank:b.rank,theme:t.code,url:b.url})));
}
fs.mkdirSync(outputDir,{recursive:true});

const summaries=[];
for(const [targetIndex,target] of targets.entries()){
  console.log("BLOG_START",targetIndex+1,targets.length,target.theme,target.rank,target.blogId);
  let listed=[];
  const analyzed=[];
  const failures=[];
  try{
    listed=await listAllNaverPosts(target.blogId,{delayMs});
  }catch(error){
    failures.push({stage:"list",message:String(error)});
  }
  const selected=listed.slice(0,Number.isFinite(maxPosts)?maxPosts:listed.length);
  console.log("BLOG_LISTED",target.blogId,listed.length,"SELECTED",selected.length);
  for(const [i,post] of selected.entries()){
    if(post.blocked||post.notOpen) {
      failures.push({logNo:post.logNo,stage:"skip",message:"blocked_or_not_open"});
      continue;
    }
    try{
      const metric=await fetchNaverPostMetrics(target.blogId,post,{delayMs});
      if(metric.textChars<20) throw new Error("EMPTY_OR_TOO_SHORT");
      analyzed.push(metric);
    }catch(error){
      failures.push({logNo:post.logNo,stage:"post",message:String(error).slice(0,300)});
    }
    if((i+1)%50===0||i===selected.length-1) console.log("BLOG_PROGRESS",target.blogId,i+1,selected.length,"ok",analyzed.length,"fail",failures.length);
  }
  const aggregate=aggregateNaverBlogCorpus(target.blogId,listed,analyzed,failures);
  aggregate.rank=target.rank;
  aggregate.theme=target.theme;
  aggregate.requestedPosts=selected.length;
  aggregate.fullCoverage=selected.length===listed.length && !failures.some((item)=>item.stage==="list");
  const filename=path.join(outputDir,`${target.theme||"single"}__${target.rank??0}__${target.blogId}.json`);
  fs.writeFileSync(filename,JSON.stringify(aggregate,null,2));
  summaries.push({
    theme:target.theme,rank:target.rank,blogId:target.blogId,
    totalListed:aggregate.coverage.totalListed,
    analyzed:aggregate.coverage.analyzed,
    failed:aggregate.coverage.failed,
    successRate:aggregate.coverage.successRate,
    fullCoverage:aggregate.fullCoverage,
    file:path.basename(filename),
  });
  console.log("BLOG_DONE",JSON.stringify(summaries.at(-1)));
}
fs.writeFileSync(path.join(outputDir,"summary.json"),JSON.stringify({generatedAt:new Date().toISOString(),targets:summaries},null,2));
console.log("CORPUS_DONE",JSON.stringify(summaries));
