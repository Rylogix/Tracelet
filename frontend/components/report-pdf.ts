import {PDFDocument, PDFName, PDFString, rgb, type PDFFont, type PDFPage} from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import type {Report, Entry} from "./workflow";
import {reportText} from "./report-export";

const W=595.28, H=841.89, M=44, CW=W-M*2, BOTTOM=64;
const ink=rgb(.12,.12,.13), muted=rgb(.40,.41,.43), rule=rgb(.85,.86,.87);
const wash=rgb(.96,.965,.97), white=rgb(1,1,1), coal=rgb(.095,.095,.10);
const labels:Record<string,string>={username:"Username",email:"Email",phone:"Number",file:"Files",website:"Website"};
const quantity=(n:number,noun:string)=>`${n} ${noun}${n===1?"":noun.endsWith("search")?"es":"s"}`;
const label=(s:string)=>s.replace(/[_-]/g," ").replace(/\b\w/g,c=>c.toUpperCase());
type Row={key:string;value:string};
type Source={id:number;name:string;url:string};
type Options={regular:Uint8Array;bold:Uint8Array;timeZone?:string;generated?:Date};

/** Flatten structured evidence into readable, lossless labeled rows. */
export function evidenceRows(value:unknown,path=""):Row[] {
  if(value===undefined)return [];
  if(value===null)return [{key:path||"Observation",value:"Not provided"}];
  if(Array.isArray(value)) {
    if(!value.length)return [{key:path||"Records",value:"No records returned"}];
    return value.flatMap((v,i)=>evidenceRows(v,path?`${path} / ${i+1}`:`Record ${i+1}`));
  }
  if(typeof value==="object") {
    const entries=Object.entries(value as Record<string,unknown>);
    if(!entries.length)return [{key:path||"Properties",value:"No properties returned"}];
    return entries.flatMap(([k,v])=>evidenceRows(v,path?path+" / "+label(k):label(k)));
  }
  return [{key:path||"Observation",value:typeof value==="boolean"?(value?"Yes":"No"):String(value)}];
}

