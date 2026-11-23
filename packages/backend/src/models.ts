import {readFileSync} from 'node:fs';
import {GatewayError,type InferenceAdapter,type ModelInfo} from './gateway.js';
import {OpenCodeAdapter} from './opencode.js';
import {CompactInferenceAdapter} from './compact-inference.js';
import {ProviderAdapter} from './gateway.js';
export class ModelRouter implements InferenceAdapter {
 readonly models:ModelInfo[];
 constructor(readonly entries:{info:ModelInfo;adapter:InferenceAdapter}[],readonly defaultModel:string){
  if(!entries.length||new Set(entries.map(e=>e.info.id)).size!==entries.length||!entries.some(e=>e.info.id===defaultModel))throw new Error('Invalid model catalog');
  for(const {info} of entries)if(!/^[a-z0-9][a-z0-9-]{0,63}$/.test(info.id)||!info.label||info.label.length>100||info.credits!==1||!['provider','opencode','opencode-compact','mock'].includes(info.adapter))throw new Error('Invalid model entry');
  this.models=entries.map(({info})=>({...info}));
 }
 async infer(prompt:string,model=this.defaultModel){const entry=this.entries.find(e=>e.info.id===model);if(!entry)throw new GatewayError(400,'Choose an available model');return entry.adapter.infer(prompt);}
}
export function loadModelRouter(file:string){
 const catalog=JSON.parse(readFileSync(file,'utf8')) as {defaultModel:string;models:{id:string;label:string;adapter:string;model:string;profile?:string;apiKeyEnv?:string;url?:string}[]};
 if(!Array.isArray(catalog.models)||catalog.models.length>20)throw new Error('Invalid model catalog');
 return new ModelRouter(catalog.models.map(entry=>{
  const base=entry.adapter==='provider'?new ProviderAdapter(entry.url??'',process.env[entry.apiKeyEnv??'']??'',entry.model):new OpenCodeAdapter({model:entry.model,profile:entry.profile,skillPath:'.opencode/skills/midnight-compact/SKILL.md'});
  if(!['provider','opencode','opencode-compact'].includes(entry.adapter))throw new Error('Unsupported model adapter');
  return {info:{id:entry.id,label:entry.label,adapter:entry.adapter,credits:1 as const},adapter:entry.adapter==='opencode-compact'?new CompactInferenceAdapter(base):base};
 }),catalog.defaultModel);
}
