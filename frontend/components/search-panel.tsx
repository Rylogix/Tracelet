"use client";
import {useEffect,useRef,useState} from "react";
import {Search,ArrowRight,Upload,Square,X,Plus,FileSearch} from "lucide-react";
import Link from "next/link";
import {api,type Job} from "./api";
import {analyzeFile} from "./analyze-file";
import {Findings} from "./findings";
import {Button} from "./ui/button";
import {useWorkflow,type Entry} from "./workflow";
export const kinds=[{id:"username",label:"Username",placeholder:"Username"},{id:"email",label:"Email",placeholder:"name@example.com"},{id:"phone",label:"Number",placeholder:"+44 20 7946 0018"},{id:"file",label:"Files",placeholder:""},{id:"website",label:"Website",placeholder:"example.com"}];
export function EntryPanel({entry,report=false,readOnly=false}:{entry:Entry;report?:boolean;readOnly?:boolean}) {
  const {include,cancel}=useWorkflow();const [expanded,setExpanded]=useState(false);const [error,setError]=useState("");
  const job=entry.job;const active=["queued","running"].includes(job.status);
  const label=kinds.find(k=>k.id===job.kind)?.label||job.kind;
  return <section className="panel workflow-entry result-arrival" aria-label={label+" search: "+job.query}>
    <div className="entry-heading"><div><span className="entry-kind">{label}</span><h2>{job.query}</h2>
      <span className="entry-meta">{job.findings.length} {job.kind==="username"?"possible matches":"findings"}<span>·</span><span className={active?"badge":""}>{job.status}</span></span>
    </div><div className="actions">
      {active && <Button size="sm" variant="outline" onClick={()=>cancel(job.id).catch(e=>setError(e.message))}><Square size={12}/>Cancel</Button>}
      {report && !readOnly && <button className="icon-button remove-entry" aria-label={"Remove "+job.query+" from report"} title="Remove from report" onClick={()=>include(entry.id,false)}><X size={17}/></button>}
      {!report && <button className={"report-toggle "+(entry.included?"is-included":"")} onClick={()=>include(entry.id,!entry.included)} aria-label={(entry.included?"Remove ":"Add ")+job.query+(entry.included?" from report":" to report")}>
        {entry.included?"In report":<><Plus size={13}/>Add to report</>}
      </button>}
    </div></div>
    {active && job.total>0 && <div className="job-progress" role="progressbar" aria-label="Investigation progress" aria-valuenow={job.completed} aria-valuemax={job.total}><span style={{width:Math.min(100,job.completed/job.total*100)+"%"}}/></div>}
    {error && <p role="alert" className="error">{error}</p>}
    {active && !job.findings.length && <div className="finding-skeleton" aria-label="Searching sources"><span/><span/><span/></div>}
    <Findings items={expanded?job.findings:job.findings.slice(0,4)}/>
    {job.findings.length>4 && <button className="text-action" onClick={()=>setExpanded(!expanded)}>{expanded?"Show less":`View all ${job.findings.length} findings`}</button>}
    {!active && !job.findings.length && <div className="entry-empty">No findings.</div>}
    {(job.checks?.length || job.notes.length || job.errors.length || job.unavailable.length)>0 && <details className="compact-details"><summary>{job.checks?`Checks (${job.completed}/${job.total})`:"Details"}</summary>
      {job.notes.map((n,i)=><p key={i}>{n}</p>)}
      {job.unavailable.map((v,i)=><p key={i}>{v.name}: {v.reason}</p>)}
      {job.errors.map((v,i)=><p key={i}>{v.source}: {v.message}</p>)}
      {job.checks && <ul className="check-list">{job.checks.map((c,i)=><li key={i}><span>{c.platform}</span><span>{c.status==="found"?"Match":c.status==="not_found"?"Not found":c.reason||c.status}</span></li>)}</ul>}
    </details>}
  </section>;
}
export function SearchPanel({kind}:{kind:string}) {
  const {draft,add}=useWorkflow();const type=kinds.find(k=>k.id===kind)!;
  const [query,setQuery]=useState("");const [busy,setBusy]=useState(false);const [error,setError]=useState("");
  const input=useRef<HTMLInputElement>(null);const file=useRef<HTMLInputElement>(null);
  const entries=draft?.entries.filter(e=>e.job.kind===kind)||[];
  const running=entries.some(e=>["queued","running"].includes(e.job.status));
  useEffect(()=>{const listener=(e:KeyboardEvent)=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==="k"){e.preventDefault();input.current?.focus()}};window.addEventListener("keydown",listener);return()=>window.removeEventListener("keydown",listener)},[]);
  async function search(e:React.FormEvent) {
    e.preventDefault();setBusy(true);setError("");
    try {add(await api<Job>("/search",{method:"POST",body:JSON.stringify({query,kind,history:false})}));setQuery("")}
    catch(e){setError((e as Error).message)}finally{setBusy(false)}
  }
  async function upload(value:File) {
    setBusy(true);setError("");
    try {const findings=await analyzeFile(value);add({id:crypto.randomUUID(),query:value.name,kind:"file",status:"completed",findings,notes:[],errors:[],unavailable:[],completed:1,total:1})}
    catch(e){setError((e as Error).message)}finally{setBusy(false)}
  }
  return <div className="workflow-page">
    <div className="page-heading"><h1>{type.label}</h1><Link className="text-action" href="/report">Report<ArrowRight size={14}/></Link></div>
    {kind==="file"?<><button className="file-drop" disabled={busy||!draft} onClick={()=>file.current?.click()} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();if(!busy&&draft&&e.dataTransfer.files[0])void upload(e.dataTransfer.files[0])}}><Upload size={25}/><strong>{busy?"Analyzing…":"Choose a file"}</strong><span>or drop it here · up to 10 MB</span></button>
      <input className="hidden" ref={file} type="file" aria-label="Upload file for local analysis" onChange={e=>{if(e.target.files?.[0])void upload(e.target.files[0]);e.target.value=""}}/>
    </>:<form className="workflow-search" onSubmit={search}><Search size={20}/><input aria-label="Search" ref={input} value={query} onChange={e=>setQuery(e.target.value)} placeholder={type.placeholder} type={kind==="email"?"email":kind==="phone"?"tel":"text"} maxLength={253} required/><Button disabled={busy||running||!draft}>{busy?"Starting…":"Search"}<ArrowRight size={15}/></Button></form>}
    {error && <div role="alert" className="error">{error}</div>}
    <div className="section-heading"><h2>Results <span className="muted">{entries.length||""}</span></h2></div>
    <div className="entry-stack">{[...entries].reverse().map(e=><EntryPanel key={e.id} entry={e}/>)}</div>
    {!entries.length && <div className="workflow-empty"><FileSearch size={27}/><span>{draft?"No searches yet":"Loading…"}</span></div>}
  </div>;
}
