import { spawn } from 'node:child_process';
import { mkdtemp,writeFile,rm } from 'node:fs/promises';
import { tmpdir,homedir } from 'node:os';
import { join } from 'node:path';
import { InferenceError,type InferenceAdapter } from './gateway.js';

export function compactSource(answer:string):string{
 const match=answer.match(/```compact\s*\n([\s\S]*?)```/i);
 const source=(match?match[1]:answer).trim();
 if(Buffer.byteLength(source)>20000)throw new Error('Contract exceeds demo source limit');
 if(!source.includes('pragma language_version 0.28;'))throw new Error('Use pragma language_version 0.28;');
 if(/\binclude\b/.test(source))throw new Error('External source includes are not permitted');
 const imports=[...source.matchAll(/\bimport\s+([^;]+);/g)];
 if(imports.length!==1||imports[0][1].trim()!=='CompactStandardLibrary')throw new Error('Use only import CompactStandardLibrary;');
 return source;
}
async function compile(source:string):Promise<string|null>{
 const dir=await mkdtemp(join(tmpdir(),'shadow-compact-'));
 try{
  const input=join(dir,'candidate.compact');await writeFile(input,source,{mode:0o600});
  return await new Promise((resolve,reject)=>{
   const child=spawn('compact',['compile','+0.36.1','--skip-zk',input,join(dir,'managed')],{cwd:dir,detached:true,env:{PATH:process.env.PATH,HOME:homedir(),COMPACT_DIRECTORY:process.env.COMPACT_DIRECTORY??join(homedir(),'.compact')},stdio:['ignore','pipe','pipe']});
   let diagnostics='',failed=false;
   const stop=()=>{failed=true;if(child.pid){try{process.kill(-child.pid,'SIGKILL');}catch{child.kill('SIGKILL');}}};
   const timer=setTimeout(stop,30000);
   const collect=(data:Buffer)=>{diagnostics+=data.toString('utf8');if(diagnostics.length>64000)stop();};
   child.stdout.on('data',collect);child.stderr.on('data',collect);
   child.on('error',()=>{clearTimeout(timer);reject(new InferenceError(true));});
   child.on('close',code=>{clearTimeout(timer);if(failed)reject(new InferenceError(true));else resolve(code===0?null:diagnostics.slice(-6000));});
  });
 }finally{await rm(dir,{recursive:true,force:true});}
}
// Each gateway execution makes at most three drafts; failed executions can retry the same paid receipt.
export class CompactInferenceAdapter implements InferenceAdapter {
 constructor(readonly model:InferenceAdapter){}
 async infer(prompt:string):Promise<string>{
  let request=prompt;
  for(let attempt=0;attempt<3;attempt++){
   const answer=await this.model.infer(request);
   let source='',diagnostic='';
   try{source=compactSource(answer);}catch(e){diagnostic=e instanceof Error?e.message:'Invalid Compact source';}
   if(!diagnostic)diagnostic=await compile(source)??'';
   if(!diagnostic)return `\`\`\`compact\n${source}\n\`\`\`\n\nCompact 0.36.1 syntax/type check passed. Behavioral tests and real proof verification are still required before deployment.`;
   request=`Original task:\n${prompt}\n\nYour previous draft failed actual Compact compiler 0.36.1 validation. Repair the complete source without removing authorization, privacy or accounting checks. Return one real compact code block.\n\nPrevious draft:\n${answer.slice(0,20000)}\n\nCompiler diagnostics:\n${diagnostic}\n\nUse real statements like assert(condition, "message"); and direct ledger assignment. The valid syntax example is in the loaded Compact skill. Replace all invalid English descriptions with real Compact. Return only the complete corrected compact code block.`;
  }
  throw new InferenceError(true);
 }
}
