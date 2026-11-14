"use client";
import {useEffect,useState} from "react";
import {useSearchParams} from "next/navigation";
import Link from "next/link";
import {FileText,Download,Copy,Check,ArrowLeft,Archive} from "lucide-react";
import {useWorkflow,type Report} from "./workflow";
import {EntryPanel} from "./search-panel";
import {Button} from "./ui/button";
import {api} from "./api";
import {reportText,exportText,exportPdf} from "./report-export";
export function ReportEditor() {
  const {draft,title,finish}=useWorkflow();const archive=useSearchParams().get("archive");
  const [saved,setSaved]=useState<Report|null>(null);const [error,setError]=useState("");const [busy,setBusy]=useState(false);const [copied,setCopied]=useState(false);const [paste,setPaste]=useState("");const [finished,setFinished]=useState(false);
  useEffect(()=>{setSaved(null);setError("");if(archive)api<Report>("/reports/"+archive).then(setSaved).catch(e=>setError(e.message))},[archive]);
  const report=archive?saved:draft;const entries=report?.entries.filter(e=>e.included)||[];
  const running=report?.entries.some(e=>["queued","running"].includes(e.job.status));
  async function pdf(){if(!report)return;setBusy(true);setError("");try{await exportPdf(report)}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
  async function copy(){if(!report)return;const text=reportText(report);try{await navigator.clipboard.writeText(text);setCopied(true);setTimeout(()=>setCopied(false),2000)}catch{setPaste(text)}}
  return <div className="workflow-page report-page">
    <div className="page-heading"><h1>Report</h1>{archive && <Link className="text-action" href="/report"><ArrowLeft size={14}/>Current report</Link>}</div>
    {error && <div className="error" role="alert">{error}</div>}
    {report && <>
      <div className="report-toolbar">
        <div className="report-title-wrap">{archive?<h2>{report.title}</h2>:<input className="report-title" aria-label="Report title" value={report.title} onChange={e=>{title(e.target.value);setFinished(false)}} maxLength={120}/>}<span className="muted">{entries.length} searches · {entries.reduce((n,e)=>n+e.job.findings.length,0)} findings{archive?" · Saved":""}</span></div>
        <div className="actions"><Button variant="outline" size="sm" disabled={!entries.length||busy} onClick={pdf}><Download size={14}/>{busy?"Exporting…":"PDF"}</Button><Button variant="outline" size="sm" disabled={!entries.length} onClick={()=>exportText(report)}>TXT</Button><Button variant="outline" size="sm" disabled={!entries.length} onClick={copy}>{copied?<Check size={14}/>:<Copy size={14}/>} {copied?"Copied":"Copy"}</Button></div>
      </div>
      {paste && <textarea aria-label="Report text to copy" className="paste-report" readOnly value={paste} onFocus={e=>e.target.select()}/>}
      <div className="entry-stack">{entries.map(e=><EntryPanel key={e.id} entry={e} report readOnly={!!archive}/>)}</div>
      {!entries.length && <div className="workflow-empty"><FileText size={28}/><strong>{finished?"Saved to history":"Your report is empty"}</strong><Link className="text-action" href="/username">Start a search</Link></div>}
      {!archive && entries.length>0 && <div className="report-finish"><Button disabled={busy||running} onClick={async()=>{setBusy(true);setError("");try{await finish();setFinished(true)}catch(e){setError((e as Error).message)}finally{setBusy(false)}}}><Archive size={15}/>Save to history & clear</Button></div>}
    </>}
    {!report && !error && <div className="workflow-empty">Loading…</div>}
  </div>;
}
