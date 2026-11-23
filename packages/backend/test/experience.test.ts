import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {onboardingState,unlockPresentation,inferenceExperience,progressDescription,elapsedLabel} from '../../terminal/experience.js';
it('guides setup from connection through explicit backup acknowledgment to a funded allowance',()=>{
 expect(onboardingState().action).toBe('wallet-connect');expect(onboardingState({connected:true}).action).toBe('vault-password');
 const data={positions:[] as {status:string}[],credits:[] as {onChain:string;receipt?:unknown}[],history:[] as {action:string}[],setupBackupConfirmed:false};
 expect(onboardingState({connected:true,data}).action).toBe('vault-backup');data.setupBackupConfirmed=true;expect(onboardingState({connected:true,data}).action).toBe('vault-mint');data.history.push({action:'mint'});expect(onboardingState({connected:true,data}).action).toBe('vault-deposit');
 data.positions.push({status:'active'});expect(onboardingState({connected:true,data}).action).toBe('vault-refresh');expect(onboardingState({connected:true,data,claimReady:true}).action).toBe('vault-claim');
 data.credits.push({onChain:'active'});expect(onboardingState({connected:true,data}).complete).toBe(true);
 expect(onboardingState({connected:true,data:{...data,pending:{action:'withdraw'}}})).toMatchObject({action:'vault-reconcile',complete:false});
 expect(onboardingState({connected:true,data:{...data,setupBackupConfirmed:false}}).done[2]).toBe(false);
});
it('makes a saved, supported passkey primary while keeping password recovery open when unavailable',()=>{
 expect(unlockPresentation({exists:true,hasPasskey:true,supported:true})).toMatchObject({passkeyFirst:true,passwordOpen:false,showPasskey:true,passwordLabel:'Use recovery password'});
 expect(unlockPresentation({exists:true,hasPasskey:true,supported:false})).toMatchObject({passkeyFirst:false,passwordOpen:true});
 expect(unlockPresentation()).toMatchObject({showPasskey:false,passwordOpen:true,submitLabel:'Create vault'});
});
it('offers the independently tested Compact task only in compiler mode and explains other adapters',()=>{
 const compact=inferenceExperience('opencode-compact');expect(compact.compact).toBe(true);expect(compact.placeholder).toContain('Compact contract');expect(compact.suggestions[0].prompt).toBe(readFileSync('demos/compact-prompt.txt','utf8'));
 expect(inferenceExperience('provider').compact).toBe(false);expect(inferenceExperience('opencode').suggestions[0].prompt).toContain('Explain');expect(inferenceExperience('mock').note).toContain('Offline mock');expect(inferenceExperience('unknown').suggestions).toEqual([]);
});
it('describes actual progress events and elapsed time without invented percentages',()=>{
 expect(progressDescription('wallet-approval')).toBe('Waiting for wallet approval');expect(progressDescription('confirming')).toContain('confirmation');expect(progressDescription('requesting-ai')).toBe('Requesting AI response');expect(progressDescription('unknown')).toBe('Checking operation status');
 expect(elapsedLabel(1000,62500)).toBe('1m 1s elapsed');expect(elapsedLabel(5000,1000)).toBe('0s elapsed');expect(elapsedLabel(undefined)).toBe('');
});
