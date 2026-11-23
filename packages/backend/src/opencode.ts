import { StringDecoder } from 'node:string_decoder';
import { spawn } from 'node:child_process';
import { mkdtemp,readFile,rm,chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { InferenceError,type InferenceAdapter } from './gateway.js';

export type OpenCodeOptions={model:string;profile?:string;binary?:string;timeoutMs?:number;skillPath?:string};
type Event={type?:string;part?:{type?:string;text?:string;reason?:string};error?:unknown};
export function parseOpenCodeOutput(output:string):string{
 const text:string[]=[];let completed=false;
 for(const line of output.split('\n')){
  if(!line.trim())continue;
  let event:Event;try{event=JSON.parse(line);}catch{throw new InferenceError(false);}
  if(event.type==='error'||event.part?.type==='tool')throw new InferenceError(false);
  if(event.type==='text'&&typeof event.part?.text==='string')text.push(event.part.text);
  if(event.type==='step_finish'&&event.part?.reason==='stop')completed=true;
 }
 if(!completed||!text.join('').trim())throw new InferenceError(false);
 return text.join('\n').trim();
}
export class OpenCodeAdapter implements InferenceAdapter {
 constructor(readonly options:OpenCodeOptions){
  if(!/^[\w.-]+\/[\w./:-]+$/.test(options.model))throw new Error('OPENCODE_MODEL must be provider/model');
  if(options.model.startsWith('opencode/')&&!options.model.endsWith('-free')&&options.model!=='opencode/big-pickle')throw new Error('Choose an explicitly free OpenCode model; paid fallbacks are disabled');
  if(!options.model.startsWith('opencode/')&&!options.profile)throw new Error('A custom provider needs OPENCODE_PROFILE');
 }
 async infer(prompt:string):Promise<string>{
  const dir=await mkdtemp(join(tmpdir(),'shadowcompute-ai-'));await chmod(dir,0o700);
  try{
   const providerId=this.options.model.split('/')[0];
   let provider:Record<string,unknown>={};
   if(this.options.profile){
    // Select only the configured provider; never import user agents, plugins, MCP or instructions.
    const profile=JSON.parse(await readFile(this.options.profile,'utf8')) as {provider?:Record<string,unknown>};
    const chosen=profile.provider?.[providerId];
    if(!chosen)throw new InferenceError(true);
    provider={[providerId]:chosen};
   }
   const skill=this.options.skillPath?await readFile(this.options.skillPath,'utf8'):'';
   if(Buffer.byteLength(skill)>20000)throw new InferenceError(true);
   const systemPrompt='You are a text-only assistant. Never execute commands, access files, delegate, or use tools. Answer directly. '+(skill?'Use the following version-pinned skill when relevant.\n'+skill:'');
   // OpenCode counts its first turn as step 1; limit 1 injects a last-step assistant prefill before any answer.
   const config={share:'disabled',autoupdate:false,provider,permission:{'*':'deny'},tools:{'*':false},agent:{shadow:{description:'ShadowCompute text-only inference',mode:'primary',prompt:systemPrompt,steps:2,permission:{'*':'deny'},tools:{'*':false}}}};
   // No vault keys, gateway credentials, user environment, or project files reach this child.
   const env:NodeJS.ProcessEnv={HOME:dir,XDG_CONFIG_HOME:join(dir,'config'),XDG_DATA_HOME:join(dir,'data'),XDG_CACHE_HOME:join(dir,'cache'),OPENCODE_CONFIG_CONTENT:JSON.stringify(config),OPENCODE_DISABLE_PROJECT_CONFIG:'true'};
   for(const key of ['PATH','LANG','SSL_CERT_FILE','SSL_CERT_DIR','HTTPS_PROXY','HTTP_PROXY','NO_PROXY'])if(process.env[key])env[key]=process.env[key];
   return await new Promise<string>((resolve,reject)=>{
    const child=spawn(this.options.binary??'opencode',['run','--pure','--format','json','--agent','shadow','--title','ShadowCompute inference','--model',this.options.model],{cwd:dir,env,detached:true,stdio:['pipe','pipe','pipe']});
    let output='',size=0,failed=false;const decoder=new StringDecoder('utf8');
    const stop=()=>{failed=true;if(child.pid){try{process.kill(-child.pid,'SIGKILL');}catch{child.kill('SIGKILL');}}};
    const timer=setTimeout(stop,this.options.timeoutMs??90000);
    child.stdout.on('data',(chunk:Buffer)=>{
     size+=chunk.length;if(size>2_000_000){stop();return;}output+=decoder.write(chunk);
     if(/"type"\s*:\s*"error"/.test(output))stop();
    });
    child.stderr.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>2_000_000)stop();});
    child.stdin.on('error',()=>{});
    child.on('error',()=>{clearTimeout(timer);reject(new InferenceError(true));});
    child.on('close',(code)=>{
     clearTimeout(timer);output+=decoder.end();
     if(failed||code!==0){reject(new InferenceError(false));return;}
     try{resolve(parseOpenCodeOutput(output));}catch{reject(new InferenceError(false));}
    });
    // Prompt travels through stdin, never a shell command or a visible argv entry.
    child.stdin.end(skill?`Version-pinned Compact reference:\n<compact-skill>\n${skill}\n</compact-skill>\n\nUser request:\n${prompt}`:prompt);
   });
  }catch(e){if(e instanceof InferenceError)throw e;throw new InferenceError(true);}
  finally{await rm(dir,{recursive:true,force:true});}
 }
}
