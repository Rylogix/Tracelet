"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Search,
  Activity,
  SlidersHorizontal,
  ArrowUpRight,
  ShieldCheck,
  LogOut,
  ChevronRight,
  LockKeyhole,
} from "lucide-react";
import { Brand } from "./brand";
import { useRuntime } from "./auth-gate";
const links = [
  { href: "/", label: "Investigate", short: "Search", icon: Search },
  { href: "/usage", label: "API usage", short: "Usage", icon: Activity },
  {
    href: "/settings/integrations",
    label: "Integrations",
    short: "Tools",
    icon: SlidersHorizontal,
  },
];
export function WorkspaceShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { hosted, username, signOut } = useRuntime();
  const current = links.find((l) => l.href === path) || links[0];
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <aside className="sidebar">
        <Brand />
        <div className="nav-label">WORKSPACE</div>
        <nav aria-label="Main navigation">
          {links.map((l) => (
            <Link
              href={l.href}
              key={l.href}
              aria-current={path === l.href ? "page" : undefined}
            >
              <l.icon size={19} />
              <span>{l.label}</span>
              {path === l.href && <span className="nav-active-dot" />}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <a
            className="source-link"
            href="https://github.com/Rylogix/Tracelet"
            target="_blank"
            rel="noreferrer"
          >
            GitHub repository <ArrowUpRight size={14} />
          </a>
          <div className="account-row">
            <span className="avatar">
              {(username || "L").slice(0, 1).toUpperCase()}
            </span>
            <div>
              <strong>{username || "Local workspace"}</strong>
            </div>
            {hosted && (
              <button
                className="icon-button"
                onClick={signOut}
                aria-label="Sign out"
                title="Sign out"
              >
                <LogOut size={17} />
              </button>
            )}
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header className="workspace-header">
          <div className="desktop-breadcrumb">
            <span>Workspace</span>
            <ChevronRight size={14} />
            <strong>{current.label}</strong>
          </div>
          <div className="mobile-brand">
            <Brand compact />
          </div>
          <div className="header-actions">
            <span
              className="header-avatar avatar"
              title={username || "Local workspace"}
            >
              {(username || "L").slice(0, 1).toUpperCase()}
            </span>
            {hosted && (
              <button
                className="mobile-signout icon-button"
                onClick={signOut}
                aria-label="Sign out"
                title="Sign out"
              >
                <LogOut size={18} />
              </button>
            )}
          </div>
        </header>
        <main id="main-content">{children}</main>
      </div>
      <nav className="mobile-navigation" aria-label="Mobile navigation">
        {links.map((l) => (
          <Link
            href={l.href}
            key={l.href}
            aria-current={path === l.href ? "page" : undefined}
          >
            <l.icon size={21} />
            <span>{l.short}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
