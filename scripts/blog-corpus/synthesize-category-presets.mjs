import fs from "node:fs";
import path from "node:path";

const input=process.argv[2]||"tmp-blog-corpus/category-blog-dna-v1.json";
const output=process.argv[3]||"tmp-blog-corpus/category-blog-presets-v1.json";
const clustered=JSON.parse(fs.readFileSync(input,"utf8"));

function n(v,d=0){return Number.isFinite(Number(v))?Number(v):d;}
function rangeText(v,low,high,labels){
  const x=n(v);
  if(x<=low) return labels[0];
  if(x>=high) return labels[2];
  return labels[1];
}
function voiceSummary(c){
  const formal=n(c.formalRate), haeyo=n(c.haeyoRate), plain=n(c.plainRate);
  const laugh=n(c.laugh), emoji=n(c.emoji), ex=n(c.exclamation);
  const parts=[];
  if(formal>=haeyo&&formal>=plain) parts.push("합니다체 중심");
  else if(haeyo>=formal&&haeyo>=plain) parts.push("해요체 중심");
  else if(plain>0.25) parts.push("서술형 평서체 비중이 높음");
  else parts.push("혼합 종결어미");
  if(laugh+emoji+ex>=3) parts.push("리액션 표현이 비교적 활발");
  else if(laugh+emoji+ex<=0.8) parts.push("감탄·이모지 사용은 절제");
  return parts.join(", ");
}
function structureSummary(c){
  const headings=n(c.headingCount), para=n(c.avgParagraphChars), short=n(c.shortParagraphRate);
  const bits=[];
  bits.push(headings>=4?"소제목을 적극적으로 사용":headings>=1.5?"필요한 구간에 소제목 사용":"소제목보다 자연스러운 흐름 위주");
  bits.push(para<=80||short>=0.65?"짧은 문단 호흡":para>=180?"긴 설명 문단":"중간 길이 문단");
  return bits.join(", ");
}
function imageSummary(c){
  const images=n(c.imageCount), trans=n(c.textImageTransitions), run=n(c.avgImageRunLength), gap=n(c.textBetweenImageRuns);
  const density=images>=15?"사진 비중이 매우 높음":images>=7?"사진 비중이 높은 편":images>=3?"사진을 적절히 사용":"텍스트 중심";
  let rhythm="이미지를 섹션 전환점에 배치";
  if(trans>=6) rhythm="사진과 짧은 텍스트를 자주 교차";
  else if(run>=2) rhythm="사진을 2장 이상 묶어서 보여주는 구간이 많음";
  const gapText=gap<=1.5?"사진 묶음 사이 텍스트가 짧음":gap>=4?"사진 사이 설명이 비교적 김":"사진 사이 설명 길이가 중간";
  return `${density}, ${rhythm}, ${gapText}`;
}
function visualSummary(c){
  const center=n(c.centeredBlockCount), strong=n(c.strongCount), heading=n(c.headingCount);
  const bits=[];
  bits.push(center>=5?"중앙 정렬 요소를 자주 사용":"본문 좌측 정렬 중심");
  bits.push(strong>=6?"강조 표현을 자주 사용":strong>=2?"핵심만 선택적으로 강조":"강조 장식이 적음");
  bits.push(heading>=4?"소제목으로 시각적 구획이 뚜렷함":"여백과 이미지로 구획");
  return bits.join(", ");
}
function moodKeywords(label,c){
  const tags=[label];
  if(n(c.imageCount)>=10) tags.push("사진중심");
  if(n(c.formalRate)>n(c.haeyoRate)) tags.push("전문적");
  else tags.push("친근함");
  if(n(c.avgParagraphChars)<=90) tags.push("빠른호흡");
  else if(n(c.avgParagraphChars)>=180) tags.push("긴호흡");
  if(n(c.exclamation)+n(c.laugh)+n(c.emoji)>=2) tags.push("리액션");
  return [...new Set(tags)].slice(0,6);
}
function buildPreset(category,cluster,index){
  const c=cluster.centroid||{};
  const members=cluster.members||[];
  const totalListed=members.reduce((a,m)=>a+n(m.coverage?.totalListed),0);
  const analyzed=members.reduce((a,m)=>a+n(m.coverage?.analyzed),0);
  const failed=members.reduce((a,m)=>a+n(m.coverage?.failed),0);
  const successRate=totalListed?Math.round(analyzed/totalListed*10000)/10000:0;
  const voice=voiceSummary(c);
  const structure=structureSummary(c);
  const image=imageSummary(c);
  const visual=visualSummary(c);
  const tags=moodKeywords(cluster.label,c);
  const identity=Math.max(.74,Math.min(.9,.78+Math.min(cluster.blogCount,5)*.02));
  return {
    id:`${category}-observed-${String(index+1).padStart(2,"0")}`,
    categoryId:category,
    label:cluster.label,
    description:`${structure} · ${image}`,
    tags,
    sourceMeta:{
      kind:"blogchart-top10-full-corpus",
      schemaVersion:1,
      generatedAt:clustered.generatedAt,
      blogCount:cluster.blogCount,
      totalListedPosts:totalListed,
      analyzedPosts:analyzed,
      failedPosts:failed,
      successRate,
      members:members.map(m=>({
        theme:m.theme,rank:m.rank,platform:m.platform,sourceUrl:m.sourceUrl,
        coverage:m.coverage,
      })),
    },
    dna:{
      version:2,
      signature:`${voice}. ${structure}. ${image}. ${visual}.`,
      confidence:successRate>=.95&&cluster.blogCount>=3?"high":successRate>=.8?"medium":"low",
      evidenceSummary:`BlogChart TOP10 표본 ${cluster.blogCount}개 블로그의 공개 포스팅 전수 지표를 집계했습니다. 분석 ${analyzed}/목록 ${totalListed}, 실패 ${failed}.`,
      voice:{
        summary:voice,
        endings:[
          `합니다체 비율 ${Math.round(n(c.formalRate)*100)}%`,
          `해요체 비율 ${Math.round(n(c.haeyoRate)*100)}%`,
          `죠/쥬체 비율 ${Math.round(n(c.jyoRate)*100)}%`,
          `평서체 비율 ${Math.round(n(c.plainRate)*100)}%`,
        ],
        sentenceRhythm:`중앙값 문장 길이 약 ${Math.round(n(c.avgSentenceChars))}자`,
        paragraphRhythm:`중앙값 문단 길이 약 ${Math.round(n(c.avgParagraphChars))}자, 짧은 문단 비율 약 ${Math.round(n(c.shortParagraphRate)*100)}%`,
        transitions:[],
        lexicalHabits:[],
        emotionPattern:`1,000자당 물음표 ${n(c.question).toFixed(1)}, 느낌표 ${n(c.exclamation).toFixed(1)}, 웃음표현 ${n(c.laugh).toFixed(1)}, 이모지 ${n(c.emoji).toFixed(1)}`,
        readerDistance:n(c.haeyoRate)>=n(c.formalRate)?"독자에게 가까운 대화형":"정보 전달 중심의 일정한 거리",
        punctuationHabits:[
          `물음표 ${n(c.question).toFixed(1)}/1000자`,
          `느낌표 ${n(c.exclamation).toFixed(1)}/1000자`,
          `ㅋㅋ/ㅎㅎ ${n(c.laugh).toFixed(1)}/1000자`,
          `이모지 ${n(c.emoji).toFixed(1)}/1000자`,
        ],
        avoid:["특정 원문 문구 복제","최근 생성글과 동일한 도입·마무리 반복"],
        metrics:{
          avgSentenceChars:n(c.avgSentenceChars),
          avgParagraphSentences:0,
          questionRate:rangeText(c.question,.5,2,["low","medium","high"]),
          exclamationRate:rangeText(c.exclamation,.5,2,["low","medium","high"]),
          emoticonDensity:rangeText(n(c.laugh)+n(c.emoji),.5,2,["low","medium","high"]),
        },
      },
      mood:{
        summary:tags.join(", "),
        keywords:tags,
        warmth:n(c.haeyoRate)>=n(c.formalRate)?"높은 편":"중간",
        energy:n(c.exclamation)+n(c.laugh)+n(c.emoji)>=2?"활발":"차분",
        intimacy:n(c.haeyoRate)>=.2?"중간 이상":"중간 이하",
        informationDensity:n(c.avgParagraphChars)>=140||n(c.headingCount)>=4?"높음":"중간",
        visualMood:visual,
      },
      structure:{
        summary:structure,
        openingPatterns:[
          n(c.textBeforeFirstImage)<=1?"도입 텍스트를 짧게 쓰고 빠르게 첫 이미지로 진입":"도입 설명 후 첫 이미지 진입",
          n(c.titleLength)>=35?"검색 의도와 핵심 키워드를 제목에 충분히 포함":"간결한 제목으로 시작",
        ],
        sectionPatterns:[
          n(c.headingCount)>=3?"소제목 → 설명 → 관련 이미지":"사진/장면 → 짧은 설명 → 다음 장면",
          n(c.textImageTransitions)>=5?"텍스트와 이미지를 자주 교차":"섹션 단위로 텍스트와 이미지를 묶음",
        ],
        closingPatterns:[
          n(c.closingHasHashtag)>=.5?"짧은 총평 뒤 해시태그 묶음":"짧은 총평 또는 추천 대상",
          n(c.hashtagCount)>=8?"검색 키워드형 해시태그를 비교적 많이 사용":"필요한 태그만 제한적으로 사용",
        ],
        fixedPrinciples:["카테고리 핵심 정보와 실제 경험을 분리하지 않고 연결","본문 리듬은 전체 코퍼스 중앙값 범위에서 유지"],
        flexiblePatterns:["소제목 수","사진 묶음 크기","도입 방식","마무리 표현","사진 사이 문장 수"],
        contentBalance:n(c.formalRate)>n(c.haeyoRate)?"정보 비중 높음":"경험과 정보의 균형",
      },
      imageRhythm:{
        summary:image,
        cadence:`게시글당 이미지 중앙값 ${Math.round(n(c.imageCount))}개, 텍스트↔이미지 전환 중앙값 ${Math.round(n(c.textImageTransitions))}회`,
        grouping:`평균 이미지 묶음 길이 ${n(c.avgImageRunLength).toFixed(1)}, 최대 연속 이미지 중앙값 ${Math.round(n(c.imageRun))}개`,
        placementRules:[
          `첫 이미지 전 텍스트 컴포넌트 중앙값 ${n(c.textBeforeFirstImage).toFixed(1)}개`,
          `이미지 묶음 사이 텍스트 컴포넌트 중앙값 ${n(c.textBetweenImageRuns).toFixed(1)}개`,
        ],
        rolePreferences:["HERO","CONTEXT","EXPLAINER","TIP"],
        adaptationRules:["현재 보유 사진 수가 적으면 섹션을 압축","사진 수가 많으면 관찰된 묶음 길이 범위에서 분산","슬롯 번호보다 사진 의미와 글 흐름 우선"],
      },
      visual:{
        summary:visual,
        alignment:n(c.centeredBlockCount)>=5?"중앙 정렬 사용 빈도가 높음":"좌측 정렬 중심",
        emphasis:n(c.strongCount)>=5?"강조 요소를 자주 사용":"강조 요소는 제한적",
        whitespace:n(c.avgParagraphChars)<=90?"짧은 문단과 넓은 호흡":"중간~긴 설명 호흡",
        headingStyle:n(c.headingCount)>=3?"소제목 구획이 명확":"소제목보다 흐름 중심",
        decorationHabits:[
          n(c.mapCount)>=1?"지도/위치 컴포넌트 활용":"지도 사용은 선택적",
          n(c.videoCount)>=1?"영상 컴포넌트도 일부 활용":"영상 의존도 낮음",
          n(c.hashtagCount)>=8?"해시태그를 적극 활용":"해시태그는 절제",
        ],
        avoid:["전체 글의 동일 레이아웃 반복","근거 없는 장식 추가"],
      },
      variation:{
        identityFidelity:Math.round(identity*100)/100,
        structureFreedom:.42,
        wordingFreedom:.55,
        imageFreedom:.48,
        antiRepetitionRules:["같은 도입 패턴 연속 사용 금지","최근 글과 동일한 소제목 순서 회피","사진 묶음 위치와 크기 변주","동일한 마무리 문구 반복 금지"],
      },
    },
  };
}

const categories={};
for(const [category,data] of Object.entries(clustered.categories||{})){
  categories[category]={
    themes:data.themes,
    analyzedBlogs:data.blogs,
    presets:(data.clusters||[]).slice(0,5).map((cluster,index)=>buildPreset(category,cluster,index)),
  };
}
const result={
  schemaVersion:1,
  generatedAt:new Date().toISOString(),
  source:"BlogChart TOP10 x public full-post corpus",
  inputBlogs:clustered.inputBlogs,
  categories,
};
fs.mkdirSync(path.dirname(output),{recursive:true});
fs.writeFileSync(output,JSON.stringify(result,null,2));
console.log("PRESET_LIBRARY_DONE",output,"categories",Object.keys(categories).length,"blogs",clustered.inputBlogs);
for(const [category,data] of Object.entries(categories)){
  console.log("PRESET_CATEGORY",category,data.analyzedBlogs,data.presets.map(p=>p.label).join(" | "));
}
