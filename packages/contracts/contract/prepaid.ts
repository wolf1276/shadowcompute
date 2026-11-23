import {CompiledContract} from '@midnight-ntwrk/midnight-js-protocol/v9/compact-js';
import {fileURLToPath} from 'node:url';
import {Contract,type Witnesses} from './managed/prepaid-credit/contract/index.js';
import {bytes32} from './witnesses.js';
export * from './managed/prepaid-credit/contract/index.js';
export type PrepaidNote={secret:Uint8Array;salt:Uint8Array;nextSalt:Uint8Array;balance:bigint;issuerSecret:Uint8Array};
export const prepaidNote=(input:Partial<PrepaidNote>={}):PrepaidNote=>({secret:bytes32(),salt:bytes32(),nextSalt:bytes32(),balance:0n,issuerSecret:bytes32(),...input});
export const prepaidWitnesses:Witnesses<PrepaidNote>={
 issuerSecret:({privateState:p})=>[p,p.issuerSecret],ownerSecret:({privateState:p})=>[p,p.secret],salt:({privateState:p})=>[p,p.salt],nextSalt:({privateState:p})=>[p,p.nextSalt],balance:({privateState:p})=>[p,p.balance],
 notePath:({privateState:p,ledger},leaf)=>{const path=ledger.notes.findPathForLeaf(leaf);if(!path)throw new Error('Unknown prepaid note');return [p,path];},
};
export const prepaidZkPath=fileURLToPath(new URL('./managed/prepaid-credit',import.meta.url));
export const compiledPrepaid=CompiledContract.make('PrepaidCredit',Contract).pipe(CompiledContract.withWitnesses(prepaidWitnesses),CompiledContract.withCompiledFileAssets(prepaidZkPath));
