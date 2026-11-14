import {it,expect,beforeAll,afterAll} from "vitest";
import {Miniflare,convertV4MiniflareOptions} from "miniflare";
import {readFileSync} from "node:fs";
import {mailPolicies,publicIpv4,rdapSummary,dnsLookup} from "../src/enrichment";
import {interpret,platforms} from "../src/usernames";
import {documentMetadata} from "../../frontend/components/document-metadata";
import {zipSync,strToU8} from "../../frontend/node_modules/fflate/esm/index.mjs";
let mf:Miniflare,db:D1Database;
beforeAll(async()=>{
 mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("ok")}}',d1Databases:['DB'],compatibilityDate:'2026-11-14'}));db=await mf.getD1Database('DB') as unknown as D1Database;
 for(const name of ['0001_initial.sql','0002_username_discovery.sql'])for(const sql of readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8').split(';').map(s=>s.trim()).filter(Boolean))await db.prepare(sql).run();
 await db.prepare('INSERT INTO accounts VALUES(?,?,?)').bind('enrich','enrich',new Date().toISOString()).run();
});
afterAll(async()=>{await mf?.dispose()});
it('keeps observed public profile details, zero counts and false flags without copying contacts',()=>{
 const site=platforms.find(p=>p.id==='github')!;
 const result=interpret(site,'test-fixture',200,{login:'test-fixture',bio:'<p>Public project biography</p>',blog:'https://example.com',followers:0,public_repos:7,private_email:'never-copy',email:'never-copy'});
 expect(result.finding?.value).toMatchObject({bio:'Public project biography',website:'https://example.com',followers:0,public_repositories:7});
 expect(result.finding?.value).not.toHaveProperty('email');expect(result.finding?.value).not.toHaveProperty('created_at');expect(result.finding?.confidence).toBe('low');
});
it('normalizes registrar and lifecycle fields without exposing registrant contact records',()=>{
 const data={ldhName:'EXAMPLE.COM',events:[{eventAction:'registration',eventDate:'2000-01-01'}],nameservers:[{ldhName:'NS1.EXAMPLE.COM'}],secureDNS:{delegationSigned:true},entities:[{roles:['registrant'],vcardArray:['vcard',[['fn',{},'text','Private Person']]]},{roles:['registrar'],vcardArray:['vcard',[['fn',{},'text','Example Registrar']]],publicIds:[{type:'IANA Registrar ID',identifier:'123'}]}]};
 expect(rdapSummary(data)).toMatchObject({domain:'EXAMPLE.COM',registered:'2000-01-01',registrar:'Example Registrar',nameservers:['NS1.EXAMPLE.COM'],dnssec_delegation_signed:true});expect(JSON.stringify(rdapSummary(data))).not.toContain('Private Person');expect(rdapSummary(data)).not.toHaveProperty('expires');
});
it('parses published mail policy without pretending to test a mailbox or unqueried policies',()=>{
 const text=(data:string)=>({Answer:[{type:16,data}]});
 const result=mailPolicies('example.com',{Answer:[{type:15,data:'10 mail.example.com.'}]},text('"v=spf1 " "include:example.net -all"'),text('"v=DMARC1; p=reject; pct=80; adkim=s"'));
 expect(result).toMatchObject({mx_records:['10 mail.example.com.'],spf_records:['v=spf1 include:example.net -all'],dmarc_policy:'reject',policy_percentage:'80',dkim_alignment:'s'});
 expect(result).not.toHaveProperty('mailbox_exists');expect(result).not.toHaveProperty('mta_sts_records');
 const duplicate=mailPolicies('example.com',{}, {},{Answer:[{type:16,data:'"v=DMARC1; p=none"'},{type:16,data:'"v=DMARC1; p=reject"'}]});expect(duplicate.dmarc_issue).toBeTruthy();expect(duplicate).not.toHaveProperty('dmarc_policy');
});
it('does not send private, reserved or malformed addresses to network enrichment',()=>{
 for(const ip of ['127.0.0.1','10.1.1.1','192.168.0.1','169.254.169.254','100.64.0.1','198.18.0.1','203.0.113.1','224.1.1.1','999.1.1.1','::1','1.1.1.1/?x'])expect(publicIpv4(ip),ip).toBe(false);
 expect(publicIpv4('1.1.1.1')).toBe(true);
});
it('caches actual DNS answers without spending another request and stops before network on cancellation',async()=>{
 const original=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;return Response.json({Status:0,AD:true,Answer:[{type:1,TTL:120,data:'1.1.1.1'}]})};
 const env={DB:db,ENCRYPTION_KEY:''};
 try{
  await dnsLookup(env,'enrich','example.com','A');await dnsLookup(env,'enrich','example.com','A');expect(calls).toBe(1);
  const usage=await db.prepare("SELECT attempts FROM usage WHERE owner='enrich' AND provider='dns'").first<{attempts:number}>();expect(usage?.attempts).toBe(1);
  await expect(dnsLookup(env,'enrich','another.example','A',{cancelled:async()=>true})).rejects.toThrow('cancelled');expect(calls).toBe(1);
  await expect(dnsLookup(env,'enrich','another.example','A',{deadline:Date.now()-1})).rejects.toThrow('time budget');expect(calls).toBe(1);
 }finally{globalThis.fetch=original}
});
it('extracts real document package metadata without executing XML entities or archive paths',()=>{
 const bytes=zipSync({'docProps/core.xml':strToU8('<cp:coreProperties><dc:title>Case &amp; evidence</dc:title><dc:creator>Test fixture</dc:creator><dcterms:created>2026-01-01T00:00:00Z</dcterms:created></cp:coreProperties>'),'docProps/app.xml':strToU8('<Properties><Application>Test editor</Application><Words>123</Words></Properties>'),'../../outside':strToU8('must-not-read')});
 expect(documentMetadata(bytes)).toMatchObject({Title:'Case & evidence',Author:'Test fixture',Application:'Test editor',Words:'123'});expect(JSON.stringify(documentMetadata(bytes))).not.toContain('must-not-read');
 const large=zipSync({'docProps/core.xml':strToU8('x'.repeat(300000))});expect(documentMetadata(large)['Metadata limit']).toBeTruthy();
});
