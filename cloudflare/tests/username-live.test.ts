import {it,expect} from 'vitest';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {readFileSync} from 'node:fs';
import {EnvHttpProxyAgent,setGlobalDispatcher} from 'undici';
import {platforms,checkProfile} from '../src/usernames';
it.skipIf(process.env.TRACELET_LIVE!=='1')('validates every real profile adapter, missing profiles, request accounting, and cache',async()=>{
 setGlobalDispatcher(new EnvHttpProxyAgent());const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("ok")}}',d1Databases:['DB'],compatibilityDate:'2026-11-14'}));
 try{const db=await mf.getD1Database('DB') as unknown as D1Database;for(const file of ['0001_initial.sql','0002_username_discovery.sql'])for(const sql of readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8').split(';').map(v=>v.trim()).filter(Boolean))await db.prepare(sql).run();await db.prepare('INSERT INTO accounts VALUES(?,?,?)').bind('live','live-fixture',new Date().toISOString()).run();const env={DB:db,ENCRYPTION_KEY:''};
  let cursor=0;const positives=new Map<string,string>();await Promise.all(Array.from({length:4},async()=>{while(cursor<platforms.length){const p=platforms[cursor++];const result=await checkProfile(env,'live',p,p.claimed);positives.set(p.id,result.status);expect(result.status,p.name+': '+result.reason).toBe('found');const cached=await checkProfile(env,'live',p,p.claimed);expect(cached.cached,p.name).toBe(true);const row=await db.prepare('SELECT attempts FROM usage WHERE owner=? AND provider=?').bind('live',p.id).first<{attempts:number}>();expect(row?.attempts,p.name).toBe(1)}}));
  await new Promise(r=>setTimeout(r,6100));cursor=0;await Promise.all(Array.from({length:4},async()=>{while(cursor<platforms.length){const p=platforms[cursor++];const result=await checkProfile(env,'live',p,'trclet9f27d4b5');expect(result.status,p.name+': '+result.reason).toBe(p.id==='opencollective'?'unavailable':'not_found')}}));
 }finally{await mf.dispose()}
},90000);
