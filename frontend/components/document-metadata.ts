import {Unzip,UnzipInflate} from "fflate";
const known=new Set(["docProps/core.xml","docProps/app.xml","meta.xml"]);
function decode(value:string) {
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi,(_match,key:string)=>{
    const entities:Record<string,string>={amp:"&",lt:"<",gt:">",quot:'"',apos:"'"};
    if(entities[key])return entities[key];
    const code=key.startsWith("#x")?parseInt(key.slice(2),16):parseInt(key.slice(1),10);
    return Number.isFinite(code)&&code>0&&code<=0x10ffff?String.fromCodePoint(code):"";
  });
}
export function documentMetadata(bytes:Uint8Array) {
  const documents:Record<string,string>={};let limited=false;let files=0;
  const unzip=new Unzip(file=>{
    if(++files>10000)throw new Error("Archive contains too many entries");
    if(!known.has(file.name))return;
    if((file.originalSize||0)>262144){limited=true;return}
    const chunks:Uint8Array[]=[];let size=0;
    file.ondata=(error,data,final)=>{
      if(error){limited=true;file.terminate();return}
      size+=data.length;
      if(size>262144){limited=true;file.terminate();return}
      chunks.push(data);
      if(final){const all=new Uint8Array(size);let offset=0;for(const part of chunks){all.set(part,offset);offset+=part.length}documents[file.name]=new TextDecoder().decode(all)}
    };file.start();
  });
  unzip.register(UnzipInflate);
  // Small compressed chunks bound decompression bursts before enforcing the cap.
  for(let i=0;i<bytes.length;i+=1024)unzip.push(bytes.subarray(i,i+1024),i+1024>=bytes.length);
  const metadata:Record<string,unknown>={};
  const names:Record<string,string>={title:"Title",subject:"Subject",creator:"Author",description:"Description",keywords:"Keywords",lastModifiedBy:"Last modified by",created:"Created",modified:"Modified",revision:"Revision",Application:"Application",AppVersion:"Application version",Pages:"Pages",Words:"Words",Characters:"Characters",Slides:"Slides",editingCycles:"Editing cycles",generator:"Generator"};
  for(const xml of Object.values(documents))for(const [name,label] of Object.entries(names)){
    const pattern=new RegExp("<(?:[\\w.-]+:)?"+name+"\\b[^>]*>([\\s\\S]*?)</(?:[\\w.-]+:)?"+name+">","i");
    const match=xml.match(pattern);
    if(match){const value=decode(match[1].replace(/<[^>]*>/g," ")).trim().slice(0,2000);if(value)metadata[label]=value}
  }
  if(limited)metadata["Metadata limit"]="Some metadata exceeded the safe extraction limit";
  return metadata;
}
