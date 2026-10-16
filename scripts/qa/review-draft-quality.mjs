#!/usr/bin/env node
// Offline, read-only review of an existing draft. No API, credentials, or DB.
// Usage: node scripts/qa/review-draft-quality.mjs --input artifacts/review-case.json --out artifacts/draft-quality-report.json
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const argv = process.argv.slice(2);
const argument = key => { const i=argv.indexOf(key); return i<0 ? undefined : argv[i+1]; };
if (!argument('--input') || !argument('--out') || argv.includes('--help')) {
  console.error('Usage: node scripts/qa/review-draft-quality.mjs --input <case.json> --out <report.json>');
  process.exit(2);
}
const src = path.resolve(argument('--input'));
const out = path.resolve(argument('--out'));
if (src===out) throw new Error('Input and report must use different paths');
const data = JSON.parse(fs.readFileSync(src,'utf8'));
const {draft, request, caseId, mode} = data;
if (!draft || !request || typeof draft !== 'object' || typeof request !== 'object') throw new Error('Provide {caseId,mode,request,draft} JSON');
if (!Array.isArray(draft.sections) || !Array.isArray(draft.images)) throw new Error('Invalid draft sections/images');
const normalized = s => String(s??'').trim().toLocaleLowerCase('ko-KR').replace(/\s+/g,' ');
const paragraphs = [...(draft.intro??[]), ...draft.sections.flatMap(x=>x.paragraphs??[]), ...(draft.closing??[])].map(normalized).filter(Boolean);
const headings = draft.sections.map(x=>normalized(x.heading)).filter(Boolean);
const countDuplicates = items => items.length-new Set(items).size;
const missing = ['title','intro','sections','closing'].filter(k=>k==='title' ? !String(draft.title??'').trim() : !(Array.isArray(draft[k])&&draft[k].length));
const repeats = paragraphs.filter((v,i)=>paragraphs.indexOf(v)<i);
const sourceText = [request.freeTopic,request.extraConditions,...Object.values(request.attributes??{})].map(String).join(' ');
const outputText = [draft.title,...paragraphs,...headings].join(' ');
const numericClaims = [...new Set(outputText.match(/\d[\d,]*(?:\.\d+)?\s*(?:원|분|시간|개월|년|점)/g)??[])].filter(v=>!sourceText.includes(v));
const isMock = mode==='mock' || /^\[샘플\]/.test(String(draft.title));
const findings = [];
const add=(code,level,detail)=>findings.push({code,level,detail});
if(missing.length) add('MISSING_PART','block',missing.join(', '));
if(countDuplicates(headings)) add('DUPLICATE_HEADINGS','review',countDuplicates(headings));
if(repeats.length) add('REPEATED_PARAGRAPHS','review',repeats.slice(0,3));
if(draft.images.length < Number(request.imageCount??0)) add('IMAGE_PLAN_SHORTAGE','review', {expected:request.imageCount,actual:draft.images.length});
if(numericClaims.length) add('UNVERIFIED_NUMERIC_CLAIMS','review',numericClaims.slice(0,8));
if(isMock) add('MOCK_NOT_REAL_OUTPUT','info','Mock/샘플은 실제 AI 품질 평가에서 제외');
const report = {
  caseId:String(caseId??path.basename(src)), mode:mode??'unknown', generatedAt:new Date().toISOString(),
  metrics:{sectionCount:draft.sections.length,paragraphCount:paragraphs.length,imagePlanCount:draft.images.length,duplicateHeadingCount:countDuplicates(headings),duplicateParagraphCount:repeats.length},
  findings,
  manualReview:{
    factualAccuracy:'NOT_EVALUATED', naturalKorean:'NOT_EVALUATED', blogDnaFidelity:'NOT_EVALUATED',
    experienceAuthenticity:'NOT_EVALUATED', imagePlacementQuality:'NOT_EVALUATED',
    note:'Requires human evaluation against source evidence and the actual approved DNA profile.'
  },
  status:isMock?'MOCK_DIAGNOSTIC_ONLY':'AUTOMATED_SCREEN_COMPLETE_MANUAL_REVIEW_PENDING'
};
fs.mkdirSync(path.dirname(out),{recursive:true});
fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');
console.log('DRAFT_QUALITY_REVIEW',report.status,JSON.stringify(report.metrics));
console.log('FINDINGS',report.findings.length,'REPORT',out);
