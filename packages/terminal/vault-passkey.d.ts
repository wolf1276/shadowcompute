import type {PasskeySecretVault,WebAuthnClient} from '@category-labs/mera';
export type VaultPasskeyOptions={rpId:string;webAuthnClient?:WebAuthnClient};
export type VaultPasskeyWrapper={version:1;rpId:string;vault:PasskeySecretVault};
export function parseVaultPasskey(input:unknown,rpId?:string):VaultPasskeyWrapper;
export function enrollVaultPasskey(password:string,scope:string,options:VaultPasskeyOptions):Promise<VaultPasskeyWrapper>;
export function unlockVaultPasskey(input:unknown,scope:string,options:VaultPasskeyOptions):Promise<string>;
export function passkeyError(error:unknown):string;
