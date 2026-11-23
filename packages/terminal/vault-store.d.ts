export function randomSecret():string;
export function newPosition(checkpoint:string):Record<string,string>;
export function nextPosition(note:Record<string,string>,config:Record<string,string>):Record<string,string>;
export function earnedYield(note:Record<string,string>,config:Record<string,string>):bigint;
export function openVaultStore(storage:{getItem(k:string):string|null;setItem(k:string,v:string):void},password:string,scope:string,backup?:string):Promise<any>;
export function acquireVaultLock(locks:any,scope:string):Promise<()=>void>;
export function vaultStoreName(scope:string):Promise<string>;
export function openVaultWithPasskey(storage:Parameters<typeof openVaultStore>[0],scope:string,options:import('./vault-passkey.js').VaultPasskeyOptions,backup?:string):ReturnType<typeof openVaultStore>;

export function vaultUnlockHint(storage:Parameters<typeof openVaultStore>[0],scope:string,backup?:string|null,rpId?:string):Promise<{exists:boolean;hasPasskey:boolean}>;
