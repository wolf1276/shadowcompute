import { it,expect } from 'vitest';
import { server } from '../src/server.js';
import { Gateway,MockAdapter } from '../src/gateway.js';
import { bytes32 } from '../../contracts/contract/witnesses.js';
it('bounds the HTTP trust boundary and never returns raw provider errors',async()=>{
 const g=new Gateway({instance:bytes32(),async receipt(){throw new Error('SECRET PROVIDER DETAIL');}},new MockAdapter(),':memory:');
 const app=server(g,'local','','opencode-compact');await new Promise<void>(r=>app.listen(0,'127.0.0.1',r));
 const url=`http://127.0.0.1:${(app.address() as {port:number}).port}`;
 try{
  const health=await fetch(url+'/health');expect(health.status).toBe(200);expect(await health.json()).toMatchObject({network:'local',vault:'',adapter:'opencode-compact'});
  expect((await fetch(url+'/missing')).status).toBe(404);
  expect((await fetch(url+'/v1/inference',{method:'POST',body:'{}'})).status).toBe(415);
  const post=(body:string)=>fetch(url+'/v1/inference',{method:'POST',headers:{'content-type':'application/json'},body});
  expect((await post('{')).status).toBe(400);
  expect((await post(JSON.stringify({prompt:'x'.repeat(22000)}))).status).toBe(413);
  const failed=await post(JSON.stringify({prompt:'test',redemption:{nullifier:'aa'.repeat(32),bearer:'bb'.repeat(32)}}));
  expect(failed.status).toBe(503);expect(await failed.text()).not.toContain('SECRET');
 }finally{await new Promise<void>(r=>app.close(()=>r()));g.close();}
});
