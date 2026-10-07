import fs from "node:fs";
import path from "node:path";
import { collectGenericBlogCorpus } from "./generic-corpus-lib.mjs";

function arg(name,fallback=null){
  const i=process.argv.indexOf(`--${name}`);
  return i>=0?(process.argv[i+1]??true):fallback;
}
const seedPath=String(arg("seed",""));
const theme=String(arg("theme",""));
const rankFilterRaw=arg("rank");
const rankFilter=rankFilterRaw?Number(rankFilterRaw):null;
const outputDir=String(arg("output","tmp-blog-corpus/generic"));
const delayMs=Number(arg("delay-ms","120"));
const maxPostsRaw=arg("max-posts");
const maxPosts=maxPostsRaw?Number(maxPostsRaw):Infinity;
const concurrency=Math.max(1,Math.min(6,Number(arg("concurrency","3"))));
if(!seedPath) throw new Error("--seed is required");

const seed=JSON.parse(fs.readFileSync(seedPath,"utf8"));
const themes=theme?seed.themes.filter(t=>t.code===theme):seed.themes;
const targets=themes.flatMap(t=>t.blogs.filter(b=>b.platform!=="naver"&&(rankFilter==null||Number(b.rank)===rankFilter)).map(b=>({...b,theme:t.code})));
fs.mkdirSync(outputDir,{recursive:true});
const summaries=[];
for(const [i,target] of targets.entries()){
  console.log("GENERIC_START",i+1,targets.length,target.theme,target.rank,target.platform,target.url);
  const aggregate=await collectGenericBlogCorpus(target,{delayMs,maxPosts,concurrency});
  aggregate.rank=target.rank;
  aggregate.theme=target.theme;
  const safeHost=new URL(target.url).hostname.replace(/[^A-Za-z0-9.-]/g,"_");
  const file=path.join(outputDir,`${target.theme}__${target.rank}__${safeHost}.json`);
  fs.writeFileSync(file,JSON.stringify(aggregate,null,2));
  const summary={theme:target.theme,rank:target.rank,platform:target.platform,url:target.url,totalListed:aggregate.coverage.totalListed,analyzed:aggregate.coverage.analyzed,failed:aggregate.coverage.failed,successRate:aggregate.coverage.successRate,fullCoverage:aggregate.fullCoverage,file:path.basename(file)};
  summaries.push(summary);
  console.log("GENERIC_DONE",JSON.stringify(summary));
}
fs.writeFileSync(path.join(outputDir,"summary.json"),JSON.stringify({generatedAt:new Date().toISOString(),targets:summaries},null,2));
console.log("GENERIC_CORPUS_DONE",JSON.stringify(summaries));
