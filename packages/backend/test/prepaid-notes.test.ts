import {it,expect} from 'vitest';
import {newCreditSeed,creditNote,creditBearer,validateCreditSeed} from '../../terminal/prepaid-notes.js';
it('recovers the same rotating credit notes from the original payment seed',async()=>{
 const seed=newCreditSeed('5'),first=await creditNote(seed),next=await creditNote(seed,1),last=await creditNote(seed,5);
 expect(first.salt).toBe(seed.baseSalt);expect(first.nextSalt).toBe(next.salt);expect(next.balance).toBe('4');expect(last.balance).toBe('0');expect(await creditNote({...seed},1)).toEqual(next);
 expect(await creditBearer(seed,0)).not.toBe(first.nextSalt);expect(await creditBearer(seed,0)).toBe(await creditBearer({...seed},0));expect(await creditBearer(seed,1)).not.toBe(await creditBearer(seed,0));
});
it('rejects invalid seeds, quantities and sequence numbers before creating credit notes',async()=>{
 for(const value of ['0','-1','1000000001','1.5','1e3'])expect(()=>newCreditSeed(value)).toThrow();expect(()=>validateCreditSeed({secret:'bad',baseSalt:'bad',units:'1'})).toThrow();const seed=newCreditSeed('2');await expect(creditNote(seed,3)).rejects.toThrow();await expect(creditNote(seed,1.5)).rejects.toThrow();await expect(creditBearer(seed,2)).rejects.toThrow();
});
