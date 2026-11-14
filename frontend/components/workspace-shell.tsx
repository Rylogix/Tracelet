"use client";
import Link from "next/link";
import {usePathname} from "next/navigation";
import {LayoutDashboard,AtSign,Mail,Phone,FileSearch,Globe,FileText,Activity,SlidersHorizontal,ArrowUpRight,LogOut,ChevronRight} from "lucide-react";
import {Brand} from "./brand";
import {useRuntime} from "./auth-gate";
import {useWorkflow} from "./workflow";
const links=[{href:"/",label:"Dashboard",icon:LayoutDashboard},{href:"/username",label:"Username",icon:AtSign},{href:"/email",label:"Email",icon:Mail},{href:"/number",label:"Number",icon:Phone},{href:"/files",label:"Files",icon:FileSearch},{href:"/website",label:"Website",icon:Globe},{href:"/report",label:"Report",icon:FileText}];
const utilities=[{href:"/usage",label:"API usage",icon:Activity},{href:"/settings/integrations",label:"Settings",icon:SlidersHorizontal}];
export function WorkspaceShell({children}:{children:React.ReactNode}){
 const path=usePathname();const {hosted,username,signOut}=useRuntime();const {draft,error,saving,retry}=useWorkflow();
 const count=draft?.entries.filter(e=>e.included).length||0;const current=[...links,...utilities].find(l=>l.href===path)||links[0];
 return <div className="app-shell report-workspace">
  <a className="skip-link" href="#main-content">Skip to content</a>
  <aside className="sidebar"><Brand/><div className="nav-label">WORKSPACE</div><nav aria-label="Main navigation">{links.map(l=><Link key={l.href} href={l.href} aria-current={path===l.href?"page":undefined}><l.icon size={18}/><span>{l.label}</span>{l.href==="/report"&&count>0&&<span className="nav-count" aria-hidden="true">{count}</span>}</Link>)}</nav>
  <nav className="utility-navigation" aria-label="Workspace settings">{utilities.map(l=><Link key={l.href} href={l.href} aria-current={path===l.href?"page":undefined}><l.icon size={17}/><span>{l.label}</span></Link>)}</nav>
  <div className="sidebar-bottom"><a className="source-link" href="https://github.com/Rylogix/Tracelet" target="_blank" rel="noreferrer">GitHub <ArrowUpRight size={14}/></a><div className="account-row"><span className="avatar">{(username||"L").slice(0,1).toUpperCase()}</span><strong>{username||"Local workspace"}</strong>{hosted&&<button className="icon-button" onClick={signOut} aria-label="Sign out"><LogOut size={17}/></button>}</div></div></aside>
  <div className="workspace"><header className="workspace-header"><div className="desktop-breadcrumb"><span>Workspace</span><ChevronRight size={13}/><strong>{current.label}</strong></div><div className="mobile-brand"><Brand compact/></div><div className="header-actions"><span className="save-status" role="status">{!draft?"":saving?"Saving…":error?"Not saved":"Saved"}</span><Link className="icon-button header-utility" href="/usage" aria-label="API usage" aria-current={path==="/usage"?"page":undefined}><Activity size={17}/></Link><Link className="icon-button header-utility" href="/settings/integrations" aria-label="Settings" aria-current={path==="/settings/integrations"?"page":undefined}><SlidersHorizontal size={17}/></Link>{hosted&&<button className="mobile-signout icon-button" onClick={signOut} aria-label="Sign out"><LogOut size={18}/></button>}</div></header>
  <main id="main-content">{error&&<div className="error workspace-error" role="alert">{error}<button className="text-action" onClick={retry}>Retry save</button></div>}{children}</main></div>
  <nav className="mobile-navigation workflow-navigation" aria-label="Mobile navigation">{links.map(l=><Link key={l.href} href={l.href} aria-current={path===l.href?"page":undefined}><l.icon size={19}/><span>{l.label}</span>{l.href==="/report"&&count>0&&<i className="mobile-report-dot"/>}</Link>)}</nav>
 </div>;
}
