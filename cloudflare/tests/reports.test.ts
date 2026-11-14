import {it,expect,beforeAll,afterAll} from "vitest";
import {Miniflare,convertV4MiniflareOptions} from "miniflare";
import {readFileSync} from "node:fs";
import {reportRoutes,validateReport} from "../src/reports";
let mf:Miniflare,db:D1Database;
beforeAll(async()=>{
 mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("ok")}}',d1Databases:['DB'],compatibilityDate:'2026-11-14'}));db=await mf.getD1Database('DB') as unknown as D1Database;
 for(const name of ['0001_initial.sql','0004_reports.sql'])for(const sql of readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8').split(';').map(v=>v.trim()).filter(Boolean))await db.prepare(sql).run();
 for(const id of ['a','b'])await db.prepare('INSERT INTO accounts VALUES(?,?,?)').bind(id,id,new Date().toISOString()).run();
});
afterAll(async()=>{await mf?.dispose()});
const route=async(owner:string,path:string,method='GET',body?:unknown)=> (await reportRoutes(new Request('https://tracelet.test'+path,{method,...(body?{body:JSON.stringify(body),headers:{'Content-Type':'application/json'}}:{})}),db,owner,path))!;
const entry=(id:string,included=true)=>({id,included,job:{id,query:id,kind:'phone',status:'completed',findings:[],notes:[],errors:[],unavailable:[]}});
it('isolates report drafts, rejects stale writes, and archives only selected searches',async()=>{
 const a=await (await route('a','/api/workspace')).json() as any;
 const b=await (await route('b','/api/workspace')).json() as any;
 expect(a.id).not.toBe(b.id);
 const payload={...a,title:'Case α',entries:[entry('keep'),entry('remove',false)]};
 const saved=await (await route('a','/api/workspace','PUT',payload)).json() as any;
 expect(saved.revision).toBe(1);
 expect((await route('a','/api/workspace','PUT',payload)).status).toBe(409);
 expect((await route('b','/api/workspace','PUT',saved)).status).toBe(409);
 expect((await route('b','/api/reports/archive','POST',{id:saved.id,revision:1})).status).toBe(409);
 expect((await route('a','/api/reports/archive','POST',{id:saved.id,revision:1})).status).toBe(200);
 const archive=await (await route('a','/api/reports/'+a.id)).json() as any;
 expect(archive.entries).toHaveLength(1);expect(archive.entries[0].id).toBe('keep');expect(archive.title).toBe('Case α');
 expect((await route('b','/api/reports/'+a.id)).status).toBe(404);
 const next=await (await route('a','/api/workspace')).json() as any;expect(next.entries).toEqual([]);expect(next.id).not.toBe(a.id);
 const history=await (await route('a','/api/reports')).json() as any[];expect(history).toHaveLength(1);expect(history[0].count).toBe(1);
 await route('b','/api/reports/'+a.id,'DELETE');expect((await route('a','/api/reports/'+a.id)).status).toBe(200);
 await route('a','/api/reports/'+a.id,'DELETE');expect((await route('a','/api/reports/'+a.id)).status).toBe(404);
});
it('rejects malformed and duplicate entries',()=>{
 expect(validateReport({title:'x',revision:0,entries:[entry('x'),entry('x')]})).toBeTruthy();
 expect(validateReport({title:'x',revision:0,entries:[{...entry('x'),job:{}}]})).toBeTruthy();
});
