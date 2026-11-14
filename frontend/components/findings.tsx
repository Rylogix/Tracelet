"use client";
import {useId,useState,type CSSProperties} from "react";
import {
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  FileCode2,
  Link2,
  ChevronDown,
} from "lucide-react";
import type { Finding } from "./api";
const label = (key: string) =>
  key.replace(/[_-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
function text(value: unknown, key = ""): string {
  if (value === null || value === undefined) return "Not provided";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (key === "type" && typeof value === "string")
    return value
      .toLowerCase()
      .replaceAll("_", " ")
      .replace(/^./, (c) => c.toUpperCase());
  if (
    key === "country" &&
    typeof value === "string" &&
    /^[A-Z]{2}$/.test(value)
  ) {
    try {
      return (
        new Intl.DisplayNames(["en"], { type: "region" }).of(value) || value
      );
    } catch {
      return value;
    }
  }
  return String(value);
}
function Scalar({value,name=""}:{value:unknown;name?:string}) {
  const content=text(value,name);
  if(typeof value==="string" && /^https?:\/\/[^\s]+$/i.test(value))return <a className="finding-link" href={value} target="_blank" rel="noreferrer">{content}<ArrowUpRight size={11}/></a>;
  return <span className="finding-text">{content}</span>;
}
function Value({value,depth=0}:{value:unknown;depth?:number}) {
  if(value===null || typeof value!=="object")return <Scalar value={value}/>;
  if(depth>4)return <pre className="nested-json">{JSON.stringify(value,null,2)}</pre>;
  if(Array.isArray(value)){
    if(!value.length)return <span className="muted">No records returned</span>;
    const primitive=value.every(v=>typeof v!=="object"||v===null);
    const render=(items:unknown[],offset=0)=>primitive?<ul className="finding-list">{items.map((v,i)=><li key={i+offset}><Scalar value={v}/></li>)}</ul>:<div className="nested-records">{items.map((v,i)=><div className="nested-record" key={i+offset}><Value value={v} depth={depth+1}/></div>)}</div>;
    return <>{render(value.slice(0,10))}{value.length>10&&<details className="additional-values"><summary>View {value.length-10} more records</summary>{render(value.slice(10),10)}</details>}</>;
  }
  const entries=Object.entries(value as Record<string,unknown>).filter(([k,v])=>k!=="note"&&v!==null&&v!==undefined);
  if(!entries.length)return <span className="muted">No additional properties returned</span>;
  return <dl className="finding-properties">{entries.map(([key,v])=><div key={key} className={typeof v==="object"&&v!==null || ["bio","description","website","note"].includes(key) || typeof v==="string"&&v.length>65?"property-wide":""}><dt>{label(key)}</dt><dd>{typeof v==="object"&&v!==null?<Value value={v} depth={depth+1}/>:<Scalar value={v} name={key}/>}</dd></div>)}</dl>;
}
function FindingPill({item,index,username}:{item:Finding;index:number;username:boolean}) {
  const [open,setOpen]=useState(false);const id=useId();
  const name=username?item.source.replace(/^Sherlock · /,""):item.title;
  const link=username && item.evidence && /^https?:\/\//i.test(item.evidence)?item.evidence:undefined;
  return <article className="finding-card finding-pill" data-open={open} style={{"--arrival-delay":Math.min(index,5)*25+"ms"} as CSSProperties}>
    <div className="finding-pill-header">
      {link && <a className="finding-platform-link" href={link} target="_blank" rel="noopener noreferrer" aria-label={"Open "+name+" profile"}>{name}<ArrowUpRight size={13}/></a>}
      <button type="button" className="finding-pill-toggle" aria-expanded={open} aria-controls={id} aria-label={(open?"Collapse ":"Expand ")+name+" details"} onClick={()=>setOpen(!open)}>
        {!link && <span className="finding-pill-name">{name}</span>}
        <span className="finding-pill-secondary">{username?item.title:item.source}</span><ChevronDown size={17} className="finding-chevron"/>
      </button>
    </div>
    <div className="finding-pill-body" id={id} hidden={!open}>{open && <>
      <div className="finding-source"><span><Link2 size={13}/>{item.source}</span><span className={"confidence confidence-"+item.confidence} title="Confidence in an observation does not establish anyone’s identity."><i/>{item.confidence==="low"?"Possible match":label(item.confidence)+" confidence"}</span></div>
      {username && <h3>{item.title}</h3>}
      <div className="finding-content"><Value value={item.value}/></div>
      <details className="source-data"><summary><FileCode2 size={13}/>View source data</summary><pre>{typeof item.value==="string"?item.value:JSON.stringify(item.value,null,2)}</pre></details>
      <div className="finding-footer">{item.evidence&&/^https?:\/\//.test(item.evidence)?<a href={item.evidence} target="_blank" rel="noreferrer">View source<ArrowUpRight size={13}/></a>:<span><CheckCircle2 size={13}/>Analyzed directly</span>}<time dateTime={item.observed_at}><Clock3 size={11}/>{new Date(item.observed_at).toLocaleString(undefined,{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"})}</time></div>
    </>}</div>
  </article>;
}
export function Findings({items,username=false}:{items:Finding[];username?:boolean}) {
  return <div className="results finding-pill-list"><span className="sr-only" aria-live="polite">{items.length} findings</span>{items.map((item,index)=><FindingPill key={[item.source,item.title,item.evidence,item.observed_at].join("|")} item={item} index={index} username={username}/>)}</div>;
}
