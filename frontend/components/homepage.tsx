import Link from "next/link";
import {AtSign,Mail,Phone,FileSearch,Globe,ArrowRight,ArrowUpRight} from "lucide-react";
import {Brand} from "./brand";
import {Button} from "./ui/button";

export function Homepage() {
  return <div className="public-home">
    <header className="public-home-header"><Brand/><nav aria-label="Public navigation"><a href="https://github.com/Rylogix/Tracelet" target="_blank" rel="noopener noreferrer">GitHub<ArrowUpRight size={12}/></a><Link href="/login">Sign in<ArrowRight size={13}/></Link></nav></header>
    <main className="public-home-main">
      <span className="public-home-label">TRACELET</span>
      <h1>Free OSINT.</h1>
      <p>Search public information and organize your findings into one report.</p>
      <div className="public-home-tools" aria-label="Search categories">{[{name:"Username",icon:AtSign},{name:"Email",icon:Mail},{name:"Number",icon:Phone},{name:"Files",icon:FileSearch},{name:"Website",icon:Globe}].map(t=><span key={t.name}><t.icon size={14}/>{t.name}</span>)}</div>
      <Button asChild><Link href="/login">Get started<ArrowRight size={16}/></Link></Button>
      <span className="public-home-footnote">Free. Open source.</span>
    </main>
  </div>;
}
