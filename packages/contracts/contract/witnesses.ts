import type { Witnesses } from './managed/shadow-vault/contract/index.js';
import { randomBytes } from 'node:crypto';
export type Note = { secret:Uint8Array; salt:Uint8Array; checkpoint:bigint; carry:bigint };
export type PrivateState = Note & { nextSalt:Uint8Array; creditSecret:Uint8Array };
export const bytes32 = () => new Uint8Array(randomBytes(32));
export function privateState(note?:Partial<PrivateState>):PrivateState {
 return {secret:bytes32(),salt:bytes32(),checkpoint:0n,carry:0n,nextSalt:bytes32(),creditSecret:bytes32(),...note};
}
export const witnesses:Witnesses<PrivateState> = {
 secret:({privateState:p})=>[p,p.secret], salt:({privateState:p})=>[p,p.salt],
 nextSalt:({privateState:p})=>[p,p.nextSalt], checkpoint:({privateState:p})=>[p,p.checkpoint],
 carry:({privateState:p})=>[p,p.carry], creditSecret:({privateState:p})=>[p,p.creditSecret],
 positionPath:({privateState:p,ledger},leaf)=>{
  const path=ledger.positions.findPathForLeaf(leaf);
  if(!path) throw new Error('Unknown private position');
  return [p,path];
 },
 creditPath:({privateState:p,ledger},leaf)=>{
  const path=ledger.credits.findPathForLeaf(leaf);
  if(!path) throw new Error('Unknown private credit');
  return [p,path];
 },
};
