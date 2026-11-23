import { describe,it,expect } from 'vitest';
import { Sim, assertNotInPublicState } from './sim.js';
import { Contract,ledger,pureCircuits } from './contract/managed/shadow-vault/contract/index.js';
import { witnesses,privateState,bytes32 } from './contract/witnesses.js';
const COLOR=bytes32(), LOT=1000000n, UNIT=10000n, RATE=1000n, YEAR=31536000n;
const coin=(value=LOT,color=COLOR)=>({value,color,nonce:bytes32()});
const hex=(b:Uint8Array)=>Buffer.from(b).toString('hex');
const setup=async()=>{
 const admin=privateState();
 const sim=await Sim.deploy({contract:new Contract(witnesses),ledger,privateState:admin,args:[COLOR,LOT,UNIT,RATE,{bytes:bytes32()}]});
 return {sim,admin};
};
const deposit=async(sim:Awaited<ReturnType<typeof setup>>['sim'])=>{
 const p=privateState({checkpoint:sim.ledger().simulatedSeconds});sim.privateState=p;
 await sim.call('deposit',coin());return p;
};
const claim=async(sim:Awaited<ReturnType<typeof setup>>['sim'],p:ReturnType<typeof privateState>)=>{
 sim.privateState=p;
 await sim.call('claim',sim.ledger().simulatedSeconds);
 const time=sim.ledger().simulatedSeconds;
 return {...p,salt:p.nextSalt,nextSalt:bytes32(),creditSecret:bytes32(),checkpoint:time,carry:p.carry+LOT*RATE*(time-p.checkpoint)-UNIT*YEAR*10000n};
};
describe('Compact vault, simulated execution (not proof verification)',()=>{
 it('keeps multi-user principal solvent and forbids cross-user and double withdrawal',async()=>{
  const {sim}=await setup();const alice=await deposit(sim),bob=await deposit(sim);
  expect(sim.ledger().principal).toBe(2n*LOT);
  const [key]=[...sim.ledger().principalCoins][0]!;
  sim.privateState={...alice,secret:bob.secret};
  await expect(sim.call('withdraw',key)).rejects.toThrow(/Unknown private position/);
  sim.privateState=alice;await sim.call('withdraw',key);
  expect(sim.ledger().principal).toBe(LOT);
  const [other]=[...sim.ledger().principalCoins][0]!;
  await expect(sim.call('withdraw',other)).rejects.toThrow(/already spent/);
  sim.privateState=bob;await sim.call('withdraw',other);
  expect(sim.ledger().principal).toBe(0n);expect(sim.ledger().principalCoins.isEmpty()).toBe(true);
 });
 it('rejects unsupported tokens, zero/wrong denominations and duplicate deposit',async()=>{
  const {sim}=await setup();
  for(const c of [coin(0n),coin(LOT-1n),coin(LOT,bytes32())]) await expect(sim.call('deposit',c)).rejects.toThrow(/Wrong deposit/);
  const c=coin();await sim.call('deposit',c);await expect(sim.call('deposit',c)).rejects.toThrow(/Duplicate/);
  await expect(sim.call('deposit',coin())).rejects.toThrow(/Duplicate position/);
  expect(sim.ledger().principal).toBe(LOT);
 });
 it('validates immutable financial parameters and exact reserve funding',async()=>{
  for(const [lot,unit,rate] of [[0n,1n,1000n],[LOT,0n,1000n],[LOT,LOT+1n,1000n],[LOT,UNIT,10001n]]){
   await expect(Sim.deploy({contract:new Contract(witnesses),ledger,privateState:privateState(),args:[COLOR,lot,unit,rate,{bytes:bytes32()}]})).rejects.toThrow(/Invalid/);
  }
  const {sim}=await setup();
  for(const c of [coin(0n),coin(UNIT+1n),coin(UNIT,bytes32())])await expect(sim.call('fundReserve',c)).rejects.toThrow(/Wrong reserve/);
  const c=coin(UNIT);await sim.call('fundReserve',c);await expect(sim.call('fundReserve',c)).rejects.toThrow(/Duplicate reserve/);
  expect(sim.ledger().reserve).toBe(UNIT);expect(sim.ledger().allocated).toBe(0n);
 });
 it('conserves principal independently of exhausted rewards and claimed allocations',async()=>{
  const {sim,admin}=await setup();const notes=[];
  for(let i=0;i<4;i++)notes.push(await deposit(sim));
  for(let i=0;i<3;i++)await sim.call('fundReserve',coin(UNIT));
  sim.privateState=admin;await sim.call('advanceSimulation',YEAR);
  for(let i=0;i<3;i++)notes[i]=await claim(sim,notes[i]!);
  sim.privateState=notes[3]!;await expect(sim.call('claim',YEAR)).rejects.toThrow(/reserve exhausted/);
  for(const note of notes){
   sim.privateState=note;await sim.call('withdraw',[...sim.ledger().principalCoins][0]![0]);
   const l=sim.ledger();expect([...l.principalCoins].reduce((n,[,c])=>n+c.value,0n)).toBe(l.principal);
   expect([...l.reserveCoins].reduce((n,[,c])=>n+c.value,0n)).toBe(l.reserve);
   expect(l.allocated<=l.reserve).toBe(true);expect(l.issued-l.redeemed).toBe(l.allocated/UNIT);
  }
  expect(sim.ledger().principal).toBe(0n);expect(sim.ledger().allocated).toBe(3n*UNIT);
 });
 it('authenticates monotonic bounded simulation time',async()=>{
  const {sim,admin}=await setup();sim.privateState=privateState();
  await expect(sim.call('advanceSimulation',YEAR)).rejects.toThrow(/Only simulation admin/);
  sim.privateState=admin;await sim.call('advanceSimulation',YEAR);
  for(const t of [0n,YEAR,315360001n]) await expect(sim.call('advanceSimulation',t)).rejects.toThrow(/Invalid simulated time/);
 });
 it('requires accrued yield and funded reserve and prevents replay/historical manipulation',async()=>{
  const {sim,admin}=await setup();const p=await deposit(sim);
  await expect(sim.call('claim',sim.ledger().simulatedSeconds)).rejects.toThrow(/Insufficient simulated yield/);
  sim.privateState=admin;await sim.call('advanceSimulation',YEAR);
  sim.privateState=p;await expect(sim.call('claim',sim.ledger().simulatedSeconds)).rejects.toThrow(/reserve exhausted/);
  await sim.call('fundReserve',coin(UNIT));
  const next=await claim(sim,p);
  expect(sim.ledger().allocated).toBe(UNIT);expect(sim.ledger().issued).toBe(1n);
  sim.privateState=p;await expect(sim.call('claim',sim.ledger().simulatedSeconds)).rejects.toThrow(/reserve exhausted|already spent/);
  await sim.call('fundReserve',coin(UNIT));
  sim.privateState={...next,carry:next.carry+1n};await expect(sim.call('claim',sim.ledger().simulatedSeconds)).rejects.toThrow(/Unknown private position/);
  sim.privateState={...next,checkpoint:0n};await expect(sim.call('claim',sim.ledger().simulatedSeconds)).rejects.toThrow(/Unknown private position/);
  const again=await claim(sim,next);expect(again.carry).toBe(8n*UNIT*YEAR*10000n);
  expect(sim.ledger().principal).toBe(LOT);expect(sim.ledger().reserve).toBe(2n*UNIT);
  sim.privateState=again;await expect(sim.call('claim',sim.ledger().simulatedSeconds)).rejects.toThrow(/reserve exhausted/);
 });
 it('retains fractional accrual exactly and gives late deposits no historical yield',async()=>{
  const {sim,admin}=await setup();let p=await deposit(sim);
  await sim.call('fundReserve',coin(UNIT));
  sim.privateState=admin;const elapsed=YEAR/10n+1n;await sim.call('advanceSimulation',elapsed);
  p=await claim(sim,p);expect(p.carry).toBe(LOT*RATE);
  const late=await deposit(sim);await sim.call('fundReserve',coin(UNIT));sim.privateState=late;
  await expect(sim.call('claim',sim.ledger().simulatedSeconds)).rejects.toThrow(/Insufficient simulated yield/);
 });
 it('never writes note secrets, owner wallet keys or credit secrets into public ledger',async()=>{
  const {sim,admin}=await setup();const alice=await deposit(sim),bob=await deposit(sim);
  await sim.call('fundReserve',coin(UNIT));sim.privateState=admin;await sim.call('advanceSimulation',YEAR);await claim(sim,alice);
  assertNotInPublicState(sim.ledger(),{alice:alice.secret,bob:bob.secret,admin:admin.secret,salt:alice.salt,next:alice.nextSalt,credit:alice.creditSecret});
  expect([...sim.ledger().principalCoins].map(([,c])=>c.value)).toEqual([LOT,LOT]);
 });
 it('rejects forged Merkle paths independently of honest witness lookup',async()=>{
  const malicious=new Contract({...witnesses,positionPath:({privateState:p,ledger:l},leaf)=>{
   const path=l.positions.findPathForLeaf(leaf)!;
   return [p,{...path,path:path.path.map((step,i)=>i===0?{...step,sibling:{field:step.sibling.field+1n}}:step)}];
  }});
  const evil=await Sim.deploy({contract:malicious,ledger,privateState:privateState(),args:[COLOR,LOT,UNIT,RATE,{bytes:bytes32()}]});
  await evil.call('deposit',coin());const [key]=[...evil.ledger().principalCoins][0]!;
  await expect(evil.call('withdraw',key)).rejects.toThrow(/Invalid position membership/);
  expect(evil.ledger().principal).toBe(LOT);
 });
 it('redeems a credit privately, rejects replay, wrong witnesses and invalid expiry',async()=>{
  const {sim,admin}=await setup();const p=await deposit(sim);
  await sim.call('fundReserve',coin(UNIT));sim.privateState=admin;await sim.call('advanceSimulation',YEAR);await claim(sim,p);
  const key=[...sim.ledger().reserveCoins][0]![0];
  sim.privateState=privateState({creditSecret:bytes32()});
  const now=BigInt(Math.floor(Date.now()/1000));
  await expect(sim.call('redeem',key,bytes32(),now+300n)).rejects.toThrow(/Unknown private credit/);
  sim.privateState=privateState({creditSecret:p.creditSecret});
  await expect(sim.call('redeem',key,bytes32(),now-1n)).rejects.toThrow(/expired/);
  await expect(sim.call('redeem',key,bytes32(),now+3600n)).rejects.toThrow(/too distant/);
  const binding=bytes32();await sim.call('redeem',key,binding,now+300n);
  expect(sim.ledger().allocated).toBe(0n);expect(sim.ledger().reserve).toBe(0n);expect(sim.ledger().principal).toBe(LOT);
  expect(sim.ledger().redeemed).toBe(1n);expect(sim.ledger().receipts.size()).toBe(1n);
  await expect(sim.call('redeem',key,binding,now+300n)).rejects.toThrow(/already redeemed/);
  assertNotInPublicState(sim.ledger(),{creditSecret:p.creditSecret,owner:p.secret});
 });
 it('rejects a claim built against a different simulated checkpoint',async()=>{
  const {sim}=await setup();await expect(sim.call('claim',1n)).rejects.toThrow(/clock changed/);
 });
 it('separates every commitment/nullifier domain and deployment',()=>{
  const sk=bytes32(),salt=bytes32(),a=bytes32(),b=bytes32();
  const outputs=[pureCircuits.ownerKey(sk,a),pureCircuits.creditCommit(sk,a),pureCircuits.creditNullifier(sk,a),pureCircuits.receiptBinding(sk,a),pureCircuits.positionCommit(sk,salt,0n,0n,a),pureCircuits.positionNullifier(sk,salt,0n,0n,a)];
  expect(new Set(outputs.map(hex)).size).toBe(outputs.length);
  expect(pureCircuits.creditNullifier(sk,a)).not.toEqual(pureCircuits.creditNullifier(sk,b));
  expect(pureCircuits.positionNullifier(sk,salt,0n,0n,a)).not.toEqual(pureCircuits.positionNullifier(sk,salt,1n,0n,a));
 });
});