export async function createReportPdf(report:Report,options:Options):Promise<Uint8Array> {
  const pdf=await PDFDocument.create();pdf.registerFontkit(fontkit);
  const regular=await pdf.embedFont(options.regular,{subset:true});
  const bold=await pdf.embedFont(options.bold,{subset:true});
  const generated=options.generated||new Date();
  const zone=options.timeZone||Intl.DateTimeFormat().resolvedOptions().timeZone;
  const date=(value:string|Date)=>{
    const d=new Date(value);
    return Number.isFinite(d.getTime())?new Intl.DateTimeFormat("en-US",{dateStyle:"medium",timeStyle:"short",timeZone:zone}).format(d):String(value);
  };
  const entries=report.entries.filter(e=>e.included);
  const count=entries.reduce((n,e)=>n+e.job.findings.length,0);
  const sources:Source[]=[];
  for(const entry of entries)for(const f of entry.job.findings) {
    if(f.evidence&&/^https?:\/\//i.test(f.evidence)&&!sources.some(s=>s.url===f.evidence))sources.push({id:sources.length+1,name:f.source,url:f.evidence});
  }
  const sourceCount=new Set(entries.flatMap(e=>e.job.findings.map(f=>f.source))).size;
  const chars=new Map<PDFFont,Set<number>>([[regular,new Set(regular.getCharacterSet())],[bold,new Set(bold.getCharacterSet())]]);
  const safe=(value:string,font=regular)=>Array.from(value.replace(/\t/g,"    ")).map(c=>chars.get(font)!.has(c.codePointAt(0)!)?c:`[U+${c.codePointAt(0)!.toString(16).toUpperCase()}]`).join("");
  function wrap(value:string,width:number,size=9.5,font=regular):string[] {
    const lines:string[]=[];
    for(const paragraph of value.replace(/\r\n?/g,"\n").split("\n")) {
      let line="";
      for(const word of paragraph.split(/(\s+)/)) {
        const candidate=line+word;
        if(font.widthOfTextAtSize(safe(candidate,font),size)<=width){line=candidate;continue}
        if(line.trim()){lines.push(line.trimEnd());line=""}
        if(font.widthOfTextAtSize(safe(word,font),size)<=width){line=word.trimStart();continue}
        for(const c of word){if(font.widthOfTextAtSize(safe(line+c,font),size)>width){lines.push(line);line=""}line+=c}
      }
      lines.push(line.trimEnd());
    }
    return lines.length?lines:[""];
  }
  function text(page:PDFPage,value:string,x:number,y:number,size=9.5,font=regular,color=ink) {
    page.drawText(safe(value,font),{x,y,size,font,color});
  }
  function line(page:PDFPage,y:number,x=M,width=CW,color=rule) {
    page.drawLine({start:{x,y},end:{x:x+width,y},thickness:.6,color});
  }
  function mark(page:PDFPage,x:number,y:number,color=ink) {
    const points=Array.from({length:6},(_,i)=>({x:x+10*Math.cos(Math.PI/3*i+Math.PI/6),y:y+10*Math.sin(Math.PI/3*i+Math.PI/6)}));
    points.forEach((p,i)=>page.drawLine({start:p,end:points[(i+1)%6],thickness:.7,color}));
    text(page,"T",x-3.6,y-4,10,bold,color);
  }
  function short(value:string,width:number,size:number,font=regular) {
    let result=value.replace(/\s+/g," ");
    if(font.widthOfTextAtSize(safe(result,font),size)<=width)return result;
    while(result&&font.widthOfTextAtSize(safe(result+"…",font),size)>width)result=result.slice(0,-1);
    return result+"…";
  }
  function link(page:PDFPage,url:string,x:number,y:number,width:number,height:number) {
    try {
      const parsed=new URL(url);if(!["http:","https:"].includes(parsed.protocol))return;
      const annotation=pdf.context.obj({Type:"Annot",Subtype:"Link",Rect:[x,y,x+width,y+height],Border:[0,0,0],A:{Type:"Action",S:"URI",URI:PDFString.of(parsed.href)}});
      page.node.addAnnot(pdf.context.register(annotation));
    }catch{/* Non-URL observations remain plain text. */}
  }
  const cover=pdf.addPage([W,H]);
  cover.drawRectangle({x:0,y:0,width:W,height:H,color:coal});
  mark(cover,M+10,H-58,white);text(cover,"tracelet.",M+31,H-64,20,bold,white);
  text(cover,"REPORT / "+report.id.slice(0,8).toUpperCase(),W-M-135,H-59,8,regular,rgb(.65,.65,.67));
  line(cover,H-100,M,CW,rgb(.28,.28,.29));
  text(cover,"INVESTIGATION REPORT",M,690,9,bold,rgb(.65,.65,.67));
  let titleSize=32;
  while(titleSize>8&&wrap(report.title||"Untitled report",CW,titleSize,bold).length*titleSize*1.25>145)titleSize--;
  wrap(report.title||"Untitled report",CW,titleSize,bold).forEach((v,i)=>text(cover,v,M,646-i*titleSize*1.25,titleSize,bold,white));
  text(cover,"Created  "+date(report.created),M,465,9,regular,rgb(.7,.7,.72));
  text(cover,"Updated  "+date(report.updated),M,447,9,regular,rgb(.7,.7,.72));
  const metrics=[[String(entries.length),"SEARCHES"],[String(count),"FINDINGS"],[String(sourceCount),"SOURCES"]];
  metrics.forEach(([value,name],i)=>{
    const x=M+i*(CW+12)/3;
    cover.drawRectangle({x,y:337,width:(CW-24)/3,height:78,color:rgb(.14,.14,.15),borderColor:rgb(.25,.25,.26),borderWidth:.5});
    text(cover,value,x+17,377,24,bold,white);text(cover,name,x+17,353,8,regular,rgb(.67,.67,.69));
  });
  text(cover,"REPORT COVERAGE",M,295,8,bold,rgb(.6,.6,.63));
  Object.entries(labels).forEach(([kind,name],i)=>{
    const set=entries.filter(e=>e.job.kind===kind);const y=265-i*26;
    text(cover,name,M,y,10,regular,white);
    text(cover,quantity(set.length,"search"),M+235,y,9,regular,rgb(.7,.7,.72));
    text(cover,quantity(set.reduce((n,e)=>n+e.job.findings.length,0),"finding"),W-M-90,y,9,regular,rgb(.7,.7,.72));
    line(cover,y-10,M,CW,rgb(.22,.22,.23));
  });
  text(cover,"Public-source observations. Matching handles do not establish shared identity.",M,79,8,regular,rgb(.65,.65,.68));
  text(cover,"Generated "+date(generated)+"  ·  "+zone,M,61,8,regular,rgb(.55,.55,.58));

  let page:PDFPage, y=0, context="";
  const bodyPage=()=>{
    page=pdf.addPage([W,H]);mark(page,M+8,H-42);text(page,"tracelet.",M+26,H-47,13,bold);
    text(page,short(report.title||"Untitled report",285,8),W-M-285,H-44,8,regular,muted);
    line(page,H-63);y=H-93;
    if(context){text(page,short(context,CW,8),M,y,8,bold,muted);y-=25}
    return page;
  };
  const need=(height:number)=>{if(y-height<BOTTOM)bodyPage()};
  function heading(value:string) {need(50);text(page,value,M,y,16,bold);y-=31}
  function paragraph(value:string,size=9.5,color=muted) {
    for(const part of wrap(value,CW,size)){need(16);text(page,part,M,y,size,regular,color);y-=15}y-=8;
  }
  function row(key:string,value:string,index:number) {
    const left=wrap(key,139,8.5,bold),right=wrap(value,CW-172,9.5);
    let offset=0;const total=Math.max(left.length,right.length);
    while(offset<total) {
      need(42);
      const amount=Math.min(total-offset,Math.max(1,Math.floor((y-BOTTOM-17)/14)));
      const height=amount*14+16;
      if(index%2===0)page.drawRectangle({x:M,y:y-height+10,width:CW,height,color:wash});
      for(let i=0;i<amount;i++) {
        if(left[offset+i])text(page,left[offset+i],M+11,y-6-i*14,8.5,bold,muted);
        else if(offset>0&&i===0)text(page,"(continued)",M+11,y-6,8,regular,muted);
        if(right[offset+i])text(page,right[offset+i],M+166,y-6-i*14,9.5);
      }
      if(/^https?:\/\/[^\s]+$/i.test(value))link(page,value,M+164,y-height+10,CW-166,height);
      y-=height;offset+=amount;
      if(offset<total)bodyPage();
    }
  }
  // Reserve index pages first, so page numbers and internal links stay accurate.
  type IndexRow={entry:Entry;number:number;page:PDFPage;top:number;height:number};
  const index:IndexRow[]=[];
  context="REPORT OVERVIEW";bodyPage();heading("Search index");
  paragraph(`${quantity(entries.length,"included search")} · ${quantity(count,"finding")} · ${quantity(sourceCount,"source")}. Times are shown in ${zone}.`);
  const indexQuery=(entry:Entry)=>{
    const parts=wrap(entry.job.query,285,10,bold);
    return parts.length>3?[parts[0],parts[1],short(parts[2]+"…",285,10,bold)]:parts;
  };
  entries.forEach((entry,i)=>{
    const height=Math.max(48,indexQuery(entry).length*14+23);
    need(height+5);index.push({entry,number:i+1,page,top:y,height});y-=height+5;
  });
  if(!entries.length)paragraph("No included searches.");

  entries.forEach((entry,indexNumber)=>{
    const job=entry.job;const section=`${String(indexNumber+1).padStart(2,"0")} / ${labels[job.kind]||label(job.kind)} · ${job.query}`;
    context=section;const start=bodyPage();
    const record=index[indexNumber];
    record.page.drawRectangle({x:M,y:record.top-record.height+10,width:CW,height:record.height,color:indexNumber%2===0?wash:white});
    text(record.page,String(indexNumber+1).padStart(2,"0"),M+12,record.top-8,10,bold,muted);
    indexQuery(entry).forEach((part,i)=>text(record.page,part,M+48,record.top-7-i*14,10,bold));
    text(record.page,labels[job.kind]||job.kind,M+48,record.top-record.height+20,8,regular,muted);
    text(record.page,quantity(job.findings.length,"finding"),M+350,record.top-9,8.5,regular,muted);
    const pageNumber=pdf.getPages().indexOf(start)+1;
    text(record.page,String(pageNumber).padStart(2,"0"),W-M-27,record.top-9,10,bold);
    record.page.node.addAnnot(pdf.context.register(pdf.context.obj({Type:"Annot",Subtype:"Link",Rect:[M,record.top-record.height+10,W-M,record.top+10],Border:[0,0,0],Dest:[start.ref,PDFName.of("XYZ"),0,H,null]})));
    text(page,(labels[job.kind]||job.kind).toUpperCase(),M,y,9,bold,muted);y-=29;
    for(const part of wrap(job.query,CW,23,bold)){need(31);text(page,part,M,y,23,bold);y-=31}
    text(page,`${quantity(job.findings.length,"finding")}  /  ${label(job.status)}`,M,y-3,9,regular,muted);y-=28;line(page,y);y-=27;
    if(!job.findings.length)paragraph("No findings returned. This does not establish absence elsewhere.");
    job.findings.forEach((finding,findingIndex)=>{
      need(125);
      page.drawRectangle({x:M,y:y-5,width:CW,height:25,color:coal});
      text(page,`${indexNumber+1}.${findingIndex+1}  /  ${finding.source}`,M+10,y+3,8.5,bold,white);y-=28;
      for(const part of wrap(finding.title,CW,13,bold)){need(20);text(page,part,M,y,13,bold);y-=19}
      const confidence=finding.confidence==="low"?"Possible match":label(finding.confidence)+" confidence";
      paragraph(`${confidence}  ·  Observed ${date(finding.observed_at)}`,8.5);
      const source=sources.find(s=>s.url===finding.evidence);
      if(source){
        need(42);text(page,"EVIDENCE / S"+String(source.id).padStart(2,"0"),M,y,7.5,bold,muted);y-=15;
        for(const part of wrap(source.url,CW,8.5)){need(15);text(page,part,M,y,8.5);link(page,source.url,M,y-3,CW,14);y-=14}y-=9;
      }
      evidenceRows(finding.value).forEach((r,i)=>row(r.key,r.value,i));y-=24;
    });
    const notes=[...job.notes,...job.unavailable.map(m=>m.name+": "+m.reason),...job.errors.map(m=>m.source+": "+m.message)];
    if(notes.length){heading("Notes & availability");notes.forEach((n,i)=>row(String(i+1).padStart(2,"0"),n,i));y-=22}
    if(job.checks?.length){heading("Source checks");job.checks.forEach((check,i)=>row(check.platform,(check.status==="found"?"Possible match":label(check.status))+(check.reason?" · "+check.reason:""),i))}
  });
  if(sources.length){
    context="EVIDENCE REGISTER";bodyPage();heading("Source index");
    paragraph(`${quantity(sources.length,"unique evidence link")} referenced in this report. Each link opens its original public source.`);
    sources.forEach((source,i)=>row("S"+String(source.id).padStart(2,"0")+" / "+source.name,source.url,i));
  }
  const pages=pdf.getPages();
  pages.forEach((p,i)=>{
    if(i===0)return;
    line(p,43);text(p,"TRACELET / PUBLIC-SOURCE REPORT",M,28,7,regular,muted);
    text(p,`${String(i+1).padStart(2,"0")} / ${String(pages.length).padStart(2,"0")}`,W-M-38,28,8,bold,muted);
  });
  pdf.setTitle(report.title||"Tracelet report");pdf.setCreator("Tracelet");pdf.setAuthor("Tracelet");pdf.setSubject("Public-source investigation report");pdf.setCreationDate(generated);
  pdf.catalog.set(PDFName.of("Lang"),PDFString.of("en-US"));
  await pdf.attach(new TextEncoder().encode(reportText(report)),"report.txt",{mimeType:"text/plain",description:"Complete original report data in UTF-8"});
  return pdf.save();
}
