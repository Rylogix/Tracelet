import {external,finding,type Finding,type ProviderEnv} from "./providers";
export interface AdapterOptions {
  emit?:(value:Finding)=>Promise<void>;
  cancelled?:()=>Promise<boolean>;
  deadline?:number;
}
async function checkpoint(options:AdapterOptions) {
  if(options.deadline && Date.now()>options.deadline-3500)throw new Error("Search time budget reached; remaining checks were not run.");
  if(await options.cancelled?.())throw new Error("Search cancelled");
}
export async function dnsLookup(env:ProviderEnv,owner:string,name:string,type:string,options:AdapterOptions={}) {
  await checkpoint(options);
  const key=name.toLowerCase()+":"+type;
  const cached=await env.DB.prepare("SELECT payload FROM provider_cache WHERE owner=? AND provider='dns' AND query=? AND expires>?").bind(owner,key,Date.now()).first<{payload:string}>();
  if(cached)return JSON.parse(cached.payload);
  const gate=await env.DB.prepare("SELECT next_request FROM provider_locks WHERE provider='dns'").first<{next_request:number}>();
  const delay=Math.max(0,(gate?.next_request||0)-Date.now()+30);
  if(delay>0)await new Promise(r=>setTimeout(r,Math.min(delay,550)));
  await checkpoint(options);
  const data=await external(env,owner,"dns","https://dns.google/resolve?name="+encodeURIComponent(name)+"&type="+type,{}, {timeout:3000});
  if(![0,3].includes(data.Status))throw new Error("Public DNS resolver could not answer this query.");
  // Cache positive responses only, respecting the shortest supplied TTL.
  const answers=data.Answer||[];
  const negative=(data.Authority||[]).filter((a:any)=>a.type===6).map((a:any)=>Math.min(Number(a.TTL)||0,Number(String(a.data).trim().split(/\s+/).at(-1))||0));
  const ttl=Math.min(300,...(answers.length?answers.map((a:any)=>Number(a.TTL)||0):negative));
  if(ttl>0 && (answers.length||negative.length))await env.DB.prepare("INSERT OR REPLACE INTO provider_cache VALUES(?,'dns',?,?,?)").bind(owner,key,JSON.stringify(data),Date.now()+ttl*1000).run();
  return data;
}
const dnsUrl=(name:string,type:string)=>"https://dns.google/query?name="+encodeURIComponent(name)+"&type="+type;
const txt=(data:any)=>(data.Answer||[]).filter((a:any)=>a.type===16).map((a:any)=>String(a.data).replace(/"\s*"/g,"").replace(/^"|"$/g,""));
export function mailPolicies(domain:string,mx:any,root:any,dmarc:any,sts?:any,tls?:any) {
  const mxHosts=(mx.Answer||[]).filter((a:any)=>a.type===15).map((a:any)=>String(a.data));
  const spf=txt(root).filter((v:string)=>/^v=spf1\b/i.test(v));
  const records=txt(dmarc).filter((v:string)=>/^v=DMARC1\b/i.test(v));
  const policy:Record<string,string>={};
  if(records.length===1)for(const part of records[0].split(";")){const i=part.indexOf("=");if(i>0)policy[part.slice(0,i).trim().toLowerCase()]=part.slice(i+1).trim()}
  const values:Record<string,unknown>={domain,mx_records:mxHosts,spf_records:spf,dmarc_records:records,
    ...(records.length===1?{dmarc_policy:policy.p||"Not specified",...(policy.sp?{subdomain_policy:policy.sp}:{}),...(policy.pct?{policy_percentage:policy.pct}:{}),...(policy.adkim?{dkim_alignment:policy.adkim}:{}),...(policy.aspf?{spf_alignment:policy.aspf}:{})}:{}),
    ...(sts?{mta_sts_records:txt(sts)}:{}),...(tls?{tls_reporting_records:txt(tls)}:{}),
    note:"Public domain configuration only. Does not prove mailbox existence, deliverability or account ownership."};
  if(spf.length>1)values.spf_issue="Multiple SPF records returned";
  if(records.length>1)values.dmarc_issue="Multiple DMARC records returned";
  return values;
}
export function publicIpv4(value:string) {
  if(!/^\d{1,3}(\.\d{1,3}){3}$/.test(value))return false;
  const [a,b,c,...rest]=value.split(".").map(Number);if([a,b,c,...rest].some(n=>n>255))return false;
  return !(a===0||a===10||a===127||a>=224||a===100&&b>=64&&b<=127||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&(b===168||b===0||b===88&&c===99)||a===198&&(b===18||b===19||b===51&&c===100)||a===203&&b===0&&c===113);
}
export function rdapSummary(data:any) {
  const events:Record<string,string>={};
  for(const e of data.events||[])if(typeof e.eventAction==="string"&&typeof e.eventDate==="string")events[e.eventAction]=e.eventDate;
  const registrar=(data.entities||[]).find((e:any)=>e.roles?.includes("registrar"));
  const cards=registrar?.vcardArray?.[1]||[];
  const result:Record<string,unknown>={domain:data.ldhName||data.unicodeName,...(data.status?{status:data.status}:{}),
    ...(events.registration?{registered:events.registration}:{}),...(events.expiration?{expires:events.expiration}:{}),...(events['last changed']?{last_changed:events['last changed']}:{}),
    nameservers:(data.nameservers||[]).map((n:any)=>n.ldhName||n.unicodeName).filter(Boolean)};
  const organization=cards.find((c:any)=>c[0]==="fn"||c[0]==="org")?.[3];if(typeof organization==="string")result.registrar=organization;
  const id=registrar?.publicIds?.find((p:any)=>p.type==="IANA Registrar ID")?.identifier;if(id)result.registrar_iana_id=id;
  if(typeof data.secureDNS?.delegationSigned==="boolean")result.dnssec_delegation_signed=data.secureDNS.delegationSigned;
  return result;
}
export async function domainAdapter(env:ProviderEnv,owner:string,provider:string,target:string,kind:string,options:AdapterOptions={}) {
  const results:Finding[]=[];
  async function emit(value:Finding){results.push(value);await options.emit?.(value)}
  if(provider==="dns") {
    const types=kind==="email"?["MX","TXT","A","AAAA"]:["A","AAAA","CNAME","MX","NS","TXT","CAA","SOA"];
    for(const type of types){
      const data=await dnsLookup(env,owner,target,type,options);
      await emit(finding("Google Public DNS",type+" records",{answers:(data.Answer||[]).map((a:any)=>({value:a.data,type:a.type,ttl_seconds:a.TTL})),...(typeof data.AD==="boolean"?{dnssec_validated:data.AD}:{}),...(data.Status===3?{response:"NXDOMAIN"}:{})},dnsUrl(target,type)));
    }
  }
  if(provider==="email-security") {
    const mx=await dnsLookup(env,owner,target,"MX",options),root=await dnsLookup(env,owner,target,"TXT",options);
    const dmarc=await dnsLookup(env,owner,"_dmarc."+target,"TXT",options);
    // Show useful mail policy before any optional checks finish.
    await emit(finding("Email DNS","SPF & DMARC",mailPolicies(target,mx,root,dmarc) ,dnsUrl("_dmarc."+target,"TXT")));
    const sts=await dnsLookup(env,owner,"_mta-sts."+target,"TXT",options);
    const tls=await dnsLookup(env,owner,"_smtp._tls."+target,"TXT",options);
    await emit(finding("Email DNS","Mail transport policies",{domain:target,mta_sts_records:txt(sts),tls_reporting_records:txt(tls)},dnsUrl("_mta-sts."+target,"TXT")));
  }
  if(provider==="network") {
    const dns=await dnsLookup(env,owner,target,"A",options);
    const ip=(dns.Answer||[]).find((a:any)=>a.type===1&&publicIpv4(a.data))?.data;
    if(!ip)throw new Error("No public IPv4 address was returned for network lookup.");
    const name=ip.split(".").reverse().join(".")+".origin.asn.cymru.com";
    const mapping=await dnsLookup(env,owner,name,"TXT",options);
    const records=txt(mapping).map((line:string)=>{const [asn,prefix,country,registry,allocated]=line.split("|").map(v=>v.trim());return {asn,prefix,allocation_country:country,registry,allocated}}).filter((v:any)=>/^[0-9 ]+$/.test(v.asn)&&v.prefix);
    if(!records.length)throw new Error("No public ASN mapping was returned.");
    const value:Record<string,unknown>={ip,routes:records,note:"Routing registration for a resolved IP, not proof of the website owner's identity or physical location."};
    const asn=records[0].asn.split(" ")[0];
    try {
      const organization=await dnsLookup(env,owner,"AS"+asn+".asn.cymru.com","TXT",options);
      const label=txt(organization)[0]?.split("|")[4]?.trim();if(label)value.network_name=label;
    }catch{value.network_name_lookup="Unavailable"}
    await emit(finding("Team Cymru DNS","Public network",value,dnsUrl(name,"TXT")));
  }
  return results;
}
