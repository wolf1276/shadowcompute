import { it,expect } from 'vitest';
import { mkdtempSync,statSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { savePrivate,loadPrivate } from '../src/notes.js';
import { privateState } from '../../contracts/contract/witnesses.js';
it('atomically preserves private note bytes and large integers with owner-only permissions',()=>{
 const dir=mkdtempSync(join(tmpdir(),'shadow-note-')),path=join(dir,'note.json');
 try{
  const note=privateState({carry:2n**100n});savePrivate(path,note);expect(loadPrivate(path)).toEqual(note);expect(statSync(path).mode&0o777).toBe(0o600);
  const next={...note,carry:1n};savePrivate(path,next);expect(loadPrivate(path)).toEqual(next);
 }finally{rmSync(dir,{recursive:true});}
});
it('preserves note integer types when the wallet SDK installs a global BigInt JSON conversion',()=>{
 const dir=mkdtempSync(join(tmpdir(),'shadow-sdk-note-')),path=join(dir,'note.json');
 const previous=Object.getOwnPropertyDescriptor(BigInt.prototype,'toJSON');
 Object.defineProperty(BigInt.prototype,'toJSON',{configurable:true,value:function(this:bigint){return this.toString();}});
 try{
  const note=privateState({checkpoint:31536000n,carry:2n**100n});savePrivate(path,note);expect(loadPrivate(path)).toEqual(note);
 }finally{
  if(previous)Object.defineProperty(BigInt.prototype,'toJSON',previous);else Reflect.deleteProperty(BigInt.prototype,'toJSON');
  rmSync(dir,{recursive:true});
 }
});
