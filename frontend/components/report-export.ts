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
  const [{PDFDocument,rgb},{default:fontkit}]=await Promise.all([import("pdf-lib"),import("@pdf-lib/fontkit")]);
  const response=await fetch("/fonts/report.ttf");if(!response.ok)throw new Error("Report font could not load");
  const pdf=await PDFDocument.create();pdf.registerFontkit(fontkit);
  const font=await pdf.embedFont(await response.arrayBuffer(),{subset:true});
  const original=reportText(report);const charset=new Set(font.getCharacterSet());
  // Preserve unsupported glyphs visibly as code points; the attached UTF-8 text
  // always retains every original character and all nested evidence values.
  const printable=Array.from(original).map(c=>c==="\n"||charset.has(c.codePointAt(0)!)?c:c==="\t"?"    ":`[U+${c.codePointAt(0)!.toString(16).toUpperCase()}]`).join("");
  let page=pdf.addPage([595.28,841.89]);let y=790;const size=10;const width=495;
  const draw=(line:string)=>{
    if(y<55){page=pdf.addPage([595.28,841.89]);y=790}
    page.drawText(line,{x:50,y,size,font,color:rgb(.12,.12,.12)});y-=15;
  };
  for(const line of printable.split("\n")) {
    if(!line){draw("");continue}
    let part="";
    for(const character of line){if(font.widthOfTextAtSize(part+character,size)>width){draw(part);part=""}part+=character}
    draw(part);
  }
  const pages=pdf.getPages();pages.forEach((p,i)=>p.drawText(`Tracelet  |  ${i+1} / ${pages.length}`,{x:50,y:28,size:8,font,color:rgb(.5,.5,.5)}));
  pdf.setTitle(report.title||"Tracelet report");pdf.setCreator("Tracelet");
  await pdf.attach(new TextEncoder().encode(original),"report.txt",{mimeType:"text/plain",description:"Complete original report in UTF-8"});
  const bytes=await pdf.save();save(new Blob([new Uint8Array(bytes)],{type:"application/pdf"}),filename(report)+".pdf");
}
