const encoder=new TextEncoder();
const hex=bytes=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
const bytes=value=>Uint8Array.from(value.match(/../g)??[],byte=>parseInt(byte,16));
export function validateCreditSeed(seed){
 if(!seed||typeof seed.secret!=='string'||typeof seed.baseSalt!=='string'||!/^([a-f0-9]{64})$/.test(seed.secret)||!/^([a-f0-9]{64})$/.test(seed.baseSalt)||typeof seed.units!=='string'||!/^\d{1,10}$/.test(seed.units)||BigInt(seed.units)<1n||BigInt(seed.units)>1000000000n)throw new Error('Invalid private credit recovery seed');
 return seed;
}
export function newCreditSeed(units){return validateCreditSeed({secret:hex(crypto.getRandomValues(new Uint8Array(32))),baseSalt:hex(crypto.getRandomValues(new Uint8Array(32))),units:String(units)});}
async function derive(seed,index,domain){
 const context=encoder.encode(`shadow:prepaid:${domain}:v1`),counter=new Uint8Array(4);new DataView(counter.buffer).setUint32(0,index,false);
 const input=new Uint8Array(context.length+68);input.set(context);input.set(bytes(seed.secret),context.length);input.set(bytes(seed.baseSalt),context.length+32);input.set(counter,context.length+64);
 try{return hex(new Uint8Array(await crypto.subtle.digest('SHA-256',input)));}finally{input.fill(0);}
}
export async function creditNote(seed,index=0){
 validateCreditSeed(seed);if(!Number.isInteger(index)||index<0||BigInt(index)>BigInt(seed.units))throw new Error('Invalid credit sequence');
 return {secret:seed.secret,salt:index===0?seed.baseSalt:await derive(seed,index,'salt'),nextSalt:await derive(seed,index+1,'salt'),balance:String(BigInt(seed.units)-BigInt(index))};
}
export async function creditBearer(seed,index){validateCreditSeed(seed);if(!Number.isInteger(index)||index<0||BigInt(index)>=BigInt(seed.units))throw new Error('Invalid credit sequence');return derive(seed,index,'bearer');}
