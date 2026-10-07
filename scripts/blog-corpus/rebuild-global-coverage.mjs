import fs from "node:fs";
import path from "node:path";

const corpusDir=process.argv[2]||"tmp-blog-corpus/combined";
const seedPath=process.argv[3]||"data/blog-corpus/blogchart-top10-v1.json";
const output=process.argv[4]||"tmp-blog-corpus/coverage-v1.json";

const seed=JSON.parse(fs.readFileSync(seedPath,"utf8"));
const expected=new Map();
for(const t of seed.themes||[]){
  for(const b of t.blogs||[]) expected.set(`${t.code}#${b.rank}`,{theme:t.code,rank:b.rank,platform:b.platform,url:b.url});
}
const records=new Map();
function walk(dir){
  if(!fs.existsSync(dir)) return;
  for(const name of fs.readdirSync(dir)){
    const p=path.join(dir,name),s=fs.statSync(p);
    if(s.isDirectory()) walk(p);
    else if(name.endsWith(".json")&&name!=="summary.json"&&name!=="coverage.json"){
      try{
        const o=JSON.parse(fs.readFileSync(p,"utf8"));
        if(!o?.coverage||!o?.theme||o?.rank==null) continue;
        const key=`${o.theme}#${o.rank}`;
        const current=records.get(key);
        const score=(x)=>(x?.coverage?.analyzed||0)-(x?.coverage?.failed||0)*0.1;
        if(!current||score(o)>score(current)) records.set(key,o);
      }catch{}
    }
  }
}
walk(corpusDir);

const rows=[];
for(const t of seed.themes||[]){
  const targets=[];
  for(const b of t.blogs||[]){
    const key=`${t.code}#${b.rank}`;
    const o=records.get(key);
    targets.push(o?{
      theme:t.code,rank:b.rank,platform:o.platform||b.platform,url:o.sourceUrl||b.url,
      totalListed:o.coverage.totalListed||0,analyzed:o.coverage.analyzed||0,failed:o.coverage.failed||0,
      successRate:o.coverage.successRate||0,fullCoverage:Boolean(o.fullCoverage),
      missing:false
    }:{
      theme:t.code,rank:b.rank,platform:b.platform,url:b.url,totalListed:0,analyzed:0,failed:0,successRate:0,fullCoverage:false,missing:true
    });
  }
  rows.push({
    theme:t.code,
    sites:targets.length,
    materializedSites:targets.filter(x=>!x.missing).length,
    totalListed:targets.reduce((a,b)=>a+b.totalListed,0),
    analyzed:targets.reduce((a,b)=>a+b.analyzed,0),
    failed:targets.reduce((a,b)=>a+b.failed,0),
    fullCoverageSites:targets.filter(x=>x.fullCoverage).length,
    blockedSites:targets.filter(x=>!x.missing&&!x.fullCoverage&&x.totalListed===0).length,
    missingSites:targets.filter(x=>x.missing).length,
    targets
  });
}
const report={
  schemaVersion:2,
  generatedAt:new Date().toISOString(),
  expectedThemes:31,
  expectedRankedSlots:310,
  themes:rows.length,
  sites:rows.reduce((a,b)=>a+b.sites,0),
  materializedSites:rows.reduce((a,b)=>a+b.materializedSites,0),
  totalListed:rows.reduce((a,b)=>a+b.totalListed,0),
  analyzed:rows.reduce((a,b)=>a+b.analyzed,0),
  failed:rows.reduce((a,b)=>a+b.failed,0),
  fullCoverageSites:rows.reduce((a,b)=>a+b.fullCoverageSites,0),
  blockedSites:rows.reduce((a,b)=>a+b.blockedSites,0),
  missingSites:rows.reduce((a,b)=>a+b.missingSites,0),
  rows
};
fs.mkdirSync(path.dirname(output),{recursive:true});
fs.writeFileSync(output,JSON.stringify(report,null,2));
console.log("COVERAGE_REBUILT",JSON.stringify({
  themes:report.themes,sites:report.sites,materializedSites:report.materializedSites,
  missingSites:report.missingSites,totalListed:report.totalListed,analyzed:report.analyzed,failed:report.failed
}));
if(report.themes!==31||report.sites!==310||report.missingSites!==0){
  console.error("COVERAGE_INCOMPLETE");
  process.exitCode=2;
}
