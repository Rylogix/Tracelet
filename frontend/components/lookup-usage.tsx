"use client";
import {useEffect,useRef,useState} from "react";
import {ChevronDown,X} from "lucide-react";
import {api} from "./api";
import {Button} from "./ui/button";
import {usageState,type ProviderUsage} from "./usage-model";

export function LookupUsage({kind,running}:{kind:string;running:boolean}) {
  const [rows,setRows]=useState<ProviderUsage[]>([]);const [selected,setSelected]=useState<string|null>(null);
  const [error,setError]=useState("");const [message,setMessage]=useState("");const [busy,setBusy]=useState(false);
  const reload=useRef<()=>Promise<void>>(async()=>{});
  const relevant=["username","email","website"].includes(kind);
  useEffect(()=>{setSelected(null);setMessage("")},[kind]);
  useEffect(()=>{
    if(!relevant)return;
    let disposed=false,version=0;
    const load=async()=>{
      const currentVersion=++version;
      try {const result=await api<ProviderUsage[]>("/usage");if(!disposed&&currentVersion===version){setRows(result);setError("")}}
      catch {if(!disposed&&currentVersion===version)setError("Usage unavailable")}
    };
    reload.current=load;void load();
    const interval=setInterval(()=>{if(document.visibilityState==="visible")void load()},running?5000:30000);
    return()=>{disposed=true;clearInterval(interval)};
  },[kind,running,relevant]);
  if(!relevant)return null;
  const providers=rows.filter(r=>r.kinds?.includes(kind)&&(r.available||r.attempts>0));
  const known=providers.filter(r=>r.remaining!==null||r.quota_limit!==null||r.budget!==null||r.blocked_until>Date.now()/1000||r.alerts.length);
  const shown=providers.length<=4?providers:known;
  const others=providers.filter(r=>!shown.includes(r));
  const current=providers.find(r=>r.provider===selected);const state=current?usageState(current):null;
  const date=(v:string|null)=>v?new Date(v).toLocaleString():"Unknown";
  function badge(row:ProviderUsage) {
    const state=usageState(row);
    return <button key={row.provider} className={"lookup-usage-badge "+(state.warn?"usage-warn":"")} type="button" aria-label={row.name+" usage"} aria-expanded={selected===row.provider} aria-controls="lookup-usage-details" onClick={()=>{setSelected(selected===row.provider?null:row.provider);setMessage("")}}>
      <i/><span>{row.name}</span><span className="usage-value">{state.value}</span>
      {state.percentage!==null&&<span className="usage-mini-meter" role="meter" aria-label={row.name+" "+state.provenance} aria-valuenow={state.percentage} aria-valuemin={0} aria-valuemax={100}><span style={{width:state.percentage+"%"}}/></span>}
      <ChevronDown size={11}/>
    </button>;
  }
  return <section className="lookup-usage" aria-label="Lookup usage">
    <div className="lookup-usage-badges"><span className="usage-caption">Usage</span>{shown.map(badge)}
      {others.length>0&&<button type="button" className="lookup-usage-badge" aria-expanded={selected==="others"} aria-controls="lookup-usage-details" onClick={()=>setSelected(selected==="others"?null:"others")}><i/><span>{others.length} {shown.length?"other ":""}sources</span><span className="usage-value">Local tracking</span><ChevronDown size={11}/></button>}
      {error&&<button type="button" className="lookup-usage-badge" onClick={()=>reload.current()}>{error}</button>}
    </div>
    <div id="lookup-usage-details" hidden={!selected}>
      {selected==="others"&&<div className="usage-inline-panel"><div className="usage-panel-heading"><strong>Locally tracked sources</strong><button className="icon-button" aria-label="Close usage details" onClick={()=>setSelected(null)}><X size={14}/></button></div><p className="usage-provenance">Provider allowances are unknown.</p><div className="usage-source-list">{others.map(row=><button key={row.provider} type="button" onClick={()=>setSelected(row.provider)}><span>{row.name}</span><span>{row.attempts} local {row.unit||"requests"}</span><ChevronDown size={11}/></button>)}</div></div>}
      {current&&state&&<div className="usage-inline-panel" key={current.provider}><div className="usage-panel-heading"><strong>{current.name}</strong><span className={"badge "+(state.warn?"warn":"")}>{state.status}</span><button className="icon-button" aria-label="Close usage details" onClick={()=>setSelected(null)}><X size={14}/></button></div>
        <dl className="usage-inline-metrics"><div><dt>Allowance</dt><dd>{current.quota_limit??"Unknown"}</dd></div><div><dt>Remaining</dt><dd>{current.remaining??"Unknown"}{state.stale&&" (last reported)"}</dd></div><div><dt>Local {current.unit||"requests"}</dt><dd>{current.attempts}</dd></div><div><dt>Reset</dt><dd>{date(current.reset)}</dd></div></dl>
        {state.percentage!==null&&<div className="usage-detail-meter" role="meter" aria-label={state.provenance} aria-valuenow={state.percentage} aria-valuemin={0} aria-valuemax={100}><span style={{width:state.percentage+"%"}}/></div>}
        <p className="usage-provenance">{state.percentage!==null?`${Math.round(state.percentage)}% · ${state.provenance}. `:""}{current.source}. {current.safety_limit_per_minute}/minute local safety limit.</p>
        {current.alerts.length>0&&<p className="usage-provenance">Usage alerts: {current.alerts.join("%, ")}%.</p>}
        <details className="compact-details"><summary>Details</summary><p>{current.successes} successful · {current.failures} failed</p><p>Updated: {date(current.last_update)}<br/>Last success: {date(current.last_success)}</p>{current.blocked_until>Date.now()/1000&&<p>Retry after: {date(new Date(current.blocked_until*1000).toISOString())}</p>}</details>
        <form className="usage-budget-form" onSubmit={async e=>{
          e.preventDefault();setBusy(true);setMessage("");
          const input=String(new FormData(e.currentTarget).get("budget")||"");
          try {await api("/usage/"+current.provider+"/budget",{method:"PUT",body:JSON.stringify({requests:input===""?null:Number(input)})});await reload.current();setMessage("Budget saved")}
          catch(e){setMessage((e as Error).message)}finally{setBusy(false)}
        }}><input name="budget" type="number" min="0" max="1000000" placeholder="Personal request cap" aria-label={current.name+" local request budget"} defaultValue={current.budget??""}/><Button size="sm" variant="outline" disabled={busy}>Save budget</Button></form>
        {message&&<p className="usage-provenance" aria-live="polite">{message}</p>}
      </div>}
    </div>
  </section>;
}
