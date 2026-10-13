import fs from "node:fs";
import path from "node:path";
import { listAllNaverPosts, fetchNaverPostMetrics, fetchNaverPostListPageMetrics, aggregateNaverBlogCorpus } from "./naver-corpus-lib.mjs";
import { RecoveryCheckpoint } from "./recovery-checkpoint-lib.mjs";

function arg(name,fallback=null){
  const index=process.argv.indexOf(`--${name}`);
  return index>=0 ? (process.argv[index+1] ?? true) : fallback;
}
const blogId=arg("blog");
const seedPath=arg("seed");
const theme=arg("theme");
const rankFilterRaw=arg("rank");
const rankFilter=rankFilterRaw?Number(rankFilterRaw):null;
const outputDir=String(arg("output","tmp-blog-corpus/naver"));
const delayMs=Number(arg("delay-ms","120"));
const maxPostsRaw=arg("max-posts");
const maxPosts=maxPostsRaw?Number(maxPostsRaw):Infinity;
const concurrency=Math.max(1,Math.min(8,Number(arg("concurrency","3"))));
const blogConcurrency=Math.max(1,Math.min(4,Number(arg("blog-concurrency","2"))));
const checkpointDir=String(arg("checkpoint-dir",path.join(outputDir,"checkpoints")));
const maxAttempts=Math.max(1,Number(arg("max-attempts","8")));
const requireCheckpoint=String(arg("require-checkpoint","false"))==="true";

if(!blogId&&!seedPath) throw new Error("Use --blog <id> or --seed <json> [--theme code]");

let targets=[];
if(blogId){
  targets=[{blogId:String(blogId),rank:null,theme:theme||null,url:`https://blog.naver.com/${blogId}`}];
}else{
  const seed=JSON.parse(fs.readFileSync(String(seedPath),"utf8"));
  const themes=theme ? seed.themes.filter((t)=>t.code===theme) : seed.themes;
  targets=themes.flatMap((t)=>t.blogs
    .filter((b)=>rankFilter==null||Number(b.rank)===rankFilter)
    .filter((b)=>b.platform==="naver"&&b.blogId)
    .map((b)=>({blogId:b.blogId,rank:b.rank,theme:t.code,url:b.url})));
}
fs.mkdirSync(outputDir,{recursive:true});

const summaries=[];

