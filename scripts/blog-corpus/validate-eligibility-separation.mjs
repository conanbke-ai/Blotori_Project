import { aggregateNaverBlogCorpus } from "./naver-corpus-lib.mjs";

const listed=[
  {logNo:"1",date:"20260101"},
  {logNo:"2",date:"20260102"},
  {logNo:"3",date:"20260103"},
  {logNo:"4",date:"20260104"},
];

const row=(overrides={})=>({
  logNo:"x",date:"20260101",titleLength:10,textChars:0,blockCount:0,paragraphCount:0,sentenceCount:0,
  avgSentenceChars:0,avgParagraphChars:0,shortParagraphRate:0,imageCount:0,imagesPer1000Chars:0,
  headingCount:0,strongCount:0,listItemCount:0,quoteCount:0,linkCount:0,galleryLike:0,
  centeredBlockCount:0,leftBlockCount:0,componentSequenceLength:0,imageComponentCount:0,
  maxConsecutiveImageComponents:0,imageRunCount:0,avgImageRunLength:0,textImageTransitions:0,
  textComponentsBeforeFirstImage:0,avgTextComponentsBetweenImageRuns:0,hashtagCount:0,mapCount:0,
  videoCount:0,closingParagraphChars:0,closingHasHashtag:0,
  endings:{formal:0,haeyo:0,jyo:0,plain:0,noun:0,other:0},
  punctuation:{question:0,exclamation:0,ellipsis:0,laugh:0,cry:0,emoji:0},
  eligibility:{text:false,visual:false,observable:false},contentClass:"minimal",
  ...overrides,
});

const analyzed=[
  row({
    logNo:"1",textChars:120,sentenceCount:4,paragraphCount:3,blockCount:3,avgSentenceChars:30,
    avgParagraphChars:40,shortParagraphRate:1,imageCount:2,imagesPer1000Chars:16.7,
    imageComponentCount:2,imageRunCount:1,avgImageRunLength:2,maxConsecutiveImageComponents:2,
    textImageTransitions:2,headingCount:1,strongCount:1,
    endings:{formal:0,haeyo:4,jyo:0,plain:0,noun:0,other:0},
    punctuation:{question:0,exclamation:1,ellipsis:0,laugh:0,cry:0,emoji:0},
    eligibility:{text:true,visual:true,observable:true},contentClass:"mixed",
  }),
  row({
    logNo:"2",textChars:8,sentenceCount:1,paragraphCount:1,blockCount:1,avgSentenceChars:8,
    avgParagraphChars:8,shortParagraphRate:1,imageCount:20,imageComponentCount:20,
    imageRunCount:4,avgImageRunLength:5,maxConsecutiveImageComponents:7,textImageTransitions:3,
    centeredBlockCount:6,
    endings:{formal:0,haeyo:1,jyo:0,plain:0,noun:0,other:0},
    punctuation:{question:0,exclamation:3,ellipsis:0,laugh:2,cry:0,emoji:2},
    eligibility:{text:false,visual:true,observable:true},contentClass:"visual",
  }),
  row({
    logNo:"3",textChars:80,sentenceCount:2,paragraphCount:2,blockCount:2,avgSentenceChars:40,
    avgParagraphChars:40,shortParagraphRate:1,imageCount:0,
    endings:{formal:2,haeyo:0,jyo:0,plain:0,noun:0,other:0},
    punctuation:{question:0,exclamation:0,ellipsis:0,laugh:0,cry:0,emoji:0},
    eligibility:{text:true,visual:false,observable:true},contentClass:"text",
  }),
  row({
    logNo:"4",textChars:3,sentenceCount:1,paragraphCount:1,blockCount:1,avgSentenceChars:3,
    avgParagraphChars:3,shortParagraphRate:1,imageCount:0,
    eligibility:{text:false,visual:false,observable:true},contentClass:"minimal",
  }),
];

const result=aggregateNaverBlogCorpus("fixture",listed,analyzed,[]);

function assert(condition,message){
  if(!condition) throw new Error(message);
}

assert(result.coverage.analyzed===4,"all observable posts must remain analyzed");
assert(result.coverage.textEligible===2,"only 2 posts should be text eligible");
assert(result.coverage.visualEligible===2,"mixed + visual-only should be visual eligible");
assert(result.coverage.failed===0,"short posts must not be true failures");
assert(result.contentMix.visualOnly===1,"visual-only post must be retained");
assert(result.contentMix.textOnly===1,"text-only post must be retained");
assert(result.distributions.imageCount.median===11,"visual distribution must include the 20-image visual-only post");
assert(result.voice.endings.haeyo.count===4,"visual-only short post must not contaminate voice endings");
assert(result.voice.endings.formal.count===2,"text-only post must contribute to voice endings");
assert(result.coverage.visualOnlyRate===0.25,"visual-only rate should use total listed denominator");

console.log("ELIGIBILITY_SEPARATION_PASS",JSON.stringify({
  coverage:result.coverage,
  contentMix:result.contentMix,
  imageMedian:result.distributions.imageCount.median,
  endings:result.voice.endings,
}));
