import fs from "node:fs";

const presetPath=process.argv[2]||"data/blog-corpus/category-blog-presets-v1.json";
const coveragePath=process.argv[3]||"data/blog-corpus/coverage-v1.json";

function fail(message){console.error("CORPUS_QA_FAIL",message);process.exitCode=1;}

if(!fs.existsSync(presetPath)) fail("preset library missing: "+presetPath);
if(!fs.existsSync(coveragePath)) fail("coverage report missing: "+coveragePath);
if(process.exitCode) process.exit();

const library=JSON.parse(fs.readFileSync(presetPath,"utf8"));
const coverage=JSON.parse(fs.readFileSync(coveragePath,"utf8"));
const categories=library.categories||{};
const categoryEntries=Object.entries(categories);

if(![1,2].includes(library.schemaVersion)) fail("unexpected preset schemaVersion");
if(!library.generatedAt) fail("materialized generatedAt missing");
if(!library.inputBlogs||library.inputBlogs<100) fail("inputBlogs unexpectedly low: "+library.inputBlogs);
if(categoryEntries.length<15) fail("too few materialized categories: "+categoryEntries.length);

let presetCount=0;
for(const [category,data] of categoryEntries){
  const presets=Array.isArray(data.presets)?data.presets:[];
  if(!presets.length) fail("no presets for category "+category);
  if(presets.length>5) fail("too many presets for category "+category);
  presetCount+=presets.length;
  for(const preset of presets){
    if(!preset.id||!preset.label||!preset.dna) fail("invalid preset in "+category);
    if(preset.sourceMeta?.kind!=="blogchart-top10-full-corpus") fail("preset is not observed corpus: "+preset.id);
    const meta=preset.sourceMeta;
    if(!meta.blogCount||meta.blogCount<1) fail("blogCount missing: "+preset.id);
    if(meta.totalListedPosts<1) fail("no listed posts: "+preset.id);
    if(meta.analyzedPosts<1) fail("no analyzed posts: "+preset.id);
    if(meta.successRate<0.65) fail("success rate too low: "+preset.id+" "+meta.successRate);
    if(meta.analyzedPosts>meta.totalListedPosts) fail("analyzed exceeds listed: "+preset.id);
    if(library.schemaVersion===2){
      for(const key of ["textCoverageRate","visualCoverageRate","visualOnlyRate"]){
        const value=Number(meta[key]);
        if(!Number.isFinite(value)||value<0||value>1) fail("invalid "+key+": "+preset.id+" "+meta[key]);
      }
    }
    const dna=preset.dna;
    for(const key of ["voice","mood","structure","imageRhythm","visual","variation"]){
      if(!dna[key]) fail("missing DNA dimension "+key+": "+preset.id);
    }
    for(const key of ["identityFidelity","structureFreedom","wordingFreedom","imageFreedom"]){
      const value=Number(dna.variation?.[key]);
      if(!Number.isFinite(value)||value<0||value>1) fail("invalid variation "+key+": "+preset.id);
    }
  }
}

if(![1,2].includes(coverage.schemaVersion)) fail("unexpected coverage schemaVersion");
if(coverage.schemaVersion===2){
  if(coverage.expectedThemes!==31) fail("expectedThemes must be 31");
  if(coverage.expectedRankedSlots!==310) fail("expectedRankedSlots must be 310");
  if(coverage.sites!==310) fail("expected exactly 310 ranked sites, got "+coverage.sites);
  if(coverage.materializedSites!==310) fail("materializedSites must be 310, got "+coverage.materializedSites);
  if(coverage.missingSites!==0) fail("missingSites must be 0, got "+coverage.missingSites);
}
if(coverage.themes!==31) fail("expected 31 coverage themes, got "+coverage.themes);
if(coverage.sites<250) fail("too few ranked sites covered: "+coverage.sites);
if(coverage.totalListed<1||coverage.analyzed<1) fail("empty coverage");
const globalRate=coverage.totalListed?coverage.analyzed/coverage.totalListed:0;
if(globalRate<0.75) fail("global analyzed/listed rate too low: "+globalRate.toFixed(4));
if(library.schemaVersion===2){
  if(library.deduplicatedSources!==true) fail("v2 preset library must certify deduplicatedSources=true");
  if(!library.deduplicationKey) fail("v2 preset library missing deduplicationKey");
  const trueFailureRate=coverage.totalListed?coverage.failed/coverage.totalListed:0;
  if(trueFailureRate>0.02) fail("true failure rate too high for bias-corrected corpus: "+trueFailureRate.toFixed(4));
  if(!Number.isFinite(Number(coverage.textEligible))) fail("textEligible missing from coverage v2");
  if(!Number.isFinite(Number(coverage.visualEligible))) fail("visualEligible missing from coverage v2");
  if(!Number.isFinite(Number(coverage.visualOnly))) fail("visualOnly missing from coverage v2");
}

if(!process.exitCode){
  console.log("CORPUS_QA_PASS",JSON.stringify({
    generatedAt:library.generatedAt,
    inputBlogs:library.inputBlogs,
    categories:categoryEntries.length,
    presets:presetCount,
    sites:coverage.sites,
    totalListed:coverage.totalListed,
    analyzed:coverage.analyzed,
    failed:coverage.failed,
    textEligible:coverage.textEligible,
    visualEligible:coverage.visualEligible,
    visualOnly:coverage.visualOnly,
    globalRate:Math.round(globalRate*10000)/10000
  }));
}
