"use client";
import {useEffect,useRef,useState} from "react";
import {api} from "./api";
import {Button} from "./ui/button";
import {UsageAlerts} from "./usage-alerts";
import {usageState,type ProviderUsage} from "./usage-model";

export function SettingsUsage() {
  const [rows,setRows]=useState<ProviderUsage[]>([]);
  const [selected,setSelected]=useState("");
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");
  const [busy,setBusy]=useState(false);
  const [loading,setLoading]=useState(true);
  const reload=useRef<()=>Promise<void>>(async()=>{});
  useEffect(()=>{
    let disposed=false,version=0;
    const load=async()=>{
      const currentVersion=++version;
      try {const result=await api<ProviderUsage[]>("/usage");if(!disposed&&currentVersion===version){setRows(result);setError("")}}
      catch {if(!disposed&&currentVersion===version)setError("Usage unavailable")}
      finally {if(!disposed&&currentVersion===version)setLoading(false)}
    };
    reload.current=load;void load();
    const interval=setInterval(()=>{if(document.visibilityState==="visible")void load()},30000);
    return()=>{disposed=true;clearInterval(interval)};
  },[]);
  const providers=rows.filter(row=>row.available||row.attempts>0||row.budget!==null);
  const current=providers.find(row=>row.provider===selected);
  const state=current?usageState(current):null;
  const date=(value:string|null)=>value?new Date(value).toLocaleString():"Unknown";
  return <section className="panel mt-8" aria-labelledby="api-usage-heading">
    <h2 id="api-usage-heading">API usage</h2>
    {loading&&<p role="status">Loading usage…</p>}
    {error&&<p role="alert">{error} <button className="text-action" onClick={()=>reload.current()}>Retry</button></p>}
    {!loading&&!error&&!providers.length&&<p>No tracked sources.</p>}
    {providers.length>0&&<label className="usage-provider-label">Usage source
      <select value={selected} disabled={busy} onChange={e=>{setSelected(e.target.value);setMessage("")}}>
        <option value="">Choose a source</option>
        {providers.map(row=><option key={row.provider} value={row.provider}>{row.name}</option>)}
      </select>
    </label>}
    {current&&state&&<div className="usage-inline-panel" key={current.provider}>
        <div className="usage-panel-heading"><strong>{current.name}</strong><span className={"badge "+(state.warn?"warn":"")}>{state.status}</span><span>{state.value}</span></div>
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
    <UsageAlerts/>
  </section>;
}
