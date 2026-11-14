"use client";
import Link from "next/link";
import {AtSign,Mail,Phone,FileSearch,Globe,ArrowRight,FileText,Trash2,History} from "lucide-react";
import {useWorkflow} from "@/components/workflow";
const tools=[{path:"username",kind:"username",name:"Username",icon:AtSign},{path:"email",kind:"email",name:"Email",icon:Mail},{path:"number",kind:"phone",name:"Number",icon:Phone},{path:"files",kind:"file",name:"Files",icon:FileSearch},{path:"website",kind:"website",name:"Website",icon:Globe}];
export default function Dashboard(){
 const {draft,history,deleteReport}=useWorkflow();const entries=draft?.entries||[];const included=entries.filter(e=>e.included);
 return <div className="workflow-page dashboard-page">
  <div className="page-heading"><div><h1>Dashboard</h1><p className="dashboard-hero">Free OSINT.</p></div><span className="workspace-mark">TRACELET</span></div>
  <Link href="/report" className="dashboard-report"><span className="dashboard-report-icon"><FileText size={24}/></span><div><span className="entry-kind">CURRENT REPORT</span><h2>{draft?.title||"Untitled report"}</h2><p>{included.length} searches<span>·</span>{included.reduce((n,e)=>n+e.job.findings.length,0)} findings</p></div><span className="open-report">Open report <ArrowRight size={17}/></span></Link>
  <div className="section-heading"><h2>Investigate</h2></div>
  <div className="tool-grid">{tools.map(t=><Link key={t.path} href={"/"+t.path} className="tool-tile"><t.icon size={23}/><strong>{t.name}</strong><span>{entries.filter(e=>e.job.kind===t.kind).length} searches</span><ArrowRight size={15}/></Link>)}</div>
  <div className="section-heading"><h2>History <span className="muted">{history.length||""}</span></h2></div>
  {history.length?<div className="report-history">{history.map(r=><div className="report-history-row" key={r.id}><Link href={"/report?archive="+r.id}><span className="history-icon"><FileText size={18}/></span><span><strong>{r.title||"Untitled report"}</strong><small>{r.count} searches · {new Date(r.updated).toLocaleDateString()}</small></span><ArrowRight size={15}/></Link><button className="icon-button" aria-label={"Delete saved report "+r.title} onClick={()=>{if(window.confirm("Delete this saved report?"))void deleteReport(r.id)}}><Trash2 size={14}/></button></div>)}</div>:<div className="workflow-empty small"><History size={25}/><span>No saved reports</span></div>}
 </div>;
}
