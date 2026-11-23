import { createServer } from 'node:http';
import { Gateway,GatewayError } from './gateway.js';
export function server(gateway:Gateway,network="local",vault="",adapter="unknown",funding="simulated-yield"){
 return createServer(async(req,res)=>{
  res.setHeader('content-type','application/json');res.setHeader('cache-control','no-store');
  if(req.method==='GET'&&req.url==='/health'){res.end(JSON.stringify({status:'ok',mode:'proof-backed-receipts',yield:funding==='prepaid'?'none':'simulated',funding,network,vault,adapter,models:gateway.adapter.models??[],defaultModel:gateway.adapter.defaultModel}));return;}
  if(req.method!=='POST'||req.url!=='/v1/inference'){res.writeHead(404).end(JSON.stringify({error:'Not found'}));return;}
  try{
   if(!req.headers['content-type']?.startsWith('application/json'))throw new GatewayError(415,'Use application/json');
   const chunks:Buffer[]=[];let size=0;
   for await(const chunk of req){size+=chunk.length;if(size>20000)throw new GatewayError(413,'Request too large');chunks.push(chunk);}
   let body:unknown;try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new GatewayError(400,'Invalid JSON');}
   const result=await gateway.infer(body);res.end(JSON.stringify(result));
  }catch(e){const status=e instanceof GatewayError?e.status:503;res.writeHead(status).end(JSON.stringify({error:e instanceof GatewayError?e.message:'Gateway unavailable'}));}
 });
}
