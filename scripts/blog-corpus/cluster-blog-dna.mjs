import fs from "node:fs";
import path from "node:path";

const CATEGORY_THEME_MAP={
  health:["health-medical","diet"],
  food:["food"],
  daily:["parenting","photography"],
  travel:["domestic-travel","overseas-travel"],
  review:["it-review","car-review","beauty"],
  education:["education","books"],
  hobby:["design","music","photography"],
  tech:["it-review"],
  "beauty-fashion":["beauty","fashion"],
  "parenting-family":["parenting","wedding"],
  pets:["pets"],
  "real-estate":["real-estate"],
  finance:["finance"],
  career:["jobs"],
  auto:["car-review"],
  "gaming-entertainment":["games","movies","comics-anime","entertainment","celebrities"],
  "living-interior":["interior"],
  "marketing-business":["marketing"],
  "outdoor-sports":["sports","hiking","camping","fishing"],
};

const FEATURES=[
  ["textChars","distributions.textChars.median"],
  ["avgSentenceChars","distributions.avgSentenceChars.median"],
  ["avgParagraphChars","distributions.avgParagraphChars.median"],
  ["shortParagraphRate","distributions.shortParagraphRate.median"],
  ["imageCount","distributions.imageCount.median"],
  ["imagesPer1000Chars","distributions.imagesPer1000Chars.median"],
  ["headingCount","distributions.headingCount.median"],
  ["strongCount","distributions.strongCount.median"],
  ["centeredBlockCount","distributions.centeredBlockCount.median"],
  ["imageRun","distributions.maxConsecutiveImageComponents.median"],
  ["imageRunCount","distributions.imageRunCount.median"],
  ["avgImageRunLength","distributions.avgImageRunLength.median"],
  ["textImageTransitions","distributions.textImageTransitions.median"],
  ["textBeforeFirstImage","distributions.textComponentsBeforeFirstImage.median"],
  ["textBetweenImageRuns","distributions.avgTextComponentsBetweenImageRuns.median"],
  ["hashtagCount","distributions.hashtagCount.median"],
  ["titleLength","distributions.titleLength.median"],
  ["closingParagraphChars","distributions.closingParagraphChars.median"],
  ["closingHasHashtag","distributions.closingHasHashtag.median"],
  ["mapCount","distributions.mapCount.median"],
  ["videoCount","distributions.videoCount.median"],
  ["visualOnlyRate","coverage.visualOnlyRate"],
  ["visualCoverageRate","coverage.visualCoverageRate"],
  ["textCoverageRate","coverage.textCoverageRate"],
  ["formalRate","voice.endings.formal.rate"],
  ["haeyoRate","voice.endings.haeyo.rate"],
  ["jyoRate","voice.endings.jyo.rate"],
  ["plainRate","voice.endings.plain.rate"],
  ["nounRate","voice.endings.noun.rate"],
  ["question","voice.punctuation.question.per1000Chars"],
  ["exclamation","voice.punctuation.exclamation.per1000Chars"],
  ["laugh","voice.punctuation.laugh.per1000Chars"],
  ["emoji","voice.punctuation.emoji.per1000Chars"],
];

function get(o,p){return p.split(".").reduce((v,k)=>v?.[k],o);}
function mean(v){return v.length?v.reduce((a,b)=>a+b,0)/v.length:0;}
function sd(v,m=mean(v)){return Math.sqrt(mean(v.map(x=>(x-m)**2)))||1;}
function dist(a,b){return Math.sqrt(a.reduce((s,x,i)=>s+(x-b[i])**2,0));}
function avgVec(rows){return rows[0].vec.map((_,i)=>mean(rows.map(r=>r.vec[i])));}

function kmeans(rows,k){
  if(rows.length<=k) return rows.map((r,i)=>({id:i+1,members:[r],centroid:r.vec}));
  const centroids=[rows[0].vec];
  while(centroids.length<k){
    let best=null,bestD=-1;
    for(const r of rows){
      const d=Math.min(...centroids.map(c=>dist(r.vec,c)));
      if(d>bestD){bestD=d;best=r;}
    }
    centroids.push(best.vec);
  }
  let groups=[];
  for(let iter=0;iter<40;iter++){
    groups=Array.from({length:k},()=>[]);
    for(const r of rows){
      let bi=0,bd=Infinity;
      centroids.forEach((c,i)=>{const d=dist(r.vec,c);if(d<bd){bd=d;bi=i;}});
      groups[bi].push(r);
    }
    let changed=false;
    for(let i=0;i<k;i++){
      if(!groups[i].length) continue;
      const next=avgVec(groups[i]);
      if(dist(next,centroids[i])>1e-6) changed=true;
      centroids[i]=next;
    }
    if(!changed) break;
  }
  return groups.filter(g=>g.length).map((members,i)=>({id:i+1,members,centroid:avgVec(members)}));
}

