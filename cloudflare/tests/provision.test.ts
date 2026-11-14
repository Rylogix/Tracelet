import {it,expect} from 'vitest';
// Deployment helper runs only in Node, never inside the public Worker.
// @ts-expect-error JavaScript deployment helper has no type declarations.
import {database,ensureKey} from '../scripts/provision.mjs';
it('reuses the existing database',async()=>{const calls:string[]=[];const id=await database(async(path:string)=>{calls.push(path);return {result:[{name:'tracelet',uuid:'existing-id'}]}},'account');expect(id).toBe('existing-id');expect(calls).toHaveLength(1)});
it('creates a database only after checking existing databases',async()=>{const calls:string[]=[];const id=await database(async(path:string,options?:{method:string})=>{calls.push(options?.method||'GET');return options?{result:{uuid:'new-id'}}:{result:[]}},'account');expect(id).toBe('new-id');expect(calls).toEqual(['GET','POST'])});
it('preserves an existing encryption key across deploys',async()=>{let wrote=false;expect(await ensureKey([{name:'ENCRYPTION_KEY'}],async()=>{wrote=true})).toBe(false);expect(wrote).toBe(false)});
it('generates a 256-bit key without hardcoding credentials',async()=>{let key='';expect(await ensureKey([],async(value:string)=>{key=value})).toBe(true);expect(Buffer.from(key,'base64')).toHaveLength(32)});
