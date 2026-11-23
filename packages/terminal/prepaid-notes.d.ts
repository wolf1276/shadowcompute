export type CreditSeed={secret:string;baseSalt:string;units:string};
export type CreditNote={secret:string;salt:string;nextSalt:string;balance:string};
export function validateCreditSeed(seed:unknown):CreditSeed;
export function newCreditSeed(units:number|string):CreditSeed;
export function creditNote(seed:CreditSeed,index?:number):Promise<CreditNote>;
export function creditBearer(seed:CreditSeed,index:number):Promise<string>;
