import {it,expect} from 'vitest';
import {previewDeploymentConfig,relayJournalDirectory} from '../src/prepaid-deployment.js';
const env={MIDNIGHT_NETWORK:'preview',SEPOLIA_RPC_URL:'https://example.com',EVM_RELAY_PRIVATE_KEY:'0x'+'01'.repeat(32),MIDNIGHT_PREVIEW_ALICE_SEED:'02'.repeat(32),PRIVATE_STATE_PASSWORD:'Test-Only-Strong-Password'};
it('requires explicit public test configuration without exposing secret values',()=>{
 expect(previewDeploymentConfig(env).chainId).toBe(11155111);
 for(const key of ['SEPOLIA_RPC_URL','EVM_RELAY_PRIVATE_KEY','MIDNIGHT_PREVIEW_ALICE_SEED','PRIVATE_STATE_PASSWORD'])expect(()=>previewDeploymentConfig({...env,[key]:''})).toThrow(key);
 expect(()=>previewDeploymentConfig({...env,MIDNIGHT_NETWORK:'mainnet'})).toThrow('preview');
 expect(()=>previewDeploymentConfig({...env,SEPOLIA_RPC_URL:'http://example.com'})).toThrow('HTTPS');
 expect(()=>previewDeploymentConfig({...env,EVM_RELAY_PRIVATE_KEY:'bad-secret'})).toThrow('Invalid EVM');
});
it('isolates Preview relay recovery state without moving existing local journals',()=>{
 const address='ab'.repeat(32);expect(relayJournalDirectory('local',address)).toBe('.private-states/prepaid-relay');
 expect(relayJournalDirectory('preview',address)).not.toBe(relayJournalDirectory('local',address));
 expect(relayJournalDirectory('preview',address)).not.toBe(relayJournalDirectory('preview','cd'.repeat(32)));
 expect(()=>relayJournalDirectory('mainnet',address)).toThrow();expect(()=>relayJournalDirectory('preview','../x')).toThrow();
});
