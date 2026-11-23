import {it,expect} from 'vitest';
import {Contract,ledger,pureCircuits,prepaidNote,prepaidWitnesses} from './contract/prepaid.js';
import {bytes32} from './contract/witnesses.js';
import {Sim,assertNotInPublicState} from './sim.js';
async function fixture(){const issuer=prepaidNote(),sim=await Sim.deploy({contract:new Contract(prepaidWitnesses),ledger,privateState:issuer,args:[31337n,new Uint8Array(20).fill(1),new Uint8Array(20).fill(2),10000n]});return {sim,issuer,instance:Buffer.from(sim.address,'hex')};}
it('authorizes one backed deposit, spends one unit and refunds only the remaining private balance',async()=>{
 const {sim,issuer,instance}=await fixture(),note=prepaidNote({balance:5n}),depositId=bytes32(),commit=pureCircuits.noteCommit(note.secret,note.salt,5n,instance);
 await sim.call('authorizeDeposit',depositId,commit,5n);sim.privateState=note;await sim.call('claimDeposit',depositId);expect(sim.ledger().outstandingUnits).toBe(5n);
 const bearer=bytes32(),spent=pureCircuits.noteNullifier(note.secret,note.salt,5n,instance);await sim.call('redeem',pureCircuits.receiptBinding(bearer,instance),BigInt(Math.floor(Date.now()/1000)+300));expect(sim.ledger().receipts.member(spent)).toBe(true);
 await expect(sim.call('redeem',pureCircuits.receiptBinding(bearer,instance),BigInt(Math.floor(Date.now()/1000)+300))).rejects.toThrow();
 sim.privateState=prepaidNote({...note,salt:note.nextSalt,balance:4n});await sim.call('requestRefund',new Uint8Array(20).fill(3));
 expect(sim.ledger().outstandingUnits).toBe(0n);expect(sim.ledger().consumedUnits).toBe(1n);expect(sim.ledger().refundedUnits).toBe(4n);expect(sim.ledger().pendingUnits).toBe(0n);
 await expect(sim.call('requestRefund',new Uint8Array(20).fill(3))).rejects.toThrow();sim.privateState=issuer;await expect(sim.call('authorizeDeposit',depositId,commit,5n)).rejects.toThrow('already authorized');
 assertNotInPublicState(sim.ledger(),{owner:note.secret,salt:note.salt,issuer:issuer.issuerSecret});
});
it('rejects unauthorized issuance, inflated claim balance, foreign owner and wrong membership',async()=>{
 const {sim,issuer,instance}=await fixture(),note=prepaidNote({balance:2n}),id=bytes32();sim.privateState=prepaidNote();await expect(sim.call('authorizeDeposit',id,bytes32(),2n)).rejects.toThrow('Only bridge');
 sim.privateState=issuer;await sim.call('authorizeDeposit',id,pureCircuits.noteCommit(note.secret,note.salt,2n,instance),2n);
 sim.privateState=prepaidNote();await expect(sim.call('claimDeposit',id)).rejects.toThrow('Wrong deposit');sim.privateState=note;await sim.call('claimDeposit',id);
 sim.privateState={...note,balance:100n};await expect(sim.call('requestRefund',new Uint8Array(20).fill(3))).rejects.toThrow();
 sim.privateState=prepaidNote({balance:2n});await expect(sim.call('requestRefund',new Uint8Array(20).fill(3))).rejects.toThrow();
});
it('rejects an approval whose commitment encodes a larger amount than the funded quantity',async()=>{
 const {sim,instance}=await fixture(),note=prepaidNote({balance:100n}),id=bytes32();await sim.call('authorizeDeposit',id,pureCircuits.noteCommit(note.secret,note.salt,100n,instance),1n);sim.privateState=note;await expect(sim.call('claimDeposit',id)).rejects.toThrow('Wrong deposit owner or quantity');expect(sim.ledger().outstandingUnits).toBe(0n);
});
it('consumes the last unit once and never permits refunding or spending a zero note',async()=>{
 const {sim,instance}=await fixture(),note=prepaidNote({balance:1n}),id=bytes32();await sim.call('authorizeDeposit',id,pureCircuits.noteCommit(note.secret,note.salt,1n,instance),1n);sim.privateState=note;await sim.call('claimDeposit',id);await sim.call('redeem',bytes32(),BigInt(Math.floor(Date.now()/1000)+300));sim.privateState={...note,salt:note.nextSalt,balance:0n};await expect(sim.call('requestRefund',new Uint8Array(20).fill(3))).rejects.toThrow('Empty credit');expect(sim.ledger().outstandingUnits).toBe(0n);
});
