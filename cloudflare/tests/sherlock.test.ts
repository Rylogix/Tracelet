import {it, expect, beforeAll, afterAll} from "vitest";
import {Miniflare, convertV4MiniflareOptions} from "miniflare";
import {readFileSync} from "node:fs";
import {sherlockEnabled, startSherlock, refreshSherlock, cancelSherlock} from "../src/sherlock";
let mf: Miniflare, db: D1Database;
beforeAll(async()=>{
  mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("ok")}}',d1Databases:['DB'],compatibilityDate:'2026-11-14'}));
  db=await mf.getD1Database('DB') as unknown as D1Database;
  for(const sql of readFileSync(new URL('../migrations/0001_initial.sql',import.meta.url),'utf8').split(';').map(s=>s.trim()).filter(Boolean))await db.prepare(sql).run();
  await db.prepare('INSERT INTO accounts VALUES(?,?,?)').bind('sherlock-test','sherlock-test',new Date().toISOString()).run();
});
afterAll(async()=>{await mf?.dispose()});
it('requires operator opt-in and a private binding',()=>{
  expect(sherlockEnabled({DB:db,ENCRYPTION_KEY:''})).toBe(false);
  expect(sherlockEnabled({DB:db,ENCRYPTION_KEY:'',SHERLOCK_ENABLED:'true'})).toBe(false);
});
it('enforces personal budgets before sending a container request',async()=>{
  await db.prepare("INSERT INTO usage(owner,provider,budget) VALUES(?,'sherlock',0)").bind('sherlock-test').run();
  let calls=0;const env={DB:db,ENCRYPTION_KEY:'',SHERLOCK_ENABLED:'true',SHERLOCK:{fetch:async()=>{calls++;return Response.json({})}} as unknown as Fetcher};
  const job={id:crypto.randomUUID(),target:'octocat',status:'queued',total:0,completed:0,findings:[],notes:[]};
  await expect(startSherlock(env,'sherlock-test',job)).rejects.toThrow('personal budget');expect(calls).toBe(0);
});
it('normalizes progress and matches and sends cancellation through the private binding',async()=>{
  let method='';const env={DB:db,ENCRYPTION_KEY:'',SHERLOCK:{fetch:async(_url:string,options:RequestInit)=>{method=options?.method||'GET';return Response.json({total:411,status:'completed',checks:[{platform:'GitHub',provider:'sherlock',status:'found',url:'https://github.com/octocat'},{platform:'Blocked',provider:'sherlock',status:'unavailable'}]})}} as unknown as Fetcher};
  const job={id:crypto.randomUUID(),target:'octocat',status:'running',total:0,completed:0,findings:[],notes:[]};
  await refreshSherlock(env,job);expect(job.status).toBe('partial');expect(job.total).toBe(411);expect(job.completed).toBe(2);expect(job.findings).toHaveLength(1);expect((job.findings[0] as any).confidence).toBe('low');
  await cancelSherlock(env,job.id);expect(method).toBe('DELETE');
});
it('accounts for successful starts and blocks duplicate bursts',async()=>{
  await db.prepare("DELETE FROM provider_locks WHERE provider='sherlock'").run();
  await db.prepare("UPDATE usage SET budget=NULL WHERE owner='sherlock-test' AND provider='sherlock'").run();
  let calls=0;
  const env={DB:db,ENCRYPTION_KEY:'',SHERLOCK_ENABLED:'true',SHERLOCK:{fetch:async()=>{calls++;return Response.json({total:411,status:'running',checks:[]})}} as unknown as Fetcher};
  const job={id:crypto.randomUUID(),target:'octocat',status:'queued',total:0,completed:0,findings:[],notes:[]};
  await startSherlock(env,'sherlock-test',job);
  expect(job.status).toBe('running');expect(job.total).toBe(411);
  const usage=await db.prepare("SELECT attempts,successes FROM usage WHERE owner='sherlock-test' AND provider='sherlock'").first<{attempts:number,successes:number}>();
  expect(usage?.attempts).toBe(1);expect(usage?.successes).toBe(1);
  await expect(startSherlock(env,'sherlock-test',{...job,id:crypto.randomUUID()})).rejects.toThrow('cooling down');expect(calls).toBe(1);
});
