import {it,expect,vi} from 'vitest';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {terminalServer} from '../src/terminal.js';
import {createTransport,validateCompanionUrl} from '../../terminal/transport.js';
const memory=()=>{const data=new Map<string,string>();return {getItem:(key:string)=>data.get(key)??null,setItem:(key:string,value:string)=>{data.set(key,value);},removeItem:(key:string)=>{data.delete(key);}};};
it('pairs only with loopback, requires a code and never discovers a remote session automatically',async()=>{
 const fetcher=vi.fn(async()=>new Response(JSON.stringify({funding:'prepaid'}),{headers:{'content-type':'application/json'}}));
 const transport=createTransport({location:{hostname:'shadowcompute.vercel.app'},storage:memory(),fetcher});
 await expect(transport.request('/api/state')).rejects.toThrow('Connect');
 for(const url of ['https://evil.example','http://evil.example:8792','http://localhost:8792/path','http://localhost:8792/?token=x','http://a:b@localhost:8792'])expect(()=>validateCompanionUrl(url)).toThrow();
 expect(()=>transport.configure('http://localhost:8792','bad')).toThrow('64-character');
 const token='ab'.repeat(32);transport.configure('http://localhost:8792',token);expect(await transport.request('/api/session')).toEqual({token});expect(fetcher).not.toHaveBeenCalled();
 await transport.request('/api/state');expect(fetcher).toHaveBeenCalledWith('http://localhost:8792/api/state',expect.objectContaining({credentials:'omit',headers:{'x-console-token':token}}));
 await expect(transport.request('//evil.example')).rejects.toThrow('Invalid');transport.disconnect();await expect(transport.request('/api/state')).rejects.toThrow('Connect');
});
it('preserves local session discovery without adding a hosted origin or storing the local token',async()=>{
 const storage=memory(),fetcher=vi.fn(async()=>new Response(JSON.stringify({token:'cd'.repeat(32)})));
 const local=createTransport({location:{hostname:'localhost'},storage,fetcher});await local.request('/api/session');await local.request('/api/state');expect(fetcher).toHaveBeenLastCalledWith('/api/state',expect.objectContaining({headers:{'x-console-token':'cd'.repeat(32)}}));expect(storage.getItem('shadowcompute-companion-v1')).toBeNull();
});
it('allows only the pinned HTTPS origin with a valid code and forbids remote pairing discovery',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'shadow-companion-')),origin='https://shadowcompute.vercel.app';writeFileSync(join(dir,'credit-1.json'),'private opening');
 expect(()=>terminalServer({directory:dir,assets:resolve('packages/terminal'),model:'test',allowedOrigin:'http://evil.example'})).toThrow('HTTPS');
 const app=terminalServer({directory:dir,assets:resolve('packages/terminal'),model:'test',allowedOrigin:origin});await new Promise<void>(r=>app.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${(app.address() as {port:number}).port}`;
 try{
  expect((await fetch(url+'/pair')).status).toBe(200);const {token}=await(await fetch(url+'/api/session')).json();
  const remote={origin,'sec-fetch-site':'cross-site','x-console-token':token};
  const preflight=await fetch(url+'/api/state',{method:'OPTIONS',headers:{origin,'access-control-request-method':'GET','access-control-request-private-network':'true'}});expect(preflight.status).toBe(204);expect(preflight.headers.get('access-control-allow-origin')).toBe(origin);expect(preflight.headers.get('access-control-allow-private-network')).toBe('true');
  expect((await fetch(url+'/api/session',{headers:remote})).status).toBe(403);expect((await fetch(url+'/pair',{headers:remote})).status).toBe(403);
  expect((await fetch(url+'/api/state',{headers:{origin}})).status).toBe(403);
  const valid=await fetch(url+'/api/state',{headers:remote});expect(valid.status).toBe(200);expect(valid.headers.get('access-control-allow-origin')).toBe(origin);expect(await valid.text()).not.toContain('private opening');
  for(const evil of ['https://evil.example','https://shadowcompute.vercel.app.evil.example']){const response=await fetch(url+'/api/state',{headers:{...remote,origin:evil}});expect(response.status).toBe(403);expect(response.headers.get('access-control-allow-origin')).toBeNull();}
 }finally{await new Promise<void>(r=>app.close(()=>r()));rmSync(dir,{recursive:true,force:true});}
});
