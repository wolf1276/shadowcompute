import { createHash, timingSafeEqual } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { pureCircuits } from '../../contracts/contract/managed/shadow-vault/contract/index.js';

export type Redemption = { nullifier:string; bearer:string };
export type Receipt = {binding:Uint8Array; expires:bigint};
export type ReceiptSource = {instance:Uint8Array; receipt(nullifier:Uint8Array):Promise<Receipt|null>};
export type ModelInfo={id:string;label:string;adapter:string;credits:1};
export type InferenceAdapter = {infer(prompt:string,model?:string):Promise<string>;models?:readonly ModelInfo[];defaultModel?:string};
export class GatewayError extends Error { constructor(readonly status:number,message:string){super(message);} }
export class InferenceError extends Error { constructor(readonly safeToRetry:boolean){super('Inference failed');} }
const hex32=/^[0-9a-f]{64}$/;
export function validateRequest(body:unknown):{prompt:string;redemption:Redemption;model?:string}{
 if(!body || typeof body!=='object')throw new GatewayError(400,'Invalid request');
 const {prompt,redemption,model}=body as {prompt?:unknown;redemption?:Partial<Redemption>;model?:unknown};
 if(typeof prompt!=='string'||!prompt.trim()||Buffer.byteLength(prompt)>16000)throw new GatewayError(400,'Prompt must contain 1–16000 bytes');
 if(!redemption||typeof redemption.nullifier!=='string'||!hex32.test(redemption.nullifier)||typeof redemption.bearer!=='string'||!hex32.test(redemption.bearer))throw new GatewayError(400,'Invalid anonymous redemption');
 if(model!==undefined&&(typeof model!=='string'||!/^[a-z0-9][a-z0-9-]{0,63}$/.test(model)))throw new GatewayError(400,'Invalid model selection');
 return {prompt,redemption:redemption as Redemption,...(model===undefined?{}:{model:model as string})};
}
type Row={digest:string;status:string;response:string|null};
export class Gateway {
 readonly db:DatabaseSync;
 constructor(readonly source:ReceiptSource,readonly adapter:InferenceAdapter,path:string,readonly now=()=>Date.now()){
  this.db=new DatabaseSync(path);
  this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
   CREATE TABLE IF NOT EXISTS requests(nullifier TEXT PRIMARY KEY,digest TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('pending','done','retryable','uncertain')),response TEXT,updated INTEGER NOT NULL);`);
 }
 async infer(body:unknown):Promise<{response:string;chargedCredits:1;cached:boolean}>{
  const {prompt,redemption,model}=validateRequest(body);
  const modelAvailable=!model||!!this.adapter.models?.some(entry=>entry.id===model);
  const n=redemption.nullifier;
  const row=this.db.prepare('SELECT digest,status,response FROM requests WHERE nullifier=?').get(n) as Row|undefined;
  if(!modelAvailable&&!row)throw new GatewayError(400,'Choose an available model');
  const receipt=await this.source.receipt(Buffer.from(n,'hex'));
  const expected=pureCircuits.receiptBinding(Buffer.from(redemption.bearer,'hex'),this.source.instance);
  if(!receipt||receipt.binding.length!==32||!timingSafeEqual(receipt.binding,expected))throw new GatewayError(403,'No valid finalized redemption');
  if(!row&&receipt.expires*1000n<=BigInt(this.now()))throw new GatewayError(403,'Redemption expired');
  const digest=createHash('sha256').update(model?JSON.stringify([model,prompt]):prompt).digest('hex');
  if(row&&row.digest!==digest)throw new GatewayError(409,'Redemption already bound to another request');
  if(row?.status==='done')return {response:row.response!,chargedCredits:1,cached:true};
  if(!modelAvailable)throw new GatewayError(400,'Choose an available model');
  if(row?.status==='pending'||row?.status==='uncertain')throw new GatewayError(409,'Inference pending or uncertain; reconciliation required');
  if(row){
   const r=this.db.prepare("UPDATE requests SET status='pending',updated=? WHERE nullifier=? AND status='retryable'").run(this.now(),n);
   if(!r.changes)throw new GatewayError(409,'Request already running');
  } else {
   const r=this.db.prepare("INSERT OR IGNORE INTO requests(nullifier,digest,status,updated) VALUES(?,?,'pending',?)").run(n,digest,this.now());
   if(!r.changes)throw new GatewayError(409,'Request already admitted');
  }
  try {
   const response=await this.adapter.infer(prompt,model);
   if(typeof response!=='string'||!response)throw new InferenceError(false);
   this.db.prepare("UPDATE requests SET status='done',response=?,updated=? WHERE nullifier=? AND status='pending'").run(response,this.now(),n);
   return {response,chargedCredits:1,cached:false};
  } catch(e){
   const retry=e instanceof InferenceError&&e.safeToRetry;
   this.db.prepare('UPDATE requests SET status=?,updated=? WHERE nullifier=?').run(retry?'retryable':'uncertain',this.now(),n);
   throw new GatewayError(503,retry?'Inference failed; retry the same request without another credit':'Inference outcome uncertain; preserve this redemption for reconciliation');
  }
 }
 close(){this.db.close();}
}

export class MockAdapter implements InferenceAdapter {
 async infer(prompt:string){return `[OFFLINE MOCK — no provider call] ${prompt}`;}
}
export class ProviderAdapter implements InferenceAdapter {
 constructor(readonly url:string,readonly apiKey:string,readonly model:string){
  const u=new URL(url);if(u.protocol!=='https:'&&u.hostname!=='127.0.0.1'&&u.hostname!=='localhost')throw new Error('Provider requires HTTPS');
  if(!apiKey||!model)throw new Error('LLM_API_KEY and LLM_MODEL required');
 }
 async infer(prompt:string):Promise<string>{
  try{
   const r=await fetch(this.url,{method:'POST',headers:{authorization:`Bearer ${this.apiKey}`,'content-type':'application/json'},body:JSON.stringify({model:this.model,messages:[{role:'user',content:prompt}],max_tokens:512}),signal:AbortSignal.timeout(60000)});
   if(!r.ok)throw new InferenceError(r.status>=400&&r.status<500&&r.status!==408);
   const data=await r.json() as {choices?:{message?:{content?:string}}[]};
   const text=data.choices?.[0]?.message?.content;
   if(!text)throw new InferenceError(false);return text;
  }catch(e){if(e instanceof InferenceError)throw e;throw new InferenceError(false);}
 }
}
