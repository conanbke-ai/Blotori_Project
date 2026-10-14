// Offline integration tests: no provider calls, no billing.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const Module = require("node:module");
const root = path.resolve(__dirname, "../lib/infrastructure");
const cached = new Map();
function loadTS(name) {
  if (cached.has(name)) return cached.get(name).exports;
  const filename = path.join(root, name + ".ts");
  const js = ts.transpileModule(fs.readFileSync(filename, "utf8"), {compilerOptions:{
    module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true
  }}).outputText;
  const m = new Module(filename,module);
  cached.set(name,m);
  m.filename=filename;m.paths=Module._nodeModulePaths(root);
  const builtinRequire=m.require.bind(m);
  m.require=(id)=> id==="./model-unavailable-error" ? loadTS("model-unavailable-error") : builtinRequire(id);
  m._compile(js,filename);
  return m.exports;
}
const {generateWithModelRecovery} = loadTS("model-recovery");
const {ModelUnavailableError}=loadTS("model-unavailable-error");
(async()=>{
  async function run(problem, opts={}) {
    let queries=0, writes=0, generations=[];
    const store={read:async()=>({id:"old",version:1}),compareAndSwap:async()=>{writes++;return opts.cas!==false;}};
    const deps={
      store, generate:async (model)=>{generations.push(model);if(model==="old") throw problem;if(opts.candidateError)throw opts.candidateError;return {ok:!opts.invalid};},
      validate:(x)=>x.ok===true,
      listModels:async()=>{queries++;return ["cheap","expensive"];},
      candidates:[{id:"cheap",compatible:true,inputUsdPerMillion:.1,outputUsdPerMillion:.4},{id:"expensive",compatible:true,inputUsdPerMillion:2,outputUsdPerMillion:5}],
      estimatedInputTokens:1000,estimatedOutputTokens:2000,maximumEstimatedUsd:.01,
    };
    if(opts.noCandidate)deps.candidates=[];
    let result,error;try{result=await generateWithModelRecovery(deps);}catch(e){error=e;}
    return {queries,writes,generations,result,error};
  }
  for(const err of [new Error("invalid key"),new Error("429"),new Error("server offline"),{status:404,error:{code:"model_not_found"}}]){
    const r=await run(err);assert.strictEqual(r.queries,0);assert.strictEqual(r.writes,0);assert.strictEqual(r.generations.length,1);assert.strictEqual(r.error,err);
  }
  const modelErr=new ModelUnavailableError("old");
  const ok=await run(modelErr);assert.equal(ok.queries,1);assert.deepEqual(ok.generations,["old","cheap"]);assert.equal(ok.writes,1);assert.equal(ok.result.persistence,"replaced");
  const absent=await run(modelErr,{noCandidate:true});assert.equal(absent.queries,1);assert.equal(absent.generations.length,1);assert.equal(absent.writes,0);
  const failed=await run(modelErr,{candidateError:new Error("failed")});assert.equal(failed.writes,0);assert.equal(failed.generations.length,2);
  const invalid=await run(modelErr,{invalid:true});assert.equal(invalid.writes,0);
  const conflict=await run(modelErr,{cas:false});assert.equal(conflict.result.persistence,"conflict");
  console.log("MODEL_RECOVERY_OFFLINE_PASS",{negativeCases:4,recoveryCases:5,externalApiCalls:0});
})().catch(e=>{console.error(e);process.exitCode=1;});
