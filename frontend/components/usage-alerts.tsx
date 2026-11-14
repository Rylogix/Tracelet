"use client";
import {useEffect,useState} from "react";
import {api} from "./api";
export function UsageAlerts() {
  const [busy,setBusy]=useState(true);
  const [thresholds,setThresholds]=useState<number[]>([50,80,90,100]);const [error,setError]=useState("");
  useEffect(()=>{api<{thresholds:number[]}>("/usage/alerts").then(v=>setThresholds(v.thresholds)).catch(()=>setError("Alerts unavailable")).finally(()=>setBusy(false))},[]);
  return <details className="panel mt-8"><summary>Usage alerts</summary><div className="actions mt-4">{[50,80,90,100].map(n=><label className="check" key={n}><input type="checkbox" disabled={busy} checked={thresholds.includes(n)} onChange={async e=>{
    setBusy(true);
    const next=e.target.checked?[...thresholds,n]:thresholds.filter(t=>t!==n);
    try{await api("/usage/alerts",{method:"PUT",body:JSON.stringify({thresholds:next})});setThresholds(next);setError("")}catch{setError("Alerts could not be saved")}finally{setBusy(false)}
  }}/>{n}%</label>)}</div>{error&&<p role="alert" className="error">{error}</p>}</details>;
}
