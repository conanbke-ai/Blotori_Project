import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const corpusDir=process.argv[2]||"tmp-blog-corpus/final";
const seedPath=process.argv[3]||"data/blog-corpus/blogchart-top10-v1.json";
const outputDir=process.argv[4]||"tmp-blog-corpus/finalized";

fs.mkdirSync(outputDir,{recursive:true});
const clusterPath=path.join(outputDir,"category-blog-dna-v1.json");
const presetsPath=path.join(outputDir,"category-blog-presets-v1.json");
const coveragePath=path.join(outputDir,"coverage-v1.json");

function run(script,args){
  execFileSync(process.execPath,[script,...args],{stdio:"inherit"});
}
run("scripts/blog-corpus/rebuild-global-coverage.mjs",[corpusDir,seedPath,coveragePath]);
run("scripts/blog-corpus/cluster-blog-dna.mjs",[corpusDir,clusterPath]);
run("scripts/blog-corpus/synthesize-category-presets.mjs",[clusterPath,presetsPath]);
run("scripts/blog-corpus/validate-materialized-corpus.mjs",[presetsPath,coveragePath]);

const coverage=JSON.parse(fs.readFileSync(coveragePath,"utf8"));
const presets=JSON.parse(fs.readFileSync(presetsPath,"utf8"));
if(coverage.materializedSites!==310||coverage.missingSites!==0||presets.inputBlogs<300){
  throw new Error(`FINAL_CORPUS_INCOMPLETE sites=${coverage.materializedSites} missing=${coverage.missingSites} inputBlogs=${presets.inputBlogs}`);
}

console.log("FINAL_CORPUS_READY",JSON.stringify({
  materializedSites:coverage.materializedSites,
  totalListed:coverage.totalListed,
  analyzed:coverage.analyzed,
  failed:coverage.failed,
  inputBlogs:presets.inputBlogs,
  categories:Object.keys(presets.categories||{}).length,
  presets:Object.values(presets.categories||{}).reduce((a,c)=>a+(c.presets?.length||0),0),
}));
