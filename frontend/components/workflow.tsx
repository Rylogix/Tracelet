"use client";
import {createContext, useContext, useEffect, useRef, useState, type ReactNode} from "react";
import {api, ApiError, type Job} from "./api";
export type Entry = {id:string; included:boolean; job:Job};
export type Report = {id:string;title:string;entries:Entry[];created:string;updated:string;revision:number;archived?:boolean};
export type SavedReport = {id:string;title:string;created:string;updated:string;count:number};
type Workflow = {
  draft:Report|null; history:SavedReport[]; historyLoaded:boolean; error:string; saving:boolean;
  add:(job:Job)=>void; include:(id:string,included:boolean)=>void;
  title:(title:string)=>void; cancel:(id:string)=>Promise<void>;
  finish:()=>Promise<void>; retry:()=>void; deleteReport:(id:string)=>Promise<void>;
};
const Context=createContext<Workflow>(null!);
export const useWorkflow=()=>useContext(Context);
export function WorkflowProvider({children}:{children:ReactNode}) {
  const [draft,setDraft]=useState<Report|null>(null);
  const [history,setHistory]=useState<SavedReport[]>([]);
  const [historyLoaded,setHistoryLoaded]=useState(false);
  const [error,setError]=useState("");const [saving,setSaving]=useState(false);
  const current=useRef<Report|null>(null);const revision=useRef(0);
  const queue=useRef<Promise<unknown>>(Promise.resolve());const mounted=useRef(true);
  const loadHistory=()=>api<SavedReport[]>("/reports").then(v=>{if(mounted.current){setHistory(v);setHistoryLoaded(true)}});
  async function load() {
    try {const value=await api<Report>("/workspace");if(!mounted.current)return;
      current.current=value;revision.current=value.revision;setDraft(value);setError("");await loadHistory();
    } catch(e){if(mounted.current)setError((e as Error).message)}
  }
  useEffect(()=>{mounted.current=true;void load();return()=>{mounted.current=false}},[]);
  function commit(next:Report) {
    next={...next,updated:new Date().toISOString()};
    current.current=next;setDraft(next);setSaving(true);
    queue.current=queue.current.catch(()=>{}).then(async()=>{
      if(!mounted.current)return;
      const saved=await api<Report>("/workspace",{method:"PUT",body:JSON.stringify({...next,revision:revision.current})});
      revision.current=saved.revision;
      if(mounted.current && current.current===next){setSaving(false);setError("")}
    }).catch(e=>{if(mounted.current){setSaving(false);setError((e as Error).message)}throw e});
    // Keep failed saves visible, without an unhandled promise rejection.
    void queue.current.catch(()=>{});
  }
  function patch(update:(value:Report)=>Report) {if(current.current)commit(update(current.current))}
  function add(job:Job) {
    if(!current.current)throw new Error("Workspace is still loading");
    const entries = current.current.entries;
    const oldestUnselected = entries.length >= 100
      ? entries.findIndex(entry => !entry.included && !["queued", "running"].includes(entry.job.status))
      : -1;
    if (entries.length >= 100 && oldestUnselected < 0)
      throw new Error("Save this report before starting more searches.");
    const retained = entries.filter((_, index) => index !== oldestUnselected);
    patch(value => ({ ...value, entries: [
      ...retained, { id: crypto.randomUUID(), included: false, job },
    ] }));
  }
  useEffect(()=>{
    let polling=false;
    const timer=setInterval(async()=>{
      if(polling || !current.current)return;
      const active=[...new Set(current.current.entries.filter(e=>["queued","running"].includes(e.job.status)).map(e=>e.job.id))];
      if(!active.length)return;polling=true;
      try {
        const outcomes=await Promise.allSettled(active.map(async id=>{
          try{return await api<Job>("/search/"+id)}catch(error){
            if(error instanceof ApiError && error.status===404){
              const old=current.current?.entries.find(e=>e.job.id===id)?.job;
              if(!old)return null;
              return {...old,status:"interrupted",notes:[...old.notes,"Search expired. Run it again to continue."]};
            }
            throw error;
          }
        }));
        const jobs=outcomes.flatMap(o=>o.status==="fulfilled" && o.value ? [o.value] : []);
        const failure=outcomes.find(o=>o.status==="rejected");
        if(failure?.status==="rejected")setError(failure.reason.message);
        if(!mounted.current)return;
        if(jobs.some(j=>JSON.stringify(j)!==JSON.stringify(current.current?.entries.find(e=>e.job.id===j.id)?.job)))patch(value=>({...value,entries:value.entries.map(e=>({...e,job:jobs.find(j=>j.id===e.job.id)||e.job}))}));
      } catch(e){if(mounted.current)setError((e as Error).message)}finally{polling=false}
    },1200);
    return()=>clearInterval(timer);
  },[]);
  async function cancel(id:string) {
    const job=await api<Job>("/search/"+id+"/cancel",{method:"POST"});
    patch(value=>({...value,entries:value.entries.map(e=>e.job.id===id?{...e,job}:e)}));
  }
  async function finish() {
    await queue.current;
    if(!current.current)return;
    await api("/reports/archive",{method:"POST",body:JSON.stringify({id:current.current.id,revision:revision.current})});
    await load();
  }
  return <Context.Provider value={{draft,history,historyLoaded,error,saving,add,
    include:(id,included)=>patch(value=>({...value,entries:value.entries.map(e=>e.id===id?{...e,included}:e)})),
    title:title=>patch(value=>({...value,title})),cancel,finish,
    retry:()=>current.current?commit(current.current):void load(),
    deleteReport:async id=>{await api("/reports/"+id,{method:"DELETE"});await loadHistory()},
  }}>{children}</Context.Provider>;
}
