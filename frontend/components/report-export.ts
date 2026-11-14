import type {Report} from "./workflow";
export function reportText(report:Report) {
  const lines=[report.title||"Untitled report","Tracelet report",`Created: ${report.created}`,`Updated: ${report.updated}`,""];
  for(const [index,entry] of report.entries.filter(e=>e.included).entries()) {
    const job=entry.job;
    lines.push(`${index+1}. ${job.kind.toUpperCase()} — ${job.query}`,`Status: ${job.status}`,"");
    for(const finding of job.findings) lines.push(finding.title,`Source: ${finding.source}`,`Confidence: ${finding.confidence}`,`Observed: ${finding.observed_at}`,
      ...(finding.evidence?[`Evidence: ${finding.evidence}`]:[]),typeof finding.value==="string"?finding.value:JSON.stringify(finding.value,null,2),"");
    if(!job.findings.length)lines.push("No findings.","");
    for(const note of job.notes)lines.push(note);
    for(const item of job.unavailable)lines.push(`${item.name}: ${item.reason}`);
    for(const item of job.errors)lines.push(`${item.source}: ${item.message}`);
    if(job.checks)for(const check of job.checks)lines.push(`${check.platform}: ${check.status}${check.reason?" — "+check.reason:""}`);
    lines.push("","—".repeat(48),"");
  }
  return lines.join("\n");
}
function save(blob:Blob,name:string) {
  const url=URL.createObjectURL(blob);const link=document.createElement("a");link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
const filename=(r:Report)=>(r.title||"tracelet-report").replace(/[^a-z0-9_-]+/gi,"-").slice(0,80)||"tracelet-report";
export function exportText(report:Report){save(new Blob([reportText(report)],{type:"text/plain;charset=utf-8"}),filename(report)+".txt")}
export async function exportPdf(report:Report) {
  const [{createReportPdf},regular,bold]=await Promise.all([
    import("./report-pdf"),fetch("/fonts/report.ttf"),fetch("/fonts/report-bold.ttf"),
  ]);
  if(!regular.ok||!bold.ok)throw new Error("Report fonts could not load");
  const bytes=await createReportPdf(report,{regular:new Uint8Array(await regular.arrayBuffer()),bold:new Uint8Array(await bold.arrayBuffer())});
  save(new Blob([new Uint8Array(bytes)],{type:"application/pdf"}),filename(report)+".pdf");
}
