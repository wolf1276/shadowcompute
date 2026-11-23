import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {writeFileSync} from 'node:fs';
const exec=promisify(execFile),results=[];
for(const model of ['qwen2.5:0.5b','qwen2.5-coder:7b-instruct']){
 for(let trial=0;trial<3;trial++){
  const power=[];let sampling=false;
  const sample=async()=>{if(sampling)return;sampling=true;try{const {stdout}=await exec('nvidia-smi',['--query-gpu=power.draw','--format=csv,noheader,nounits'],{timeout:2000});const watts=Number(stdout.trim().split('\n')[0]);if(Number.isFinite(watts))power.push({at:performance.now(),watts});}catch{}finally{sampling=false;}};
  await sample();const timer=setInterval(sample,500),start=performance.now();
  let data;try{
   const response=await fetch('http://127.0.0.1:11435/api/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({model,stream:false,messages:[{role:'user',content:'Return only the result of 2 plus 3 as a single digit.'}],options:{temperature:0,num_predict:64}}),signal:AbortSignal.timeout(120000)});
   if(!response.ok)throw new Error(`Local model HTTP ${response.status}`);data=await response.json();
  }finally{clearInterval(timer);}
  const wallMs=performance.now()-start;await sample();let joules=0;
  for(let i=1;i<power.length;i++)joules+=(power[i].at-power[i-1].at)/1000*(power[i].watts+power[i-1].watts)/2;
  const answer=data.message?.content??'';results.push({model,trial,wallMs:Math.round(wallMs),answer,exactAnswerCorrect:answer.trim()==='5',inputTokens:data.prompt_eval_count,outputTokens:data.eval_count,loadMs:data.load_duration/1e6,generationMs:data.eval_duration/1e6,gpuSamples:power.length,grossGpuJoules:power.length>1?Math.round(joules):null});
 }
}
const report={at:new Date().toISOString(),route:'Direct loopback Ollama; not the proof/relay/gateway paid path',results,energyBoundary:'Sampled gross first-GPU board power only. Includes idle/other GPU work. Excludes CPU, RAM, cooling, hardware depreciation, proofs, settlement, retries and support. Not a full service cost.',pricing:'Test token units have no monetary value. No electricity tariff, real service revenue or profit claimed.'};
writeFileSync('artifacts/inference-cost-benchmark.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if(results.some(result=>!result.exactAnswerCorrect))process.exitCode=1;
