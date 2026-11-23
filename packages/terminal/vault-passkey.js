import {createSecretVaultWithNewPasskey,decryptSecretVaultWithPasskey,parseSecretVault} from './mera.js';
const encoder=new TextEncoder();
export function parseVaultPasskey(input,rpId){
 if(!input||input.version!==1||typeof input.rpId!=='string'||input.rpId.length>253)throw new Error('Invalid vault passkey backup. Use the recovery password.');
 if(rpId!==undefined&&input.rpId!==rpId)throw new Error('This passkey belongs to another hostname. Open the original hostname or use the recovery password.');
 return {version:1,rpId:input.rpId,vault:parseSecretVault(input.vault)};
}
export async function enrollVaultPasskey(password,scope,{rpId,webAuthnClient}){
 const secret=encoder.encode(JSON.stringify({scope,password}));
 try{
  const vault=await createSecretVaultWithNewPasskey({rp:{id:rpId,name:'ShadowCompute'},user:{name:'ShadowCompute vault',displayName:'ShadowCompute private vault'},secret,webAuthnClient});
  return {version:1,rpId,vault};
 }finally{secret.fill(0);}
}
export async function unlockVaultPasskey(input,scope,{rpId,webAuthnClient}){
 const wrapper=parseVaultPasskey(input,rpId);
 const secret=await decryptSecretVaultWithPasskey({rpId,vault:wrapper.vault,webAuthnClient});
 try{
  const payload=JSON.parse(new TextDecoder().decode(secret));
  if(!payload||payload.scope!==scope||typeof payload.password!=='string'||payload.password.length<16)throw new Error('Passkey does not match this wallet, network or vault. Use the recovery password.');
  return payload.password;
 }finally{secret.fill(0);}
}
export function passkeyError(error){
 if(error?.code==='PRF_UNAVAILABLE')return 'This passkey cannot unlock encrypted notes on this device. Use your recovery password or try another authenticator.';
 if(error?.code==='PASSKEY_OPERATION_FAILED'||error?.name==='NotAllowedError')return 'Passkey request cancelled or unavailable. Your notes are unchanged; use the recovery password or try again.';
 if(error?.code)return 'Could not unlock the passkey-protected secret. Use the original hostname, passkey and recovery password.';
 return error?.message||'Passkey operation failed. Your password vault is still available.';
}