async function processTarget(target,targetIndex){
  console.log("BLOG_START",targetIndex+1,targets.length,target.theme,target.rank,target.blogId);
  const checkpointPath=path.join(checkpointDir,`${target.theme||"single"}__${target.rank??0}__${target.blogId}.jsonl`);
  if(requireCheckpoint&&!fs.existsSync(checkpointPath)) throw new Error(`RECOVERY_CHECKPOINT_REQUIRED ${checkpointPath}`);
  const checkpoint=new RecoveryCheckpoint(checkpointPath,{
    sourceUrl:target.url||`https://blog.naver.com/${target.blogId}`,
    platform:"naver",
    identity:target.blogId,
  });
  if(requireCheckpoint&&!checkpoint.manifest&&!checkpoint.discovery){
    checkpoint.close();
    throw new Error(`RECOVERY_CHECKPOINT_INCOMPLETE ${checkpointPath}`);
  }
  let listed=[];
  const listFailures=[];
  if(checkpoint.manifest){
    listed=checkpoint.requests().map((entry)=>entry.request);
    console.log("BLOG_MANIFEST_RESUME",target.blogId,listed.length,checkpoint.manifest.digest);
  }else if(checkpoint.discovery?.outcome==="failure"&&(checkpoint.discovery.permanent||Number(checkpoint.discovery.attemptsTotal||0)>=maxAttempts)){
    listFailures.push({
      stage:"list",message:checkpoint.discovery.message,classification:checkpoint.discovery.classification,
      status:checkpoint.discovery.status,attempts:checkpoint.discovery.attemptsTotal,permanent:checkpoint.discovery.permanent,
    });
    console.log("BLOG_DISCOVERY_FAILURE_RESUME",target.blogId,checkpoint.discovery.classification,checkpoint.discovery.attemptsTotal);
  }else{
    try{
      listed=await listAllNaverPosts(target.blogId,{
        delayMs,
        retryOptions:{
          attempts:Math.max(1,maxAttempts-Number(checkpoint.discovery?.attemptsTotal||0)),
          onRetry:({attempt,delayMs:waitMs,classification})=>console.log("BLOG_LIST_RETRY",target.blogId,attempt,classification.kind,waitMs),
        },
      });
      checkpoint.initializeManifest(listed);
    }catch(error){
      checkpoint.recordDiscoveryFailure(error);
      listFailures.push({
        stage:"list",message:String(error),classification:error?.recoveryClassification?.kind||null,status:error?.status||null,
        attempts:checkpoint.discovery?.attemptsTotal||1,permanent:error?.recoveryClassification?.permanent??null,
      });
    }
  }
  const selected=listed.slice(0,Number.isFinite(maxPosts)?maxPosts:listed.length);
  const selectedKeys=new Set(selected.map((post)=>String(post.logNo)));
  const selectedEntries=new Map(checkpoint.requests().filter((entry)=>selectedKeys.has(String(entry.requestId))).map((entry)=>[String(entry.requestId),entry]));
  const stateFor=(post)=>checkpoint.stateFor(selectedEntries.get(String(post.logNo))||post);
  const shouldProcess=(post)=>{
    const state=stateFor(post);
    if(!state) return true;
    if(state.outcome==="success"||state.permanent) return false;
    return Number(state.attemptsTotal||0)<maxAttempts;
  };
  for(const post of selected){
    if((post.blocked||post.notOpen)&&shouldProcess(post)) checkpoint.recordFailure(selectedEntries.get(String(post.logNo))||post,new Error("blocked_or_not_open"),{extra:{blocked:post.blocked,notOpen:post.notOpen}});
  }
  const initialSuccess=selected.filter((post)=>stateFor(post)?.outcome==="success").length;
  console.log("BLOG_LISTED",target.blogId,listed.length,"SELECTED",selected.length,"RESUMED_OK",initialSuccess,"PENDING",selected.filter(shouldProcess).length);
  const useBatch=arg("batch","true")!=="false" && selected.length===listed.length;
  if(useBatch){
    const groups=[];
    for(let i=0;i<selected.length;i+=3) groups.push({pageNo:Math.floor(i/3)+1,posts:selected.slice(i,i+3)});
    let cursor=0,completed=0;
    async function batchWorker(){
      while(true){
        const gi=cursor++;
        if(gi>=groups.length) return;
        const group=groups[gi];
        const pending=group.posts.filter((post)=>!post.blocked&&!post.notOpen&&shouldProcess(post));
        let batchError=null;
        if(pending.length===group.posts.length){
          let batchAttempts=0;
          try{
            const metrics=await fetchNaverPostListPageMetrics(target.blogId,group.posts,group.pageNo,{
              delayMs,
              retryOptions:{
                attempts:Math.max(1,Math.min(...pending.map((post)=>maxAttempts-Number(stateFor(post)?.attemptsTotal||0)))),
                onAttempt:()=>{batchAttempts++;},
                onRetry:({attempt,delayMs:waitMs,classification})=>console.log("BLOG_BATCH_RETRY",target.blogId,group.pageNo,attempt,classification.kind,waitMs),
              },
            });
            for(const metric of metrics){
              const post=group.posts.find((item)=>String(item.logNo)===String(metric.logNo));
              checkpoint.recordSuccess(selectedEntries.get(String(metric.logNo))||post,metric,{attemptsUsed:Math.max(1,batchAttempts)});
            }
          }catch(error){
            batchError=error;
          }
        }
        const batchClassification=batchError?.recoveryClassification?.kind||null;
        const stopAfterBatchFailure=new Set(["rate_limited","access_forbidden","authentication_or_permission_required","authentication_required","not_found"]).has(batchClassification);
        if(batchError&&stopAfterBatchFailure){
          for(const post of pending){
            checkpoint.recordFailure(selectedEntries.get(String(post.logNo))||post,batchError,{
              attemptsUsed:Math.max(1,Number(batchError?.attemptsUsed||1)),
              extra:{batchFallback:null,batchPage:group.pageNo},
            });
          }
        }else if(batchError||pending.length!==group.posts.length){
          if(batchError?.recoveryClassification?.retryable){
            for(const post of pending){
              checkpoint.recordFailure(selectedEntries.get(String(post.logNo))||post,batchError,{
                attemptsUsed:Math.max(1,Number(batchError?.attemptsUsed||1)),
                extra:{batchFallback:"individual",batchPage:group.pageNo},
              });
            }
          }
          for(const post of pending){
            if(!shouldProcess(post)) continue;
            let attemptsUsed=0;
            try{
              const remaining=Math.max(1,maxAttempts-Number(stateFor(post)?.attemptsTotal||0));
              const metric=await fetchNaverPostMetrics(target.blogId,post,{
                delayMs,
                retryOptions:{
                  attempts:remaining,
                  onAttempt:()=>{attemptsUsed++;},
                  onRetry:({attempt,delayMs:waitMs,classification})=>console.log("BLOG_POST_RETRY",target.blogId,post.logNo,attempt,classification.kind,waitMs),
                },
              });
              checkpoint.recordSuccess(selectedEntries.get(String(post.logNo))||post,metric,{attemptsUsed:Math.max(1,attemptsUsed)});
            }catch(error){
              checkpoint.recordFailure(selectedEntries.get(String(post.logNo))||post,error,{attemptsUsed:Math.max(1,attemptsUsed),extra:{batchFallback:batchError?String(batchError).slice(0,180):null}});
            }
          }
        }
        completed+=group.posts.length;
        if(completed%60<3||completed===selected.length){
          const summary=checkpoint.summary({maxAttempts});
          console.log("BLOG_PROGRESS",target.blogId,completed,selected.length,"ok",summary.succeeded,"fail",summary.failed,"retryable",summary.retryable);
        }
      }
    }
    await Promise.all(Array.from({length:Math.min(concurrency,Math.max(1,groups.length))},()=>batchWorker()));
  } else {
    let cursor=0,completed=0;
    async function worker(){
      while(true){
        const i=cursor++;
        if(i>=selected.length) return;
        const post=selected[i];
        if(!post.blocked&&!post.notOpen&&shouldProcess(post)) {
          let attemptsUsed=0;
          try{
            const remaining=Math.max(1,maxAttempts-Number(stateFor(post)?.attemptsTotal||0));
            const metric=await fetchNaverPostMetrics(target.blogId,post,{
              delayMs,
              retryOptions:{
                attempts:remaining,
                onAttempt:()=>{attemptsUsed++;},
                onRetry:({attempt,delayMs:waitMs,classification})=>console.log("BLOG_POST_RETRY",target.blogId,post.logNo,attempt,classification.kind,waitMs),
              },
            });
            checkpoint.recordSuccess(selectedEntries.get(String(post.logNo))||post,metric,{attemptsUsed:Math.max(1,attemptsUsed)});
          }catch(error){
            checkpoint.recordFailure(selectedEntries.get(String(post.logNo))||post,error,{attemptsUsed:Math.max(1,attemptsUsed)});
          }
        }
        completed++;
        if(completed%50===0||completed===selected.length){
          const summary=checkpoint.summary({maxAttempts});
          console.log("BLOG_PROGRESS",target.blogId,completed,selected.length,"ok",summary.succeeded,"fail",summary.failed,"retryable",summary.retryable);
        }
      }
    }
    await Promise.all(Array.from({length:Math.min(concurrency,Math.max(1,selected.length))},()=>worker()));
  }
  checkpoint.flush();
  const checkpointSummary=checkpoint.summary({maxAttempts});
  const analyzed=[];
  const failures=[...listFailures];
  for(const post of selected){
    const state=stateFor(post);
    if(state?.outcome==="success") analyzed.push(state.metric);
    else if(state?.outcome==="failure") failures.push({
      logNo:post.logNo,stage:post.blocked||post.notOpen?"skip":"post",message:state.message,
      status:state.status,classification:state.classification,attempts:state.attemptsTotal,permanent:state.permanent,
      ...(state.extra?.batchFallback?{batchFallback:state.extra.batchFallback}:{}),
    });
  }
  const aggregate=aggregateNaverBlogCorpus(target.blogId,listed,analyzed,failures);
  aggregate.rank=target.rank;
  aggregate.theme=target.theme;
  aggregate.requestedPosts=selected.length;
  aggregate.fullCoverage=selected.length===listed.length && !failures.some((item)=>item.stage==="list");
  aggregate.recoveryCheckpoint={
    file:path.relative(outputDir,checkpointPath).replaceAll(path.sep,"/"),
    ...checkpointSummary,
  };
  const filename=path.join(outputDir,`${target.theme||"single"}__${target.rank??0}__${target.blogId}.json`);
  fs.writeFileSync(filename,JSON.stringify(aggregate,null,2));
  checkpoint.close();
  const summary={
    theme:target.theme,rank:target.rank,blogId:target.blogId,
    totalListed:aggregate.coverage.totalListed,
    analyzed:aggregate.coverage.analyzed,
    failed:aggregate.coverage.failed,
    successRate:aggregate.coverage.successRate,
    fullCoverage:aggregate.fullCoverage,
    file:path.basename(filename),
  };
  summaries.push(summary);
  console.log("BLOG_DONE",JSON.stringify(summary));
}

let targetCursor=0;
async function targetWorker(){
  while(true){
    const index=targetCursor++;
    if(index>=targets.length) return;
    await processTarget(targets[index],index);
  }
}
await Promise.all(Array.from({length:Math.min(blogConcurrency,Math.max(1,targets.length))},()=>targetWorker()));

summaries.sort((a,b)=>(a.rank??999)-(b.rank??999));
fs.writeFileSync(path.join(outputDir,"summary.json"),JSON.stringify({generatedAt:new Date().toISOString(),targets:summaries},null,2));
console.log("CORPUS_DONE",JSON.stringify(summaries));