function inferLabel(raw){
  const image=raw.imageCount||0, para=raw.avgParagraphChars||0, sent=raw.avgSentenceChars||0;
  const info=raw.headingCount||0, formal=raw.formalRate||0, haeyo=raw.haeyoRate||0;
  const emo=(raw.exclamation||0)+(raw.laugh||0)+(raw.emoji||0);
  const transitions=raw.textImageTransitions||0, hashtags=raw.hashtagCount||0;
  const run=raw.avgImageRunLength||0, visualOnly=raw.visualOnlyRate||0;
  if(visualOnly>=0.18&&image>=5) return "비주얼 중심·짧은텍스트형";
  if(image>=12&&para<=90&&transitions>=5) return "사진-짧은코멘트 교차형";
  if(image>=12&&run>=2) return "사진 묶음 중심 비주얼형";
  if(info>=4&&formal>haeyo) return "구조화 전문 정보형";
  if(info>=3) return "소제목 중심 정보형";
  if(hashtags>=8&&haeyo>=formal) return "검색키워드 강화 후기형";
  if(emo>=2&&haeyo>=formal) return "친근한 경험·리액션형";
  if(sent>=45||para>=180) return "긴 호흡 설명·칼럼형";
  return "균형형 블로그 서술";
}

function rawCentroid(members){
  const out={};
  for(const [name,path] of FEATURES) out[name]=Math.round(mean(members.map(r=>Number(get(r.data,path)||0)))*10000)/10000;
  return out;
}

const inputDir=process.argv[2]||"tmp-blog-corpus/all";
const output=process.argv[3]||"tmp-blog-corpus/category-clusters.json";
const files=[];
(function walk(dir){
  if(!fs.existsSync(dir)) return;
  for(const name of fs.readdirSync(dir)){
    const p=path.join(dir,name),s=fs.statSync(p);
    if(s.isDirectory()) walk(p);
    else if(name.endsWith(".json")&&name!=="summary.json") files.push(p);
  }
})(inputDir);

const blogs=[];
for(const file of files){
  try{
    const data=JSON.parse(fs.readFileSync(file,"utf8"));
    if(!data.coverage||!data.theme||data.coverage.analyzed<1) continue;
    blogs.push({data,file,theme:data.theme,sourceUrl:data.sourceUrl,rank:data.rank,platform:data.platform});
  }catch{}
}

const result={schemaVersion:1,generatedAt:new Date().toISOString(),inputBlogs:blogs.length,categories:{}};
for(const [category,themes] of Object.entries(CATEGORY_THEME_MAP)){
  const members=blogs.filter(b=>themes.includes(b.theme));
  if(!members.length){result.categories[category]={themes,blogs:0,clusters:[]};continue;}
  const raw=members.map(b=>FEATURES.map(([,p])=>Number(get(b.data,p)||0)));
  const means=raw[0].map((_,i)=>mean(raw.map(v=>v[i])));
  const sds=raw[0].map((_,i)=>sd(raw.map(v=>v[i]),means[i]));
  const rows=members.map((b,ri)=>({...b,vec:raw[ri].map((v,i)=>(v-means[i])/sds[i])}));
  const k=Math.max(1,Math.min(5,Math.max(3,Math.round(Math.sqrt(rows.length/2)))));
  const clusters=kmeans(rows,Math.min(k,rows.length)).map(cluster=>{
    const rc=rawCentroid(cluster.members);
    return {
      id:cluster.id,
      label:inferLabel(rc),
      blogCount:cluster.members.length,
      centroid:rc,
      members:cluster.members.map(m=>({theme:m.theme,rank:m.rank,platform:m.platform,sourceUrl:m.sourceUrl,coverage:m.data.coverage,representativePosts:m.data.representativePosts||[]})),
    };
  }).sort((a,b)=>b.blogCount-a.blogCount);
  result.categories[category]={themes,blogs:members.length,clusters};
}
fs.mkdirSync(path.dirname(output),{recursive:true});
fs.writeFileSync(output,JSON.stringify(result,null,2));
console.log("CLUSTER_DONE",output,"blogs",blogs.length);
for(const [cat,v] of Object.entries(result.categories)) console.log("CATEGORY",cat,v.blogs,v.clusters.map(c=>`${c.label}:${c.blogCount}`).join(" | "));
